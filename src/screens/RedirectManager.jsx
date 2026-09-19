import React, { useCallback, useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useNotify } from '../context/NotificationContext'
import './RedirectManager.css'

function authHeader(site) {
  return 'Basic ' + btoa(`${site.username}:${site.password}`)
}

// The Redirection plugin (redirection.me) is the de-facto standard for 301
// redirects on WordPress and exposes its own REST namespace once installed —
// there is no such endpoint in WordPress core, so this feature only works on
// sites that have it active.
const REDIRECTION_BASE = 'wp-json/redirection/v1'

async function fetchRedirects(site) {
  const res = await fetch(`${site.url}/${REDIRECTION_BASE}/redirect?per_page=200&page=1&orderby=id&direction=desc`, {
    headers: { Authorization: authHeader(site) },
  })
  if (res.status === 404) return { available: false, redirects: [] }
  if (!res.ok) throw new Error(`WordPress returned HTTP ${res.status}`)
  const data = await res.json().catch(() => null)
  const items = Array.isArray(data) ? data : (data?.items || [])
  return { available: true, redirects: items }
}

async function createRedirect(site, sourcePath, targetUrl) {
  const res = await fetch(`${site.url}/${REDIRECTION_BASE}/redirect`, {
    method: 'POST',
    headers: { Authorization: authHeader(site), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: sourcePath,
      match_type: 'url',
      action_type: 'url',
      action_data: { url: targetUrl },
      group_id: 1,
      status: 'enabled',
    }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.message || `WordPress returned HTTP ${res.status}`)
  return data
}

async function deleteRedirects(site, ids) {
  const res = await fetch(`${site.url}/${REDIRECTION_BASE}/bulk/redirect/delete`, {
    method: 'POST',
    headers: { Authorization: authHeader(site), 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: ids }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.message || `WordPress returned HTTP ${res.status}`)
  }
}

function normalizePath(value) {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

export default function RedirectManager() {
  const { sites } = useApp()
  const { notifySuccess, notifyError } = useNotify()
  const connectedSites = sites.filter(s => s.connected && s.username && s.password)

  const [selectedSiteId, setSelectedSiteId] = useState(connectedSites[0]?.id || '')
  const [pluginAvailable, setPluginAvailable] = useState(null) // null | true | false
  const [redirects, setRedirects] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sourcePath, setSourcePath] = useState('')
  const [targetUrl, setTargetUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [search, setSearch] = useState('')

  const selectedSite = sites.find(s => s.id === selectedSiteId)

  const reload = useCallback(async () => {
    if (!selectedSite) return
    setLoading(true)
    setError('')
    try {
      const result = await fetchRedirects(selectedSite)
      setPluginAvailable(result.available)
      setRedirects(result.redirects)
    } catch (e) {
      setError(e.message || 'Could not load redirects.')
      setPluginAvailable(null)
    } finally {
      setLoading(false)
    }
  }, [selectedSite])

  useEffect(() => {
    setRedirects([])
    setPluginAvailable(null)
    setError('')
    reload()
  }, [reload])

  const handleAdd = async (event) => {
    event.preventDefault()
    if (!selectedSite || adding) return
    const source = normalizePath(sourcePath)
    const target = normalizePath(targetUrl)
    if (!source || !target) {
      setError('Both the old URL and new URL are required.')
      return
    }
    setAdding(true)
    setError('')
    try {
      await createRedirect(selectedSite, source, target)
      notifySuccess(`✓ Redirect created on ${selectedSite.name}: ${source} → ${target}`)
      setSourcePath('')
      setTargetUrl('')
      await reload()
    } catch (e) {
      const msg = e.message || 'Could not create redirect.'
      setError(msg)
      notifyError(`Failed to create redirect on ${selectedSite.name}: ${msg}`, { site: selectedSite.name, action: 'Create Redirect' })
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (redirect) => {
    if (!selectedSite) return
    if (!window.confirm(`Delete this redirect?\n\n${redirect.url} → ${redirect.action_data?.url || ''}`)) return
    setDeletingId(redirect.id)
    try {
      await deleteRedirects(selectedSite, [redirect.id])
      setRedirects(prev => prev.filter(r => r.id !== redirect.id))
      notifySuccess(`✓ Deleted redirect on ${selectedSite.name}`)
    } catch (e) {
      notifyError(`Failed to delete redirect on ${selectedSite.name}: ${e.message}`, { site: selectedSite.name, action: 'Delete Redirect' })
    } finally {
      setDeletingId(null)
    }
  }

  const displayRedirects = search.trim()
    ? redirects.filter(r => {
        const q = search.toLowerCase()
        return (r.url || '').toLowerCase().includes(q) || (r.action_data?.url || '').toLowerCase().includes(q)
      })
    : redirects

  return (
    <div className="rm-screen">
      <div className="rm-top">
        <div>
          <h1>Redirect Manager</h1>
          <p>Create and manage 301 redirects — pair this with Broken Links to fix dead URLs properly instead of just removing the link.</p>
        </div>
      </div>

      <div className="rm-controls">
        <select className="filter-select" value={selectedSiteId} onChange={e => setSelectedSiteId(e.target.value)}>
          {connectedSites.length === 0
            ? <option value="">No connected sites</option>
            : connectedSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)
          }
        </select>
        <button className="btn btn-secondary btn-sm" onClick={reload} disabled={loading || !selectedSite}>
          {loading ? 'Checking…' : '⟳ Refresh'}
        </button>
      </div>

      {connectedSites.length === 0 && (
        <div className="rm-cta">
          <p>No connected sites. Connect a website in Site Manager first.</p>
        </div>
      )}

      {connectedSites.length > 0 && pluginAvailable === false && (
        <div className="rm-setup-card">
          <div className="rm-setup-icon">🔌</div>
          <div>
            <div className="rm-setup-title">Redirection plugin not detected on {selectedSite?.name}</div>
            <p>
              Redirect management needs the free <strong>Redirection</strong> plugin installed and activated on this WordPress site —
              WordPress core has no built-in way to create 301 redirects.
            </p>
            <ol>
              <li>Go to <strong>{selectedSite?.url}/wp-admin/plugin-install.php?s=redirection&tab=search&type=term</strong></li>
              <li>Install and activate the <strong>Redirection</strong> plugin by John Godley.</li>
              <li>Come back here and click Refresh.</li>
            </ol>
          </div>
        </div>
      )}

      {error && <div className="rm-error">✗ {error}</div>}

      {connectedSites.length > 0 && pluginAvailable && (
        <>
          <form className="rm-add-form" onSubmit={handleAdd}>
            <div className="rm-add-field">
              <span>Old URL / path</span>
              <input value={sourcePath} onChange={e => setSourcePath(e.target.value)} placeholder="/old-page-slug" />
            </div>
            <div className="rm-add-arrow">→</div>
            <div className="rm-add-field">
              <span>New URL / path</span>
              <input value={targetUrl} onChange={e => setTargetUrl(e.target.value)} placeholder="/new-page-slug or https://..." />
            </div>
            <button className="btn btn-primary btn-sm" type="submit" disabled={adding}>
              {adding ? 'Creating…' : '+ Add Redirect'}
            </button>
          </form>

          <div className="rm-summary">
            <div className="rm-stat"><span>{redirects.length}</span><small>Total Redirects</small></div>
            <div className="rm-stat"><span>{redirects.filter(r => r.status === 'enabled').length}</span><small>Enabled</small></div>
            <div className="rm-stat"><span>{redirects.filter(r => r.status !== 'enabled').length}</span><small>Disabled</small></div>
          </div>

          <input
            className="input rm-search"
            placeholder="🔍 Search redirects…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          <div className="rm-table-wrap">
            <table className="rm-table">
              <thead>
                <tr>
                  <th>Old URL</th>
                  <th>New URL</th>
                  <th>Status</th>
                  <th>Hits</th>
                  <th style={{ width: 90 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Loading redirects…</td></tr>
                )}
                {!loading && displayRedirects.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                    {search ? `No redirects match "${search}"` : 'No redirects yet — add one above.'}
                  </td></tr>
                )}
                {!loading && displayRedirects.map(r => (
                  <tr key={r.id}>
                    <td className="rm-url-cell" title={r.url}>{r.url}</td>
                    <td className="rm-url-cell" title={r.action_data?.url}>{r.action_data?.url || '—'}</td>
                    <td><span className={`rm-badge ${r.status === 'enabled' ? 'on' : 'off'}`}>{r.status === 'enabled' ? 'Enabled' : 'Disabled'}</span></td>
                    <td>{r.last_count ?? r.hits ?? 0}</td>
                    <td>
                      <button className="rm-delete-btn" onClick={() => handleDelete(r)} disabled={deletingId === r.id}>
                        {deletingId === r.id ? '…' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
