import React, { useState } from 'react'
import { useApp } from '../context/AppContext'
import './AdSenseChecker.css'

const CHECKS = [
  { key: 'privacy',    label: 'Privacy Policy page',       required: true,  pageSearch: ['privacy', 'privacy policy'] },
  { key: 'terms',      label: 'Terms of Service page',     required: true,  pageSearch: ['terms', 'terms of service', 'terms and conditions'] },
  { key: 'contact',    label: 'Contact page',              required: true,  pageSearch: ['contact', 'contact us'] },
  { key: 'about',      label: 'About Us page',             required: true,  pageSearch: ['about', 'about us'] },
  { key: 'disclaimer', label: 'Disclaimer page',           required: false, pageSearch: ['disclaimer'] },
  { key: 'cookie',     label: 'Cookie Policy page',        required: false, pageSearch: ['cookie', 'cookie policy'] },
  { key: 'posts10',    label: 'At least 10 published posts', required: true,  postMin: 10 },
  { key: 'posts20',    label: 'Ideally 20+ published posts', required: false, postMin: 20 },
  { key: 'categories', label: 'At least 3 categories',    required: false,  catMin: 3 },
  { key: 'original',   label: 'Original content (no empty categories)', required: false, noemptycats: true },
]

const REJECTION_REASONS = [
  {
    category: '📄 Content Quality',
    color: '#dc2626',
    bg: '#fff1f2',
    reasons: [
      { icon: '📏', title: 'Thin Content (< 300 words)', severity: 'critical', fix: 'Expand all posts to 800–1200+ words. Use the Thin Content Scanner to find offenders. This is the #1 rejection reason in 2025–2026.' },
      { icon: '🤖', title: 'AI-Generated Content Without Editing', severity: 'critical', fix: 'Google detects unedited AI content. Always add your own experience, examples, and unique insights. 82% of rejected sites had zero first-person language.' },
      { icon: '📋', title: 'Duplicate / Copied Content', severity: 'critical', fix: 'Never copy from other websites. Even paraphrasing popular articles fails — Google wants "Information Gain", meaning new angles, data, or perspectives.' },
      { icon: '🔄', title: 'Repetitive or Redundant Posts', severity: 'high', fix: 'If you have 5 posts on the same topic, merge them into one comprehensive guide and redirect the others.' },
      { icon: '🖼️', title: 'Mostly Images / Videos, No Text', severity: 'high', fix: 'Pages with only images or embedded videos and no real text body will be rejected. Add thorough written descriptions and context.' },
    ]
  },
  {
    category: '🔒 Required Pages & Policies',
    color: '#d97706',
    bg: '#fffbeb',
    reasons: [
      { icon: '🔒', title: 'Missing Privacy Policy', severity: 'critical', fix: 'Mandatory for AdSense. Must explicitly mention cookies, Google AdSense/analytics, and how you collect/use data. Use the Pages Manager to create one.' },
      { icon: '✉️', title: 'Missing Contact Page', severity: 'critical', fix: 'Google wants to know a real person runs the site. Must have a working contact method — an email address or contact form.' },
      { icon: '👤', title: 'Missing About Us Page', severity: 'critical', fix: 'Proves a real human or organization is behind the site. Include your name, background, and why you write about this topic. E-E-A-T requires this.' },
      { icon: '⚠️', title: 'Missing Disclaimer (health/finance/legal niches)', severity: 'high', fix: 'For health, finance, legal, relationship or safety topics — a disclaimer is required by AdSense policy. Adds trust signals.' },
      { icon: '🍪', title: 'Missing Cookie Consent Notice', severity: 'medium', fix: 'Required in EU/UK. Even outside Europe, adding it protects you. Many rejections come from lack of GDPR-style cookie notice.' },
    ]
  },
  {
    category: '⚙️ Technical Issues',
    color: '#7c3aed',
    bg: '#f5f3ff',
    reasons: [
      { icon: '🔒', title: 'No HTTPS / SSL Certificate', severity: 'critical', fix: 'AdSense will not approve HTTP sites. Ensure your hosting has a valid SSL. Check for "https://" in the browser — if it shows a warning, fix it first.' },
      { icon: '📱', title: 'Not Mobile-Friendly', severity: 'critical', fix: 'Over 60% of web traffic is mobile. Google rejects sites with broken mobile layouts. Test with Google Mobile-Friendly Test tool.' },
      { icon: '🐢', title: 'Very Slow Page Speed', severity: 'high', fix: 'Extremely slow sites (10+ seconds) are rejected. Use Google PageSpeed Insights. Compress images, use a caching plugin (WP Super Cache or W3 Total Cache).' },
      { icon: '🔗', title: 'Broken Links / Navigation Errors', severity: 'high', fix: 'Google reviewers click around. Dead links and 404 errors signal an abandoned site. Run the Broken Links scanner and fix all issues.' },
      { icon: '🚫', title: 'Incomplete / Under-Construction Pages', severity: 'high', fix: 'Any page that says "Coming Soon" or has placeholder content must be removed or completed before applying.' },
    ]
  },
  {
    category: '📋 Site Structure & Trust',
    color: '#0891b2',
    bg: '#ecfeff',
    reasons: [
      { icon: '🗂️', title: 'Poor Site Navigation', severity: 'high', fix: 'Your site must have a clear menu, categories, and a logical structure. Visitors should find content within 2 clicks. Add a top navigation menu if missing.' },
      { icon: '🆔', title: 'No Author Information / E-E-A-T Signals', severity: 'high', fix: 'Google\'s E-E-A-T (Experience, Expertise, Authority, Trust) framework requires real author bios. Add author profiles showing credentials, especially for YMYL (health/finance/legal) topics.' },
      { icon: '📅', title: 'Brand New Domain (< 3–6 months)', severity: 'medium', fix: 'Very new sites are often rejected. Wait until you have consistent traffic and more content. Some niches (health, finance) require 6+ months of history.' },
      { icon: '📊', title: 'No Traffic at All', severity: 'medium', fix: 'While not an official requirement, sites with zero visitors rarely pass. Work on SEO and getting some organic traffic before applying.' },
      { icon: '🌍', title: 'Domain Not in Supported Countries', severity: 'medium', fix: 'Ensure your site is in a supported AdSense language and your country is eligible. Check Google\'s supported countries list.' },
    ]
  },
  {
    category: '🚫 Policy Violations',
    color: '#be123c',
    bg: '#fff1f2',
    reasons: [
      { icon: '🎰', title: 'Prohibited Content (gambling, adult, drugs)', severity: 'critical', fix: 'Gambling, adult content, illegal drugs, piracy, weapon instructions, hate speech — any of these on ANY page means instant rejection. Check all posts.' },
      { icon: '💊', title: 'Misleading Health / Medical Claims', severity: 'critical', fix: 'Health sites must not make unverified medical claims or promise cures. Add a disclaimer and cite reputable sources (PubMed, NHS, Mayo Clinic).' },
      { icon: '💰', title: 'Misleading Financial or Get-Rich Claims', severity: 'critical', fix: 'Promises of guaranteed returns, forex schemes, pyramid marketing content = rejection. Finance content must have proper disclaimers.' },
      { icon: '©️', title: 'Copyright Infringement (images/text)', severity: 'critical', fix: 'Using copyrighted images without license or copying text from other sites violates AdSense policy. Use free image sites: Unsplash, Pexels, Pixabay.' },
      { icon: '📧', title: 'Incentivised Clicks or Click Bait Ads', severity: 'high', fix: 'Telling users to "click ads to support us" or designing layouts that trick users into clicking ads = permanent ban. Never do this.' },
    ]
  },
]

