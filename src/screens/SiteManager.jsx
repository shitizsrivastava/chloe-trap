import React, { useState, useEffect } from 'react'
import { useApp, DEFAULT_SITES } from '../context/AppContext'
import { testConnection } from '../utils/wordpress'
import SiteAvatar from '../components/SiteAvatar'
import './SiteManager.css'

const DEFAULT_SITE_IDS = new Set(DEFAULT_SITES.map(s => s.id))

function SiteCard({ site, onUpdate, onRemove, externalResult }) {
  const [username, setUsername] = useState(site.username || '')
  const [password, setPassword] = useState(site.password || '')
  const [touched, setTouched] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [saving, setSaving] = useState(false)

  // Site credentials load from localStorage as ciphertext and get decrypted
  // asynchronously a moment after app startup (see AppContext). If this card
  // is already mounted when that resolves, `site.password` goes from
  // undefined to the real value — but useState above only seeds once, so
  // without this the input stays blank even though the real password now
  // exists. Save would then silently overwrite it with ''. Only resync while
  // the user hasn't touched the fields, so we never clobber an in-progress edit.
  useEffect(() => {
    if (touched) return
    setUsername(site.username || '')
    setPassword(site.password || '')
  }, [site.username, site.password, touched])

  // Show external (Test All) result if no individual result yet
  const activeResult = testResult ?? externalResult

  const handleTest = async () => {
    if (!username.trim() || !password.trim()) {
      setTestResult({ success: false, error: 'Enter username and application password first.' })
      return
    }
    setTesting(true)
    setTestResult(null)
    const result = await testConnection({ ...site, username, password })
    setTestResult(result)
    if (result.success) onUpdate(site.id, { username, password, connected: true })
    else onUpdate(site.id, { connected: false })
    setTesting(false)
  }

  const handleSave = () => {
    setSaving(true)
    onUpdate(site.id, { username, password })
    setTimeout(() => setSaving(false), 600)
  }

  const statusClass = site.connected ? 'ok' : activeResult?.success === false ? 'err' : 'off'
  const statusLabel = site.connected ? 'Connected' : activeResult?.success === false ? 'Error' : 'Not set up'

  return (
    <div className={`site-manager-card ${site.connected ? 'connected' : activeResult?.success === false ? 'error-state' : ''}`}>
      <div className="site-card-header">
        <SiteAvatar site={site} size={42} radius={10} />
        <div className="site-card-info">
          <div className="site-card-title">{site.name}</div>
          <div className="site-card-url">{site.url}</div>
        </div>
        <div className={`site-card-badge ${statusClass}`}>
          <div className="site-card-badge-dot" />
          {statusLabel}
        </div>
      </div>

      <div className="site-form">
        <div className="form-group">
          <label className="form-label">WordPress Username</label>
          <input className="input" placeholder="admin" value={username}
            onChange={e => { setUsername(e.target.value); setTouched(true) }} autoComplete="off" />
        </div>
        <div className="form-group">
          <label className="form-label">Application Password</label>
          <div className="form-input-row">
            <input className="input" type={showPass ? 'text' : 'password'}
              placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
              value={password} onChange={e => { setPassword(e.target.value); setTouched(true) }} autoComplete="off" />
            <button className="btn btn-secondary btn-sm" onClick={() => setShowPass(v => !v)} type="button">
              {showPass ? '🙈' : '👁'}
            </button>
          </div>
        </div>

        {activeResult && (
          <div className={`test-result ${activeResult.success ? 'success' : 'error'}`}>
            {activeResult.success ? (
              <><svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
              Connected as {activeResult.user?.name || username}</>
            ) : (
              <><svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/></svg>
              {activeResult.error}</>
            )}
          </div>
        )}

        <div className="site-actions">
          <button className="btn btn-primary btn-sm" onClick={handleTest} disabled={testing}>
            {testing ? 'Testing…' : 'Test Connection'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saved!' : 'Save'}
          </button>
          {!DEFAULT_SITE_IDS.has(site.id) && (
            <button className="btn btn-ghost btn-sm"
              onClick={() => { if (window.confirm(`Remove "${site.name}"?`)) onRemove(site.id) }}
              style={{ marginLeft: 'auto', color: 'var(--error)' }}>
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function AddSiteModal({ onClose, onAdd }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('https://')
  const handleAdd = () => {
    if (!name.trim() || !url.trim()) return alert('Enter site name and URL.')
    let cleanUrl = url.trim().replace(/\/$/, '')
    if (!cleanUrl.startsWith('http')) cleanUrl = 'https://' + cleanUrl
    onAdd({ name: name.trim(), url: cleanUrl, username: '', password: '' })
    onClose()
  }
  return (
    <div className="add-site-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="add-site-modal">
        <div className="modal-title">Add New Site</div>
        <div className="site-form">
          <div className="form-group">
            <label className="form-label">Site Name</label>
            <input className="input" placeholder="My Blog" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Site URL</label>
            <input className="input" placeholder="https://myblog.com" value={url} onChange={e => setUrl(e.target.value)} />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleAdd}>Add Site</button>
        </div>
      </div>
    </div>
  )
}

export default function SiteManager() {
  const { sites, updateSite, addSite, removeSite } = useApp()
  const [showAdd, setShowAdd] = useState(false)
  const [testingAll, setTestingAll] = useState(false)
  const [allResults, setAllResults] = useState({}) // siteId → result
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  const connected = sites.filter(s => s.connected).length
  const configuredSites = sites.filter(s => s.username && s.password)

  const handleTestAll = async () => {
    if (configuredSites.length === 0) {
      alert('No sites have credentials saved yet. Enter username + password and click Save on each site first.')
      return
    }
    setTestingAll(true)
    setAllResults({})
    setProgress({ done: 0, total: configuredSites.length })

    // Test in parallel batches of 3
    const batchSize = 3
    const results = {}
    for (let i = 0; i < configuredSites.length; i += batchSize) {
      const batch = configuredSites.slice(i, i + batchSize)
      await Promise.all(batch.map(async (site) => {
        const result = await testConnection(site)
        results[site.id] = result
        if (result.success) updateSite(site.id, { connected: true })
        else updateSite(site.id, { connected: false })
        setProgress(prev => ({ ...prev, done: prev.done + 1 }))
      }))
    }
    setAllResults(results)
    setTestingAll(false)
  }

  const allResultsList = Object.entries(allResults)
  const passCount = allResultsList.filter(([, r]) => r.success).length
  const failCount = allResultsList.filter(([, r]) => !r.success).length

  return (
    <div className="site-manager">
      <div className="page-header-row">
        <div>
          <h1>Site Manager</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
            {connected} of {sites.length} sites connected
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Test All progress */}
          {testingAll && (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Testing {progress.done}/{progress.total}…
            </span>
          )}
          {/* Test All summary */}
          {!testingAll && allResultsList.length > 0 && (
            <span style={{ fontSize: 12 }}>
              <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ {passCount} ok</span>
              {failCount > 0 && <span style={{ color: 'var(--error)', fontWeight: 600, marginLeft: 8 }}>✗ {failCount} failed</span>}
            </span>
          )}
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleTestAll}
            disabled={testingAll}
            title={`Test all ${configuredSites.length} sites with saved credentials`}
          >
            {testingAll ? (
              <>
                <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" style={{ animation: 'spin 0.8s linear infinite' }}>
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1z" clipRule="evenodd"/>
                </svg>
                Testing {progress.done}/{progress.total}…
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd"/>
                </svg>
                Test All ({configuredSites.length})
              </>
            )}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/></svg>
            Add New Site
          </button>
        </div>
      </div>

      <div style={{ margin: '16px 0 8px', padding: '12px 16px', background: 'var(--primary-light)', border: '1px solid var(--primary-border)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--primary)' }}>
        <strong>How to get Application Password:</strong> In WordPress → Users → Profile → scroll to "Application Passwords" → enter a name → click "Add New". Copy the password.
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div className="sites-manager-grid">
        {sites.map(site => (
          <SiteCard
            key={site.id}
            site={site}
            onUpdate={updateSite}
            onRemove={removeSite}
            externalResult={allResults[site.id] ?? null}
          />
        ))}
      </div>

      {showAdd && <AddSiteModal onClose={() => setShowAdd(false)} onAdd={addSite} />}
    </div>
  )
}
