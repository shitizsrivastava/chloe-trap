import React, { useState, useEffect, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { CONTENT_PLAN } from '../utils/contentPlanData'
import SiteAvatar from '../components/SiteAvatar'
import './SmartSuggestions.css'

const CP_ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'", '&#8217;': "'", '&#8216;': "'", '&#8220;': '"', '&#8221;': '"', '&#8211;': '–', '&#8212;': '—', '&nbsp;': ' ' }
function cpNorm(t) {
  return (t || '').replace(/<[^>]+>/g, '').replace(/&[#a-z0-9]+;/gi, m => CP_ENT[m] || m).toLowerCase().replace(/\s+/g, ' ').trim()
}
function buildContentPlanSuggestions(siteNameMap, writtenMap) {
  const suggestions = []
  let id = 90000
  for (const series of CONTENT_PLAN) {
    const site = siteNameMap[series.siteName?.toLowerCase()]
    if (!site?.connected) continue
    for (let i = 0; i < series.posts.length; i++) {
      if (!writtenMap.has(`${site.id}||${cpNorm(series.posts[i])}`)) {
        suggestions.push({
          id: id++, siteId: site.id, siteName: series.siteName,
          siteColor: site.color || '#6366f1',
          siteInitials: site.initials || series.siteName.slice(0, 2).toUpperCase(),
          priority: 'medium', category: 'Content Plan',
          icon: '📋',
          title: `Next planned post for ${series.siteName}`,
          detail: `#${i + 1} in "${series.series}": ${series.posts[i]}`,
          action: { label: '✍️ Write Now', screen: 'create' },
          prefill: { title: series.posts[i], siteId: site.id },
        })
        break
      }
    }
  }
  return suggestions
}

const PRIORITY = { critical: 0, high: 1, medium: 2, low: 3 }

async function quickScanSite(site) {
  const headers = { Authorization: 'Basic ' + btoa(`${site.username}:${site.password}`) }
  const results = { pages: [], postCount: 0, lastPostDate: null, recentPosts: [], categories: [], thinCount: 0 }

  await Promise.allSettled([
    // Pages
    fetch(`${site.url}/wp-json/wp/v2/pages?per_page=50&status=publish&_fields=id,title,slug`, { headers })
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (Array.isArray(data)) results.pages = data }),

    // Post count + last post
    fetch(`${site.url}/wp-json/wp/v2/posts?per_page=5&status=publish&orderby=date&order=desc&_fields=id,title,date,content`, { headers })
      .then(r => {
        results.postCount = parseInt(r.headers.get('X-WP-Total') || '0')
        return r.json()
      })
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          results.lastPostDate = data[0].date
          results.recentPosts = data
          results.thinCount = data.filter(p => {
            const wc = (p.content?.rendered || '')
              .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(w => w.length > 0).length
            return wc < 300
          }).length
        }
      }),

    // Categories
    fetch(`${site.url}/wp-json/wp/v2/categories?per_page=100&_fields=id,name,count,slug`, { headers })
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (Array.isArray(data)) results.categories = data }),
  ])

  return results
}

function daysSince(dateStr) {
  if (!dateStr) return Infinity
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
}