async function checkSite(site) {
  const headers = { Authorization: 'Basic ' + btoa(`${site.username}:${site.password}`) }
  const results = {}

  // Fetch pages
  let pages = []
  try {
    let p = 1
    while (true) {
      const r = await fetch(`${site.url}/wp-json/wp/v2/pages?per_page=100&page=${p}&status=publish`, { headers })
      if (!r.ok) break
      const batch = await r.json()
      if (!Array.isArray(batch) || batch.length === 0) break
      pages = [...pages, ...batch]
      if (batch.length < 100) break
      p++
    }
  } catch {}

  // Fetch post count
  let postCount = 0
  try {
    const r = await fetch(`${site.url}/wp-json/wp/v2/posts?per_page=1&status=publish`, { headers })
    postCount = parseInt(r.headers.get('X-WP-Total') || '0')
  } catch {}

  // Fetch category count
  let catCount = 0
  try {
    const r = await fetch(`${site.url}/wp-json/wp/v2/categories?per_page=1`, { headers })
    catCount = parseInt(r.headers.get('X-WP-Total') || '0')
  } catch {}

  // Fetch categories for empty check
  let cats = []
  try {
    const r = await fetch(`${site.url}/wp-json/wp/v2/categories?per_page=100`, { headers })
    cats = await r.json()
  } catch {}
  const emptyCats = Array.isArray(cats) ? cats.filter(c => c.count === 0 && c.name !== 'Uncategorized').length : 0

  const pageTitles = pages.map(p => (p.title?.rendered || p.slug || '').toLowerCase())

  CHECKS.forEach(check => {
    if (check.pageSearch) {
      results[check.key] = check.pageSearch.some(keyword => pageTitles.some(t => t.includes(keyword)))
    } else if (check.postMin) {
      results[check.key] = postCount >= check.postMin
    } else if (check.catMin) {
      results[check.key] = catCount >= check.catMin
    } else if (check.noemptycats) {
      results[check.key] = emptyCats === 0
    }
  })

  return { results, postCount, catCount, emptyCats, pageCount: pages.length }
}

