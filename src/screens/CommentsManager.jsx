import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { useNotify } from '../context/NotificationContext'
import './CommentsManager.css'

async function fetchComments(site, status = 'hold') {
  try {
    const creds = btoa(`${site.username}:${site.password}`)
    const res = await fetch(`${site.url}/wp-json/wp/v2/comments?per_page=50&status=${status}`, {
      headers: { Authorization: `Basic ${creds}` }
    })
    if (!res.ok) return []
    return await res.json()
  } catch { return [] }
}

async function moderateComment(site, commentId, action) {
  try {
    const creds = btoa(`${site.username}:${site.password}`)
    const body = action === 'approve' ? { status: 'approved' }
               : action === 'spam'   ? { status: 'spam' }
               : null
    const res = body
      ? await fetch(`${site.url}/wp-json/wp/v2/comments/${commentId}`, {
          method: 'POST',
          headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      : await fetch(`${site.url}/wp-json/wp/v2/comments/${commentId}?force=true`, {
          method: 'DELETE',
          headers: { Authorization: `Basic ${creds}` },
        })
    return res.ok
  } catch { return false }
}

export default function CommentsManager() {
  const { sites } = useApp()
  const { notifySuccess, notifyError } = useNotify()
  const connectedSites = sites.filter(s => s.connected && s.username && s.password)
  const [tab, setTab]           = useState('hold')
  const [comments, setComments] = useState([])
  const [loading, setLoading]   = useState(false)
  const [actioning, setActioning] = useState({})
  const [siteFilter, setSiteFilter] = useState('all')

  const load = async () => {
    if (connectedSites.length === 0) return
    setLoading(true); setComments([])
    const targetSites = siteFilter === 'all' ? connectedSites : connectedSites.filter(s => s.id === siteFilter)
    const all = []
    await Promise.all(targetSites.map(async site => {
      const cs = await fetchComments(site, tab)
      cs.forEach(c => all.push({ ...c, _siteId: site.id, _siteName: site.name, _siteColor: site.color }))
    }))
    all.sort((a, b) => new Date(b.date) - new Date(a.date))
    setComments(all)
    setLoading(false)
  }

  useEffect(() => { load() }, [tab, siteFilter])

  const handleAction = async (comment, action) => {
    const site = connectedSites.find(s => s.id === comment._siteId)
    if (!site) return
    setActioning(prev => ({ ...prev, [comment.id]: action }))
    const ok = await moderateComment(site, comment.id, action)
    if (ok) {
      setComments(prev => prev.filter(c => !(c.id === comment.id && c._siteId === comment._siteId)))
      const verb = action === 'approve' ? 'Approved' : action === 'spam' ? 'Marked as spam' : 'Deleted'
      notifySuccess(`✓ ${verb} comment on ${site.name}`)
    } else {
      notifyError(`Failed to ${action} this comment on ${site.name}. Check the site's credentials and try again.`, { site: site.name, action: 'Comment Moderation' })
    }
    setActioning(prev => { const n = { ...prev }; delete n[comment.id]; return n })
  }

  const stripHtml = (html) => html?.replace(/<[^>]*>/g, '').trim() || ''

  return (
    <div className="comments-screen">
      <div className="comments-top">
        <div>
          <h1>Comments Manager</h1>
          <p>Moderate comments across all your WordPress sites</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
          {loading ? '⟳ Loading…' : '↻ Refresh'}
        </button>
      </div>

      <div className="comments-controls">
        <div className="comments-tabs">
          {[
            { key: 'hold',    label: 'Pending' },
            { key: 'approve', label: 'Approved' },
            { key: 'spam',    label: 'Spam' },
          ].map(t => (
            <button key={t.key} className={`comments-tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <select
          className="filter-select"
          value={siteFilter}
          onChange={e => setSiteFilter(e.target.value)}
          style={{ marginLeft: 'auto' }}
        >
          <option value="all">All Sites</option>
          {connectedSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div className="comments-list">
        {loading && (
          <div className="comments-empty"><div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}><span style={{ animation: 'spin 0.7s linear infinite', display: 'inline-block' }}>⟳</span> Loading comments…</div></div>
        )}
        {!loading && connectedSites.length === 0 && (
          <div className="comments-empty"><p>No connected sites. Add credentials in Site Manager first.</p></div>
        )}
        {!loading && comments.length === 0 && connectedSites.length > 0 && (
          <div className="comments-empty"><p>No {tab === 'hold' ? 'pending' : tab} comments found.</p></div>
        )}
        {!loading && comments.map((c, i) => (
          <div key={`${c._siteId}-${c.id}`} className="comment-row">
            <div className="comment-avatar">
              {c.author_name?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="comment-body">
              <div className="comment-meta">
                <strong className="comment-author">{c.author_name || 'Anonymous'}</strong>
                {c.author_email && <span className="comment-email">{c.author_email}</span>}
                <span className="comment-date">{new Date(c.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                <div className="comment-site-badge" style={{ background: c._siteColor + '20', color: c._siteColor }}>
                  {c._siteName}
                </div>
              </div>
              <div className="comment-text">{stripHtml(c.content?.rendered || '')}</div>
              {c.post && <div className="comment-post-link">On post #{c.post}</div>}
            </div>
            <div className="comment-actions">
              {tab === 'hold' && (
                <button className="comment-btn approve" onClick={() => handleAction(c, 'approve')} disabled={!!actioning[c.id]}>
                  {actioning[c.id] === 'approve' ? '…' : '✓ Approve'}
                </button>
              )}
              <button className="comment-btn spam" onClick={() => handleAction(c, 'spam')} disabled={!!actioning[c.id]}>
                {actioning[c.id] === 'spam' ? '…' : '⚑ Spam'}
              </button>
              <button className="comment-btn delete" onClick={() => handleAction(c, 'delete')} disabled={!!actioning[c.id]}>
                {actioning[c.id] === 'delete' ? '…' : '✕ Delete'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {!loading && comments.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>{comments.length} comment{comments.length !== 1 ? 's' : ''} loaded</div>
      )}
    </div>
  )
}
