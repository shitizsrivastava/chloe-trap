import React, { useState, useEffect, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { useNotify } from '../context/NotificationContext'
import SiteAvatar from '../components/SiteAvatar'
import './AllCategoriesOverview.css'

export default function AllCategoriesOverview({ navigate }) {
  const { sites } = useApp()
  const { notifyWarning } = useNotify()
  const connected = sites.filter(s => s.connected)

  const [data, setData]       = useState({}) // { siteId: [cats] }
  const [failedSiteIds, setFailedSiteIds] = useState(new Set())
  const [loading, setLoading] = useState(false)
  const [filter, setFilter]   = useState('all') // all | empty | low | rich
  const [search, setSearch]   = useState('')
  const [sortKey, setSortKey] = useState('name')
  const [sortDir, setSortDir] = useState('asc')

  const fetchSiteCats = async (site) => {
    const headers = { Authorization: 'Basic ' + btoa(`${site.username}:${site.password}`) }
    let all = [], page = 1
    while (true) {
      const r = await fetch(`${site.url}/wp-json/wp/v2/categories?per_page=100&page=${page}`, { headers })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const batch = await r.json()
      if (!Array.isArray(batch) || batch.length === 0) break
      all = [...all, ...batch]
      if (batch.length < 100) break
      page++
    }
    return all
  }

  const fetchAll = async () => {
    if (!connected.length) return
    setLoading(true)
    const results = {}
    const failed = new Set()
    await Promise.all(connected.map(async site => {
      try {
        results[site.id] = await fetchSiteCats(site)
      } catch {
        // A failed fetch used to be stored as [] — identical to a site that
        // genuinely has zero categories — and "Sites Scanned" still counted
        // it as successfully scanned. Track it separately instead so a
        // network hiccup doesn't get silently read as "this site has no
        // categories that need content."
        failed.add(site.id)
      }
    }))
    setData(results)
    setFailedSiteIds(failed)
    setLoading(false)
    if (failed.size > 0) {
      const names = connected.filter(s => failed.has(s.id)).map(s => s.name).join(', ')
      notifyWarning(`Couldn't load categories from: ${names}. They're excluded from these totals, not counted as having none.`)
    }
  }

  useEffect(() => { fetchAll() }, [connected.length])

  // Build a unified category map: name → { sites: {siteId: {count, id}}, totalPosts }
  const unified = useMemo(() => {
    const map = {}
    Object.entries(data).forEach(([siteId, cats]) => {
      cats.forEach(cat => {
        const key = cat.name.toLowerCase().trim()
        if (!map[key]) map[key] = { name: cat.name, slug: cat.slug, sites: {}, totalPosts: 0 }
        map[key].sites[siteId] = { count: cat.count, id: cat.id }
        map[key].totalPosts += cat.count
      })
    })
    return Object.values(map)
  }, [data])

  const filtered = useMemo(() => {
    let rows = unified
    if (search) rows = rows.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
    if (filter === 'empty') rows = rows.filter(r => r.totalPosts === 0)
    if (filter === 'low')   rows = rows.filter(r => r.totalPosts > 0 && r.totalPosts < 5)
    if (filter === 'rich')  rows = rows.filter(r => r.totalPosts >= 5)
    rows = [...rows].sort((a, b) => {
      let va = sortKey === 'name' ? a.name : sortKey === 'sites' ? Object.keys(a.sites).length : a.totalPosts
      let vb = sortKey === 'name' ? b.name : sortKey === 'sites' ? Object.keys(b.sites).length : b.totalPosts
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      return sortDir === 'asc' ? va - vb : vb - va
    })
    return rows
  }, [unified, filter, search, sortKey, sortDir])

  const totalCats    = unified.length
  const emptyCats    = unified.filter(r => r.totalPosts === 0).length
  const lowCats      = unified.filter(r => r.totalPosts > 0 && r.totalPosts < 5).length
  const needsContent = emptyCats + lowCats

  const sort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }
  const arrow = (key) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  const statusBadge = (totalPosts) => {
    if (totalPosts === 0) return <span className="aco-badge empty">Empty</span>
    if (totalPosts < 5)   return <span className="aco-badge low">Low</span>
    if (totalPosts < 10)  return <span className="aco-badge ok">OK</span>
    return <span className="aco-badge rich">Rich</span>
  }

  return (
    <div className="aco-screen">
      <div className="page-header-row">
        <div>
          <h1>All Categories Overview</h1>
          <p className="page-subtitle">Combined view across all connected sites — see what needs content</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={fetchAll} disabled={loading}>
          {loading ? 'Refreshing…' : '↺ Refresh'}
        </button>
      </div>

      {/* Summary strip */}
      <div className="aco-summary">
        <div className="aco-stat">
          <div className="aco-stat-val">{totalCats}</div>
          <div className="aco-stat-lbl">Unique Categories</div>
        </div>
        <div className="aco-stat">
          <div className="aco-stat-val">{connected.length - failedSiteIds.size}</div>
          <div className="aco-stat-lbl">
            Sites Scanned{failedSiteIds.size > 0 ? ` (${failedSiteIds.size} failed)` : ''}
          </div>
        </div>
        <div className="aco-stat warn">
          <div className="aco-stat-val">{emptyCats}</div>
          <div className="aco-stat-lbl">Empty (0 posts)</div>
        </div>
        <div className="aco-stat warn">
          <div className="aco-stat-val">{lowCats}</div>
          <div className="aco-stat-lbl">Low (&lt;5 posts)</div>
        </div>
        <div className="aco-stat highlight">
          <div className="aco-stat-val">{needsContent}</div>
          <div className="aco-stat-lbl">Need Content</div>
        </div>
      </div>

      {/* Filters */}
      <div className="aco-toolbar">
        <div className="aco-filter-tabs">
          {[
            { key: 'all',   label: `All (${unified.length})` },
            { key: 'empty', label: `Empty (${emptyCats})` },
            { key: 'low',   label: `Low <5 (${lowCats})` },
            { key: 'rich',  label: `Rich 5+ (${unified.filter(r => r.totalPosts >= 5).length})` },
          ].map(t => (
            <button key={t.key} className={`aco-tab${filter === t.key ? ' active' : ''}`} onClick={() => setFilter(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <input
          className="aco-search"
          placeholder="Search categories…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="aco-loading">
          <div className="aco-spin">⟳</div>
          <span>Fetching categories from {connected.length} sites…</span>
        </div>
      ) : !connected.length ? (
        <div className="aco-empty-state">
          <div className="aco-empty-icon">🔌</div>
          <div>No connected sites. Go to <strong>Site Manager</strong> and connect your WordPress sites first.</div>
        </div>
      ) : (
        <div className="aco-table-wrap">
          <table className="aco-table">
            <thead>
              <tr>
                <th className="aco-th-num">#</th>
                <th className="aco-th-sort" onClick={() => sort('name')}>Category Name{arrow('name')}</th>
                <th className="aco-th-sort" onClick={() => sort('posts')}>Total Posts{arrow('posts')}</th>
                <th>Status</th>
                <th className="aco-th-sort" onClick={() => sort('sites')}>Sites{arrow('sites')}</th>
                <th>Per Site Breakdown</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr key={row.name} className={row.totalPosts === 0 ? 'aco-row-empty' : ''}>
                  <td className="aco-td-num">{i + 1}</td>
                  <td className="aco-td-name">
                    <div className="aco-cat-name">{row.name}</div>
                    <div className="aco-cat-slug">/{row.slug}</div>
                  </td>
                  <td className="aco-td-posts">
                    <strong>{row.totalPosts}</strong>
                    <div className="aco-mini-bar-track">
                      <div
                        className="aco-mini-bar-fill"
                        style={{ width: `${Math.min(100, (row.totalPosts / Math.max(...unified.map(r => r.totalPosts), 1)) * 100)}%` }}
                      />
                    </div>
                  </td>
                  <td>{statusBadge(row.totalPosts)}</td>
                  <td className="aco-td-sitecount">{Object.keys(row.sites).length} / {connected.length}</td>
                  <td className="aco-td-breakdown">
                    <div className="aco-site-dots">
                      {connected.map(site => {
                        const sc = row.sites[site.id]
                        return (
                          <span
                            key={site.id}
                            className={`aco-site-chip${sc ? '' : ' missing'}`}
                            title={`${site.name}: ${sc ? sc.count + ' posts' : 'no category'}`}
                            style={sc ? { background: site.color + '22', color: site.color, borderColor: site.color + '55' } : {}}
                          >
                            <SiteAvatar site={site} size={14} radius={4} />
                            {sc !== undefined && <span className="aco-chip-count">{sc.count}</span>}
                          </span>
                        )
                      })}
                    </div>
                  </td>
                  <td>
                    <button
                      className="aco-write-btn"
                      onClick={() => navigate('create')}
                      title={`Write a post for "${row.name}"`}
                    >
                      + Write
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="aco-no-results">No categories match your filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