export default function AdSenseChecker({ navigate }) {
  const { sites } = useApp()
  const connected = sites.filter(s => s.connected)

  const [scanning,   setScanning]   = useState(false)
  const [siteScores, setSiteScores] = useState({}) // { siteId: { results, postCount, catCount, emptyCats, pageCount } }
  const [selected,   setSelected]   = useState(new Set(connected.map(s => s.id)))

  const runScan = async () => {
    const toScan = connected.filter(s => selected.has(s.id))
    if (!toScan.length) return
    setScanning(true)
    setSiteScores({})
    for (const site of toScan) {
      const res = await checkSite(site)
      setSiteScores(prev => ({ ...prev, [site.id]: res }))
    }
    setScanning(false)
  }

  const toggleSite = (id) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const scoreFor = (siteData) => {
    if (!siteData) return null
    const reqChecks = CHECKS.filter(c => c.required)
    const passed = reqChecks.filter(c => siteData.results[c.key]).length
    return Math.round((passed / reqChecks.length) * 100)
  }

  const scoreColor = (score) => {
    if (score >= 90) return '#16a34a'
    if (score >= 70) return '#d97706'
    return '#dc2626'
  }

  const scoreLabel = (score) => {
    if (score >= 90) return 'Ready'
    if (score >= 70) return 'Almost'
    return 'Not Ready'
  }

  const hasAnyResults = Object.keys(siteScores).length > 0

  return (
    <div className="asc-screen">
      <div className="page-header-row">
        <div>
          <h1>AdSense Compliance Checker</h1>
          <p className="page-subtitle">Scan your sites for Google AdSense requirements — required pages, content, and more</p>
        </div>
      </div>

      {/* Site selector */}
      <div className="asc-site-select-row">
        <div className="asc-select-label">Sites to scan:</div>
        <div className="asc-site-chips">
          {connected.map(site => (
            <button
              key={site.id}
              className={`asc-site-chip${selected.has(site.id) ? ' active' : ''}`}
              style={selected.has(site.id) ? { background: site.color + '22', color: site.color, borderColor: site.color + '66' } : {}}
              onClick={() => toggleSite(site.id)}
            >
              <span className="asc-chip-dot" style={{ background: selected.has(site.id) ? site.color : '#d1d5db' }} />
              {site.name}
            </button>
          ))}
        </div>
        <button
          className="btn btn-primary"
          onClick={runScan}
          disabled={scanning || !selected.size || !connected.length}
        >
          {scanning ? '⟳ Scanning…' : '▶ Run Scan'}
        </button>
      </div>

      {!connected.length && (
        <div className="asc-no-sites">No connected sites. Go to Site Manager first.</div>
      )}

      {hasAnyResults && (
        <>
          {/* Summary cards */}
          <div className="asc-score-row">
            {connected.filter(s => selected.has(s.id)).map(site => {
              const d = siteScores[site.id]
              if (!d) return (
                <div key={site.id} className="asc-score-card scanning">
                  <div className="asc-score-site-name">{site.name}</div>
                  <div className="asc-score-scanning">Scanning…</div>
                </div>
              )
              const score = scoreFor(d)
              return (
                <div key={site.id} className="asc-score-card" style={{ borderColor: scoreColor(score) + '55' }}>
                  <div className="asc-score-site-name">{site.name}</div>
                  <div className="asc-score-num" style={{ color: scoreColor(score) }}>{score}%</div>
                  <div className="asc-score-label" style={{ color: scoreColor(score) }}>{scoreLabel(score)}</div>
                  <div className="asc-score-meta">{d.postCount} posts · {d.pageCount} pages</div>
                </div>
              )
            })}
          </div>

          {/* Per-site detailed results */}
          {connected.filter(s => selected.has(s.id) && siteScores[s.id]).map(site => {
            const d = siteScores[site.id]
            const score = scoreFor(d)
            const missing = CHECKS.filter(c => c.required && !d.results[c.key])

            return (
              <div key={site.id} className="asc-site-result">
                <div className="asc-result-header" style={{ borderLeftColor: site.color }}>
                  <span className="asc-result-site">{site.name}</span>
                  <span className="asc-result-score" style={{ color: scoreColor(score) }}>
                    {score}% — {scoreLabel(score)}
                  </span>
                </div>

                {missing.length > 0 && (
                  <div className="asc-missing-banner">
                    ⚠️ <strong>{missing.length} required item{missing.length > 1 ? 's' : ''} missing:</strong>{' '}
                    {missing.map(c => c.label).join(', ')}
                    {missing.some(c => ['privacy','terms','contact','about','disclaimer','cookie'].includes(c.key)) && (
                      <button className="asc-fix-btn" onClick={() => navigate('pages')}>
                        → Create Missing Pages
                      </button>
                    )}
                  </div>
                )}

                <div className="asc-checks-grid">
                  {CHECKS.map(check => {
                    const passed = d.results[check.key]
                    return (
                      <div key={check.key} className={`asc-check-row${passed ? ' pass' : check.required ? ' fail' : ' warn'}`}>
                        <span className="asc-check-icon">{passed ? '✓' : check.required ? '✗' : '!'}</span>
                        <span className="asc-check-label">{check.label}</span>
                        {check.required && <span className="asc-check-req">Required</span>}
                        {!check.required && <span className="asc-check-rec">Recommended</span>}
                      </div>
                    )
                  })}
                </div>

                <div className="asc-site-stats">
                  <div className={`asc-stat-chip${d.postCount >= 20 ? ' good' : d.postCount >= 10 ? ' ok' : ' bad'}`}>
                    {d.postCount} published posts
                  </div>
                  <div className={`asc-stat-chip${d.catCount >= 3 ? ' good' : ' ok'}`}>
                    {d.catCount} categories
                  </div>
                  {d.emptyCats > 0 && (
                    <div className="asc-stat-chip bad">{d.emptyCats} empty categories</div>
                  )}
                </div>
              </div>
            )
          })}
        </>
      )}

      {/* Full AdSense Rejection Reasons Guide — always visible */}
      <div className="asc-rejection-guide">
        <div className="asc-guide-header">
          <div className="asc-guide-title">📋 Complete Google AdSense Rejection Reasons — 2025/2026 Guide</div>
          <div className="asc-guide-subtitle">Every known reason Google rejects AdSense applications — researched and verified</div>
        </div>

        <div className="asc-severity-legend">
          <span className="asc-sev critical">Critical — auto-reject</span>
          <span className="asc-sev high">High — likely reject</span>
          <span className="asc-sev medium">Medium — reduces chances</span>
        </div>

        {REJECTION_REASONS.map(cat => (
          <div key={cat.category} className="asc-cat-block" style={{ borderColor: cat.color + '44' }}>
            <div className="asc-cat-title" style={{ background: cat.bg, color: cat.color, borderColor: cat.color + '44' }}>
              {cat.category}
            </div>
            <div className="asc-reason-grid">
              {cat.reasons.map((r, i) => (
                <div key={i} className={`asc-reason-card asc-sev-${r.severity}`}>
                  <div className="asc-reason-top">
                    <span className="asc-reason-icon">{r.icon}</span>
                    <div className="asc-reason-title">{r.title}</div>
                    <span className={`asc-sev-badge ${r.severity}`}>{r.severity}</span>
                  </div>
                  <div className="asc-reason-fix">✅ Fix: {r.fix}</div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="asc-final-tip">
          <strong>🎯 The #1 thing that gets sites approved in 2026:</strong> Real, original, in-depth content (800–1200+ words) written by a real person with genuine expertise, on a site with clear navigation, HTTPS, and all required policy pages.
          Run the <strong>Thin Content Scanner</strong> first — fix every post under 300 words — then apply.
        </div>
      </div>
    </div>
  )
}