function buildSuggestions(sites, scanData) {
  const suggestions = []
  let id = 0

  sites.forEach(site => {
    const d = scanData[site.id]
    if (!d) return

    const pageTitles = d.pages.map(p => (p.title?.rendered || p.slug || '').toLowerCase())
    const hasPage = (keywords) => keywords.some(k => pageTitles.some(t => t.includes(k)))

    // ---- CRITICAL ----
    if (!hasPage(['privacy', 'privacy policy'])) {
      suggestions.push({ id: id++, siteId: site.id, siteName: site.name, siteColor: site.color, siteInitials: site.initials,
        priority: 'critical', category: 'Compliance',
        icon: '🔒', title: `Create Privacy Policy on "${site.name}"`,
        detail: 'Google AdSense requires a Privacy Policy page before approval. Missing = auto-rejection.',
        action: { label: 'Create Page', screen: 'pages' } })
    }
    if (!hasPage(['contact', 'contact us'])) {
      suggestions.push({ id: id++, siteId: site.id, siteName: site.name, siteColor: site.color, siteInitials: site.initials,
        priority: 'critical', category: 'Compliance',
        icon: '✉️', title: `Add Contact page to "${site.name}"`,
        detail: 'AdSense reviewers must be able to contact a real person behind the site.',
        action: { label: 'Create Page', screen: 'pages' } })
    }
    if (!hasPage(['about', 'about us'])) {
      suggestions.push({ id: id++, siteId: site.id, siteName: site.name, siteColor: site.color, siteInitials: site.initials,
        priority: 'critical', category: 'Compliance',
        icon: '👤', title: `Add About Us page to "${site.name}"`,
        detail: 'Proves a real person runs the site. Required for E-E-A-T signals — critical for AdSense.',
        action: { label: 'Create Page', screen: 'pages' } })
    }

    // ---- HIGH ----
    // Empty categories
    const emptyCats = d.categories.filter(c => c.count === 0 && c.name !== 'Uncategorized')
    emptyCats.slice(0, 5).forEach(cat => {
      suggestions.push({ id: id++, siteId: site.id, siteName: site.name, siteColor: site.color, siteInitials: site.initials,
        priority: 'high', category: 'Content Gap',
        icon: '📝', title: `Write for "${cat.name}" category on ${site.name}`,
        detail: `The "${cat.name}" category has 0 posts. Empty categories signal a low-quality site to Google.`,
        action: { label: '+ Write Post', screen: 'create' }, meta: cat.name })
    })

    // Low content categories (1-2 posts)
    const lowCats = d.categories.filter(c => c.count > 0 && c.count < 3 && c.name !== 'Uncategorized')
    lowCats.slice(0, 3).forEach(cat => {
      suggestions.push({ id: id++, siteId: site.id, siteName: site.name, siteColor: site.color, siteInitials: site.initials,
        priority: 'high', category: 'Content Gap',
        icon: '📊', title: `"${cat.name}" on ${site.name} only has ${cat.count} post${cat.count > 1 ? 's' : ''}`,
        detail: `Build this category up to at least 5 posts to make it look substantial to AdSense reviewers.`,
        action: { label: '+ Write Post', screen: 'create' }, meta: cat.name })
    })

    // Writing frequency
    const days = daysSince(d.lastPostDate)
    if (d.postCount > 0 && days > 14 && days < Infinity) {
      suggestions.push({ id: id++, siteId: site.id, siteName: site.name, siteColor: site.color, siteInitials: site.initials,
        priority: days > 30 ? 'high' : 'medium', category: 'Writing Frequency',
        icon: '📅', title: `No new post on "${site.name}" for ${days} days`,
        detail: `Last post was ${days} days ago. Regular publishing (2–4/week) signals an active site to Google.`,
        action: { label: '+ Write Post', screen: 'create' } })
    }
    if (d.postCount === 0) {
      suggestions.push({ id: id++, siteId: site.id, siteName: site.name, siteColor: site.color, siteInitials: site.initials,
        priority: 'critical', category: 'Content',
        icon: '🚨', title: `"${site.name}" has no published posts`,
        detail: 'AdSense requires at least 10–15 quality posts before applying. Start publishing immediately.',
        action: { label: '+ Write First Post', screen: 'create' } })
    } else if (d.postCount < 10) {
      suggestions.push({ id: id++, siteId: site.id, siteName: site.name, siteColor: site.color, siteInitials: site.initials,
        priority: 'high', category: 'Content',
        icon: '📉', title: `"${site.name}" only has ${d.postCount} published posts`,
        detail: 'AdSense wants 10–15+ quality posts. Keep writing consistently before applying.',
        action: { label: '+ Write Post', screen: 'create' } })
    }

    // Thin content
    if (d.thinCount > 0) {
      suggestions.push({ id: id++, siteId: site.id, siteName: site.name, siteColor: site.color, siteInitials: site.initials,
        priority: 'high', category: 'Content Quality',
        icon: '📏', title: `Thin content detected on "${site.name}"`,
        detail: `${d.thinCount} recent post${d.thinCount > 1 ? 's have' : ' has'} under 300 words. Thin content is the #1 AdSense rejection reason. Humanize and expand them.`,
        action: { label: 'Scan Thin Content', screen: 'thin-content' } })
    }

    // ---- MEDIUM ----
    if (!hasPage(['disclaimer'])) {
      suggestions.push({ id: id++, siteId: site.id, siteName: site.name, siteColor: site.color, siteInitials: site.initials,
        priority: 'medium', category: 'Compliance',
        icon: '⚠️', title: `Add Disclaimer to "${site.name}"`,
        detail: 'Recommended for health, finance, and legal content. Builds trust and reduces AdSense rejection risk.',
        action: { label: 'Create Page', screen: 'pages' } })
    }
    if (!hasPage(['terms', 'terms of service'])) {
      suggestions.push({ id: id++, siteId: site.id, siteName: site.name, siteColor: site.color, siteInitials: site.initials,
        priority: 'medium', category: 'Compliance',
        icon: '📋', title: `Add Terms of Service to "${site.name}"`,
        detail: 'Strengthens your site\'s credibility and reduces legal exposure.',
        action: { label: 'Create Page', screen: 'pages' } })
    }

    // Humanizer suggestion for AI content
    if (d.postCount > 0) {
      suggestions.push({ id: id++, siteId: site.id, siteName: site.name, siteColor: site.color, siteInitials: site.initials,
        priority: 'medium', category: 'Content Quality',
        icon: '🤖', title: `Humanize AI content on "${site.name}"`,
        detail: 'If any posts were written with AI, use the Humanizer to make them natural, pass AI detectors, and improve your AdSense approval chances.',
        action: { label: 'Open Humanizer', screen: 'humanizer' } })
    }
  })

  // Sort by priority
  return suggestions.sort((a, b) => PRIORITY[a.priority] - PRIORITY[b.priority])
}

