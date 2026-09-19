import React, { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import SiteAvatar from '../components/SiteAvatar'
import './ContentRefresh.css'

function staleness(post) {
  const days = Math.floor((Date.now() - new Date(post.createdAt).getTime()) / 86400000)
  const wc = post.wc || 0
  const agePenalty = Math.min(days / 30, 10)
  const wcPenalty = Math.max(0, (800 - wc) / 800) * 5
  return Math.round((agePenalty + wcPenalty) * 10) / 10
}

function daysOld(post) {
  return Math.floor((Date.now() - new Date(post.createdAt).getTime()) / 86400000)
}

function badgeInfo(post) {
  const days = daysOld(post)
  const wc = post.wc || 0
  if (days >= 180 && wc < 600) return { label: 'Critical', color: '#dc2626', bg: '#fee2e2' }
  if (days >= 365) return { label: 'Stale', color: '#d97706', bg: '#fef3c7' }
  if (wc < 400) return { label: 'Thin', color: '#2563eb', bg: '#dbeafe' }
  return { label: 'Aging', color: '#7c3aed', bg: '#ede9fe' }
}

export default function ContentRefresh({ navigate }) {
  const { posts, sites } = useApp()
  const [siteFilter, setSiteFilter] = useState('all')
  const [sort, setSort] = useState('score')
  const [badgeFilter, setBadgeFilter] = useState('all')

  const staleThreshold = 90

  const stalePosts = useMemo(() => {
    return posts
      .filter(p => daysOld(p) >= staleThreshold)
      .map(p => ({ ...p, _score: staleness(p), _days: daysOld(p), _badge: badgeInfo(p) }))
  }, [posts])

  const filtered = useMemo(() => {
    return stalePosts
      .filter(p => {
        if (siteFilter !== 'all' && p.siteId !== siteFilter) return false
        if (badgeFilter !== 'all' && p._badge.label !== badgeFilter) return false
        return true
      })
      .sort((a, b) => {
        if (sort === 'score') return b._score - a._score
        if (sort === 'age') return b._days - a._days
        if (sort === 'wc') return (a.wc || 0) - (b.wc || 0)
        return 0
      })
  }, [stalePosts, siteFilter, badgeFilter, sort])

  const critCount   = stalePosts.filter(p => p._badge.label === 'Critical').length
  const staleCount  = stalePosts.filter(p => p._badge.label === 'Stale').length
  const thinCount   = stalePosts.filter(p => p._badge.label === 'Thin').length

  const handleRefresh = (post) => {
    try {
      localStorage.setItem('hz_prefill_content', post.content || '')
      localStorage.setItem('hz_prefill_title', post.title?.replace(/<[^>]+>/g, '') || '')
    } catch {}
    navigate('humanizer')
  }

  const handleEdit = (post) => {
    navigate('create', post)
  }

  if (posts.length === 0) {
    return (
      <div className="cr-screen">
        <div className="page-header-row">
          <div><h1>Content Refresh</h1><p className="page-subtitle">Sync your sites first</p></div>
        </div>
        <div className="cr-empty">
          <div className="cr-empty-icon">🔄</div>
          <p>No posts synced yet.</p>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('dashboard')}>Go to Dashboard →</button>
        </div>
      </div>
    )
  }

  return (
    <div className="cr-screen">
      <div className="page-header-row">
        <div>
          <h1>Content Refresh</h1>
          <p className="page-subtitle">
            {stalePosts.length} posts need updating — Google rewards freshness
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="cr-stats">
        {[
          { label: 'Critical', count: critCount, color: '#dc2626', bg: '#fee2e2', filter: 'Critical' },
          { label: 'Stale (1+ year)', count: staleCount, color: '#d97706', bg: '#fef3c7', filter: 'Stale' },
          { label: 'Thin content', count: thinCount, color: '#2563eb', bg: '#dbeafe', filter: 'Thin' },
          { label: 'Total flagged', count: stalePosts.length, color: '#7c3aed', bg: '#ede9fe', filter: 'all' },
        ].map(s => (
          <button
            key={s.filter}
            className={`cr-stat-card${badgeFilter === s.filter ? ' active' : ''}`}
            style={{ '--stat-color': s.color, '--stat-bg': s.bg }}
            onClick={() => setBadgeFilter(s.filter === badgeFilter ? 'all' : s.filter)}
          >
            <div className="cr-stat-num">{s.count}</div>
            <div className="cr-stat-label">{s.label}</div>
          </button>
        ))}
      </div>

      {/* Info */}
      <div className="cr-info">
        <span>💡</span>
        <span><strong>Critical</strong> = older than 6 months + under 600 words. <strong>Stale</strong> = over 1 year old. <strong>Thin</strong> = under 400 words. Use <strong>Refresh in Humanizer</strong> to expand and rewrite.</span>
      </div>

      {/* Filters */}
      <div className="cr-filters">
        <select className="cr-select" value={siteFilter} onChange={e => setSiteFilter(e.target.value)}>
          <option value="all">All sites</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="cr-select" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="score">Sort: Most urgent first</option>
          <option value="age">Sort: Oldest first</option>
          <option value="wc">Sort: Thinnest first</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="cr-empty">
          <p>No posts match this filter.</p>
        </div>
      ) : (
        <div className="cr-list">
          {filtered.map(post => {
            const site = sites.find(s => s.id === post.siteId)
            const wc = post.wc || 0
            return (
              <div key={post.localId} className="cr-row">
                <div className="cr-row-left">
                  {site && (
                    <SiteAvatar site={site} size={34} radius={8} />
                  )}
                  <div className="cr-info-col">
                    <div className="cr-title" dangerouslySetInnerHTML={{ __html: post.title || '(Untitled)' }} />
                    <div className="cr-meta">
                      <span>{site?.name}</span>
                      <span>·</span>
                      <span>{post._days} days old</span>
                      <span>·</span>
                      <span style={{ color: wc < 400 ? '#dc2626' : wc < 800 ? '#d97706' : 'var(--text-muted)' }}>
                        {wc} words
                      </span>
                      {post.wpLink && (
                        <>
                          <span>·</span>
                          <a href="#" className="cr-link" onClick={e => { e.preventDefault(); window.open(post.wpLink) }}>View →</a>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="cr-row-right">
                  <span className="cr-badge" style={{ background: post._badge.bg, color: post._badge.color }}>
                    {post._badge.label}
                  </span>
                  <span className="cr-score" title="Urgency score">🔥 {post._score}</span>
                  <button className="cr-btn cr-btn-humanize" onClick={() => handleRefresh(post)}>
                    ✨ Refresh
                  </button>
                  <button className="cr-btn cr-btn-edit" onClick={() => handleEdit(post)}>
                    ✏ Edit
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
