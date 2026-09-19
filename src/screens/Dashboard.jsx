import React, { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { useApp } from '../context/AppContext'
import { useNotify } from '../context/NotificationContext'
import { CONTENT_PLAN } from '../utils/contentPlanData'
import { fetchPostCount } from '../utils/wordpress'
import SiteAvatar from '../components/SiteAvatar'
import TargetCelebration from '../components/TargetCelebration'
import './Dashboard.css'

function formatDeadline(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function TargetRow({ site, onSave, onClear }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(site.target || '')
  const [months, setMonths] = useState(6)

  const hasTarget = !!site.target
  const pct = hasTarget ? Math.min(100, Math.round((site.count / site.target) * 100)) : 0
  const met = hasTarget && site.count >= site.target
  const remaining = hasTarget ? Math.max(0, site.target - site.count) : 0

  const save = () => {
    const n = parseInt(value, 10)
    if (n > 0) onSave(site.id, n, months)
    setEditing(false)
  }

  return (
    <div className="target-row">
      <SiteAvatar site={site} size={30} radius={8} />
      <div className="target-info">
        <div className="target-top">
          <span className="target-name">{site.name}</span>
          {!editing && (
            <span className="target-count">
              {site.loading ? '…' : site.count}{hasTarget ? ` / ${site.target}` : ''}
            </span>
          )}
        </div>
        {editing ? (
          <div className="target-edit-row">
            <input
              type="number"
              className="target-edit-input"
              placeholder="Target articles"
              value={value}
              autoFocus
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()}
            />
            <select className="target-edit-select" value={months} onChange={e => setMonths(Number(e.target.value))}>
              <option value={1}>in 1 month</option>
              <option value={3}>in 3 months</option>
              <option value={6}>in 6 months</option>
              <option value={12}>in 12 months</option>
            </select>
            <button className="btn btn-primary btn-sm" onClick={save}>Save</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        ) : hasTarget ? (
          <>
            <div className="target-bar-track">
              <div className={`target-bar-fill${met ? ' is-met' : ''}`} style={{ width: `${pct}%`, background: met ? '#16a34a' : site.color }} />
            </div>
            <div className="target-meta">
              {met
                ? <span className="target-met">🎉 Target reached!</span>
                : <span>{remaining} article{remaining === 1 ? '' : 's'} to go · by {formatDeadline(site.targetDeadline)}</span>}
              <span className="target-row-actions">
                <button className="target-link-btn" onClick={() => { setValue(site.target); setEditing(true) }}>Edit</button>
                <button className="target-link-btn" onClick={() => onClear(site.id)}>Clear</button>
              </span>
            </div>
          </>
        ) : (
          <button className="target-set-btn" onClick={() => { setValue(''); setEditing(true) }}>+ Set a target</button>
        )}
      </div>
    </div>
  )
}

const HTML_ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'", '&#8217;': "'", '&#8216;': "'", '&#8220;': '"', '&#8221;': '"', '&#8211;': '–', '&#8212;': '—', '&nbsp;': ' ' }
function normTitle(t) {
  return (t || '').replace(/<[^>]+>/g, '').replace(/&[#a-z0-9]+;/gi, m => HTML_ENT[m] || m).toLowerCase().replace(/\s+/g, ' ').trim()
}
function findUpNext(writtenMap, siteNameMap) {
  for (const series of CONTENT_PLAN) {
    const site = siteNameMap[series.siteName?.toLowerCase()]
    if (!site) continue
    for (let i = 0; i < series.posts.length; i++) {
      if (!writtenMap.has(`${site.id}||${normTitle(series.posts[i])}`)) {
        return { series, postTitle: series.posts[i], postNum: i + 1, site }
      }
    }
  }
  return null
}

function formatRelative(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function formatDate() {
  return new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })
}

function StatCard({ value, label, sub, color, bgColor, icon, onClick }) {
  return (
    <div className={`stat-card${onClick ? ' is-clickable' : ''}`} onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className="stat-card-header">
        <div className="stat-card-icon" style={{ background: bgColor }}>
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      <div className="stat-card-value">{value.toLocaleString()}</div>
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-sub">{sub}</div>
    </div>
  )
}

const ACTIVITY_ICONS = {
  published: { bg: '#dcfce7', color: '#16a34a', icon: <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg> },
  draft_saved: { bg: '#fef9c3', color: '#ca8a04', icon: <svg viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"/></svg> },
  connected: { bg: '#ede9fe', color: '#7c3aed', icon: <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg> },
  deleted: { bg: '#fee2e2', color: '#dc2626', icon: <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zm-1 8a1 1 0 112 0v3a1 1 0 11-2 0V10zm5-1a1 1 0 00-1 1v3a1 1 0 102 0v-3a1 1 0 00-1-1z" clipRule="evenodd"/></svg> },
  target_set: { bg: '#e0f2fe', color: '#0284c7', icon: <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-2a6 6 0 100-12 6 6 0 000 12zm0-2a4 4 0 110-8 4 4 0 010 8zm0-2a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/></svg> },
}

export default function Dashboard({ navigate }) {
  const { sites, posts, activity, stats, syncAllSites, setSiteTarget, clearSiteTarget, celebratedTargets, markTargetCelebrated } = useApp()
  const { notifyWarning } = useNotify()
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [lastSync, setLastSync] = useState(() => localStorage.getItem('ct_lastsync') || '')
  const [liveCounts, setLiveCounts] = useState({})
  const [countsLoading, setCountsLoading] = useState({})
  const [celebrating, setCelebrating] = useState(null)

  useEffect(() => {
    const targets = sites.filter(s => s.connected && s.username && s.password)
    targets.forEach(site => {
      setCountsLoading(prev => ({ ...prev, [site.id]: true }))
      fetchPostCount(site).then(count => {
        setLiveCounts(prev => ({ ...prev, [site.id]: count }))
        setCountsLoading(prev => ({ ...prev, [site.id]: false }))
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites.map(s => `${s.id}:${s.connected}:${s.username}`).join(',')])

  const handleSync = async () => {
    setSyncing(true)
    setSyncMsg('Starting sync…')
    try {
      const result = await syncAllSites(msg => setSyncMsg(msg))
      setSyncMsg(`✓ Synced ${result.posts} posts from ${result.sites} sites`)
      setLastSync(new Date().toISOString())
      if (result.truncatedSites?.length > 0) {
        notifyWarning(`${result.truncatedSites.join(', ')} ${result.truncatedSites.length === 1 ? 'has' : 'have'} more posts than this sync could fetch (2,000+) — counts for ${result.truncatedSites.length === 1 ? 'it' : 'them'} may be incomplete.`)
      }
    } catch (e) {
      setSyncMsg(`✗ Sync failed: ${e.message}`)
    }
    setSyncing(false)
    setTimeout(() => setSyncMsg(''), 5000)
  }

  const trendData = useMemo(() => {
    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      const short = d.toLocaleDateString('en-US', { weekday: 'short' })
      const count = posts.filter(p => {
        const pd = new Date(p.createdAt)
        return pd.toDateString() === d.toDateString() && p.status === 'publish'
      }).length
      days.push({ label: short, fullLabel: label, count })
    }
    return days
  }, [posts])

  const donutData = useMemo(() => {
    const bySite = {}
    posts.forEach(p => {
      if (!bySite[p.siteId]) bySite[p.siteId] = 0
      bySite[p.siteId]++
    })
    return sites
      .filter(s => bySite[s.id])
      .map(s => ({ name: s.name, value: bySite[s.id], color: s.color }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [posts, sites])

  const connectedCount = sites.filter(s => s.connected).length

  const leaderboard = useMemo(() => {
    return sites
      .map(site => ({
        ...site,
        // Falls back to the local cache only when the live WordPress count
        // hasn't loaded yet (or the site has no working connection) — must
        // filter to published posts here too, or a site that never
        // successfully fetches a live count (bad/untested credentials)
        // permanently shows drafts + scheduled + everything else as if
        // published, with no way for it to ever correct itself.
        count: liveCounts[site.id] ?? posts.filter(p => p.siteId === site.id && p.status === 'publish').length,
        loading: !!countsLoading[site.id],
      }))
      .sort((a, b) => b.count - a.count)
  }, [sites, posts, liveCounts, countsLoading])
  const leaderCount = leaderboard[0]?.count || 0

  // Fire the celebration once per site per target value — celebratedTargets
  // remembers the last target we already celebrated so re-renders (or
  // raising the bar after a previous win) don't re-trigger it endlessly.
  useEffect(() => {
    if (celebrating) return
    const win = leaderboard.find(s => s.target && s.count >= s.target && celebratedTargets[s.id] !== s.target)
    if (win) setCelebrating(win)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderboard, celebratedTargets])

  const closeCelebration = () => {
    if (celebrating) markTargetCelebrated(celebrating.id, celebrating.target)
    setCelebrating(null)
  }

  const writtenMap = useMemo(() => {
    const m = new Set()
    posts.forEach(p => m.add(`${p.siteId}||${normTitle(p.title)}`))
    return m
  }, [posts])
  const siteNameMap = useMemo(() => Object.fromEntries(sites.map(s => [s.name?.toLowerCase(), s])), [sites])
  const upNext = useMemo(() => findUpNext(writtenMap, siteNameMap), [writtenMap, siteNameMap])

  return (
    <div className="dashboard">
      {celebrating && (
        <TargetCelebration
          site={celebrating}
          target={celebrating.target}
          onClose={closeCelebration}
          onSetNewTarget={closeCelebration}
        />
      )}
      {/* Top bar */}
      <div className="dashboard-topbar">
        <div>
          <h1>Dashboard</h1>
          <p>Overview of your content and sites</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {syncMsg && (
            <span style={{ fontSize: 12, fontWeight: 600, color: syncMsg.startsWith('✗') ? 'var(--error)' : syncMsg.startsWith('✓') ? 'var(--success)' : 'var(--text-secondary)' }}>
              {syncMsg}
            </span>
          )}
          {!syncMsg && lastSync && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Last sync: {formatRelative(lastSync)}
            </span>
          )}
          <button className="btn btn-primary btn-sm" onClick={handleSync} disabled={syncing}>
            <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" style={syncing ? { animation: 'spin 0.8s linear infinite' } : undefined}>
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.609-1.276z" clipRule="evenodd"/>
            </svg>
            {syncing ? 'Syncing…' : 'Sync All Sites'}
          </button>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <div className="dashboard-date">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/></svg>
            {formatDate()}
          </div>
        </div>
      </div>

      {/* Today's Next Post */}
      {upNext && (
        <div
          className="db-next-post"
          style={{ '--np-color': upNext.site?.color || '#6366f1' }}
        >
          <div className="db-np-left">
            <div className="db-np-eyebrow">
              <span className="db-np-dot" />
              TODAY'S NEXT POST
            </div>
            <div className="db-np-title">{upNext.postTitle}</div>
            <div className="db-np-meta">
              <span className="db-np-badge" style={{
                background: (upNext.site?.color || '#6366f1') + '22',
                color: upNext.site?.color || '#6366f1',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}>
                {upNext.site && <SiteAvatar site={upNext.site} size={14} radius={4} />}
                {upNext.series.siteName}
              </span>
              <span className="db-np-series">{upNext.series.series} · #{upNext.postNum}</span>
            </div>
          </div>
          <div className="db-np-actions">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                localStorage.setItem('ct_prefill_title', upNext.postTitle)
                localStorage.setItem('ct_prefill_site', upNext.site?.id || '')
                navigate('create')
              }}
            >
              ✍️ Write Now
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('content-plan')}>
              View Plan
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid">
        <StatCard
          value={stats.total} label="Total Posts" sub={`Across ${sites.length} sites`}
          color="#6366f1" bgColor="#eef2ff"
          onClick={() => navigate('all-posts')}
          icon={<svg viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/><path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd"/></svg>}
        />
        <StatCard
          value={stats.published} label="Published Posts" sub={`${stats.total ? Math.round(stats.published / stats.total * 100) : 0}% of total`}
          color="#10b981" bgColor="#dcfce7"
          onClick={() => navigate('published')}
          icon={<svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>}
        />
        <StatCard
          value={stats.drafts} label="Drafts" sub="Need your attention"
          color="#f59e0b" bgColor="#fef9c3"
          onClick={() => navigate('drafts')}
          icon={<svg viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"/></svg>}
        />
        <StatCard
          value={stats.today} label="Posts Today" sub={`${connectedCount} sites connected`}
          color="#3b82f6" bgColor="#dbeafe"
          onClick={() => navigate('calendar')}
          icon={<svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/></svg>}
        />
      </div>

      {/* Targets */}
      <div className="card">
        <div className="card-header">
          <h3>🎯 Site Targets</h3>
        </div>
        <div className="card-header-sub">Set how many articles you want each site to reach, and by when</div>
        <div className="target-list">
          {leaderboard.map(site => (
            <TargetRow key={site.id} site={site} onSave={setSiteTarget} onClear={clearSiteTarget} />
          ))}
        </div>
      </div>

      {/* Sites + Activity */}
      <div className="dashboard-grid">
        {/* Sites overview */}
        <div className="card">
          <div className="card-header">
            <h3>🏆 Sites Leaderboard</h3>
            <button className="card-link" onClick={() => navigate('sites')}>Manage Sites</button>
          </div>
          <div className="card-header-sub">Ranked by published articles — close the gap to rank up</div>
          <div className="leaderboard">
            {leaderboard.map((site, i) => {
              const rank = i + 1
              const prev = leaderboard[i - 1]
              const pct = leaderCount ? Math.max((site.count / leaderCount) * 100, site.count > 0 ? 3 : 0) : 0
              const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null
              const gap = prev ? prev.count - site.count : 0
              return (
                <div key={site.id} className={`leaderboard-row${rank === 1 && site.count > 0 ? ' is-leader' : ''}`}>
                  <div className="lb-rank">{medal || `#${rank}`}</div>
                  <SiteAvatar site={site} size={30} radius={8} />
                  <div className="lb-info">
                    <div className="lb-top">
                      <span className="lb-name">{site.name}</span>
                      <span className="lb-count">{site.loading ? '…' : site.count}</span>
                    </div>
                    <div className="lb-bar-track">
                      <div className="lb-bar-fill" style={{ width: `${pct}%`, background: site.color }} />
                    </div>
                    <div className="lb-gap">
                      {rank === 1
                        ? (leaderboard.length > 1 && leaderCount > 0 ? `🔥 Leading by ${gap >= 0 ? gap : 0}` : 'No posts yet')
                        : gap === 0
                          ? `Tied with ${prev.name}`
                          : `📈 ${gap} article${gap === 1 ? '' : 's'} behind ${prev.name} to rank up`}
                    </div>
                  </div>
                  <div className={`site-card-status ${site.connected ? 'connected' : 'disconnected'}`}>
                    <div className="status-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: site.connected ? 'var(--success)' : '#d1d5db' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Activity */}
        <div className="card">
          <div className="card-header">
            <h3>Recent Activity</h3>
            <button className="card-link" onClick={() => navigate('all-posts')}>View All</button>
          </div>
          <div className="card-header-sub">Latest actions across all sites</div>
          <div className="activity-list">
            {activity.length === 0 ? (
              <div className="empty-state" style={{ padding: '30px 0' }}>
                <p>No activity yet. Create your first post!</p>
              </div>
            ) : activity.slice(0, 8).map(item => {
              const config = ACTIVITY_ICONS[item.type] || ACTIVITY_ICONS.draft_saved
              return (
                <div key={item.id} className="activity-item">
                  <div className="activity-icon" style={{ background: config.bg, color: config.color }}>
                    {config.icon}
                  </div>
                  <div className="activity-text">
                    <div className="activity-title">{item.title}</div>
                    <div className="activity-meta">
                      {item.type === 'published' ? 'Published on' : item.type === 'target_set' ? 'Target set for' : 'Draft saved on'} {item.siteName}
                    </div>
                  </div>
                  <div className="activity-time">{formatRelative(item.timestamp)}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="charts-grid">
        {/* Publishing trend */}
        <div className="card">
          <div className="card-header">
            <h3>Publishing Trend</h3>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Posts published in last 7 days</span>
          </div>
          <div style={{ marginTop: 16 }}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={trendData} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={24} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}
                  cursor={{ fill: 'var(--bg-tertiary)' }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullLabel || ''}
                />
                <Bar dataKey="count" fill="#6366f1" radius={[5, 5, 0, 0]} name="Posts" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Post distribution */}
        <div className="card">
          <div className="card-header">
            <h3>Post Distribution</h3>
          </div>
          <div className="card-header-sub">Posts by site</div>
          {donutData.length === 0 ? (
            <div className="empty-state" style={{ padding: '30px 0' }}>
              <p>Create posts to see distribution</p>
            </div>
          ) : (
            <div className="donut-layout">
              <ResponsiveContainer width={120} height={120}>
                <PieChart>
                  <Pie data={donutData} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={2}>
                    {donutData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="donut-legend">
                {donutData.slice(0, 6).map((item, i) => (
                  <div key={i} className="legend-item">
                    <div className="legend-dot" style={{ background: item.color }} />
                    <span className="legend-name">{item.name}</span>
                    <span className="legend-val">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
