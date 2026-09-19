import React, { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useNotify } from '../context/NotificationContext'
import { fetchPostCount, fetchCategories, deletePost as wpDeletePost } from '../utils/wordpress'
import SiteAvatar from '../components/SiteAvatar'
import './SiteDetail.css'

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function SiteDetail({ navigate, site: siteArg }) {
  const { sites, posts, syncAllSites, deletePost: localDeletePost } = useApp()
  const { notifySuccess, notifyError, notifyWarning } = useNotify()
  // Re-look the site up by id so this view stays fresh after credentials/status change elsewhere.
  const site = sites.find(s => s.id === siteArg?.id) || siteArg

  const [liveCount, setLiveCount] = useState(null)
  const [catCount, setCatCount] = useState(null)
  const [loadingStats, setLoadingStats] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const canQuery = site?.connected && site?.username && site?.password

  const loadStats = () => {
    if (!canQuery) { setLiveCount(null); setCatCount(null); return }
    setLoadingStats(true)
    Promise.all([
      fetchPostCount(site),
      fetchCategories(site),
    ]).then(([count, catRes]) => {
      setLiveCount(count)
      setCatCount(catRes.success ? catRes.categories.length : null)
    }).finally(() => setLoadingStats(false))
  }

  useEffect(loadStats, [site?.id, canQuery])

  const sitePosts = useMemo(
    () => posts.filter(p => p.siteId === site?.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [posts, site?.id]
  )
  const localPublished = sitePosts.filter(p => p.status === 'publish').length
  const localDrafts = sitePosts.filter(p => p.status === 'draft').length

  const goWrite = () => {
    localStorage.setItem('ct_prefill_site', site.id)
    navigate('create')
  }

  const handleSync = async () => {
    if (!canQuery || syncing) return
    setSyncing(true)
    try {
      const result = await syncAllSites(null, site.id)
      notifySuccess(`✓ Synced ${site.name} — ${result.posts} post(s) now match WordPress exactly`)
      if (result.truncatedSites?.length > 0) {
        notifyWarning(`${site.name} has more than 2,000 posts — this sync stopped early, so counts may be incomplete.`)
      }
      loadStats()
    } catch (e) {
      notifyError(`Failed to sync ${site.name}: ${e.message}`, { site: site.name, action: 'Sync Site' })
    }
    setSyncing(false)
  }

  const handleDeletePost = async (post) => {
    const label = (post.title || '(Untitled)').replace(/<[^>]+>/g, '').slice(0, 60)
    if (!window.confirm(`Delete "${label}"?\n\nThis removes it from ChloeTrap${post.wpPostId && canQuery ? ' and moves it to WordPress Trash.' : '.'}`)) return
    setDeletingId(post.localId)
    let wpOk = true
    if (post.wpPostId && canQuery) {
      const result = await wpDeletePost(site, post.wpPostId)
      wpOk = result.success
    }
    localDeletePost(post.localId)
    setDeletingId(null)
    if (wpOk) notifySuccess(`✓ Deleted "${label}"${post.wpPostId && canQuery ? ` and moved to Trash on ${site.name}` : ''}`)
    else notifyError(`Removed "${label}" from ChloeTrap, but failed to trash it on ${site.name}`, { site: site.name, action: 'Delete Post' })
  }

  if (!site) {
    return (
      <div className="sd-screen">
        <div className="sd-empty">
          <p>No site selected.</p>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('sites')}>Go to Site Manager →</button>
        </div>
      </div>
    )
  }

  return (
    <div className="sd-screen">
      <div className="sd-header">
        <SiteAvatar site={site} size={48} radius={12} />
        <div className="sd-header-info">
          <h1>{site.name}</h1>
          <a href="#" className="sd-url" onClick={e => { e.preventDefault(); window.open(site.url) }}>{site.url} ↗</a>
        </div>
        <span className={`sd-status ${site.connected ? 'connected' : 'disconnected'}`}>
          <span className="sd-status-dot" />
          {site.connected ? 'Connected' : 'Not connected'}
        </span>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('sites')}>⚙ Edit Credentials</button>
      </div>

      {!canQuery && (
        <div className="sd-warning">
          ⚠ This site isn't connected with valid credentials yet. Add a WordPress username and application password in Site Manager to see live stats and publish here.
        </div>
      )}

      <div className="sd-stats">
        <div className="sd-stat">
          <div className="sd-stat-val">{loadingStats ? '…' : liveCount ?? '—'}</div>
          <div className="sd-stat-lbl">Live Posts on Site</div>
        </div>
        <div className="sd-stat">
          <div className="sd-stat-val">{loadingStats ? '…' : catCount ?? '—'}</div>
          <div className="sd-stat-lbl">Categories</div>
        </div>
        <div className="sd-stat">
          <div className="sd-stat-val">{localPublished}</div>
          <div className="sd-stat-lbl">Synced Published</div>
        </div>
        <div className="sd-stat">
          <div className="sd-stat-val">{localDrafts}</div>
          <div className="sd-stat-lbl">Synced Drafts</div>
        </div>
      </div>

      <div className="sd-actions">
        <button className="sd-action-btn primary" onClick={goWrite}>✍️ Write New Post</button>
        <button className="sd-action-btn" onClick={handleSync} disabled={!canQuery || syncing} title={!canQuery ? 'Connect this site first' : 'Re-pull every post status from WordPress and fix any local mismatches'}>
          {syncing ? '⟳ Syncing…' : '🔄 Sync This Site'}
        </button>
        <button className="sd-action-btn" onClick={() => navigate('all-posts', site.id)}>📋 View All Posts</button>
        <button className="sd-action-btn" onClick={() => navigate('categories', site.id)} disabled={!canQuery}>🗂 Browse Categories</button>
        <button className="sd-action-btn" onClick={() => navigate('adsense')}>✅ AdSense Check</button>
      </div>

      <div className="sd-recent">
        <div className="sd-recent-head">
          <h3>Recent Posts (synced)</h3>
          <button className="card-link" onClick={() => navigate('all-posts', site.id)}>View all →</button>
        </div>
        {sitePosts.length === 0 ? (
          <div className="sd-empty-recent">
            No posts synced for this site yet. Click <strong>🔄 Sync This Site</strong> above.
          </div>
        ) : (
          <div className="sd-recent-list">
            {sitePosts.slice(0, 8).map(post => (
              <div key={post.localId} className="sd-recent-row">
                <span className={`sd-recent-badge ${post.status}`}>{post.status}</span>
                <span className="sd-recent-title" dangerouslySetInnerHTML={{ __html: post.title || '(Untitled)' }} />
                <span className="sd-recent-date">{formatDate(post.createdAt)}</span>
                {post.wpLink && (
                  <a href="#" className="sd-recent-link" onClick={e => { e.preventDefault(); window.open(post.wpLink) }}>View →</a>
                )}
                <button
                  className="sd-recent-delete"
                  onClick={() => handleDeletePost(post)}
                  disabled={deletingId === post.localId}
                  title="Delete this post"
                >
                  {deletingId === post.localId ? '…' : '🗑'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
