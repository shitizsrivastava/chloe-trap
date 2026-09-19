import React, { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import SiteAvatar from '../components/SiteAvatar'
import './ThinContentScanner.css'

// Word count thresholds based on AdSense 2025/2026 guidelines
const THRESHOLDS = {
  thin:       { max: 299,  label: 'Thin',       color: '#dc2626', bg: '#fee2e2', desc: 'Critical — delete or rewrite. Under 300 words is a direct rejection trigger.' },
  borderline: { max: 799,  label: 'Borderline', color: '#d97706', bg: '#fef3c7', desc: 'Needs expanding to 800+ words. Google considers this low-value.' },
  good:       { max: 1199, label: 'Good',        color: '#2563eb', bg: '#dbeafe', desc: 'Acceptable. Aim to expand to 1200+ for best results.' },
  excellent:  { max: 99999,label: 'Excellent',   color: '#16a34a', bg: '#dcfce7', desc: '1200+ words. This is what Google wants to see.' },
}

function classify(wc) {
  if (wc < 300)  return 'thin'
  if (wc < 800)  return 'borderline'
  if (wc < 1200) return 'good'
  return 'excellent'
}

function countWords(html) {
  if (!html) return 0
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w.length > 0).length
}

async function fetchAllPostsFull(site) {
  const headers = { Authorization: 'Basic ' + btoa(`${site.username}:${site.password}`) }
  let all = [], page = 1
  while (true) {
    const r = await fetch(
      `${site.url}/wp-json/wp/v2/posts?per_page=100&page=${page}&status=publish&_fields=id,title,link,modified,content`,
      { headers }
    )
    if (!r.ok) break
    const batch = await r.json()
    if (!Array.isArray(batch) || batch.length === 0) break
    all = [...all, ...batch]
    if (batch.length < 100) break
    page++
  }
  return all
}