const PRIORITY_STYLES = {
  critical: { bg: '#fff1f2', border: '#fecdd3', badge: '#fee2e2', badgeText: '#dc2626', dot: '#dc2626' },
  high:     { bg: '#fffbeb', border: '#fde68a', badge: '#fef3c7', badgeText: '#d97706', dot: '#d97706' },
  medium:   { bg: '#eff6ff', border: '#bfdbfe', badge: '#dbeafe', badgeText: '#2563eb', dot: '#2563eb' },
  low:      { bg: '#f9fafb', border: '#e5e7eb', badge: '#f3f4f6', badgeText: '#6b7280', dot: '#9ca3af' },
}

export default function SmartSuggestions({ navigate }) {
  const { sites, posts } = useApp()
  const connected = sites.filter(s => s.connected)

  const writtenMap = useMemo(() => {
    const m = new Set()
    posts.forEach(p => m.add(`${p.siteId}||${cpNorm(p.title)}`))
    return m
  }, [posts])
  const siteNameMap = useMemo(() => Object.fromEntries(sites.map(s => [s.name?.toLowerCase(), s])), [sites])

  const CACHE_KEY = 'ct_scan_data'
  const CACHE_TS_KEY = 'ct_scan_ts'
  const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

  const [scanning,   setScanning]   = useState(false)
  const [scanData,   setScanData]   = useState(() => {
    try {
      const ts = parseInt(localStorage.getItem(CACHE_TS_KEY) || '0')
      if (Date.now() - ts < CACHE_TTL) {
        return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
      }
    } catch {}
    return {}
  })
  const [dismissed,  setDismissed]  = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('ct_dismissed_suggestions') || '[]')) }
    catch { return new Set() }
  })
  const [filterCat,  setFilterCat]  = useState('all')
  const [progress,   setProgress]   = useState({ done: 0, total: 0 })

  const runScan = async (force = false) => {
    if (!connected.length) return
    // Skip if cached data is fresh (unless forced via Refresh button)
    if (!force) {
      const ts = parseInt(localStorage.getItem(CACHE_TS_KEY) || '0')
      if (Date.now() - ts < CACHE_TTL && Object.keys(scanData).length > 0) return
    }
    setScanning(true)
    setScanData({})
    setProgress({ done: 0, total: connected.length })
    const fresh = {}
    for (const site of connected) {
      try {
        const d = await quickScanSite(site)
        fresh[site.id] = d
        setScanData(prev => ({ ...prev, [site.id]: d }))
      } catch {}
      setProgress(p => ({ ...p, done: p.done + 1 }))
    }
    setScanning(false)
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(fresh))
      localStorage.setItem(CACHE_TS_KEY, String(Date.now()))
    } catch {}
  }

  useEffect(() => { if (connected.length) runScan() }, [])

  const dismiss = (id) => {
    const next = new Set(dismissed)
    next.add(id)
    setDismissed(next)
    localStorage.setItem('ct_dismissed_suggestions', JSON.stringify([...next]))
  }

  const clearDismissed = () => {
    setDismissed(new Set())
    localStorage.setItem('ct_dismissed_suggestions', '[]')
  }

  const cpSuggestions = useMemo(() => buildContentPlanSuggestions(siteNameMap, writtenMap), [siteNameMap, writtenMap])
  const allSuggestions = [...buildSuggestions(connected, scanData), ...cpSuggestions].sort((a, b) => PRIORITY[a.priority] - PRIORITY[b.priority])
  const visible = allSuggestions.filter(s => !dismissed.has(s.id))
  const categories = ['all', ...new Set(allSuggestions.map(s => s.category))]
  const filtered = filterCat === 'all' ? visible : visible.filter(s => s.category === filterCat)

  const critCount = visible.filter(s => s.priority === 'critical').length
  const highCount  = visible.filter(s => s.priority === 'high').length

  return (
    <div className="ss-screen">
      <div className="page-header-row">
        <div>
          <h1>Smart Suggestions</h1>
          <p className="page-subtitle">Your personalized to-do list — what to fix right now to get AdSense approved</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => runScan(true)} disabled={scanning}>
          {scanning ? `⟳ Scanning… (${progress.done}/${progress.total})` : '↺ Refresh'}
        </button>
      </div>

      {/* Summary bar */}
      {!scanning && Object.keys(scanData).length > 0 && (
        <div className="ss-summary">
          <div className="ss-sum-item critical">
            <span className="ss-sum-num">{critCount}</span>
            <span className="ss-sum-lbl">Critical</span>
          </div>
          <div className="ss-sum-item high">
            <span className="ss-sum-num">{highCount}</span>
            <span className="ss-sum-lbl">High Priority</span>
          </div>
          <div className="ss-sum-item total">
            <span className="ss-sum-num">{visible.length}</span>
            <span className="ss-sum-lbl">Total To-Dos</span>
          </div>
          {dismissed.size > 0 && (
            <button className="ss-clear-btn" onClick={clearDismissed}>
              Restore {dismissed.size} dismissed
            </button>
          )}
        </div>
      )}

      {scanning && (
        <div className="ss-scanning">
          <div className="ss-scan-bar">
            <div className="ss-scan-fill" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 5}%` }} />
          </div>
          <span>Scanning {connected[progress.done]?.name || ''}…</span>
        </div>
      )}

      {/* Category filter */}
      {visible.length > 0 && (
        <div className="ss-filter-row">
          {categories.map(cat => {
            const count = cat === 'all' ? visible.length : visible.filter(s => s.category === cat).length
            return (
              <button
                key={cat}
                className={`ss-cat-btn${filterCat === cat ? ' active' : ''}`}
                onClick={() => setFilterCat(cat)}
              >
                {cat === 'all' ? `All (${count})` : `${cat} (${count})`}
              </button>
            )
          })}
        </div>
      )}

      {/* Suggestion list */}
      {!connected.length ? (
        <div className="ss-empty">🔌 No connected sites. Go to Site Manager and connect your WordPress sites first.</div>
      ) : filtered.length === 0 && !scanning ? (
        <div className="ss-empty">
          {visible.length === 0
            ? '🎉 All clear! No suggestions right now. Keep writing consistently!'
            : '✓ No suggestions in this category.'}
        </div>
      ) : (
        <div className="ss-list">
          {filtered.map(s => {
            const style = PRIORITY_STYLES[s.priority]
            return (
              <div
                key={s.id}
                className="ss-card"
                style={{ background: style.bg, borderColor: style.border }}
              >
                <div className="ss-card-left">
                  <span className="ss-card-icon">{s.icon}</span>
                </div>
                <div className="ss-card-body">
                  <div className="ss-card-top">
                    <span className="ss-card-title">{s.title}</span>
                    <span className="ss-priority-badge" style={{ background: style.badge, color: style.badgeText }}>
                      {s.priority}
                    </span>
                    <span className="ss-cat-label">{s.category}</span>
                  </div>
                  <div className="ss-card-detail">{s.detail}</div>
                  <div className="ss-card-actions">
                    <span className="ss-site-chip" style={{ background: s.siteColor + '22', color: s.siteColor, borderColor: s.siteColor + '44', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      {sites.find(x => x.id === s.siteId) && <SiteAvatar site={sites.find(x => x.id === s.siteId)} size={14} radius={4} />}
                      {s.siteName}
                    </span>
                    <button
                      className="ss-action-btn"
                      style={{ background: style.badgeText, color: 'white' }}
                      onClick={() => {
                        if (s.prefill) {
                          localStorage.setItem('ct_prefill_title', s.prefill.title)
                          localStorage.setItem('ct_prefill_site', s.prefill.siteId)
                          navigate('create')
                        } else {
                          navigate(s.action.screen)
                        }
                      }}
                    >
                      {s.action.label} →
                    </button>
                    <button className="ss-dismiss-btn" onClick={() => dismiss(s.id)} title="Dismiss">✕</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
