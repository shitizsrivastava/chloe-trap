import React, { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useNotify } from '../context/NotificationContext'
import SiteAvatar from '../components/SiteAvatar'
import './SocialTracker.css'

const MAX_PASSES = 3

function stripTitle(t) {
  return (t || '(Untitled)').replace(/<[^>]+>/g, '').trim()
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Recompute shareStamps for a new pass count: keep whichever earlier
// timestamps already exist, fill in newly-reached passes with now, and
// drop stamps for passes that were just undone.
function stampsForCount(currentStamps, newCount) {
  const stamps = (currentStamps || []).slice(0, newCount)
  while (stamps.length < newCount) stamps.push(new Date().toISOString())
  return stamps
}

export default function SocialTracker({ navigate }) {
  const { posts, sites, updatePost, settings } = useApp()
  const { notifySuccess, notifyInfo } = useNotify()

  const [siteFilter, setSiteFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all') // all | none | partial | full
  const [search, setSearch] = useState('')
  const [suggested, setSuggested] = useState(null)
  const [caption, setCaption] = useState('')
  const [exporting, setExporting] = useState(false)

  // Load an article into the composer card, defaulting the caption to its
  // title — the user can edit it before posting, but never has to start blank.
  const selectForCompose = (post) => {
    setSuggested(post)
    setCaption(stripTitle(post.title))
    document.querySelector('.st-suggest-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Only live, link-bearing posts make sense to share — drafts have nothing to post.
  // Some sites still have duplicate local records for the same live article
  // (from before per-site sync was fixed) — collapse those by URL so the same
  // article never shows twice, and so marking it shared actually sticks.
  const eligible = useMemo(() => {
    const base = posts.filter(p => p.status === 'publish' && p.wpLink)
    const byLink = new Map()
    for (const p of base) {
      const existing = byLink.get(p.wpLink)
      if (!existing || (p.shareCount || 0) > (existing.shareCount || 0)) byLink.set(p.wpLink, p)
    }
    return [...byLink.values()]
  }, [posts])

  const fullyShared = eligible.filter(p => (p.shareCount || 0) >= MAX_PASSES).length
  const notShared = eligible.filter(p => !p.shareCount).length
  const totalPassesDone = eligible.reduce((sum, p) => sum + (p.shareCount || 0), 0)
  const pct = eligible.length ? Math.round((totalPassesDone / (eligible.length * MAX_PASSES)) * 100) : 0

  const bySiteStats = useMemo(() => {
    const m = {}
    eligible.forEach(p => {
      if (!m[p.siteId]) m[p.siteId] = { total: 0, started: 0 }
      m[p.siteId].total++
      if (p.shareCount) m[p.siteId].started++
    })
    return m
  }, [eligible])

  const filtered = useMemo(() => {
    return eligible
      .filter(p => {
        const count = p.shareCount || 0
        if (siteFilter !== 'all' && p.siteId !== siteFilter) return false
        if (statusFilter === 'none' && count !== 0) return false
        if (statusFilter === 'partial' && (count === 0 || count >= MAX_PASSES)) return false
        if (statusFilter === 'full' && count < MAX_PASSES) return false
        if (search && !stripTitle(p.title).toLowerCase().includes(search.toLowerCase())) return false
        return true
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }, [eligible, siteFilter, statusFilter, search])

  const applyShareCount = (post, newCount) => {
    const stamps = stampsForCount(post.shareStamps, newCount)
    // Apply to every local record sharing this article's live URL, not just
    // the one row clicked — otherwise a duplicate record could keep this
    // same article eligible for suggestion after it's already fully shared.
    posts.filter(p => p.wpLink === post.wpLink).forEach(p => {
      updatePost(p.localId, { shareCount: newCount, shareStamps: stamps })
    })
    return stamps
  }

  const suggestRandom = () => {
    const pool = eligible.filter(p => (p.shareCount || 0) < MAX_PASSES)
    if (pool.length === 0) {
      notifyInfo('🎉 Every published article has been shared all 3 times!')
      setSuggested(null)
      return
    }
    // Surface articles with fewer passes first so nothing gets left behind.
    const minCount = Math.min(...pool.map(p => p.shareCount || 0))
    const priority = pool.filter(p => (p.shareCount || 0) === minCount)
    selectForCompose(priority[Math.floor(Math.random() * priority.length)])
  }

  const markSuggestedShared = () => {
    if (!suggested) return
    const newCount = Math.min((suggested.shareCount || 0) + 1, MAX_PASSES)
    applyShareCount(suggested, newCount)
    notifySuccess(`✓ Pass ${newCount}/${MAX_PASSES} logged for "${stripTitle(suggested.title)}"`)
    if (newCount >= MAX_PASSES) setSuggested(null)
    else setSuggested({ ...suggested, shareCount: newCount })
  }

  // Star-rating style: clicking a dot sets the count up through that dot,
  // or clicking the dot that's currently the highest filled one undoes it.
  const setDot = (post, dotIndex) => {
    const current = post.shareCount || 0
    const newCount = current === dotIndex + 1 ? dotIndex : dotIndex + 1
    applyShareCount(post, newCount)
    notifySuccess(newCount > current
      ? `✓ Pass ${newCount}/${MAX_PASSES} logged for "${stripTitle(post.title)}"`
      : `Pass ${current}/${MAX_PASSES} undone for "${stripTitle(post.title)}"`)
    if (suggested?.wpLink === post.wpLink && newCount >= MAX_PASSES) setSuggested(null)
  }

  const copyLink = (url) => {
    navigator.clipboard.writeText(url)
    notifySuccess('✓ Link copied to clipboard')
  }

  // Facebook's share dialog dropped support for reliably pre-filling custom
  // text back in 2015 — the "quote" param is passed as a best-effort, but we
  // also copy the caption to the clipboard so it can just be pasted in if
  // Facebook shows up blank. Clipboard access can be denied by the OS/browser,
  // so only claim success once the copy actually confirms.
  const postToFacebook = async (link, text) => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}&quote=${encodeURIComponent(text)}`)
    try {
      await navigator.clipboard.writeText(text)
      notifySuccess('✓ Caption copied — paste it in if Facebook doesn\'t pre-fill it')
    } catch {
      notifyInfo('Facebook window opened — copy your caption manually if it doesn\'t pre-fill.')
    }
  }

  const exportExcel = async () => {
    setExporting(true)
    try {
      const excelModule = await import('exceljs')
      const ExcelJS = excelModule.default || excelModule
      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'ChloeTrap'
      workbook.created = new Date()

      const sheet = workbook.addWorksheet('Article Sharing', {
        views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
      })
      sheet.columns = [
        { header: '#', key: 'number', width: 6 },
        { header: 'Website', key: 'website', width: 22 },
        { header: 'Article Title', key: 'title', width: 58 },
        { header: 'Times Shared', key: 'shareCount', width: 14 },
        { header: 'Pass 1 Date', key: 'pass1', width: 16 },
        { header: 'Pass 2 Date', key: 'pass2', width: 16 },
        { header: 'Pass 3 Date', key: 'pass3', width: 16 },
        { header: 'Published Date', key: 'createdAt', width: 16 },
        { header: 'Article URL', key: 'url', width: 62 },
      ]

      const ordered = [...eligible].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      ordered.forEach((p, i) => {
        const site = sites.find(s => s.id === p.siteId)
        const stamps = p.shareStamps || []
        sheet.addRow({
          number: i + 1,
          website: site?.name || p.siteId,
          title: stripTitle(p.title),
          shareCount: `${p.shareCount || 0}/${MAX_PASSES}`,
          pass1: stamps[0] ? stamps[0].slice(0, 10) : '',
          pass2: stamps[1] ? stamps[1].slice(0, 10) : '',
          pass3: stamps[2] ? stamps[2].slice(0, 10) : '',
          createdAt: p.createdAt ? p.createdAt.slice(0, 10) : '',
          url: p.wpLink,
        })
      })

      sheet.autoFilter = { from: 'A1', to: 'I1' }
      const header = sheet.getRow(1)
      header.height = 26
      header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }
      header.alignment = { vertical: 'middle', horizontal: 'center' }
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return
        row.height = 22
        row.alignment = { vertical: 'middle' }
        if (rowNumber % 2 === 0) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
        const urlCell = row.getCell('url')
        if (urlCell.value) {
          urlCell.value = { text: String(urlCell.value), hyperlink: String(urlCell.value) }
          urlCell.font = { color: { argb: 'FF2563EB' }, underline: true }
        }
      })

      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `article-sharing-status-${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      notifySuccess(`✓ Exported ${ordered.length} articles to Excel`)
    } catch (err) {
      notifyInfo(err.message || 'Could not create the Excel file.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="st-screen">
      <div className="page-header-row">
        <div>
          <h1>Social Poster Tracker</h1>
          <p className="page-subtitle">Every published article across all {sites.length} sites — check off up to 3 sharing passes each, and it stays checked as new articles sync in.</p>
        </div>
        <button className="btn btn-secondary" onClick={exportExcel} disabled={exporting || eligible.length === 0}>
          {exporting ? 'Creating Excel...' : '⬇ Export Excel (.xlsx)'}
        </button>
      </div>

      {/* Stats */}
      <div className="st-stats">
        <div className="st-stat">
          <div className="st-stat-val">{eligible.length}</div>
          <div className="st-stat-lbl">Total Articles</div>
        </div>
        <div className="st-stat">
          <div className="st-stat-val green">{fullyShared}</div>
          <div className="st-stat-lbl">Fully Shared (3x)</div>
        </div>
        <div className="st-stat">
          <div className="st-stat-val red">{notShared}</div>
          <div className="st-stat-lbl">Not Shared Yet</div>
        </div>
        <div className="st-stat">
          <div className="st-stat-val">{pct}%</div>
          <div className="st-stat-lbl">Passes Complete</div>
        </div>
      </div>
      <div className="st-progress-track">
        <div className="st-progress-fill" style={{ width: `${pct}%` }} />
      </div>

      {/* Random suggestion */}
      <div className="st-suggest-card">
        {suggested ? (
          <>
            <div className="st-suggest-eyebrow">🎲 Suggested next post — pass {(suggested.shareCount || 0) + 1} of {MAX_PASSES}</div>
            <div className="st-suggest-title" dangerouslySetInnerHTML={{ __html: suggested.title || '(Untitled)' }} />
            <div className="st-suggest-meta">
              <span className="st-suggest-site" style={{ background: (sites.find(s => s.id === suggested.siteId)?.color || '#6366f1') + '22', color: sites.find(s => s.id === suggested.siteId)?.color || '#6366f1' }}>
                {sites.find(s => s.id === suggested.siteId)?.name || suggested.siteId}
              </span>
              <span>{formatDate(suggested.createdAt)}</span>
            </div>

            {(settings?.facebookPageUrl || settings?.xProfileUrl) ? (
              <div className="st-account-strip">
                <span>Posting as:</span>
                {settings?.xProfileUrl && (
                  <button className="st-account-link" onClick={() => window.open(settings.xProfileUrl)}>𝕏 Open X Profile ↗</button>
                )}
                {settings?.facebookPageUrl && (
                  <button className="st-account-link" onClick={() => window.open(settings.facebookPageUrl)}>📘 Open Facebook Page ↗</button>
                )}
              </div>
            ) : (
              <div className="st-account-strip st-account-strip-empty">
                Set your Facebook Page and X profile once in <button className="st-account-link" onClick={() => navigate?.('settings')}>Settings →</button> so you can jump straight to the right account before posting.
              </div>
            )}

            <div className="st-composer">
              <label className="st-composer-label" htmlFor="st-caption">Caption</label>
              <textarea
                id="st-caption"
                className="st-composer-textarea"
                rows={3}
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder="Write what you want to say about this article…"
              />
              <div className={`st-char-count${caption.length > 280 ? ' over' : ''}`}>
                {caption.length}/280 for X{caption.length > 280 ? ' — over the X limit, it will post as a shorter auto-wrapped version' : ''}
              </div>
              <label className="st-composer-label" htmlFor="st-link">Article Link</label>
              <input id="st-link" className="st-composer-link" value={suggested.wpLink} readOnly onFocus={e => e.target.select()} />
            </div>

            <div className="st-suggest-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => window.open(suggested.wpLink)}>↗ Open Article</button>
              <button className="btn btn-secondary btn-sm" onClick={() => copyLink(suggested.wpLink)}>📋 Copy Link</button>
              <button className="btn btn-secondary btn-sm" onClick={() => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}&url=${encodeURIComponent(suggested.wpLink)}`)}>𝕏 Post to X</button>
              <button className="btn btn-secondary btn-sm" onClick={() => postToFacebook(suggested.wpLink, caption)}>📘 Post to Facebook</button>
              <button className="btn btn-primary btn-sm" onClick={markSuggestedShared}>✓ Log This Pass</button>
              <button className="btn btn-ghost btn-sm" onClick={suggestRandom}>🎲 Suggest Another</button>
            </div>
          </>
        ) : (
          <>
            <div className="st-suggest-empty">Stuck on what to share next? Pull a random article that hasn't hit 3 passes yet from across all your sites.</div>
            <button className="btn btn-primary btn-sm" onClick={suggestRandom} disabled={eligible.length - fullyShared === 0}>
              🎲 Suggest a Random Article
            </button>
          </>
        )}
      </div>

      {/* Per-site breakdown */}
      <div className="st-site-chips">
        {sites.filter(s => bySiteStats[s.id]).map(s => {
          const { total, started } = bySiteStats[s.id]
          return (
            <button
              key={s.id}
              className={`st-site-chip${siteFilter === s.id ? ' active' : ''}`}
              onClick={() => setSiteFilter(siteFilter === s.id ? 'all' : s.id)}
              style={{ '--chip-color': s.color }}
            >
              <span className="st-chip-dot" style={{ background: s.color }} />
              {s.name}
              <span className="st-chip-count">{started}/{total}</span>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="st-filters">
        <input className="st-search" placeholder="Search articles…" value={search} onChange={e => setSearch(e.target.value)} />
        <select className="st-select" value={siteFilter} onChange={e => setSiteFilter(e.target.value)}>
          <option value="all">All sites</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="st-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All articles</option>
          <option value="none">○ Not shared</option>
          <option value="partial">◐ In progress (1-2)</option>
          <option value="full">● Fully shared (3)</option>
        </select>
        <span className="st-count">{filtered.length} of {eligible.length}</span>
      </div>

      {/* List */}
      {eligible.length === 0 ? (
        <div className="st-empty">
          <p>No published articles synced yet.</p>
          <p className="st-empty-sub">Go to Dashboard and hit <strong>Sync All Sites</strong> first.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="st-empty"><p>No articles match this filter.</p></div>
      ) : (
        <div className="st-list">
          {filtered.map(post => {
            const site = sites.find(s => s.id === post.siteId)
            const count = post.shareCount || 0
            const stamps = post.shareStamps || []
            return (
              <div key={post.localId} className="st-row">
                <div className="st-dots" title={`${count}/${MAX_PASSES} passes shared`}>
                  {Array.from({ length: MAX_PASSES }).map((_, i) => (
                    <button
                      key={i}
                      className={`st-dot ${i < count ? 'filled' : ''}`}
                      onClick={() => setDot(post, i)}
                      title={stamps[i] ? `Pass ${i + 1}: ${formatDate(stamps[i])}` : `Mark pass ${i + 1} as shared`}
                    />
                  ))}
                </div>
                {site && <SiteAvatar site={site} size={24} radius={6} />}
                <span className="st-title" dangerouslySetInnerHTML={{ __html: post.title || '(Untitled)' }} />
                <span className="st-date">{formatDate(stamps[count - 1] || post.createdAt)}</span>
                <button className="st-link-btn" onClick={() => selectForCompose(post)} title="Compose a post for this article">✏️</button>
                <button className="st-link-btn" onClick={() => copyLink(post.wpLink)} title="Copy link">📋</button>
                <a href="#" className="st-link-btn" onClick={e => { e.preventDefault(); window.open(post.wpLink) }} title="Open article">↗</a>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