export default function ThinContentScanner({ navigate }) {
  const { sites } = useApp()
  const connected = sites.filter(s => s.connected)

  const [scanning,    setScanning]    = useState(false)
  const [progress,    setProgress]    = useState({ done: 0, total: 0, site: '' })
  const [results,     setResults]     = useState([]) // [{siteId, siteName, siteColor, id, title, link, wordCount, class}]
  const [filter,      setFilter]      = useState('all')
  const [siteFilter,  setSiteFilter]  = useState('all')
  const [sortKey,     setSortKey]     = useState('wordCount')
  const [sortDir,     setSortDir]     = useState('asc')
  const [selected,    setSelected]    = useState(new Set(connected.map(s => s.id)))

  const runScan = async () => {
    const toScan = connected.filter(s => selected.has(s.id))
    if (!toScan.length) return
    setScanning(true)
    setResults([])
    setProgress({ done: 0, total: toScan.length, site: '' })

    const allResults = []
    for (const site of toScan) {
      setProgress(p => ({ ...p, site: site.name }))
      try {
        const posts = await fetchAllPostsFull(site)
        posts.forEach(post => {
          const wc = countWords(post.content?.rendered || '')
          allResults.push({
            siteId:    site.id,
            siteName:  site.name,
            siteColor: site.color,
            siteInitials: site.initials,
            postId:    post.id,
            title:     post.title?.rendered?.replace(/<[^>]*>/g, '') || '(no title)',
            link:      post.link,
            modified:  post.modified,
            wordCount: wc,
            class:     classify(wc),
          })
        })
      } catch {}
      setProgress(p => ({ ...p, done: p.done + 1 }))
    }

    setResults(allResults)
    setScanning(false)
  }

  const toggleSite = (id) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const filtered = useMemo(() => {
    let rows = results
    if (filter !== 'all') rows = rows.filter(r => r.class === filter)
    if (siteFilter !== 'all') rows = rows.filter(r => r.siteId === siteFilter)
    return [...rows].sort((a, b) => {
      const va = sortKey === 'title' ? a.title : sortKey === 'site' ? a.siteName : a.wordCount
      const vb = sortKey === 'title' ? b.title : sortKey === 'site' ? b.siteName : b.wordCount
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      return sortDir === 'asc' ? va - vb : vb - va
    })
  }, [results, filter, siteFilter, sortKey, sortDir])

  const stats = useMemo(() => ({
    total:      results.length,
    thin:       results.filter(r => r.class === 'thin').length,
    borderline: results.filter(r => r.class === 'borderline').length,
    good:       results.filter(r => r.class === 'good').length,
    excellent:  results.filter(r => r.class === 'excellent').length,
    avgWords:   results.length ? Math.round(results.reduce((s, r) => s + r.wordCount, 0) / results.length) : 0,
  }), [results])

  const sort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'wordCount' ? 'asc' : 'asc') }
  }
  const arrow = (key) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  const hasResults = results.length > 0

  const scannedSites = [...new Set(results.map(r => r.siteId))]
    .map(id => connected.find(s => s.id === id))
    .filter(Boolean)

  return (
    <div className="tcs-screen">
      <div className="page-header-row">
        <div>
          <h1>Thin Content Scanner</h1>
          <p className="page-subtitle">Scan all posts for word count — thin content (&lt;300 words) is the #1 AdSense rejection reason</p>
        </div>
      </div>

      {/* AdSense word count guide */}
      <div className="tcs-guide-row">
        {Object.entries(THRESHOLDS).map(([key, t]) => (
          <div key={key} className="tcs-guide-chip" style={{ background: t.bg, color: t.color, borderColor: t.color + '44' }}>
            <strong>{t.label}</strong>
            <span>{key === 'thin' ? '< 300' : key === 'borderline' ? '300–799' : key === 'good' ? '800–1199' : '1200+'} words</span>
          </div>
        ))}
      </div>

      {/* Site selector + scan button */}
      <div className="tcs-controls">
        <div className="tcs-sites-row">
          <span className="tcs-sites-label">Scan sites:</span>
          {connected.map(site => (
            <button
              key={site.id}
              className={`tcs-site-btn${selected.has(site.id) ? ' active' : ''}`}
              style={selected.has(site.id) ? { background: site.color + '22', color: site.color, borderColor: site.color + '66' } : {}}
              onClick={() => toggleSite(site.id)}
            >
              <span className="tcs-dot" style={{ background: selected.has(site.id) ? site.color : '#d1d5db' }} />
              {site.name}
            </button>
          ))}
        </div>
        <button
          className="btn btn-primary"
          onClick={runScan}
          disabled={scanning || !selected.size || !connected.length}
          style={{ flexShrink: 0 }}
        >
          {scanning
            ? `⟳ Scanning ${progress.site}… (${progress.done}/${progress.total})`
            : '▶ Scan All Posts'}
        </button>
      </div>

      {!connected.length && (
        <div className="tcs-no-sites">No connected sites. Go to Site Manager first.</div>
      )}

      {scanning && (
        <div className="tcs-scanning-bar">
          <div className="tcs-scanning-fill" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 5}%` }} />
        </div>
      )}

      {hasResults && (
        <>
          {/* Summary stats */}
          <div className="tcs-stats-row">
            <div className="tcs-stat">
              <div className="tcs-stat-val">{stats.total}</div>
              <div className="tcs-stat-lbl">Posts Scanned</div>
            </div>
            <div className="tcs-stat" style={{ borderColor: '#fca5a5', background: '#fff1f2' }}>
              <div className="tcs-stat-val" style={{ color: '#dc2626' }}>{stats.thin}</div>
              <div className="tcs-stat-lbl" style={{ color: '#dc2626' }}>Thin (&lt;300 words)</div>
            </div>
            <div className="tcs-stat" style={{ borderColor: '#fde68a', background: '#fffbeb' }}>
              <div className="tcs-stat-val" style={{ color: '#d97706' }}>{stats.borderline}</div>
              <div className="tcs-stat-lbl" style={{ color: '#d97706' }}>Borderline (300–799)</div>
            </div>
            <div className="tcs-stat" style={{ borderColor: '#93c5fd', background: '#eff6ff' }}>
              <div className="tcs-stat-val" style={{ color: '#2563eb' }}>{stats.good}</div>
              <div className="tcs-stat-lbl" style={{ color: '#2563eb' }}>Good (800–1199)</div>
            </div>
            <div className="tcs-stat" style={{ borderColor: '#86efac', background: '#f0fdf4' }}>
              <div className="tcs-stat-val" style={{ color: '#16a34a' }}>{stats.excellent}</div>
              <div className="tcs-stat-lbl" style={{ color: '#16a34a' }}>Excellent (1200+)</div>
            </div>
            <div className="tcs-stat">
              <div className="tcs-stat-val">{stats.avgWords}</div>
              <div className="tcs-stat-lbl">Avg Words / Post</div>
            </div>
          </div>

          {/* AdSense readiness for each site */}
          <div className="tcs-site-scores">
            {scannedSites.map(site => {
              const sitePosts = results.filter(r => r.siteId === site.id)
              const thinCount = sitePosts.filter(r => r.class === 'thin').length
              const borderCount = sitePosts.filter(r => r.class === 'borderline').length
              const issues = thinCount + borderCount
              const pct = sitePosts.length ? Math.round(((sitePosts.length - issues) / sitePosts.length) * 100) : 0
              return (
                <div key={site.id} className="tcs-site-score-card" style={{ borderColor: site.color + '55' }}>
                  <div className="tcs-ssc-header">
                    <SiteAvatar site={site} size={24} radius={6} />
                    <span className="tcs-ssc-name">{site.name}</span>
                    <span className="tcs-ssc-pct" style={{ color: pct >= 80 ? '#16a34a' : pct >= 60 ? '#d97706' : '#dc2626' }}>{pct}% ok</span>
                  </div>
                  <div className="tcs-ssc-bar-track">
                    <div className="tcs-ssc-bar-fill tcs-bar-excellent" style={{ width: `${sitePosts.length ? (sitePosts.filter(r=>r.class==='excellent').length/sitePosts.length)*100 : 0}%` }} />
                    <div className="tcs-ssc-bar-fill tcs-bar-good"      style={{ width: `${sitePosts.length ? (sitePosts.filter(r=>r.class==='good').length/sitePosts.length)*100 : 0}%` }} />
                    <div className="tcs-ssc-bar-fill tcs-bar-borderline"style={{ width: `${sitePosts.length ? (borderCount/sitePosts.length)*100 : 0}%` }} />
                    <div className="tcs-ssc-bar-fill tcs-bar-thin"      style={{ width: `${sitePosts.length ? (thinCount/sitePosts.length)*100 : 0}%` }} />
                  </div>
                  <div className="tcs-ssc-counts">
                    <span>{sitePosts.length} posts</span>
                    {thinCount > 0 && <span style={{ color: '#dc2626' }}>⚠ {thinCount} thin</span>}
                    {borderCount > 0 && <span style={{ color: '#d97706' }}>! {borderCount} borderline</span>}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Action banner for thin posts */}
          {stats.thin > 0 && (
            <div className="tcs-action-banner">
              <span className="tcs-banner-icon">🚨</span>
              <div>
                <strong>You have {stats.thin} thin posts under 300 words.</strong> Google AdSense will reject your site for this.
                For each thin post: either <strong>expand it to 800+ words</strong> with useful content, or <strong>delete it</strong> if it has no value.
                Do not leave thin posts published — they pull down your entire site's quality score.
              </div>
            </div>
          )}
          {stats.borderline > 0 && (
            <div className="tcs-action-banner warn">
              <span className="tcs-banner-icon">⚠️</span>
              <div>
                <strong>{stats.borderline} posts are borderline (300–799 words).</strong> Google considers these low-value.
                Aim to expand each one to at least 800 words — add examples, FAQs, step-by-step guides, or data.
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="tcs-filter-bar">
            <div className="tcs-filter-tabs">
              {[
                { key: 'all',       label: `All (${results.length})` },
                { key: 'thin',      label: `🔴 Thin (${stats.thin})` },
                { key: 'borderline',label: `🟡 Borderline (${stats.borderline})` },
                { key: 'good',      label: `🔵 Good (${stats.good})` },
                { key: 'excellent', label: `🟢 Excellent (${stats.excellent})` },
              ].map(t => (
                <button key={t.key} className={`tcs-tab${filter === t.key ? ' active' : ''}`} onClick={() => setFilter(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>
            <select className="tcs-site-filter" value={siteFilter} onChange={e => setSiteFilter(e.target.value)}>
              <option value="all">All Sites</option>
              {scannedSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {/* Results table */}
          <div className="tcs-table-wrap">
            <table className="tcs-table">
              <thead>
                <tr>
                  <th className="tcs-th-num">#</th>
                  <th className="tcs-th-sort" onClick={() => sort('title')}>Post Title{arrow('title')}</th>
                  <th className="tcs-th-sort" onClick={() => sort('site')}>Site{arrow('site')}</th>
                  <th className="tcs-th-sort" onClick={() => sort('wordCount')}>Words{arrow('wordCount')}</th>
                  <th>Status</th>
                  <th>What to Do</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => {
                  const t = THRESHOLDS[row.class]
                  return (
                    <tr key={`${row.siteId}-${row.postId}`} className={`tcs-row tcs-row-${row.class}`}>
                      <td className="tcs-td-num">{i + 1}</td>
                      <td className="tcs-td-title">
                        <div className="tcs-post-title">{row.title}</div>
                        <div className="tcs-post-date">{new Date(row.modified).toLocaleDateString()}</div>
                      </td>
                      <td>
                        <span className="tcs-site-badge" style={{ background: row.siteColor + '22', color: row.siteColor, borderColor: row.siteColor + '55', display: 'inline-flex', alignItems: 'center', padding: '2px 4px' }}>
                          <SiteAvatar site={sites.find(s => s.id === row.siteId)} size={16} radius={4} />
                        </span>
                      </td>
                      <td>
                        <div className="tcs-wc-cell">
                          <span className="tcs-wc-num" style={{ color: t.color }}>{row.wordCount.toLocaleString()}</span>
                          <div className="tcs-wc-bar-track">
                            <div className="tcs-wc-bar-fill" style={{
                              width: `${Math.min(100, (row.wordCount / 1200) * 100)}%`,
                              background: t.color,
                            }} />
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="tcs-status-badge" style={{ background: t.bg, color: t.color }}>
                          {t.label}
                        </span>
                      </td>
                      <td className="tcs-td-action-hint">
                        {row.class === 'thin'       && <span>🚨 Expand to 800+ or delete</span>}
                        {row.class === 'borderline' && <span>⚠️ Add {800 - row.wordCount}+ more words</span>}
                        {row.class === 'good'       && <span>✓ Good — try to reach 1200</span>}
                        {row.class === 'excellent'  && <span>✅ Excellent — keep it up</span>}
                      </td>
                      <td>
                        <a
                          href={`${sites.find(s=>s.id===row.siteId)?.url}/wp-admin/post.php?post=${row.postId}&action=edit`}
                          target="_blank"
                          rel="noreferrer"
                          className="tcs-edit-btn"
                        >
                          Edit ↗
                        </a>
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="tcs-no-results">
                    {filter === 'thin' ? '🎉 No thin posts found!' :
                     filter === 'borderline' ? '✓ No borderline posts!' : 'No posts match the filter.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Tips always visible */}
      <div className="tcs-tips">
        <div className="tcs-tips-title">📋 How to Fix Thin Content — AdSense 2026 Guide</div>
        <div className="tcs-tips-grid">
          {[
            { icon: '📏', title: 'Target 800–1200+ words', text: 'Google AdSense reviewers look for posts that thoroughly answer a question. Under 300 words = auto-rejection. Under 800 = low-value flag.' },
            { icon: '🧠', title: 'Add Original Perspective', text: '82% of rejected sites had zero first-person language. Add your own experience, opinions, examples, or data. "I tried this and found…" beats generic lists.' },
            { icon: '❓', title: 'Add FAQs to Every Post', text: 'Add a "Frequently Asked Questions" section at the bottom. Each Q+A adds 50-100 words and directly satisfies search intent.' },
            { icon: '🔢', title: 'Add Steps or How-To Sections', text: 'Convert bullet points into numbered step-by-step instructions with explanations. Doubles word count while adding real value.' },
            { icon: '🗑️', title: 'Delete What Cannot Be Saved', text: 'If a post has under 200 words and covers something trivial, delete it. One low-quality post hurts your entire site\'s AdSense review.' },
            { icon: '🔗', title: 'Merge Related Thin Posts', text: 'Have 3 thin posts on similar topics? Combine them into one comprehensive 1500-word guide. Redirect the old URLs to the new one.' },
            { icon: '📊', title: 'Add Tables and Data', text: 'A comparison table, pricing table, or stat-based list adds words and is considered high-value by Google\'s quality raters.' },
            { icon: '🤖', title: 'AI Content is Risky', text: 'Google\'s crawlers detect AI-generated content that lacks unique perspective. Always edit AI drafts heavily with personal examples and real insight.' },
          ].map((t, i) => (
            <div key={i} className="tcs-tip-card">
              <div className="tcs-tip-icon">{t.icon}</div>
              <div>
                <div className="tcs-tip-title">{t.title}</div>
                <div className="tcs-tip-text">{t.text}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
