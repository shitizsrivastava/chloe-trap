import React, { useState, useMemo, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { useNotify } from '../context/NotificationContext'
import { callAI } from '../utils/aiCall'
import SiteAvatar from '../components/SiteAvatar'
import './BulkSEOEditor.css'

async function pushSEOToWP(site, wpPostId, seoFields) {
  try {
    const r = await fetch(`${site.url}/wp-json/wp/v2/posts/${wpPostId}`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${site.username}:${site.password}`),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: seoFields.title || undefined,
        meta: {
          rank_math_title: seoFields.seoTitle || '',
          rank_math_description: seoFields.metaDesc || '',
          rank_math_focus_keyword: seoFields.focusKeyword || '',
        },
      }),
    })
    return r.ok
  } catch { return false }
}

function metaDescColor(len) {
  if (!len) return '#dc2626'
  if (len < 120) return '#d97706'
  if (len <= 160) return '#16a34a'
  return '#d97706'
}

function buildMetaPrompt(title, content) {
  const plain = (content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400)
  return `Write a compelling SEO meta description for this blog post. Output ONLY the meta description (120-155 characters). No quotes, no labels, no explanation.

Post title: ${title}
Content snippet: ${plain}`
}

function Cell({ value, onChange, placeholder, maxLen, mono }) {
  return (
    <input
      className={`bse-cell${mono ? ' mono' : ''}`}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLen || 300}
      style={maxLen && value.length > maxLen ? { borderColor: '#dc2626' } : {}}
    />
  )
}

export default function BulkSEOEditor({ navigate }) {
  const { posts, sites, updatePost, settings } = useApp()
  const { notifySuccess, notifyError, notifyWarning } = useNotify()

  const [edits, setEdits] = useState({})
  const [pushing, setPushing] = useState({})
  const [pushed, setPushed] = useState({})
  const [errors, setErrors] = useState({})
  const [generating, setGenerating] = useState({})
  const [bulkGenerating, setBulkGenerating] = useState(false)
  const [siteFilter, setSiteFilter] = useState('all')
  const [showFilter, setShowFilter] = useState('all')
  const [search, setSearch] = useState('')

  const connectedSites = sites.filter(s => s.connected)

  const edit = useCallback((localId, field, value) => {
    setEdits(prev => ({
      ...prev,
      [localId]: { ...prev[localId], [field]: value },
    }))
  }, [])

  const getVal = (post, field) => {
    if (edits[post.localId]?.[field] !== undefined) return edits[post.localId][field]
    if (field === 'title') return post.title?.replace(/<[^>]+>/g, '') || ''
    return post.seo?.[field] || ''
  }

  const isDirty = (localId) => !!edits[localId] && Object.keys(edits[localId]).length > 0
  const dirtyCount = Object.keys(edits).filter(id => isDirty(id)).length

  const generateMeta = async (post) => {
    setGenerating(prev => ({ ...prev, [post.localId]: true }))
    try {
      const title = getVal(post, 'title')
      const text = await callAI(settings, buildMetaPrompt(title, post.content), 200)
      const clean = text.replace(/^["']|["']$/g, '').trim().slice(0, 160)
      edit(post.localId, 'metaDesc', clean)
      notifySuccess(`✓ AI-generated meta description for "${title}"`)
    } catch (e) {
      notifyError(`AI generation failed: ${e.message}`, { action: 'AI Generate Meta' })
    }
    setGenerating(prev => { const n = { ...prev }; delete n[post.localId]; return n })
  }

  const generateAllMissing = async () => {
    if (!settings?.geminiApiKey?.trim()) { notifyWarning('Add a Gemini API key in Settings → AI Configuration first.'); return }
    const targets = filtered.filter(p => getVal(p, 'metaDesc').length < 80)
    if (targets.length === 0) { notifySuccess('Every visible post already has a meta description.'); return }
    setBulkGenerating(true)
    for (const post of targets) await generateMeta(post)
    setBulkGenerating(false)
  }

  const filtered = useMemo(() => {
    return posts.filter(p => {
      if (siteFilter !== 'all' && p.siteId !== siteFilter) return false
      const metaDesc = getVal(p, 'metaDesc')
      if (showFilter === 'no-meta' && metaDesc.length >= 80) return false
      if (showFilter === 'no-keyword' && (p.seo?.focusKeyword || '').trim()) return false
      if (showFilter === 'dirty' && !isDirty(p.localId)) return false
      if (search) {
        const q = search.toLowerCase()
        const title = getVal(p, 'title').toLowerCase()
        if (!title.includes(q)) return false
      }
      return true
    })
  }, [posts, siteFilter, showFilter, search, edits])

  const noMetaCount = posts.filter(p => !(p.seo?.metaDesc?.length >= 80)).length

  const handlePushOne = async (post) => {
    const site = sites.find(s => s.id === post.siteId)
    if (!site?.connected || !post.wpPostId) {
      setErrors(prev => ({ ...prev, [post.localId]: 'Not connected or no WP ID' }))
      notifyError(`Cannot push SEO for "${post.title}" — site not connected or post has no WordPress ID`, { site: site?.name, action: 'Bulk SEO Push' })
      return
    }
    setPushing(prev => ({ ...prev, [post.localId]: true }))
    setErrors(prev => { const n = { ...prev }; delete n[post.localId]; return n })

    const fields = {
      title: getVal(post, 'title'),
      seoTitle: getVal(post, 'seoTitle'),
      metaDesc: getVal(post, 'metaDesc'),
      focusKeyword: getVal(post, 'focusKeyword'),
    }
    const ok = await pushSEOToWP(site, post.wpPostId, fields)

    if (ok && updatePost) {
      updatePost(post.localId, {
        title: fields.title,
        seo: { ...post.seo, seoTitle: fields.seoTitle, metaDesc: fields.metaDesc, focusKeyword: fields.focusKeyword },
      })
      setEdits(prev => { const n = { ...prev }; delete n[post.localId]; return n })
    }

    setPushing(prev => { const n = { ...prev }; delete n[post.localId]; return n })
    setPushed(prev => ({ ...prev, [post.localId]: ok ? 'ok' : 'fail' }))
    if (ok) {
      notifySuccess(`✓ SEO updated on ${site.name} for "${fields.title}"`)
    } else {
      setErrors(prev => ({ ...prev, [post.localId]: 'WP update failed — check credentials' }))
      notifyError(`Failed to push SEO for "${fields.title}" to ${site.name} — check credentials`, { site: site.name, action: 'Bulk SEO Push' })
    }
    setTimeout(() => setPushed(prev => { const n = { ...prev }; delete n[post.localId]; return n }), 4000)
  }

  const handlePushAll = async () => {
    const dirtyIds = Object.keys(edits).filter(id => isDirty(id))
    for (const id of dirtyIds) {
      const post = posts.find(p => String(p.localId) === String(id))
      if (post) await handlePushOne(post)
    }
  }

  return (
    <div className="bse-screen">
      <div className="page-header-row">
        <div>
          <h1>Bulk SEO Editor</h1>
          <p className="page-subtitle">
            Edit meta descriptions, focus keywords, and SEO titles for all posts across all sites — then push to WordPress in one click.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {dirtyCount > 0 && (
            <span className="bse-dirty-badge">{dirtyCount} unsaved</span>
          )}
          <button
            className="btn btn-secondary btn-sm"
            onClick={generateAllMissing}
            disabled={bulkGenerating}
            title="AI-generate meta descriptions for every visible post missing one"
          >
            {bulkGenerating ? '⟳ Generating…' : '✨ AI-fill Missing'}
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handlePushAll}
            disabled={dirtyCount === 0}
          >
            ⬆ Push {dirtyCount > 0 ? dirtyCount : 'All'} to WordPress
          </button>
        </div>
      </div>

      {noMetaCount > 0 && (
        <div className="bse-alert">
          <span>⚠</span>
          <span><strong>{noMetaCount} posts</strong> are missing a meta description — these won't show custom snippets in Google search results.</span>
          <button className="bse-alert-filter" onClick={() => setShowFilter('no-meta')}>Show only →</button>
        </div>
      )}

      {/* Filters */}
      <div className="bse-filters">
        <input
          className="bse-search"
          placeholder="Search posts…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="bse-select" value={siteFilter} onChange={e => setSiteFilter(e.target.value)}>
          <option value="all">All sites</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="bse-select" value={showFilter} onChange={e => setShowFilter(e.target.value)}>
          <option value="all">All posts</option>
          <option value="no-meta">Missing meta desc</option>
          <option value="no-keyword">No focus keyword</option>
          <option value="dirty">Unsaved changes</option>
        </select>
      </div>

      {posts.length === 0 ? (
        <div className="bse-empty">
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <p>No posts synced yet.</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Go to Dashboard and hit Sync All Sites first.</p>
          <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => navigate('dashboard')}>Go to Dashboard →</button>
        </div>
      ) : (
        <>
          <div className="bse-count">{filtered.length} of {posts.length} posts</div>
          <div className="bse-table-wrap">
            <table className="bse-table">
              <thead>
                <tr>
                  <th className="bse-th bse-th-site">Site</th>
                  <th className="bse-th bse-th-title">Post Title</th>
                  <th className="bse-th bse-th-keyword">Focus Keyword</th>
                  <th className="bse-th bse-th-meta">Meta Description <span className="bse-th-hint">120–160 chars</span></th>
                  <th className="bse-th bse-th-action"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(post => {
                  const site = sites.find(s => s.id === post.siteId)
                  const metaDesc = getVal(post, 'metaDesc')
                  const dirty = isDirty(post.localId)
                  const isPushing = pushing[post.localId]
                  const isGenerating = generating[post.localId]
                  const pushResult = pushed[post.localId]
                  const errMsg = errors[post.localId]

                  return (
                    <tr key={post.localId} className={`bse-row${dirty ? ' dirty' : ''}`}>
                      <td className="bse-td bse-td-site">
                        {site && <SiteAvatar site={site} size={28} radius={7} />}
                      </td>
                      <td className="bse-td bse-td-title">
                        <Cell
                          value={getVal(post, 'title')}
                          onChange={v => edit(post.localId, 'title', v)}
                          placeholder="Post title"
                        />
                        {post.wpLink && (
                          <a href="#" className="bse-view-link" onClick={e => { e.preventDefault(); window.open(post.wpLink) }}>View →</a>
                        )}
                      </td>
                      <td className="bse-td">
                        <Cell
                          value={getVal(post, 'focusKeyword')}
                          onChange={v => edit(post.localId, 'focusKeyword', v)}
                          placeholder="e.g. best running shoes"
                        />
                      </td>
                      <td className="bse-td bse-td-meta">
                        <div className="bse-meta-wrap">
                          <Cell
                            value={metaDesc}
                            onChange={v => edit(post.localId, 'metaDesc', v)}
                            placeholder="Write a 120–160 char meta description…"
                            maxLen={160}
                          />
                          <span
                            className="bse-char-count"
                            style={{ color: metaDescColor(metaDesc.length) }}
                          >
                            {metaDesc.length || 0}
                          </span>
                          <button
                            className="bse-ai-btn"
                            onClick={() => generateMeta(post)}
                            disabled={isGenerating}
                            title="AI-generate a meta description from this post's content"
                          >
                            {isGenerating ? '…' : '✨'}
                          </button>
                        </div>
                      </td>
                      <td className="bse-td bse-td-action">
                        {errMsg && <div className="bse-err">{errMsg}</div>}
                        <button
                          className={`bse-push-btn${pushResult === 'ok' ? ' ok' : pushResult === 'fail' ? ' fail' : ''}`}
                          onClick={() => handlePushOne(post)}
                          disabled={isPushing || (!dirty && !post.wpPostId)}
                          title={!post.wpPostId ? 'No WordPress ID — publish first' : !site?.connected ? 'Site not connected' : ''}
                        >
                          {isPushing ? '…' : pushResult === 'ok' ? '✓' : pushResult === 'fail' ? '✗' : '⬆'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
