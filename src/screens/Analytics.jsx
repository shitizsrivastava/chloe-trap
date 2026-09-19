import React, { useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useApp } from '../context/AppContext'
import { useNotify } from '../context/NotificationContext'
import SiteAvatar from '../components/SiteAvatar'
import './Analytics.css'

const DAY_OPTIONS = [
  { value: 7, label: 'Last 7 days' },
  { value: 28, label: 'Last 28 days' },
  { value: 90, label: 'Last 90 days' },
]

function matchLocalPost(posts, siteId, path) {
  if (!path) return null
  const cleanPath = path.split('?')[0].replace(/\/$/, '')
  return posts.find(p => {
    if (p.siteId !== siteId || !p.wpLink) return false
    try { return new URL(p.wpLink).pathname.replace(/\/$/, '') === cleanPath } catch { return false }
  }) || null
}

function GA4Panel({ site, posts, updateSite, notifySuccess, notifyError, hasElectron }) {
  const [propertyIdDraft, setPropertyIdDraft] = useState(site?.ga4PropertyId || '')
  const [serviceAccountDraft, setServiceAccountDraft] = useState(site?.ga4ServiceAccountJson || '')
  const [days, setDays] = useState(30)
  const [trend, setTrend] = useState(null)
  const [pages, setPages] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [savingConfig, setSavingConfig] = useState(false)

  const configured = Boolean(site?.ga4PropertyId && site?.ga4ServiceAccountJson)

  const saveConfig = () => {
    if (!site) return
    setSavingConfig(true)
    try {
      if (serviceAccountDraft.trim()) JSON.parse(serviceAccountDraft)
      updateSite(site.id, {
        ga4PropertyId: propertyIdDraft.trim(),
        ga4ServiceAccountJson: serviceAccountDraft.trim(),
      })
      notifySuccess(`✓ Saved GA4 configuration for ${site.name}`)
    } catch {
      notifyError('Service account key is not valid JSON — paste the full JSON file contents.', { site: site?.name, action: 'Save GA4 Config' })
    } finally {
      setSavingConfig(false)
    }
  }

  const handleFetch = async () => {
    if (!site || !hasElectron || !configured) return
    setLoading(true)
    setError('')
    setTrend(null)
    setPages(null)
    try {
      const args = { serviceAccountJson: site.ga4ServiceAccountJson, propertyId: site.ga4PropertyId, days }
      const [trendRes, pagesRes] = await Promise.all([
        window.electronAPI.ga4Fetch(args),
        window.electronAPI.ga4FetchPages({ ...args, limit: 100 }),
      ])
      if (!trendRes.success) throw new Error(trendRes.error || 'Could not load GA4 trend data.')
      if (!pagesRes.success) throw new Error(pagesRes.error || 'Could not load GA4 page data.')
      setTrend(trendRes.data)
      setPages(pagesRes.data)
    } catch (e) {
      setError(e.message || 'Could not load Google Analytics data.')
    } finally {
      setLoading(false)
    }
  }

  const totals = useMemo(() => {
    if (!trend) return null
    return {
      sessions: trend.reduce((s, r) => s + r.sessions, 0),
      pageviews: trend.reduce((s, r) => s + r.pageviews, 0),
    }
  }, [trend])

  const pagesWithPosts = useMemo(() => {
    if (!pages || !site) return []
    return pages.map(p => ({ ...p, localPost: matchLocalPost(posts, site.id, p.path) }))
  }, [pages, posts, site])

  return (
    <>
      <div className="an-controls">
        <select className="filter-select" value={days} onChange={e => setDays(Number(e.target.value))}>
          {DAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={handleFetch} disabled={loading || !hasElectron || !configured}>
          {loading ? 'Loading…' : '📈 Load Traffic Data'}
        </button>
      </div>

      <div className="an-config-card">
        <div className="an-config-title">GA4 configuration for {site?.name || 'this site'}</div>
        <p className="an-config-hint">
          Create a Google Cloud service account, grant it "Viewer" access to this site's GA4 property (Admin → Property Access Management),
          then paste the property ID and the downloaded service account JSON key here.
        </p>
        <div className="an-config-grid">
          <label>
            <span>GA4 Property ID</span>
            <input value={propertyIdDraft} onChange={e => setPropertyIdDraft(e.target.value)} placeholder="e.g. 123456789" />
          </label>
          <label className="an-config-wide">
            <span>Service Account JSON key</span>
            <textarea
              value={serviceAccountDraft}
              onChange={e => setServiceAccountDraft(e.target.value)}
              placeholder='{"client_email": "...", "private_key": "..."}'
              rows={4}
            />
          </label>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={saveConfig} disabled={savingConfig || !site}>
          {savingConfig ? 'Saving…' : 'Save Configuration'}
        </button>
        {!configured && <span className="an-config-status">Not configured yet for this site.</span>}
      </div>

      {error && <div className="an-error">✗ {error}</div>}

      {trend && (
        <>
          <div className="an-summary">
            <div className="an-stat"><span>{totals.sessions.toLocaleString()}</span><small>Sessions ({days}d)</small></div>
            <div className="an-stat"><span>{totals.pageviews.toLocaleString()}</span><small>Pageviews ({days}d)</small></div>
            <div className="an-stat"><span>{pagesWithPosts.length}</span><small>Pages With Traffic</small></div>
          </div>

          <div className="an-chart-card">
            <div className="an-chart-title">Daily sessions &amp; pageviews</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="sessions" stroke="#6366f1" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="pageviews" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="an-table-card">
            <div className="an-table-head">Traffic per post</div>
            <div className="an-table-wrap">
              <table className="an-table">
                <thead>
                  <tr>
                    <th>Post / Page</th>
                    <th>URL Path</th>
                    <th>Sessions</th>
                    <th>Pageviews</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pagesWithPosts.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No page data for this range.</td></tr>
                  )}
                  {pagesWithPosts.map((p, i) => (
                    <tr key={i}>
                      <td className="an-title-cell" title={p.title}>{p.localPost?.title || p.title || '(untitled)'}</td>
                      <td className="an-path-cell" title={p.path}>{p.path}</td>
                      <td>{p.sessions.toLocaleString()}</td>
                      <td>{p.pageviews.toLocaleString()}</td>
                      <td>{p.localPost ? <span className="an-badge">Tracked in ChloeTrap</span> : <span className="an-badge muted">Not synced</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}

function SearchConsolePanel({ site, posts, updateSite, notifySuccess, notifyError, hasGscElectron }) {
  const [siteUrlDraft, setSiteUrlDraft] = useState(site?.gscSiteUrl || `${site?.url || ''}/`)
  const [serviceAccountDraft, setServiceAccountDraft] = useState(site?.gscServiceAccountJson || '')
  const [days, setDays] = useState(28)
  const [queries, setQueries] = useState(null)
  const [pages, setPages] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [savingConfig, setSavingConfig] = useState(false)

  const configured = Boolean(site?.gscSiteUrl && site?.gscServiceAccountJson)

  const saveConfig = () => {
    if (!site) return
    setSavingConfig(true)
    try {
      if (serviceAccountDraft.trim()) JSON.parse(serviceAccountDraft)
      updateSite(site.id, {
        gscSiteUrl: siteUrlDraft.trim(),
        gscServiceAccountJson: serviceAccountDraft.trim(),
      })
      notifySuccess(`✓ Saved Search Console configuration for ${site.name}`)
    } catch {
      notifyError('Service account key is not valid JSON — paste the full JSON file contents.', { site: site?.name, action: 'Save Search Console Config' })
    } finally {
      setSavingConfig(false)
    }
  }

  const handleFetch = async () => {
    if (!site || !hasGscElectron || !configured) return
    setLoading(true)
    setError('')
    setQueries(null)
    setPages(null)
    try {
      const base = { serviceAccountJson: site.gscServiceAccountJson, siteUrl: site.gscSiteUrl, days, rowLimit: 100 }
      const [queryRes, pageRes] = await Promise.all([
        window.electronAPI.gscFetch({ ...base, dimensions: ['query'] }),
        window.electronAPI.gscFetch({ ...base, dimensions: ['page'] }),
      ])
      if (!queryRes.success) throw new Error(queryRes.error || 'Could not load Search Console query data.')
      if (!pageRes.success) throw new Error(pageRes.error || 'Could not load Search Console page data.')
      setQueries(queryRes.data)
      setPages(pageRes.data)
    } catch (e) {
      setError(e.message || 'Could not load Search Console data.')
    } finally {
      setLoading(false)
    }
  }

  const pagesWithPosts = useMemo(() => {
    if (!pages || !site) return []
    return pages.map(p => {
      let path = p.keys[0]
      try { path = new URL(p.keys[0]).pathname } catch { /* keep raw value */ }
      return { ...p, path, localPost: matchLocalPost(posts, site.id, path) }
    })
  }, [pages, posts, site])

  // ── Rank tracking: pick keywords to watch, then pull their daily position
  // history so movement over time is visible instead of just a snapshot. ──
  const trackedKeywords = site?.gscTrackedKeywords || []
  const [history, setHistory] = useState(null) // { [keyword]: [{date, position}] }
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')

  const toggleTrack = (keyword) => {
    if (!site) return
    const next = trackedKeywords.includes(keyword)
      ? trackedKeywords.filter(k => k !== keyword)
      : [...trackedKeywords, keyword]
    updateSite(site.id, { gscTrackedKeywords: next })
  }

  const loadHistory = async () => {
    if (!site || !hasGscElectron || !configured || trackedKeywords.length === 0) return
    setHistoryLoading(true)
    setHistoryError('')
    setHistory(null)
    try {
      const results = {}
      for (const keyword of trackedKeywords) {
        const res = await window.electronAPI.gscFetch({
          serviceAccountJson: site.gscServiceAccountJson,
          siteUrl: site.gscSiteUrl,
          days: 90,
          dimensions: ['date'],
          queryFilter: keyword,
          rowLimit: 90,
        })
        if (!res.success) throw new Error(res.error || `Could not load history for "${keyword}".`)
        results[keyword] = res.data
          .map(r => ({ date: r.keys[0], position: r.position }))
          .sort((a, b) => a.date.localeCompare(b.date))
      }
      setHistory(results)
    } catch (e) {
      setHistoryError(e.message || 'Could not load keyword position history.')
    } finally {
      setHistoryLoading(false)
    }
  }

  // Merge each keyword's own date series into one array of rows (one per
  // date) so a single multi-line chart can plot every tracked keyword.
  const historyChartData = useMemo(() => {
    if (!history) return []
    const byDate = new Map()
    Object.entries(history).forEach(([keyword, rows]) => {
      rows.forEach(row => {
        if (!byDate.has(row.date)) byDate.set(row.date, { date: row.date })
        byDate.get(row.date)[keyword] = row.position
      })
    })
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  }, [history])

  const KEYWORD_COLORS = ['#6366f1', '#ef4444', '#10b981', '#f59e0b', '#06b6d4', '#8b5cf6']

  return (
    <>
      <div className="an-controls">
        <select className="filter-select" value={days} onChange={e => setDays(Number(e.target.value))}>
          {DAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={handleFetch} disabled={loading || !hasGscElectron || !configured}>
          {loading ? 'Loading…' : '🔍 Load Search Console Data'}
        </button>
      </div>

      <div className="an-config-card">
        <div className="an-config-title">Search Console configuration for {site?.name || 'this site'}</div>
        <p className="an-config-hint">
          In Search Console → Settings → Users and permissions, add your service account's email as a user (Restricted is enough).
          The site URL below must match the property exactly — e.g. <code>https://example.com/</code> for a URL-prefix property, or <code>sc-domain:example.com</code> for a domain property.
        </p>
        <div className="an-config-grid">
          <label>
            <span>Search Console property</span>
            <input value={siteUrlDraft} onChange={e => setSiteUrlDraft(e.target.value)} placeholder="https://example.com/" />
          </label>
          <label className="an-config-wide">
            <span>Service Account JSON key</span>
            <textarea
              value={serviceAccountDraft}
              onChange={e => setServiceAccountDraft(e.target.value)}
              placeholder='{"client_email": "...", "private_key": "..."}'
              rows={4}
            />
          </label>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={saveConfig} disabled={savingConfig || !site}>
          {savingConfig ? 'Saving…' : 'Save Configuration'}
        </button>
        {!configured && <span className="an-config-status">Not configured yet for this site.</span>}
      </div>

      {error && <div className="an-error">✗ {error}</div>}

      {trackedKeywords.length > 0 && (
        <div className="an-table-card">
          <div className="an-table-head an-rank-head">
            <span>📌 Rank Tracker — {trackedKeywords.length} keyword{trackedKeywords.length === 1 ? '' : 's'} tracked (90-day position history)</span>
            <button className="btn btn-secondary btn-sm" onClick={loadHistory} disabled={historyLoading || !hasGscElectron || !configured}>
              {historyLoading ? 'Loading…' : 'Load Position History'}
            </button>
          </div>
          {historyError && <div className="an-error" style={{ margin: '0 16px 12px' }}>✗ {historyError}</div>}
          <div style={{ padding: 16 }}>
            <div className="an-tracked-list">
              {trackedKeywords.map(keyword => {
                const rows = history?.[keyword]
                const current = rows?.length ? rows[rows.length - 1].position : null
                const first = rows?.length ? rows[0].position : null
                const delta = current != null && first != null ? first - current : null
                return (
                  <div key={keyword} className="an-tracked-chip">
                    <span className="an-tracked-name">{keyword}</span>
                    {current != null && <span className="an-tracked-pos">#{current.toFixed(1)}</span>}
                    {delta != null && delta !== 0 && (
                      <span className={`an-tracked-delta ${delta > 0 ? 'up' : 'down'}`}>{delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}</span>
                    )}
                    <button className="an-untrack-btn" onClick={() => toggleTrack(keyword)} title="Stop tracking">✕</button>
                  </div>
                )
              })}
            </div>

            {historyChartData.length > 0 && (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={historyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} reversed domain={['auto', 'auto']} label={{ value: 'Position (lower = better)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                  <Tooltip />
                  {trackedKeywords.map((keyword, i) => (
                    <Line key={keyword} type="monotone" dataKey={keyword} stroke={KEYWORD_COLORS[i % KEYWORD_COLORS.length]} strokeWidth={2} dot={false} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {queries && (
        <>
          <div className="an-summary">
            <div className="an-stat"><span>{queries.reduce((s, r) => s + r.clicks, 0).toLocaleString()}</span><small>Clicks ({days}d)</small></div>
            <div className="an-stat"><span>{queries.reduce((s, r) => s + r.impressions, 0).toLocaleString()}</span><small>Impressions ({days}d)</small></div>
            {/* Weighted by impressions, matching how Search Console computes its
                own average position — an unweighted mean of per-query averages
                lets a handful of low-volume, poorly-ranked long-tail queries
                skew the number far more than the traffic that actually matters. */}
            <div className="an-stat"><span>{queries.length ? (queries.reduce((s, r) => s + r.position * r.impressions, 0) / (queries.reduce((s, r) => s + r.impressions, 0) || 1)).toFixed(1) : '—'}</span><small>Avg Position</small></div>
          </div>

          <div className="an-table-card">
            <div className="an-table-head">Top search queries — ⭐ a keyword to track its position over time</div>
            <div className="an-table-wrap">
              <table className="an-table">
                <thead>
                  <tr><th>Query</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Avg Position</th><th>Track</th></tr>
                </thead>
                <tbody>
                  {queries.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No query data for this range.</td></tr>
                  )}
                  {queries.map((q, i) => (
                    <tr key={i}>
                      <td className="an-title-cell" title={q.keys[0]}>{q.keys[0]}</td>
                      <td>{q.clicks.toLocaleString()}</td>
                      <td>{q.impressions.toLocaleString()}</td>
                      <td>{(q.ctr * 100).toFixed(1)}%</td>
                      <td>{q.position.toFixed(1)}</td>
                      <td>
                        <button className="an-track-btn" onClick={() => toggleTrack(q.keys[0])} title={trackedKeywords.includes(q.keys[0]) ? 'Untrack' : 'Track this keyword'}>
                          {trackedKeywords.includes(q.keys[0]) ? '★' : '☆'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="an-table-card">
            <div className="an-table-head">Top pages</div>
            <div className="an-table-wrap">
              <table className="an-table">
                <thead>
                  <tr><th>Post / Page</th><th>URL Path</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Avg Position</th></tr>
                </thead>
                <tbody>
                  {pagesWithPosts.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No page data for this range.</td></tr>
                  )}
                  {pagesWithPosts.map((p, i) => (
                    <tr key={i}>
                      <td className="an-title-cell" title={p.localPost?.title || p.path}>{p.localPost?.title || '(not synced)'}</td>
                      <td className="an-path-cell" title={p.path}>{p.path}</td>
                      <td>{p.clicks.toLocaleString()}</td>
                      <td>{p.impressions.toLocaleString()}</td>
                      <td>{(p.ctr * 100).toFixed(1)}%</td>
                      <td>{p.position.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}

function AllSitesPanel({ sites, updateSite, notifySuccess, notifyWarning, hasGa4Electron, hasGscElectron }) {
  const [days, setDays] = useState(28)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [results, setResults] = useState({}) // { [siteId]: { sessions, pageviews, clicks, impressions, position, queries, ga4Error, gscError } }
  const [bulkKey, setBulkKey] = useState('')
  const [applyTo, setApplyTo] = useState({ ga4: true, gsc: true })

  const ga4Sites = sites.filter(s => s.ga4PropertyId && s.ga4ServiceAccountJson)
  const gscSites = sites.filter(s => s.gscSiteUrl && s.gscServiceAccountJson)

  // One Google Cloud service account can be granted access to every site's
  // GA4 property and Search Console property — it's the same credential
  // either way. Pasting it 13 times is the single biggest friction point in
  // setting this up for a whole portfolio, so let one paste apply it to
  // every site that's missing it (never overwrites a site that already has
  // its own key configured).
  const applyBulkKey = () => {
    if (!bulkKey.trim()) { notifyWarning('Paste the service account JSON first.'); return }
    try {
      JSON.parse(bulkKey)
    } catch {
      notifyWarning('That\'s not valid JSON — paste the full downloaded service account key file contents.')
      return
    }
    let count = 0
    sites.forEach(s => {
      const patch = {}
      if (applyTo.ga4 && !s.ga4ServiceAccountJson) patch.ga4ServiceAccountJson = bulkKey.trim()
      if (applyTo.gsc && !s.gscServiceAccountJson) patch.gscServiceAccountJson = bulkKey.trim()
      if (Object.keys(patch).length > 0) { updateSite(s.id, patch); count++ }
    })
    if (count === 0) {
      notifyWarning('Every site already has its own service account key saved — nothing to apply. Each site still needs its own GA4 Property ID / Search Console URL.')
    } else {
      notifySuccess(`✓ Applied to ${count} site${count === 1 ? '' : 's'}. Each still needs its own GA4 Property ID and/or Search Console property URL below.`)
    }
  }

  const loadAll = async () => {
    if (ga4Sites.length === 0 && gscSites.length === 0) {
      notifyWarning('No sites have GA4 or Search Console configured yet — set up at least one below, or on the GA4/Search Console tabs.')
      return
    }
    setLoading(true)
    const out = {}
    const configuredSites = [...new Set([...ga4Sites, ...gscSites])]
    let done = 0
    for (const site of configuredSites) {
      setProgress(`Loading ${site.name}… (${done + 1}/${configuredSites.length})`)
      const entry = {}
      if (site.ga4PropertyId && site.ga4ServiceAccountJson && hasGa4Electron) {
        try {
          const res = await window.electronAPI.ga4Fetch({ serviceAccountJson: site.ga4ServiceAccountJson, propertyId: site.ga4PropertyId, days })
          if (res.success) {
            entry.sessions = res.data.reduce((s, r) => s + r.sessions, 0)
            entry.pageviews = res.data.reduce((s, r) => s + r.pageviews, 0)
          } else {
            entry.ga4Error = res.error
          }
        } catch (e) { entry.ga4Error = e.message }
      }
      if (site.gscSiteUrl && site.gscServiceAccountJson && hasGscElectron) {
        try {
          const res = await window.electronAPI.gscFetch({
            serviceAccountJson: site.gscServiceAccountJson, siteUrl: site.gscSiteUrl,
            days, dimensions: ['query'], rowLimit: 25,
          })
          if (res.success) {
            entry.queries = res.data
            entry.clicks = res.data.reduce((s, r) => s + r.clicks, 0)
            entry.impressions = res.data.reduce((s, r) => s + r.impressions, 0)
            const impSum = entry.impressions || 1
            entry.position = res.data.reduce((s, r) => s + r.position * r.impressions, 0) / impSum
          } else {
            entry.gscError = res.error
          }
        } catch (e) { entry.gscError = e.message }
      }
      out[site.id] = entry
      done++
    }
    setResults(out)
    setProgress('')
    setLoading(false)
  }

  const topQueriesAcrossSites = useMemo(() => {
    const rows = []
    Object.entries(results).forEach(([siteId, r]) => {
      const site = sites.find(s => s.id === siteId)
      if (!site || !r.queries) return
      r.queries.forEach(q => rows.push({ site, query: q.keys[0], clicks: q.clicks, impressions: q.impressions, position: q.position }))
    })
    return rows.sort((a, b) => b.clicks - a.clicks).slice(0, 30)
  }, [results, sites])

  const anyConfigured = ga4Sites.length > 0 || gscSites.length > 0
  const anyLoaded = Object.keys(results).length > 0

  return (
    <>
      <div className="an-config-card">
        <div className="an-config-title">Bulk setup — apply one service account to every site</div>
        <p className="an-config-hint">
          The same Google Cloud service account can be granted access to every site's GA4 property and Search Console
          property — you only need to create it once. Paste its JSON key here to save it to every site that doesn't
          already have one; each site still needs its own GA4 Property ID and/or Search Console property URL set
          individually below (or on the GA4 / Search Console tabs above).
        </p>
        <div className="an-config-grid">
          <label className="an-config-wide">
            <span>Service Account JSON key</span>
            <textarea
              value={bulkKey}
              onChange={e => setBulkKey(e.target.value)}
              placeholder='{"client_email": "...", "private_key": "..."}'
              rows={4}
            />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
            <input type="checkbox" checked={applyTo.ga4} onChange={e => setApplyTo(prev => ({ ...prev, ga4: e.target.checked }))} />
            GA4
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
            <input type="checkbox" checked={applyTo.gsc} onChange={e => setApplyTo(prev => ({ ...prev, gsc: e.target.checked }))} />
            Search Console
          </label>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={applyBulkKey}>Apply to All Sites</button>
      </div>

      <div className="an-controls">
        <select className="filter-select" value={days} onChange={e => setDays(Number(e.target.value))}>
          {DAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={loadAll} disabled={loading || !anyConfigured}>
          {loading ? (progress || 'Loading…') : `📊 Load All ${ga4Sites.length + gscSites.length ? `(${new Set([...ga4Sites, ...gscSites].map(s => s.id)).size} configured)` : ''}`}
        </button>
      </div>

      {!anyConfigured && (
        <div className="an-notice">
          No sites have GA4 or Search Console configured yet. Use the bulk setup above, then set each site's Property
          ID / Search Console URL on the GA4 and Search Console tabs (switch the site dropdown at the top to reach each one).
        </div>
      )}

      {anyLoaded && (
        <div className="an-table-card" style={{ marginBottom: 16 }}>
          <div className="an-table-head">Per-site summary — last {days} days</div>
          <div className="an-table-wrap">
            <table className="an-table">
              <thead>
                <tr>
                  <th>Site</th><th>Sessions</th><th>Pageviews</th><th>Clicks</th><th>Impressions</th><th>Avg Position</th>
                </tr>
              </thead>
              <tbody>
                {sites.filter(s => results[s.id]).map(s => {
                  const r = results[s.id]
                  return (
                    <tr key={s.id}>
                      <td className="an-title-cell">{s.name}</td>
                      <td>{r.ga4Error ? <span title={r.ga4Error}>—</span> : r.sessions?.toLocaleString() ?? '—'}</td>
                      <td>{r.ga4Error ? <span title={r.ga4Error}>—</span> : r.pageviews?.toLocaleString() ?? '—'}</td>
                      <td>{r.gscError ? <span title={r.gscError}>—</span> : r.clicks?.toLocaleString() ?? '—'}</td>
                      <td>{r.gscError ? <span title={r.gscError}>—</span> : r.impressions?.toLocaleString() ?? '—'}</td>
                      <td>{r.gscError ? <span title={r.gscError}>—</span> : r.position ? r.position.toFixed(1) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {topQueriesAcrossSites.length > 0 && (
        <div className="an-table-card">
          <div className="an-table-head">Top search phrases across all sites — last {days} days</div>
          <div className="an-table-wrap">
            <table className="an-table">
              <thead>
                <tr><th>Query</th><th>Site</th><th>Clicks</th><th>Impressions</th><th>Position</th></tr>
              </thead>
              <tbody>
                {topQueriesAcrossSites.map((r, i) => (
                  <tr key={i}>
                    <td className="an-title-cell">{r.query}</td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <SiteAvatar site={r.site} size={16} radius={4} />{r.site.name}
                      </span>
                    </td>
                    <td>{r.clicks}</td>
                    <td>{r.impressions}</td>
                    <td>{r.position.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

export default function Analytics() {
  const { sites, posts, updateSite } = useApp()
  const { notifySuccess, notifyError, notifyWarning } = useNotify()

  const [selectedSiteId, setSelectedSiteId] = useState(sites[0]?.id || '')
  const [tab, setTab] = useState('all') // all | ga4 | gsc
  const selectedSite = sites.find(s => s.id === selectedSiteId)

  const hasGa4Electron = typeof window !== 'undefined' && !!window.electronAPI?.ga4Fetch
  const hasGscElectron = typeof window !== 'undefined' && !!window.electronAPI?.gscFetch

  return (
    <div className="an-screen">
      <div className="an-top">
        <div>
          <h1>Analytics</h1>
          <p>Google Analytics traffic and Search Console rankings, per site and per post — see which of your posts actually drive traffic and where they rank.</p>
        </div>
      </div>

      <div className="an-controls">
        {tab !== 'all' && (
          <select className="filter-select" value={selectedSiteId} onChange={e => setSelectedSiteId(e.target.value)}>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <div className="an-tabs">
          <button className={`cat-tab${tab === 'all' ? ' active' : ''}`} onClick={() => setTab('all')}>🌐 All Sites</button>
          <button className={`cat-tab${tab === 'ga4' ? ' active' : ''}`} onClick={() => setTab('ga4')}>📈 GA4 Traffic</button>
          <button className={`cat-tab${tab === 'gsc' ? ' active' : ''}`} onClick={() => setTab('gsc')}>🔍 Search Console</button>
        </div>
      </div>

      {tab !== 'all' && !(tab === 'ga4' ? hasGa4Electron : hasGscElectron) && (
        <div className="an-notice">
          Google's APIs need a signed service-account request, which can only run in the ChloeTrap desktop app — not in a plain browser preview.
        </div>
      )}

      {tab === 'all' && (!hasGa4Electron || !hasGscElectron) && (
        <div className="an-notice">
          Google's APIs need a signed service-account request, which can only run in the ChloeTrap desktop app — not in a plain browser preview.
        </div>
      )}

      {tab === 'all' && (
        <AllSitesPanel
          sites={sites}
          updateSite={updateSite}
          notifySuccess={notifySuccess}
          notifyWarning={notifyWarning}
          hasGa4Electron={hasGa4Electron}
          hasGscElectron={hasGscElectron}
        />
      )}

      {selectedSite && tab === 'ga4' && (
        <GA4Panel
          key={`ga4-${selectedSite.id}`}
          site={selectedSite}
          posts={posts}
          updateSite={updateSite}
          notifySuccess={notifySuccess}
          notifyError={notifyError}
          hasElectron={hasGa4Electron}
        />
      )}

      {selectedSite && tab === 'gsc' && (
        <SearchConsolePanel
          key={`gsc-${selectedSite.id}`}
          site={selectedSite}
          posts={posts}
          updateSite={updateSite}
          notifySuccess={notifySuccess}
          notifyError={notifyError}
          hasGscElectron={hasGscElectron}
        />
      )}
    </div>
  )
}
