import React, { useState } from 'react'
import { useApp } from '../context/AppContext'
import './LinkExporter.css'

function authHeader(site) {
  return 'Basic ' + btoa(`${site.username}:${site.password}`)
}

// Fetch every item of a type with pagination (posts / pages / categories)
async function fetchAllOfType(site, type) {
  const endpoint = type === 'categories' ? 'categories' : type // posts | pages | categories
  const items = []
  for (let page = 1; page <= 20; page++) {
    try {
      const q = new URLSearchParams({ per_page: 100, page, _fields: 'id,title,name,link,status,date,count' }).toString()
      const res = await fetch(`${site.url}/wp-json/wp/v2/${endpoint}?${q}`, {
        headers: { Authorization: authHeader(site) },
      })
      if (!res.ok) break
      const batch = await res.json()
      if (!batch.length) break
      items.push(...batch)
      const totalPages = parseInt(res.headers.get('X-WP-TotalPages') || '1')
      if (page >= totalPages) break
    } catch {
      break
    }
  }
  return items.map(it => ({
    site: site.name,
    type: type === 'posts' ? 'Post' : type === 'pages' ? 'Page' : 'Category',
    title: it.title?.rendered || it.name || '(Untitled)',
    url: it.link || '',
    status: it.status || (type === 'categories' ? `${it.count ?? 0} posts` : ''),
    date: it.date ? it.date.slice(0, 10) : '',
  }))
}

// Build CSV text (Excel-compatible, UTF-8 BOM so special chars open correctly)
function buildCSV(rows) {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""').replace(/<[^>]+>/g, '')}"`
  const header = ['Website', 'Type', 'Title', 'URL', 'Status', 'Date'].join(',')
  const lines = rows.map(r => [r.site, r.type, r.title, r.url, r.status, r.date].map(esc).join(','))
  return '﻿' + [header, ...lines].join('\r\n')
}

