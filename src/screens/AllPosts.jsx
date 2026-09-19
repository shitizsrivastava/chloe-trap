import React, { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { useNotify } from '../context/NotificationContext'
import { fetchPosts, createPost, updatePost as wpUpdatePost, deletePost as wpDeletePost, resolveTaxonomyTerms } from '../utils/wordpress'
import SiteAvatar from '../components/SiteAvatar'
import './AllPosts.css'

const PAGE_SIZE = 20

function healthScore(post) {
  let score = 0
  const title = (post.title || '').replace(/<[^>]+>/g, '').trim()
  const wc = post.wc || Math.round((post.content || '').replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length)
  const days = Math.floor((Date.now() - new Date(post.createdAt).getTime()) / 86400000)
  if (title.length >= 20) score += 15
  else if (title.length > 5) score += 8
  if (wc >= 1000) score += 30
  else if (wc >= 600) score += 20
  else if (wc >= 300) score += 10
  if (post.seo?.metaDesc?.length >= 80) score += 20
  if (post.seo?.focusKeyword?.trim()) score += 15
  if (days < 180) score += 10
  else if (days < 365) score += 5
  if (post.status === 'publish') score += 10
  return Math.min(score, 100)
}
function healthGrade(score) {
  if (score >= 80) return { grade: 'A', color: '#16a34a', bg: '#dcfce7' }
  if (score >= 60) return { grade: 'B', color: '#ca8a04', bg: '#fef9c3' }
  if (score >= 40) return { grade: 'C', color: '#d97706', bg: '#fef3c7' }
  return { grade: 'D', color: '#dc2626', bg: '#fee2e2' }
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function DuplicateModal({ post, sites, onClose }) {
  const { addPost } = useApp()
  const { notifySuccess, notifyError } = useNotify()
  const connectedSites = sites.filter(s => s.connected && s.username && s.password && s.id !== post.siteId)
  const [targetSiteId, setTargetSiteId] = useState(connectedSites[0]?.id || '')
  const [newTitle, setNewTitle] = useState(post.title + ' (Copy)')
  const [newCats, setNewCats] = useState(post.categories?.join(', ') || '')
  const [publishing, setPublishing] = useState(false)
  const [done, setDone] = useState('')

  const handleDuplicate = async () => {
    const site = sites.find(s => s.id === targetSiteId)
    if (!site) return
    setPublishing(true)
    // WP REST rejects the entire create request with a 400 if categories
    // aren't numeric term IDs — this duplicates to a DIFFERENT site than the
    // post came from, so even IDs copied from the original post's category
    // list would be wrong here anyway. Resolve by name on the target site,
    // same as Create Post already does.
    const catNames = newCats.split(',').map(c => c.trim()).filter(Boolean)
    const categories = catNames.length > 0 ? await resolveTaxonomyTerms(site, 'categories', catNames) : []
    const postData = { title: newTitle, content: post.content || '', status: 'draft', categories, seo: post.seo || {} }
    const result = await createPost(site, postData)
    if (result.success) {
      addPost({ ...postData, siteId: targetSiteId, wpPostId: result.post.id, wpLink: result.post.link })
      setDone(`✓ Duplicated to ${site.name} as draft`)
      notifySuccess(`✓ Duplicated "${newTitle}" to ${site.name} as draft`)
    } else {
      setDone(`✗ Error: ${result.error}`)
      notifyError(`Failed to duplicate "${newTitle}" to ${site.name}: ${result.error}`, { site: site.name, action: 'Duplicate Post' })
    }
    setPublishing(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Duplicate & Cross-Post</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="modal-field">
            <label>Target Site</label>
            {connectedSites.length === 0
              ? <p style={{ color: 'var(--error)', fontSize: 12 }}>No other connected sites available.</p>
              : <select value={targetSiteId} onChange={e => setTargetSiteId(e.target.value)} className="modal-select">
                  {connectedSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
            }
          </div>
          <div className="modal-field">
            <label>Post Title</label>
            <input className="modal-input" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
          </div>
          <div className="modal-field">
            <label>Categories (comma separated)</label>
            <input className="modal-input" value={newCats} onChange={e => setNewCats(e.target.value)} placeholder="e.g. News, Health" />
          </div>
          {done && <div style={{ fontSize: 12, color: done.startsWith('✓') ? 'var(--success)' : 'var(--error)', marginTop: 8 }}>{done}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleDuplicate} disabled={publishing || !targetSiteId || !newTitle.trim()}>
            {publishing ? 'Duplicating…' : 'Duplicate as Draft'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AllPosts({ navigate, statusFilter: initialStatus, initialSiteId }) {
  const { posts, sites, deletePost, setPosts, updatePost } = useApp()
  const { notifySuccess, notifyError, notifyInfo, notifyWarning } = useNotify()
  const [siteFilter, setSiteFilter] = useState(initialSiteId || 'all')
  const [statusFilter, setStatusFilter] = useState(initialStatus || 'all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [bulkAction, setBulkAction] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [duplicatePost, setDuplicatePost] = useState(null)

  const connectedSites = sites.filter(s => s.connected && s.username && s.password)

  const handleSync = async () => {
    const targetSites = siteFilter === 'all' ? connectedSites : connectedSites.filter(s => s.id === siteFilter)
    if (targetSites.length === 0) { setSyncMsg('No connected sites.'); setTimeout(() => setSyncMsg(''), 3000); return }
    setSyncing(true); setSyncMsg(''); let total = 0
    const truncatedSites = []
    for (const site of targetSites) {
      const MAX_PAGES = 5
      for (let pg = 1; pg <= MAX_PAGES; pg++) {
        const result = await fetchPosts(site, { per_page: 20, page: pg, status: statusFilter === 'all' ? 'any' : statusFilter })
        if (!result.success || result.posts.length === 0) break
        setPosts(prev => {
          const existing = new Set(prev.map(p => `${p.siteId}:${p.wpPostId}`))
          const newPosts = result.posts.filter(wp => !existing.has(`${site.id}:${wp.id}`)).map(wp => ({
            localId: Date.now() + Math.random(), siteId: site.id, wpPostId: wp.id, wpLink: wp.link,
            title: wp.title?.rendered || '(Untitled)', content: wp.content?.rendered || '',
            status: wp.status, createdAt: wp.date,
          }))
          total += newPosts.length
          return [...newPosts, ...prev]
        })
        if (result.posts.length < 20) break
        // A full page at the cap means there were more posts still waiting —
        // this sync stopped without checking them, so older/overlooked posts
        // for this site may not have been picked up.
        if (pg === MAX_PAGES) truncatedSites.push(site.name)
      }
    }
    setSyncing(false)
    setSyncMsg(total > 0 ? `✓ Imported ${total} new post${total !== 1 ? 's' : ''}` : '✓ Up to date')
    setTimeout(() => setSyncMsg(''), 4000)
    notifySuccess(total > 0 ? `✓ Synced ${total} new post${total !== 1 ? 's' : ''} from WordPress` : 'Already up to date — no new posts found')
    if (truncatedSites.length > 0) {
      notifyWarning(`${truncatedSites.join(', ')} had more matching posts than this sync checked (100+) — some older posts may be missing.`)
    }
  }

  const filtered = useMemo(() => posts.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false
    if (siteFilter !== 'all' && p.siteId !== siteFilter) return false
    if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [posts, statusFilter, siteFilter, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const toggleSelect = (localId) => setSelected(prev => {
    const next = new Set(prev)
    next.has(localId) ? next.delete(localId) : next.add(localId)
    return next
  })

  const toggleSelectAll = () => {
    if (selected.size === paginated.length) setSelected(new Set())
    else setSelected(new Set(paginated.map(p => p.localId)))
  }

  const applyBulkAction = async () => {
    if (!bulkAction || selected.size === 0) return
    const targets = posts.filter(p => selected.has(p.localId))

    if (bulkAction === 'delete') {
      if (!window.confirm(`Delete ${selected.size} post(s) from ChloeTrap?`)) return
      selected.forEach(id => deletePost(id))
      notifySuccess(`✓ Removed ${selected.size} post(s) from ChloeTrap`)
      setSelected(new Set())
      setBulkAction('')
      return
    }

    const newStatus = bulkAction === 'publish' ? 'publish' : 'draft'
    setBulkBusy(true)
    let succeeded = 0
    let failed = 0
    for (const post of targets) {
      const site = sites.find(s => s.id === post.siteId)
      // Push the status change to the live site when this post was actually
      // synced/published there — otherwise it's a local-only draft.
      if (site?.connected && site.username && site.password && post.wpPostId) {
        const result = await wpUpdatePost(site, post.wpPostId, { status: newStatus })
        if (!result.success) {
          failed++
          notifyError(`Failed to mark "${post.title}" as ${newStatus} on ${site.name}: ${result.error}`, { site: site.name, action: 'Bulk Status Update' })
          continue
        }
      }
      updatePost(post.localId, { status: newStatus })
      succeeded++
    }
    setBulkBusy(false)
    setSelected(new Set())
    setBulkAction('')
    if (succeeded > 0) notifySuccess(`✓ Marked ${succeeded} post(s) as ${newStatus}${failed > 0 ? ` (${failed} failed — see Error Log)` : ''}`)
    else if (failed > 0) notifyError(`All ${failed} update(s) failed — see Error Log for details`)
  }

  const pageTitle = statusFilter === 'draft' ? 'Drafts' : statusFilter === 'publish' ? 'Published Posts' : 'All Posts'

  return (
    <div className="all-posts">
      <div className="page-header-row" style={{ padding: '28px 32px 0' }}>
        <div>
          <h1>{pageTitle}</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
            {statusFilter === 'draft' ? 'Your saved drafts' : statusFilter === 'publish' ? 'Live posts across all sites' : 'All posts across all sites'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {syncMsg && <span style={{ fontSize: 12, color: syncMsg.startsWith('✓') ? 'var(--success)' : 'var(--error)', fontWeight: 500 }}>{syncMsg}</span>}
          <button className="btn btn-secondary btn-sm" onClick={handleSync} disabled={syncing}>
            <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd"/></svg>
            {syncing ? 'Syncing…' : 'Sync from WordPress'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="posts-filters">
        <select className="filter-select" value={siteFilter} onChange={e => { setSiteFilter(e.target.value); setPage(1) }}>
          <option value="all">All Sites</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="filter-select" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
          <option value="all">All Statuses</option>
          <option value="publish">Published</option>
          <option value="draft">Drafts</option>
          <option value="pending">Pending Review</option>
          <option value="future">Scheduled</option>
        </select>
        <div className="search-input-wrap">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/></svg>
          <input className="search-input" placeholder="Search posts…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => navigate('create')}>
          <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/></svg>
          New Post
        </button>
        <span className="posts-count">{filtered.length} post{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Bulk action toolbar */}
      {selected.size > 0 && (
        <div className="bulk-toolbar">
          <span className="bulk-count">{selected.size} selected</span>
          <select className="bulk-select" value={bulkAction} onChange={e => setBulkAction(e.target.value)}>
            <option value="">Bulk action…</option>
            <option value="publish">Mark as Published</option>
            <option value="draft">Mark as Draft</option>
            <option value="delete">Delete from ChloeTrap</option>
          </select>
          <button className="btn btn-sm btn-secondary" onClick={applyBulkAction} disabled={!bulkAction || bulkBusy}>{bulkBusy ? 'Applying…' : 'Apply'}</button>
          <button className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set())}>Clear selection</button>
        </div>
      )}

      {/* Table */}
      <div className="posts-table-wrap">
        {paginated.length === 0 ? (
          <div className="empty-state">
            <svg width="40" height="40" viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/><path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5z" clipRule="evenodd"/></svg>
            <p>{search || siteFilter !== 'all' ? 'No posts match your filters.' : statusFilter === 'draft' ? 'No drafts yet.' : 'No posts yet.'}</p>
            {!search && siteFilter === 'all' && !statusFilter && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn btn-secondary btn-sm" onClick={handleSync} disabled={syncing}>{syncing ? 'Syncing…' : '↻ Sync from WordPress'}</button>
                <button className="btn btn-primary btn-sm" onClick={() => navigate('create')}>+ New Post</button>
              </div>
            )}
          </div>
        ) : (
          <>
            <table className="posts-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input type="checkbox" checked={selected.size === paginated.length && paginated.length > 0} onChange={toggleSelectAll} style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />
                  </th>
                  <th>Title</th>
                  <th>Site</th>
                  <th>Health</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(post => {
                  const site = sites.find(s => s.id === post.siteId)
                  return (
                    <tr key={post.localId} className={selected.has(post.localId) ? 'selected-row' : ''}>
                      <td>
                        <input type="checkbox" checked={selected.has(post.localId)} onChange={() => toggleSelect(post.localId)} style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />
                      </td>
                      <td className="post-title-cell">
                        <span className="post-title-text" title={post.title}>{post.title || '(Untitled)'}</span>
                        {post.wpLink && (
                          <a href="#" onClick={e => { e.preventDefault(); window.open(post.wpLink) }} style={{ fontSize: 11, color: 'var(--primary)', display: 'block', marginTop: 2 }}>View on site →</a>
                        )}
                      </td>
                      <td>
                        {site ? (
                          <div className="post-site-cell">
                            <SiteAvatar site={site} size={22} radius={5} />
                            {site.name}
                          </div>
                        ) : <span style={{ color: 'var(--text-muted)' }}>Unknown</span>}
                      </td>
                      <td>
                        {(() => {
                          const s = healthScore(post)
                          const { grade, color, bg } = healthGrade(s)
                          return <span title={`Health score: ${s}/100`} style={{ fontWeight: 800, fontSize: 12, padding: '2px 8px', borderRadius: 6, background: bg, color, display: 'inline-block' }}>{grade} <span style={{ fontWeight: 400, fontSize: 10 }}>{s}</span></span>
                        })()}
                      </td>
                      <td><span className={`badge badge-${post.status}`}>{post.status || 'draft'}</span></td>
                      <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{formatDate(post.createdAt)}</td>
                      <td>
                        <div className="post-actions">
                          <button className="action-btn" onClick={() => navigate('create', post)} title="Edit">
                            <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zm-2.207 2.207L3 13.172V16h2.828l8.38-8.379-2.83-2.828z"/></svg> Edit
                          </button>
                          <button className="action-btn" onClick={() => setDuplicatePost(post)} title="Duplicate to another site">
                            <svg viewBox="0 0 20 20" fill="currentColor"><path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z"/><path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z"/></svg> Duplicate
                          </button>
                          {post.wpLink && (
                            <button className="action-btn" onClick={() => window.open(post.wpLink)} title="View on site">
                              <svg viewBox="0 0 20 20" fill="currentColor"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"/><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"/></svg> View
                            </button>
                          )}
                          <button className="action-btn delete" onClick={() => { if (window.confirm(`Delete "${post.title}"?`)) { deletePost(post.localId); notifyInfo(`Removed "${post.title}" from ChloeTrap (not deleted from WordPress)`) } }} title="Delete">
                            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zm-1 8a1 1 0 112 0v3a1 1 0 11-2 0V10zm5-1a1 1 0 00-1 1v3a1 1 0 102 0v-3a1 1 0 00-1-1z" clipRule="evenodd"/></svg> Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="pagination">
                <button className="page-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>‹</button>
                {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map(p => (
                  <button key={p} className={`page-btn ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>{p}</button>
                ))}
                {totalPages > 10 && <span style={{ padding: '0 4px', color: 'var(--text-muted)' }}>…{totalPages}</span>}
                <button className="page-btn" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>›</button>
              </div>
            )}
          </>
        )}
      </div>

      {duplicatePost && <DuplicateModal post={duplicatePost} sites={sites} onClose={() => setDuplicatePost(null)} />}
    </div>
  )
}
