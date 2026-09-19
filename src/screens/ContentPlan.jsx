import React, { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { CONTENT_PLAN } from '../utils/contentPlanData'
import SiteAvatar from '../components/SiteAvatar'
import './ContentPlan.css'

const HTML_ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'", '&#8217;': "'", '&#8216;': "'", '&#8220;': '"', '&#8221;': '"', '&#8211;': '–', '&#8212;': '—', '&nbsp;': ' ' }

function decodeEntities(str) {
  return str.replace(/&[#a-z0-9]+;/gi, m => HTML_ENTITIES[m] || m)
}

function normalizeTitle(t) {
  return decodeEntities((t || '').replace(/<[^>]+>/g, '')).toLowerCase().replace(/\s+/g, ' ').trim()
}

function useWrittenMap(posts) {
  return useMemo(() => {
    const map = new Set()
    posts.forEach(p => map.add(`${p.siteId}||${normalizeTitle(p.title)}`))
    return map
  }, [posts])
}

function isWritten(writtenMap, siteId, title) {
  return writtenMap.has(`${siteId}||${normalizeTitle(title)}`)
}

// Find the "up next" post — first unwritten post in first unfinished series
function findUpNext(plan, writtenMap, resolveId = id => id) {
  for (const series of plan) {
    const sid = resolveId(series.siteId)
    for (let i = 0; i < series.posts.length; i++) {
      if (!isWritten(writtenMap, sid, series.posts[i])) {
        return { series, postIndex: i, postTitle: series.posts[i], postNum: i + 1, realSiteId: sid }
      }
    }
  }
  return null // all done!
}

// Find next unwritten per site (for the site quick-picks row)
function findNextPerSite(plan, writtenMap, resolveId = id => id) {
  const siteNext = {}
  for (const series of plan) {
    const sid = resolveId(series.siteId)
    if (siteNext[sid]) continue
    for (let i = 0; i < series.posts.length; i++) {
      if (!isWritten(writtenMap, sid, series.posts[i])) {
        siteNext[sid] = { series, postIndex: i, postTitle: series.posts[i], postNum: i + 1, realSiteId: sid }
        break
      }
    }
  }
  return siteNext
}

function getSectionLabel(sections, postNum) {
  for (const s of sections) {
    if (postNum >= s.range[0] && postNum <= s.range[1]) return s.label
  }
  return ''
}

export default function ContentPlan({ navigate }) {
  const { sites, posts } = useApp()
  const writtenMap = useWrittenMap(posts)

  // Map CONTENT_PLAN's hardcoded siteId → real AppContext siteId (match by site name)
  const cpSiteIdMap = useMemo(() => {
    const m = {}
    CONTENT_PLAN.forEach(s => {
      const real = sites.find(r => r.name?.toLowerCase() === s.siteName?.toLowerCase())
      if (real) m[s.siteId] = real.id
    })
    return m
  }, [sites])
  const resolveId = (cpSiteId) => cpSiteIdMap[cpSiteId] || cpSiteId

  const [expandedSeries, setExpandedSeries] = useState({})
  const [siteFilter, setSiteFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showOnlyUnwritten, setShowOnlyUnwritten] = useState(false)

  const upNext = useMemo(() => findUpNext(CONTENT_PLAN, writtenMap, resolveId), [writtenMap, cpSiteIdMap])
  const nextPerSite = useMemo(() => findNextPerSite(CONTENT_PLAN, writtenMap, resolveId), [writtenMap, cpSiteIdMap])
  const hasConnectedSites = sites.some(s => s.connected)

  const toggleSeries = (id) =>
    setExpandedSeries(prev => ({ ...prev, [id]: !prev[id] }))

  const writePost = (title, siteId, category) => {
    localStorage.setItem('ct_prefill_title', title)
    localStorage.setItem('ct_prefill_site', siteId)
    if (category) localStorage.setItem('ct_prefill_category', category)
    navigate('create')
  }

  // Stats
  const totalPosts = CONTENT_PLAN.reduce((s, x) => s + x.posts.length, 0)
  const writtenCount = CONTENT_PLAN.reduce((s, series) =>
    s + series.posts.filter(t => isWritten(writtenMap, resolveId(series.siteId), t)).length, 0)
  const overallPct = Math.round((writtenCount / totalPosts) * 100)

  // Unique sites in the plan (resolved to real site objects)
  const planSites = useMemo(() => {
    const seen = new Set()
    const result = []
    for (const s of CONTENT_PLAN) {
      const rid = resolveId(s.siteId)
      if (seen.has(rid)) continue
      seen.add(rid)
      const site = sites.find(r => r.id === rid)
      if (site) result.push(site)
    }
    return result
  }, [sites, cpSiteIdMap])

  const filtered = CONTENT_PLAN.filter(series => {
    if (siteFilter !== 'all' && resolveId(series.siteId) !== siteFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const inSeries = series.series.toLowerCase().includes(q)
      const inPosts = series.posts.some(p => p.toLowerCase().includes(q))
      if (!inSeries && !inPosts) return false
    }
    return true
  })

  const getSiteColor = (cpSiteId) => sites.find(s => s.id === resolveId(cpSiteId))?.color || '#6366f1'
  const getSite = (cpSiteId) => sites.find(s => s.id === resolveId(cpSiteId))

  return (
    <div className="cp-screen">

      {/* ── Header ── */}
      <div className="page-header-row">
        <div>
          <h1>Content Plan</h1>
          <p className="page-subtitle">
            {writtenCount} of {totalPosts} posts written across {CONTENT_PLAN.length} series — {overallPct}% complete
          </p>
        </div>
        <div className="cp-header-stats">
          <div className="cp-hs-item">
            <span className="cp-hs-val">{writtenCount}</span>
            <span className="cp-hs-lbl">Written</span>
          </div>
          <div className="cp-hs-item">
            <span className="cp-hs-val">{totalPosts - writtenCount}</span>
            <span className="cp-hs-lbl">Remaining</span>
          </div>
          <div className="cp-hs-item">
            <span className="cp-hs-val">{overallPct}%</span>
            <span className="cp-hs-lbl">Done</span>
          </div>
        </div>
      </div>

      {/* ── Sync nudge ── */}
      {!hasConnectedSites && (
        <div className="cp-sync-nudge">
          <span>🔌 Connect your WordPress sites in</span>
          <button className="cp-nudge-link" onClick={() => navigate('sites')}>Site Manager</button>
          <span>then hit <strong>Sync All Sites</strong> on the Dashboard — written posts will auto grey out.</span>
        </div>
      )}

      {/* ── UP NEXT BANNER ── */}
      {upNext ? (
        <div className="cp-upnext" style={{ '--site-color': getSiteColor(upNext.series.siteId) }}>
          <div className="cp-un-left">
            <div className="cp-un-eyebrow">
              <span className="cp-un-pulse" />
              TODAY'S NEXT POST
            </div>
            <div className="cp-un-title">{upNext.postTitle}</div>
            <div className="cp-un-meta">
              <span
                className="cp-un-site-badge"
                style={{ background: getSiteColor(upNext.series.siteId) + '22', color: getSiteColor(upNext.series.siteId), display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                {getSite(upNext.series.siteId) && <SiteAvatar site={getSite(upNext.series.siteId)} size={14} radius={4} />}
                {upNext.series.siteName}
              </span>
              <span className="cp-un-series">{upNext.series.series}</span>
              <span className="cp-un-num">Post #{upNext.postNum} of 100</span>
              <span className="cp-un-section">{getSectionLabel(upNext.series.sections, upNext.postNum)}</span>
            </div>
          </div>
          <button
            className="cp-un-btn"
            onClick={() => writePost(upNext.postTitle, upNext.realSiteId, upNext.series.category || upNext.series.series)}
          >
            ✍️ Write This Now
          </button>
        </div>
      ) : (
        <div className="cp-upnext cp-upnext--done">
          🎉 All {totalPosts.toLocaleString()} posts written. You're a content machine.
        </div>
      )}

      {/* ── SITE QUICK-PICKS ── */}
      <div className="cp-quickpicks">
        <div className="cp-qp-label">Next post per site</div>
        <div className="cp-qp-row">
          {planSites.map(site => {
            const next = nextPerSite[site.id]
            if (!next) return (
              <div key={site.id} className="cp-qp-card cp-qp-done">
                <SiteAvatar site={site} size={32} radius={8} />
                <div className="cp-qp-info">
                  <div className="cp-qp-site">{site.name}</div>
                  <div className="cp-qp-post">✅ All done!</div>
                </div>
              </div>
            )
            return (
              <div
                key={site.id}
                className="cp-qp-card"
                style={{ '--card-color': site.color }}
                onClick={() => writePost(next.postTitle, site.id, next.series.category || next.series.series)}
                title={`Write: ${next.postTitle}`}
              >
                <SiteAvatar site={site} size={32} radius={8} />
                <div className="cp-qp-info">
                  <div className="cp-qp-site">{site.name}</div>
                  <div className="cp-qp-post">#{next.postNum} · {next.postTitle}</div>
                  <div className="cp-qp-series">{next.series.series}</div>
                </div>
                <span className="cp-qp-arrow">→</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── FILTERS ── */}
      <div className="cp-filters">
        <div className="cp-filter-chips">
          <button
            className={`cp-chip${siteFilter === 'all' ? ' active' : ''}`}
            onClick={() => setSiteFilter('all')}
          >
            All Sites
          </button>
          {planSites.map(site => (
            <button
              key={site.id}
              className={`cp-chip${siteFilter === site.id ? ' active' : ''}`}
              style={siteFilter === site.id ? { background: site.color, borderColor: site.color, color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 5 } : { display: 'inline-flex', alignItems: 'center', gap: 5 }}
              onClick={() => setSiteFilter(site.id)}
            >
              <SiteAvatar site={site} size={14} radius={4} />
              {site.name}
            </button>
          ))}
        </div>
        <div className="cp-filter-right">
          <label className="cp-toggle-lbl">
            <input
              type="checkbox"
              checked={showOnlyUnwritten}
              onChange={e => setShowOnlyUnwritten(e.target.checked)}
            />
            Unwritten only
          </label>
          <input
            className="cp-search"
            placeholder="Search titles…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ── SERIES CARDS ── */}
      <div className="cp-series-list">
        {filtered.map(series => {
          const rid = resolveId(series.siteId)
          const siteColor = getSiteColor(series.siteId)
          const siteObj = getSite(series.siteId)
          const written = series.posts.filter(t => isWritten(writtenMap, rid, t)).length
          const total = series.posts.length
          const pct = Math.round((written / total) * 100)
          const isExpanded = expandedSeries[series.id]

          // Find posts to display (with optional unwritten filter + search)
          const displayPosts = series.posts.map((title, i) => ({
            title, num: i + 1,
            done: isWritten(writtenMap, rid, title),
            section: getSectionLabel(series.sections, i + 1),
          })).filter(p => {
            if (showOnlyUnwritten && p.done) return false
            if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false
            return true
          })

          // First unwritten in this series
          const nextInSeries = series.posts.findIndex(t => !isWritten(writtenMap, rid, t))

          return (
            <div key={series.id} className="cp-series-card" style={{ '--series-color': siteColor }}>
              {/* Card header */}
              <div className="cp-sc-header" onClick={() => toggleSeries(series.id)}>
                <div className="cp-sc-left">
                  {siteObj ? <SiteAvatar site={siteObj} size={38} radius={9} /> : <span className="cp-sc-avatar" style={{ background: siteColor }} />}
                  <div>
                    <div className="cp-sc-title">{series.series}</div>
                    <div className="cp-sc-site">{series.siteName}</div>
                  </div>
                </div>
                <div className="cp-sc-right">
                  <div className="cp-sc-progress-wrap">
                    <div className="cp-sc-bar-track">
                      <div
                        className="cp-sc-bar-fill"
                        style={{ width: `${pct}%`, background: pct === 100 ? '#16a34a' : siteColor }}
                      />
                    </div>
                    <span className="cp-sc-pct">{written}/{total}</span>
                  </div>
                  <span className={`cp-sc-chevron${isExpanded ? ' open' : ''}`}>▾</span>
                </div>
              </div>

              {/* Expanded posts list */}
              {isExpanded && (
                <div className="cp-sc-body">
                  {/* Section headers with counts */}
                  <div className="cp-sc-sections-overview">
                    {series.sections.map(sec => {
                      const secPosts = series.posts.slice(sec.range[0] - 1, sec.range[1])
                      const secDone = secPosts.filter(t => isWritten(writtenMap, rid, t)).length
                      return (
                        <span key={sec.label} className="cp-sec-pill">
                          {sec.label} <strong>{secDone}/{secPosts.length}</strong>
                        </span>
                      )
                    })}
                  </div>

                  <div className="cp-posts-list">
                    {displayPosts.map((post, i) => {
                      const isNext = post.num === nextInSeries + 1 && !post.done
                      // Section boundary
                      const prevSection = i > 0 ? displayPosts[i - 1].section : null
                      const showSectionHeader = post.section !== prevSection

                      return (
                        <React.Fragment key={post.num}>
                          {showSectionHeader && (
                            <div className="cp-section-header">{post.section}</div>
                          )}
                          <div className={`cp-post-row${post.done ? ' done' : ''}${isNext ? ' next' : ''}`}>
                            <span className="cp-post-check">
                              {post.done ? '✓' : isNext ? '→' : '○'}
                            </span>
                            <span className="cp-post-num">#{post.num}</span>
                            <span className="cp-post-title">{post.title}</span>
                            {!post.done && (
                              <button
                                className="cp-post-write-btn"
                                onClick={() => writePost(post.title, rid, series.category || series.series)}
                              >
                                Write
                              </button>
                            )}
                          </div>
                        </React.Fragment>
                      )
                    })}
                    {displayPosts.length === 0 && (
                      <div className="cp-posts-empty">No posts match the current filter.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div className="cp-empty">No series match your filter.</div>
      )}
    </div>
  )
}