function downloadCSV(filename, rows) {
  const blob = new Blob([buildCSV(rows)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export default function LinkExporter() {
  const { sites } = useApp()
  const connectedSites = sites.filter(s => s.connected && s.username && s.password)

  const [selectedSiteId, setSelectedSiteId] = useState('all')
  const [types, setTypes] = useState({ posts: true, pages: true, categories: true })
  const [fetching, setFetching] = useState(false)
  const [progress, setProgress] = useState('')
  const [data, setData] = useState(() => {
    // Load last fetched links from storage so they survive app restarts
    try {
      const raw = localStorage.getItem('ct_linkexport')
      return raw ? JSON.parse(raw).data : null
    } catch { return null }
  })
  const [lastFetched, setLastFetched] = useState(() => {
    try {
      const raw = localStorage.getItem('ct_linkexport')
      return raw ? JSON.parse(raw).fetchedAt : ''
    } catch { return '' }
  })
  const [error, setError] = useState('')
  const [view, setView] = useState('table') // 'table' | 'cards'
  const [tableFilter, setTableFilter] = useState('all') // all | Post | Page | Category
  const [siteFilter, setSiteFilter] = useState('all')   // all | site name
  const [search, setSearch] = useState('')
  const [expandedSite, setExpandedSite] = useState(null) // site name expanded in cards view

  const toggleType = (key) => setTypes(prev => ({ ...prev, [key]: !prev[key] }))
  const activeTypes = Object.keys(types).filter(k => types[k])

  const handleFetch = async () => {
    const targets = selectedSiteId === 'all'
      ? connectedSites
      : connectedSites.filter(s => s.id === selectedSiteId)
    if (!targets.length || !activeTypes.length) return

    setFetching(true); setError('')
    const result = {}
    try {
      for (const site of targets) {
        result[site.name] = []
        for (const type of activeTypes) {
          setProgress(`${site.name} — fetching ${type}…`)
          const rows = await fetchAllOfType(site, type)
          result[site.name].push(...rows)
        }
      }
      // Single-site fetch updates just that site; all-sites fetch replaces everything
      const merged = selectedSiteId === 'all' ? result : { ...(data || {}), ...result }
      const fetchedAt = new Date().toISOString()
      setData(merged)
      setLastFetched(fetchedAt)
      try {
        localStorage.setItem('ct_linkexport', JSON.stringify({ data: merged, fetchedAt }))
      } catch { /* storage full — data still shown, just not saved */ }
    } catch (e) {
      setError(e.message)
    }
    setFetching(false); setProgress('')
  }

  const allRows = data ? Object.values(data).flat() : []
  const today = new Date().toISOString().slice(0, 10)

  const handleDownloadAll = () => downloadCSV(`all-sites-links-${today}.csv`, allRows)
  const handleDownloadSite = (siteName) => downloadCSV(`${slug(siteName)}-links-${today}.csv`, data[siteName])
  const handleDownloadSeparate = () => {
    Object.keys(data).forEach((siteName, i) => {
      // Stagger downloads slightly so the browser doesn't block them
      setTimeout(() => handleDownloadSite(siteName), i * 300)
    })
  }

  const countByType = (rows, type) => rows.filter(r => r.type === type).length

  const tableRows = allRows.filter(r => {
    if (siteFilter !== 'all' && r.site !== siteFilter) return false
    if (tableFilter !== 'all' && r.type !== tableFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return r.title.toLowerCase().includes(q) || r.url.toLowerCase().includes(q) || r.site.toLowerCase().includes(q)
    }
    return true
  })

  return (
    <div className="lx-screen">
      <div className="lx-top">
        <div>
          <h1>Link Exporter</h1>
          <p>Export all post, page and category links to Excel (CSV)</p>
        </div>
      </div>

      {/* Controls */}
      <div className="lx-controls">
        <select className="filter-select" value={selectedSiteId} onChange={e => setSelectedSiteId(e.target.value)}>
          <option value="all">🌐 All Sites ({connectedSites.length})</option>
          {connectedSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <div className="lx-type-toggles">
          {[
            { key: 'posts', label: '📝 Posts' },
            { key: 'pages', label: '📄 Pages' },
            { key: 'categories', label: '🗂 Categories' },
          ].map(t => (
            <label key={t.key} className={`lx-toggle${types[t.key] ? ' on' : ''}`}>
              <input type="checkbox" checked={types[t.key]} onChange={() => toggleType(t.key)} />
              {t.label}
            </label>
          ))}
        </div>

        <button className="btn btn-primary btn-sm" onClick={handleFetch} disabled={fetching || !connectedSites.length || !activeTypes.length}>
          {fetching ? 'Fetching…' : data ? '⟳ Refresh Links' : '🔗 Fetch Links'}
        </button>

        {lastFetched && !fetching && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Last fetched: {new Date(lastFetched).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {fetching && <div className="lx-progress">{progress}</div>}
      {error && <div className="lx-error">✗ {error}</div>}

      {/* Results */}
      {data && (
        <>
          <div className="lx-summary">
            <div className="lx-stat"><span>{allRows.length}</span><small>Total Links</small></div>
            <div className="lx-stat"><span>{countByType(allRows, 'Post')}</span><small>Posts</small></div>
            <div className="lx-stat"><span>{countByType(allRows, 'Page')}</span><small>Pages</small></div>
            <div className="lx-stat"><span>{countByType(allRows, 'Category')}</span><small>Categories</small></div>
            <div className="lx-stat"><span>{Object.keys(data).length}</span><small>Websites</small></div>
          </div>

          {/* Download buttons + view toggle */}
          <div className="lx-download-bar">
            <button className="btn btn-primary btn-sm" onClick={handleDownloadAll}>
              ⬇ Download All (one file)
            </button>
            {Object.keys(data).length > 1 && (
              <button className="btn btn-secondary btn-sm" onClick={handleDownloadSeparate}>
                ⬇ Download Separate Files ({Object.keys(data).length} files)
              </button>
            )}
            <div className="lx-view-toggle">
              <button className={`cat-tab${view === 'table' ? ' active' : ''}`} onClick={() => setView('table')}>☰ Table</button>
              <button className={`cat-tab${view === 'cards' ? ' active' : ''}`} onClick={() => setView('cards')}>▦ Cards</button>
            </div>
          </div>

          {/* Table view — every link, scrollable */}
          {view === 'table' && (
            <>
              <div className="lx-table-controls">
                <select className="filter-select" value={siteFilter} onChange={e => setSiteFilter(e.target.value)}>
                  <option value="all">🌐 All Websites ({allRows.length})</option>
                  {Object.entries(data).map(([siteName, rows]) => (
                    <option key={siteName} value={siteName}>{siteName} ({rows.length})</option>
                  ))}
                </select>
                <div className="lx-filter-tabs">
                  {(() => {
                    const scoped = siteFilter === 'all' ? allRows : allRows.filter(r => r.site === siteFilter)
                    return [
                      { k: 'all', l: `All (${scoped.length})` },
                      { k: 'Post', l: `Posts (${countByType(scoped, 'Post')})` },
                      { k: 'Page', l: `Pages (${countByType(scoped, 'Page')})` },
                      { k: 'Category', l: `Categories (${countByType(scoped, 'Category')})` },
                    ].map(t => (
                      <button key={t.k} className={`cat-tab${tableFilter === t.k ? ' active' : ''}`} onClick={() => setTableFilter(t.k)}>{t.l}</button>
                    ))
                  })()}
                </div>
                <input className="input lx-search" placeholder="🔍 Search title, URL or site…"
                  value={search} onChange={e => setSearch(e.target.value)} />
              </div>

              <div className="lx-table-wrap">
                <table className="lx-table">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}>#</th>
                      <th>Website</th>
                      <th>Type</th>
                      <th>Title</th>
                      <th>URL</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.length === 0
                      ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>No links match.</td></tr>
                      : tableRows.map((r, i) => (
                        <tr key={i}>
                          <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{i + 1}</td>
                          <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{r.site}</td>
                          <td><span className={`lx-type-badge ${r.type.toLowerCase()}`}>{r.type}</span></td>
                          <td className="lx-td-title" title={r.title}>{r.title}</td>
                          <td className="lx-td-url">
                            <a href="#" onClick={e => { e.preventDefault(); window.open(r.url) }} title={r.url}>{r.url}</a>
                          </td>
                          <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-secondary)' }}>{r.status}</td>
                          <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-muted)' }}>{r.date}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Cards view — expanded single site */}
          {view === 'cards' && expandedSite && data[expandedSite] && (
            <div className="lx-expanded">
              <div className="lx-expanded-head">
                <button className="btn btn-secondary btn-sm" onClick={() => setExpandedSite(null)}>← Back to Cards</button>
                <strong>{expandedSite}</strong>
                <span className="lx-expanded-counts">
                  📝 {countByType(data[expandedSite], 'Post')} posts ·
                  📄 {countByType(data[expandedSite], 'Page')} pages ·
                  🗂 {countByType(data[expandedSite], 'Category')} categories
                </span>
                <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => handleDownloadSite(expandedSite)}>⬇ Excel</button>
              </div>
              <div className="lx-table-wrap">
                <table className="lx-table">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}>#</th>
                      <th>Type</th>
                      <th>Title</th>
                      <th>URL</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data[expandedSite].map((r, i) => (
                      <tr key={i}>
                        <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{i + 1}</td>
                        <td><span className={`lx-type-badge ${r.type.toLowerCase()}`}>{r.type}</span></td>
                        <td className="lx-td-title" title={r.title}>{r.title.replace(/<[^>]+>/g, '')}</td>
                        <td className="lx-td-url">
                          <a href="#" onClick={e => { e.preventDefault(); window.open(r.url) }} title={r.url}>{r.url}</a>
                        </td>
                        <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-secondary)' }}>{r.status}</td>
                        <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-muted)' }}>{r.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Per-site cards — click a card to expand it */}
          {view === 'cards' && !expandedSite && (
          <div className="lx-sites">
            {Object.entries(data).map(([siteName, rows]) => (
              <div key={siteName} className="lx-site-card clickable" onClick={() => setExpandedSite(siteName)} title="Click to see all links">
                <div className="lx-site-head">
                  <strong>{siteName}</strong>
                  <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); handleDownloadSite(siteName) }}>⬇ Excel</button>
                </div>
                <div className="lx-site-counts">
                  <span>📝 {countByType(rows, 'Post')} posts</span>
                  <span>📄 {countByType(rows, 'Page')} pages</span>
                  <span>🗂 {countByType(rows, 'Category')} categories</span>
                </div>
                <div className="lx-preview">
                  {rows.slice(0, 5).map((r, i) => (
                    <div key={i} className="lx-preview-row">
                      <span className={`lx-type-badge ${r.type.toLowerCase()}`}>{r.type}</span>
                      <span className="lx-preview-title" title={r.url}>{r.title.replace(/<[^>]+>/g, '')}</span>
                    </div>
                  ))}
                  {rows.length > 5 && <div className="lx-preview-more">…click to see all {rows.length} links</div>}
                  {rows.length === 0 && <div className="lx-preview-more">No links found</div>}
                </div>
              </div>
            ))}
          </div>
          )}
        </>
      )}

      {!data && !fetching && (
        <div className="lx-cta">
          <svg width="48" height="48" viewBox="0 0 20 20" fill="currentColor" style={{ color: 'var(--border)' }}><path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" transform="rotate(180 10 10)"/></svg>
          <p>Pick a site (or all sites) and click Fetch Links</p>
          <span>The file opens directly in Excel with columns: Website, Type, Title, URL, Status, Date</span>
        </div>
      )}
    </div>
  )
}
