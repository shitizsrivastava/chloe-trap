import React, { useState } from 'react'
import { useApp } from '../context/AppContext'
import { useNotify } from '../context/NotificationContext'
import { fetchPosts } from '../utils/wordpress'
import './BrokenLinks.css'

function extractLinks(html) {
  const matches = [...(html || '').matchAll(/href="(https?:\/\/[^"]+)"/g)]
  return [...new Set(matches.map(m => m[1]))]
}

async function checkLink(url) {
  const start = Date.now()
  try {
    let res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(6000) })
    // Some servers (bot mitigation, strict CDNs, or ones that just don't
    // implement HEAD) reject HEAD requests specifically while the page is
    // perfectly reachable — without this fallback, those show up as "broken"
    // for a link that works fine, and this screen offers to delete exactly
    // that link from the post.
    if (!res.ok) {
      try {
        res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(6000) })
      } catch { /* GET failed too — fall through and report the HEAD result */ }
    }
    return { url, status: res.status, ok: res.ok, ms: Date.now() - start }
  } catch {
    return { url, status: 0, ok: false, ms: Date.now() - start, error: 'Timeout / unreachable' }
  }
}

async function removeLinkFromPost(site, postId, brokenUrl) {
  const headers = {
    Authorization: 'Basic ' + btoa(`${site.username}:${site.password}`),
    'Content-Type': 'application/json',
  }
  // 1. Fetch current post content — context=edit is required for WordPress
  // to include content.raw at all; without it, content.raw is always
  // undefined and this used to silently fall back to content.rendered (the
  // post-shortcode, post-wpautop HTML output). Writing THAT back as the
  // post's new content permanently flattened Gutenberg blocks/shortcodes on
  // every post this "fix" touched — not just removing the one link.
  const getRes = await fetch(`${site.url}/wp-json/wp/v2/posts/${postId}?context=edit&_fields=id,content`, { headers })
  if (!getRes.ok) throw new Error(`Failed to fetch post (${getRes.status})`)
  const post = await getRes.json()
  const rawContent = post.content?.raw
  if (rawContent === undefined) throw new Error('Could not read the post\'s raw content — check the account has edit permissions on this post.')

  // 2. Remove the broken <a href="..."> tag — keep the link text, strip the anchor
  const escaped = brokenUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const linkRegex = new RegExp(`<a[^>]*href=["']${escaped}["'][^>]*>(.*?)<\\/a>`, 'gi')
  let newContent = rawContent.replace(linkRegex, '$1')

  if (newContent === rawContent) {
    // Try alternate quote style
    const linkRegex2 = new RegExp(`<a[^>]*href="${escaped}"[^>]*>(.*?)<\\/a>`, 'gi')
    newContent = rawContent.replace(linkRegex2, '$1')
    if (newContent === rawContent) throw new Error('Link not found in post content')
  }

  // 3. Update post
  const putRes = await fetch(`${site.url}/wp-json/wp/v2/posts/${postId}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content: newContent }),
  })
  if (!putRes.ok) throw new Error(`Failed to update post (${putRes.status})`)
  return true
}

export default function BrokenLinks() {
  const { sites } = useApp()
  const { notifySuccess, notifyError } = useNotify()
  const connectedSites = sites.filter(s => s.connected && s.username && s.password)
  const [selectedSiteId, setSelectedSiteId] = useState(connectedSites[0]?.id || '')
  const [scanning, setScanning]     = useState(false)
  const [progress, setProgress]     = useState({ done: 0, total: 0 })
  const [results, setResults]       = useState(null)
  const [filter, setFilter]         = useState('broken')
  const [fixing, setFixing]         = useState({})   // url → 'fixing' | 'fixed' | 'error'
  const [fixMsg, setFixMsg]         = useState({})   // url → error message
  const [confirmFix, setConfirmFix] = useState(null) // url to confirm

  const handleScan = async () => {
    const site = sites.find(s => s.id === selectedSiteId)
    if (!site) return
    setScanning(true); setResults(null); setProgress({ done: 0, total: 0 })

    // Fetch posts (up to 100)
    const allPosts = []
    for (let pg = 1; pg <= 5; pg++) {
      const r = await fetchPosts(site, { per_page: 20, page: pg })
      if (!r.success || !r.posts.length) break
      allPosts.push(...r.posts)
      if (r.posts.length < 20) break
    }

    // Extract unique links
    const linkMap = {}
    allPosts.forEach(post => {
      const links = extractLinks(post.content?.rendered || '')
      links.forEach(url => {
        if (!linkMap[url]) linkMap[url] = []
        linkMap[url].push({ postId: post.id, postTitle: post.title?.rendered || '(Untitled)', postLink: post.link })
      })
    })

    const urls = Object.keys(linkMap)
    setProgress({ done: 0, total: urls.length })

    const linkResults = []
    // Check in batches of 5
    for (let i = 0; i < urls.length; i += 5) {
      const batch = urls.slice(i, i + 5)
      const batchResults = await Promise.all(batch.map(checkLink))
      batchResults.forEach((r, j) => {
        linkResults.push({ ...r, posts: linkMap[batch[j]] })
        setProgress(prev => ({ ...prev, done: prev.done + 1 }))
      })
    }

    setResults(linkResults)
    setScanning(false)
  }

  const handleFix = async (linkResult) => {
    const site = sites.find(s => s.id === selectedSiteId)
    if (!site) return
    setConfirmFix(null)
    setFixing(prev => ({ ...prev, [linkResult.url]: 'fixing' }))
    setFixMsg(prev => ({ ...prev, [linkResult.url]: '' }))

    let allOk = true
    let lastError = ''
    for (const post of linkResult.posts) {
      try {
        await removeLinkFromPost(site, post.postId, linkResult.url)
      } catch (e) {
        allOk = false
        lastError = e.message
        setFixMsg(prev => ({ ...prev, [linkResult.url]: e.message }))
      }
    }
    setFixing(prev => ({ ...prev, [linkResult.url]: allOk ? 'fixed' : 'error' }))
    if (allOk) notifySuccess(`✓ Removed broken link from ${linkResult.posts.length} post(s) on ${site.name}`)
    else notifyError(`Failed to remove broken link on ${site.name}: ${lastError}`, { site: site.name, action: 'Fix Broken Link' })
  }

  const displayResults = results ? results.filter(r => {
    if (filter === 'broken') return !r.ok
    if (filter === 'ok')     return r.ok
    return true
  }) : []

  const brokenCount = results?.filter(r => !r.ok).length || 0
  const okCount     = results?.filter(r => r.ok).length  || 0

  return (
    <div className="bl-screen">
      <div className="bl-top">
        <div>
          <h1>Broken Link Scanner</h1>
          <p>Scan posts on any site for dead or broken links</p>
        </div>
      </div>

      <div className="bl-controls">
        <select className="filter-select" value={selectedSiteId} onChange={e => setSelectedSiteId(e.target.value)}>
          {connectedSites.length === 0
            ? <option value="">No connected sites</option>
            : connectedSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)
          }
        </select>
        <button className="btn btn-primary btn-sm" onClick={handleScan} disabled={scanning || !selectedSiteId}>
          {scanning ? `Scanning… ${progress.done}/${progress.total}` : '🔍 Scan for Broken Links'}
        </button>
      </div>

      {scanning && (
        <div className="bl-progress">
          <div className="bl-progress-bar">
            <div className="bl-progress-fill" style={{ width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : '0%' }} />
          </div>
          <span className="bl-progress-text">Checking {progress.done} of {progress.total} links…</span>
        </div>
      )}

      {results && (
        <>
          <div className="bl-summary">
            <div className="bl-stat"><span style={{ color: 'var(--error)' }}>{brokenCount}</span><small>Broken Links</small></div>
            <div className="bl-stat"><span style={{ color: 'var(--success)' }}>{okCount}</span><small>Working Links</small></div>
            <div className="bl-stat"><span>{results.length}</span><small>Total Checked</small></div>
          </div>

          <div className="bl-filter-tabs">
            {[{k:'broken',l:'Broken Only'},{k:'ok',l:'Working'},{k:'all',l:'All'}].map(t => (
              <button key={t.k} className={`cat-tab${filter === t.k ? ' active' : ''}`} onClick={() => setFilter(t.k)}>{t.l}</button>
            ))}
          </div>

          <div className="bl-table-wrap">
            <table className="bl-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>URL</th>
                  <th>Code</th>
                  <th>Response</th>
                  <th>Found In</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {displayResults.length === 0
                  ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>No {filter === 'broken' ? 'broken' : 'working'} links found.</td></tr>
                  : displayResults.map((r, i) => {
                    const fixState = fixing[r.url]
                    return (
                      <tr key={i} style={{ opacity: fixState === 'fixed' ? 0.5 : 1 }}>
                        <td>
                          <span className={`bl-badge ${r.ok ? 'ok' : 'broken'}`}>{r.ok ? '✓ OK' : '✗ Broken'}</span>
                        </td>
                        <td className="bl-url-cell">
                          <a href="#" onClick={e => { e.preventDefault(); window.open(r.url) }} title={r.url}>
                            {r.url.length > 60 ? r.url.slice(0, 60) + '…' : r.url}
                          </a>
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: 12, color: r.ok ? 'var(--success)' : 'var(--error)' }}>{r.status || 'timeout'}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.ms}ms</td>
                        <td style={{ fontSize: 11 }}>
                          {r.posts.map((p, j) => (
                            <div key={j}>
                              <a href="#" onClick={e => { e.preventDefault(); window.open(`${sites.find(s=>s.id===selectedSiteId)?.url}/wp-admin/post.php?post=${p.postId}&action=edit`) }} style={{ color: 'var(--primary)', fontSize: 11 }}>
                                {p.postTitle.length > 40 ? p.postTitle.slice(0,40)+'…' : p.postTitle} ↗
                              </a>
                            </div>
                          ))}
                        </td>
                        <td>
                          {!r.ok && (
                            fixState === 'fixed' ? (
                              <span style={{ fontSize: 11, color: '#10b981', fontWeight: 700 }}>✓ Removed</span>
                            ) : fixState === 'fixing' ? (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Removing…</span>
                            ) : fixState === 'error' ? (
                              <div>
                                <span style={{ fontSize: 10, color: '#dc2626' }}>✗ {fixMsg[r.url] || 'Error'}</span>
                                <button className="bl-fix-btn" onClick={() => setConfirmFix(r)} style={{ marginTop: 3 }}>Retry</button>
                              </div>
                            ) : (
                              <button className="bl-fix-btn" onClick={() => setConfirmFix(r)}>
                                🗑 Remove Link
                              </button>
                            )
                          )}
                        </td>
                      </tr>
                    )
                  })
                }
              </tbody>
            </table>
          </div>

          {/* Confirm modal */}
          {confirmFix && (
            <div className="modal-overlay" onClick={() => setConfirmFix(null)}>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', width: 440, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>🗑 Remove Broken Link</div>
                <div style={{ padding: '14px 18px', fontSize: 13, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ margin: 0 }}>This will remove the broken link from <strong>{confirmFix.posts.length} post{confirmFix.posts.length > 1 ? 's' : ''}</strong> on your WordPress site. The link text will be kept — only the anchor tag is removed.</p>
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: 6, padding: '8px 10px', fontSize: 11, fontFamily: 'monospace', wordBreak: 'break-all', color: 'var(--text-muted)' }}>{confirmFix.url}</div>
                  <div style={{ background: '#fff1f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: '#dc2626' }}>
                    ⚠️ This directly edits your live WordPress posts. Make sure you have a backup.
                  </div>
                  <div style={{ fontSize: 12 }}>
                    <strong>Affected posts:</strong>
                    {confirmFix.posts.map((p,i) => <div key={i} style={{ color: 'var(--text-muted)', marginTop: 3 }}>• {p.postTitle}</div>)}
                  </div>
                </div>
                <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setConfirmFix(null)}>Cancel</button>
                  <button className="btn btn-sm" style={{ background: '#dc2626', color: 'white' }} onClick={() => handleFix(confirmFix)}>Yes, Remove Link</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {!results && !scanning && (
        <div className="bl-cta">
          <svg width="48" height="48" viewBox="0 0 20 20" fill="currentColor" style={{ color: 'var(--border)' }}><path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd"/></svg>
          <p>Select a site and click Scan</p>
          <span>The scanner will fetch your posts and check every outbound link</span>
        </div>
      )}
    </div>
  )
}
