import React, { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { useNotify } from '../context/NotificationContext'
import SiteAvatar from '../components/SiteAvatar'
import './DuplicateChecker.css'

const HTML_ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'", '&#8217;': "'", '&#8216;': "'", '&#8220;': '"', '&#8221;': '"', '&#8211;': '–', '&#8212;': '—', '&nbsp;': ' ' }
const STOP = new Set(['the','a','an','is','are','was','were','in','on','at','to','for','of','and','or','but','with','how','what','why','when','which','who','can','do','does','did','will','would','could','should','this','that','these','those','its','our','your','my','their','be','been','being','have','has','had','not','by','as','from','into','through','about','up','down','out','i','you','we','they','he','she','it','your','all','any','more','most'])

function cleanTitle(t) {
  return (t || '').replace(/<[^>]+>/g, '').replace(/&[#a-z0-9]+;/gi, m => HTML_ENT[m] || m)
    .toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

function wordSet(t) {
  return new Set(cleanTitle(t).split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)))
}

function jaccard(a, b) {
  const sa = wordSet(a), sb = wordSet(b)
  if (sa.size === 0 && sb.size === 0) return 0
  const inter = [...sa].filter(w => sb.has(w)).length
  const union = new Set([...sa, ...sb]).size
  return union === 0 ? 0 : inter / union
}

function findGroups(posts, minSim = 0.45) {
  const used = new Set()
  const groups = []
  for (let i = 0; i < posts.length; i++) {
    if (used.has(i)) continue
    const matches = []
    for (let j = i + 1; j < posts.length; j++) {
      if (used.has(j)) continue
      const sim = jaccard(posts[i].title, posts[j].title)
      const exact = cleanTitle(posts[i].title) === cleanTitle(posts[j].title)
      if (exact || sim >= minSim) {
        matches.push({ post: posts[j], sim: exact ? 1 : sim, exact })
        used.add(j)
      }
    }
    if (matches.length > 0) {
      used.add(i)
      const isCross = matches.some(m => m.post.siteId !== posts[i].siteId)
      groups.push({ key: `g${i}`, main: posts[i], matches, isCross })
    }
  }
  return groups.sort((a, b) => {
    const topA = Math.max(...a.matches.map(m => m.sim))
    const topB = Math.max(...b.matches.map(m => m.sim))
    return topB - topA
  })
}

function simLabel(sim, exact) {
  if (exact) return 'Exact duplicate'
  if (sim >= 0.85) return `${Math.round(sim * 100)}% match`
  if (sim >= 0.65) return `${Math.round(sim * 100)}% similar`
  return `${Math.round(sim * 100)}% related`
}

function simLevel(sim, exact) {
  if (exact) return 'exact'
  if (sim >= 0.65) return 'high'
  return 'medium'
}

async function fetchPostContent(site, wpPostId) {
  try {
    const r = await fetch(`${site.url}/wp-json/wp/v2/posts/${wpPostId}?_fields=id,content,link`, {
      headers: { Authorization: 'Basic ' + btoa(`${site.username}:${site.password}`) }
    })
    if (!r.ok) return null
    const d = await r.json()
    return { content: d.content?.raw || d.content?.rendered || '', link: d.link }
  } catch { return null }
}

async function updateWPContent(site, wpPostId, newContent) {
  try {
    const r = await fetch(`${site.url}/wp-json/wp/v2/posts/${wpPostId}`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${site.username}:${site.password}`),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: newContent })
    })
    return r.ok
  } catch { return false }
}

async function trashWPPost(site, wpPostId) {
  try {
    const r = await fetch(`${site.url}/wp-json/wp/v2/posts/${wpPostId}`, {
      method: 'DELETE',
      headers: { Authorization: 'Basic ' + btoa(`${site.username}:${site.password}`) }
    })
    return r.ok
  } catch { return false }
}

function alsoReadBlock(title, url) {
  return `\n<!-- wp:paragraph -->\n<p>Also Read &#8212; <a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a></p>\n<!-- /wp:paragraph -->`
}

export default function DuplicateChecker({ navigate }) {
  const { posts, sites, deletePost } = useApp()
  const { notifySuccess, notifyError, notifyWarning, notifyInfo } = useNotify()

  const [filter, setFilter] = useState('cross')
  const [clStatus, setClStatus] = useState({})   // groupKey → 'linking'|'done'|'error'|string
  const [delStatus, setDelStatus] = useState({})  // localId → 'deleting'|'done'

  const groups = useMemo(() => findGroups(posts), [posts])

  const filtered = useMemo(() => {
    if (filter === 'cross') return groups.filter(g => g.isCross)
    if (filter === 'same') return groups.filter(g => !g.isCross)
    return groups
  }, [groups, filter])

  const crossCount = groups.filter(g => g.isCross).length
  const sameCount  = groups.filter(g => !g.isCross).length

  const handleCrossLink = async (groupKey, postA, postB, siteA, siteB) => {
    if (!postA.wpLink || !postB.wpLink) {
      setClStatus(p => ({ ...p, [groupKey]: 'error:Both posts need a live WordPress URL. Publish them first.' }))
      notifyWarning('Both posts need a live WordPress URL before they can be cross-linked.')
      return
    }
    if (!siteA?.connected || !siteB?.connected) {
      setClStatus(p => ({ ...p, [groupKey]: 'error:Both sites must be connected in Site Manager.' }))
      notifyWarning('Both sites must be connected in Site Manager before cross-linking.')
      return
    }

    setClStatus(p => ({ ...p, [groupKey]: 'linking' }))

    const [dataA, dataB] = await Promise.all([
      fetchPostContent(siteA, postA.wpPostId),
      fetchPostContent(siteB, postB.wpPostId),
    ])

    if (!dataA || !dataB) {
      setClStatus(p => ({ ...p, [groupKey]: 'error:Could not fetch post content from WordPress.' }))
      notifyError('Could not fetch post content from WordPress to add cross-links.', { action: 'Cross-Link' })
      return
    }

    const urlA = postA.wpLink
    const urlB = postB.wpLink
    const titleA = postA.title.replace(/<[^>]+>/g, '')
    const titleB = postB.title.replace(/<[^>]+>/g, '')

    const alreadyA = dataA.content.includes(urlB)
    const alreadyB = dataB.content.includes(urlA)

    const tasks = []
    if (!alreadyA) tasks.push(updateWPContent(siteA, postA.wpPostId, dataA.content + alsoReadBlock(titleB, urlB)))
    if (!alreadyB) tasks.push(updateWPContent(siteB, postB.wpPostId, dataB.content + alsoReadBlock(titleA, urlA)))

    if (tasks.length === 0) {
      setClStatus(p => ({ ...p, [groupKey]: 'already' }))
      notifyInfo('These posts are already cross-linked.')
      return
    }

    const results = await Promise.all(tasks)
    const allOk = results.every(Boolean)
    setClStatus(p => ({ ...p, [groupKey]: allOk ? 'done' : 'error:One or more updates failed. Check your site credentials.' }))
    if (allOk) notifySuccess(`✓ Cross-linked "${titleA}" and "${titleB}"`)
    else notifyError(`Failed to cross-link "${titleA}" and "${titleB}" — check your site credentials`, { action: 'Cross-Link' })
  }

  const handleDelete = async (post) => {
    const label = post.title.replace(/<[^>]+>/g, '').slice(0, 60)
    if (!window.confirm(`Delete "${label}"?\n\nThis removes it from ChloeTrap and moves it to WordPress Trash (if connected).`)) return
    setDelStatus(p => ({ ...p, [post.localId]: 'deleting' }))
    const site = sites.find(s => s.id === post.siteId)
    let wpOk = true
    if (site?.connected && site?.username && post.wpPostId) {
      wpOk = await trashWPPost(site, post.wpPostId)
    }
    deletePost(post.localId)
    setDelStatus(p => ({ ...p, [post.localId]: 'done' }))
    if (wpOk) notifySuccess(`✓ Deleted "${label}"${site?.connected ? ` and moved to Trash on ${site.name}` : ''}`)
    else notifyError(`Removed "${label}" from ChloeTrap, but failed to trash it on ${site?.name}`, { site: site?.name, action: 'Delete Post' })
  }

  if (posts.length === 0) {
    return (
      <div className="dc-screen">
        <div className="page-header-row">
          <div><h1>Duplicate & Cross-Link</h1><p className="page-subtitle">Sync your sites first to scan for duplicates</p></div>
        </div>
        <div className="dc-empty">
          <div className="dc-empty-icon">🔍</div>
          <p>No posts synced yet.</p>
          <p className="dc-empty-sub">Go to Dashboard and hit <strong>Sync All Sites</strong>, then come back here.</p>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('dashboard')}>Go to Dashboard →</button>
        </div>
      </div>
    )
  }

  return (
    <div className="dc-screen">
      <div className="page-header-row">
        <div>
          <h1>Duplicate &amp; Cross-Link</h1>
          <p className="page-subtitle">
            {groups.length === 0
              ? `Scanned ${posts.length} posts — no duplicates found`
              : `${groups.length} duplicate group${groups.length !== 1 ? 's' : ''} found across ${posts.length} posts`}
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="dc-info-banner">
        <span className="dc-info-icon">💡</span>
        <div>
          <strong>Cross-linking tip:</strong> Adding "Also Read" links between related posts on different sites builds
          topical authority and passes link equity across your network — a major SEO win.
        </div>
      </div>

      {/* Filters */}
      <div className="dc-filters">
        {[
          ['all',   `All groups (${groups.length})`],
          ['cross', `Cross-site (${crossCount})`],
          ['same',  `Same site (${sameCount})`],
        ].map(([v, l]) => (
          <button key={v} className={`dc-chip${filter === v ? ' active' : ''}`} onClick={() => setFilter(v)}>{l}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="dc-empty">
          <p>No {filter === 'cross' ? 'cross-site' : 'same-site'} duplicates found.</p>
        </div>
      ) : (
        <div className="dc-groups">
          {filtered.map(group => {
            const allPosts = [{ post: group.main, sim: 1, exact: true, isMain: true }, ...group.matches.map(m => ({ ...m, isMain: false }))]
            const status = clStatus[group.key] || ''
            const isLinking = status === 'linking'
            const isDone = status === 'done'
            const isAlready = status === 'already'
            const isError = status.startsWith('error:')
            const errorMsg = isError ? status.slice(6) : ''

            // Pick first two cross-site posts for the cross-link button
            const crossPair = (() => {
              for (const m of group.matches) {
                if (m.post.siteId !== group.main.siteId) {
                  return [group.main, m.post]
                }
              }
              return null
            })()

            const siteA = crossPair ? sites.find(s => s.id === crossPair[0].siteId) : null
            const siteB = crossPair ? sites.find(s => s.id === crossPair[1].siteId) : null
            const canCrossLink = crossPair && crossPair[0].wpLink && crossPair[1].wpLink && siteA?.connected && siteB?.connected

            return (
              <div key={group.key} className={`dc-group${group.isCross ? ' dc-group-cross' : ''}`}>
                {/* Group header */}
                <div className="dc-group-head">
                  <div className="dc-group-meta">
                    <span className={`dc-group-type ${group.isCross ? 'cross' : 'same'}`}>
                      {group.isCross ? '↔ Cross-site' : '⚠ Same site'}
                    </span>
                    <span className="dc-group-count">{allPosts.length} posts</span>
                  </div>

                  {/* Cross-link action */}
                  {group.isCross && (
                    <div className="dc-cl-area">
                      {(isDone || isAlready) ? (
                        <span className="dc-cl-done">✓ {isDone ? 'Cross-linked!' : 'Already linked'}</span>
                      ) : (
                        <button
                          className="dc-cl-btn"
                          onClick={() => handleCrossLink(group.key, crossPair[0], crossPair[1], siteA, siteB)}
                          disabled={isLinking || !canCrossLink}
                          title={!canCrossLink ? 'Both posts need to be live on WordPress with connected sites' : ''}
                        >
                          {isLinking ? '⟳ Adding links…' : '↔ Add "Also Read" to both posts'}
                        </button>
                      )}
                      {isError && <span className="dc-cl-error">✗ {errorMsg}</span>}
                      {!canCrossLink && !isDone && !isAlready && (
                        <span className="dc-cl-hint">
                          {!crossPair?.[0]?.wpLink || !crossPair?.[1]?.wpLink
                            ? 'Posts need a live WP URL'
                            : 'Connect both sites first'}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Posts */}
                {allPosts.map(({ post, sim, exact, isMain }) => {
                  const site = sites.find(s => s.id === post.siteId)
                  const isDeleting = delStatus[post.localId] === 'deleting'

                  return (
                    <div key={post.localId} className={`dc-post-row${isMain ? ' dc-main' : ''}`}>
                      <div className="dc-post-left">
                        {site && <SiteAvatar site={site} size={32} radius={8} />}
                        <div className="dc-post-info">
                          <div
                            className="dc-post-title"
                            dangerouslySetInnerHTML={{ __html: post.title || '(Untitled)' }}
                          />
                          <div className="dc-post-meta">
                            <span>{site?.name || 'Unknown site'}</span>
                            {post.createdAt && (
                              <span>· {new Date(post.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            )}
                            {post.wpLink && (
                              <a
                                href="#"
                                className="dc-view-link"
                                onClick={e => { e.preventDefault(); window.open(post.wpLink) }}
                              >
                                View on site →
                              </a>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="dc-post-right">
                        {isMain ? (
                          <span className="dc-badge dc-badge-original">Original</span>
                        ) : (
                          <span className={`dc-badge dc-badge-${simLevel(sim, exact)}`}>
                            {simLabel(sim, exact)}
                          </span>
                        )}
                        <button
                          className="dc-delete-btn"
                          onClick={() => handleDelete(post)}
                          disabled={isDeleting}
                          title="Remove from ChloeTrap and trash on WordPress"
                        >
                          {isDeleting ? '…' : '🗑 Delete'}
                        </button>
                      </div>
                    </div>
                  )
                })}

                {/* Also Read preview */}
                {group.isCross && crossPair && (isDone) && (
                  <div className="dc-preview">
                    <span className="dc-preview-label">Added to {siteA?.name}:</span>
                    <span className="dc-preview-text">
                      Also Read &#8212; <span className="dc-preview-link">{crossPair[1].title.replace(/<[^>]+>/g, '')}</span>
                    </span>
                    <span className="dc-preview-sep">|</span>
                    <span className="dc-preview-label">Added to {siteB?.name}:</span>
                    <span className="dc-preview-text">
                      Also Read &#8212; <span className="dc-preview-link">{crossPair[0].title.replace(/<[^>]+>/g, '')}</span>
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
