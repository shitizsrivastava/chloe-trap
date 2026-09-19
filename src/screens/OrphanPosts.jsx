import React, { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import SiteAvatar from '../components/SiteAvatar'
import './OrphanPosts.css'

function extractLinkedUrls(html) {
  const urls = new Set()
  const matches = html?.matchAll(/href=["']([^"']+)["']/g) || []
  for (const m of matches) urls.add(m[1].replace(/\/$/, '').toLowerCase())
  return urls
}

export default function OrphanPosts({ navigate }) {
  const { posts, sites } = useApp()
  const [siteFilter, setSiteFilter] = useState('all')
  const [sort, setSort] = useState('date')

  const { orphans, linkedMap } = useMemo(() => {
    const linkedMap = {}
    // Only links inside published content count toward "linked" — a link
    // sitting in an unpublished draft isn't crawlable yet, so it shouldn't
    // be able to make a genuinely orphaned live post look linked.
    for (const p of posts) {
      if (!p.content || p.status !== 'publish') continue
      const urls = extractLinkedUrls(p.content)
      for (const url of urls) linkedMap[url] = (linkedMap[url] || 0) + 1
    }

    // wpLink is set for drafts and scheduled posts too (WordPress computes a
    // permalink for any post), so it must be paired with a status check —
    // otherwise every synced draft counts as a "published" post that's
    // "orphaned", when it was never live for Google to discover anyway.
    const orphans = posts.filter(p => {
      if (!p.wpLink || p.status !== 'publish') return false
      const url = p.wpLink.replace(/\/$/, '').toLowerCase()
      return !linkedMap[url]
    })

    return { orphans, linkedMap }
  }, [posts])

  const filtered = useMemo(() => {
    let list = orphans
    if (siteFilter !== 'all') list = list.filter(p => p.siteId === siteFilter)
    if (sort === 'date') list = [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    if (sort === 'alpha') list = [...list].sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    return list
  }, [orphans, siteFilter, sort])

  const siteOrphanCounts = useMemo(() => {
    const m = {}
    for (const p of orphans) m[p.siteId] = (m[p.siteId] || 0) + 1
    return m
  }, [orphans])

  const published = posts.filter(p => p.wpLink && p.status === 'publish')
  const linkedCount = published.length - orphans.length

  return (
    <div className="op-screen">
      <div className="page-header-row">
        <div>
          <h1>Orphan Posts Report</h1>
          <p className="page-subtitle">Posts with no internal links pointing to them — Google can't discover these through crawling.</p>
        </div>
      </div>

      {/* Stats */}
      <div className="op-stats">
        <div className="op-stat">
          <div className="op-stat-num" style={{ color: '#dc2626' }}>{orphans.length}</div>
          <div className="op-stat-label">Orphan posts</div>
        </div>
        <div className="op-stat">
          <div className="op-stat-num" style={{ color: '#16a34a' }}>{linkedCount}</div>
          <div className="op-stat-label">Linked posts</div>
        </div>
        <div className="op-stat">
          <div className="op-stat-num">{published.length}</div>
          <div className="op-stat-label">Total published</div>
        </div>
        <div className="op-stat">
          <div className="op-stat-num" style={{ color: orphans.length / Math.max(published.length, 1) > 0.4 ? '#dc2626' : '#d97706' }}>
            {Math.round((orphans.length / Math.max(published.length, 1)) * 100)}%
          </div>
          <div className="op-stat-label">Orphan rate</div>
        </div>
      </div>

      {/* Info */}
      <div className="op-info">
        <span>💡</span>
        <span>
          Orphan posts receive less PageRank because no internal pages link to them. Fix them by editing posts on the same site and adding links using the <strong>Internal Links</strong> panel in Create Post.
          {orphans.length > 0 && <> The <strong>Auto-link</strong> feature in the editor can insert them with one click.</>}
        </span>
      </div>

      {posts.length === 0 ? (
        <div className="op-empty">
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔗</div>
          <p>No posts synced yet.</p>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('dashboard')}>Go to Dashboard →</button>
        </div>
      ) : orphans.length === 0 ? (
        <div className="op-empty">
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
          <p style={{ color: '#16a34a' }}>No orphan posts found!</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>All your published posts have at least one internal link pointing to them.</p>
        </div>
      ) : (
        <>
          {/* Site breakdown */}
          <div className="op-site-breakdown">
            {sites.filter(s => siteOrphanCounts[s.id]).map(s => (
              <button
                key={s.id}
                className={`op-site-chip${siteFilter === s.id ? ' active' : ''}`}
                style={{ '--chip-color': s.color }}
                onClick={() => setSiteFilter(siteFilter === s.id ? 'all' : s.id)}
              >
                <span className="op-chip-dot" style={{ background: s.color }} />
                {s.name}
                <span className="op-chip-count">{siteOrphanCounts[s.id]}</span>
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="op-filters">
            <select className="op-select" value={siteFilter} onChange={e => setSiteFilter(e.target.value)}>
              <option value="all">All sites ({orphans.length})</option>
              {sites.filter(s => siteOrphanCounts[s.id]).map(s => (
                <option key={s.id} value={s.id}>{s.name} ({siteOrphanCounts[s.id]})</option>
              ))}
            </select>
            <select className="op-select" value={sort} onChange={e => setSort(e.target.value)}>
              <option value="date">Sort: Newest first</option>
              <option value="alpha">Sort: A–Z</option>
            </select>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
              {filtered.length} orphan post{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* List */}
          <div className="op-list">
            {filtered.map(post => {
              const site = sites.find(s => s.id === post.siteId)
              const days = Math.floor((Date.now() - new Date(post.createdAt).getTime()) / 86400000)
              return (
                <div key={post.localId} className="op-row">
                  <div className="op-row-left">
                    {site && <SiteAvatar site={site} size={34} radius={8} />}
                    <div className="op-info-col">
                      <div className="op-title" dangerouslySetInnerHTML={{ __html: post.title || '(Untitled)' }} />
                      <div className="op-meta">
                        <span>{site?.name}</span>
                        <span>·</span>
                        <span>{days} days old</span>
                        {post.wpLink && (
                          <>
                            <span>·</span>
                            <a href="#" className="op-link" onClick={e => { e.preventDefault(); window.open(post.wpLink) }}>View →</a>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="op-row-right">
                    <span className="op-badge">No inbound links</span>
                    <button
                      className="op-fix-btn"
                      onClick={() => navigate('create', post)}
                      title="Edit this post to add internal links"
                    >
                      ✏ Edit & fix
                    </button>
                    <button
                      className="op-fix-btn op-fix-btn-secondary"
                      onClick={() => {
                        localStorage.setItem('ct_prefill_title', '')
                        navigate('create')
                      }}
                      title="Write a new post that links to this one"
                    >
                      + New post linking to it
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
