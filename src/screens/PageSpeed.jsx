import React, { useState } from 'react'
import { useApp } from '../context/AppContext'
import SiteAvatar from '../components/SiteAvatar'
import './PageSpeed.css'

const AUDIT_ID = { lcp: 'largest-contentful-paint', cls: 'cumulative-layout-shift', tbt: 'total-blocking-time' }

async function runAudit(site, strategy, apiKey) {
  const params = new URLSearchParams({ url: site.url, strategy })
  ;['performance', 'accessibility', 'best-practices', 'seo'].forEach(c => params.append('category', c))
  if (apiKey) params.set('key', apiKey)

  try {
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`, { signal: AbortSignal.timeout(45000) })
    const data = await res.json()
    if (!res.ok) return { error: data?.error?.message || `HTTP ${res.status}` }

    const cats = data.lighthouseResult?.categories || {}
    const audits = data.lighthouseResult?.audits || {}
    const score = c => cats[c]?.score != null ? Math.round(cats[c].score * 100) : null

    return {
      performance: score('performance'),
      accessibility: score('accessibility'),
      bestPractices: score('best-practices'),
      seo: score('seo'),
      lcp: audits[AUDIT_ID.lcp]?.displayValue || '—',
      cls: audits[AUDIT_ID.cls]?.displayValue || '—',
      tbt: audits[AUDIT_ID.tbt]?.displayValue || '—',
    }
  } catch (e) {
    return { error: e.name === 'TimeoutError' ? 'Timed out' : (e.message || 'Request failed') }
  }
}

function ScoreBadge({ value }) {
  if (value == null) return <span className="ps-score ps-score-na">—</span>
  const tier = value >= 90 ? 'good' : value >= 50 ? 'ok' : 'poor'
  return <span className={`ps-score ps-score-${tier}`}>{value}</span>
}

export default function PageSpeed() {
  const { sites, settings } = useApp()
  const [strategy, setStrategy] = useState('mobile')
  const [results, setResults] = useState({})   // siteId -> { performance, accessibility, ..., error?, checkedAt }
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [singleRunning, setSingleRunning] = useState(null) // siteId currently re-running alone

  const runOne = async (site) => {
    const r = await runAudit(site, strategy, settings.pageSpeedApiKey)
    setResults(prev => ({ ...prev, [site.id]: { ...r, strategy, checkedAt: new Date().toISOString() } }))
  }

  const runAll = async () => {
    setRunning(true)
    setProgress({ done: 0, total: sites.length })
    for (const site of sites) {
      await runOne(site)
      setProgress(prev => ({ ...prev, done: prev.done + 1 }))
    }
    setRunning(false)
  }

  const runSingle = async (site) => {
    setSingleRunning(site.id)
    await runOne(site)
    setSingleRunning(null)
  }

  const hasResults = Object.keys(results).length > 0
  const scored = sites.map(s => results[s.id]?.performance).filter(v => v != null)
  const avgPerf = scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null

  return (
    <div className="ps-screen">
      <div className="ps-top">
        <div>
          <h1>PageSpeed Audit</h1>
          <p>Run Google PageSpeed Insights across all {sites.length} sites and compare Performance, Accessibility, Best Practices and SEO scores.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="ps-strategy-toggle">
            <button className={strategy === 'mobile' ? 'active' : ''} onClick={() => setStrategy('mobile')} disabled={running}>📱 Mobile</button>
            <button className={strategy === 'desktop' ? 'active' : ''} onClick={() => setStrategy('desktop')} disabled={running}>🖥 Desktop</button>
          </div>
          <button className="btn btn-primary btn-sm" onClick={runAll} disabled={running}>
            {running ? `⟳ Auditing… ${progress.done}/${progress.total}` : '▶ Run All Audits'}
          </button>
        </div>
      </div>

      {!settings.pageSpeedApiKey && (
        <div className="ps-key-hint">
          Running without an API key — audits are slower and may hit rate limits across {sites.length} sites. Add a free key in Settings for smoother batch runs.
        </div>
      )}

      {running && (
        <div className="ps-progress">
          <div className="ps-progress-bar">
            <div className="ps-progress-fill" style={{ width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : '0%' }} />
          </div>
          <span className="ps-progress-text">Auditing site {progress.done + 1} of {progress.total} ({strategy})… each audit can take 10-30s</span>
        </div>
      )}

      {hasResults && (
        <div className="ps-summary">
          <div className="ps-stat"><span>{avgPerf ?? '—'}</span><small>Avg Performance</small></div>
          <div className="ps-stat"><span>{scored.length}</span><small>Sites Audited</small></div>
          <div className="ps-stat"><span>{sites.length - scored.length}</span><small>Not Audited</small></div>
        </div>
      )}

      <div className="ps-table-wrap">
        <table className="ps-table">
          <thead>
            <tr>
              <th>Site</th>
              <th>Performance</th>
              <th>Accessibility</th>
              <th>Best Practices</th>
              <th>SEO</th>
              <th>LCP</th>
              <th>CLS</th>
              <th>TBT</th>
              <th>Checked</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sites.map(site => {
              const r = results[site.id]
              return (
                <tr key={site.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <SiteAvatar site={site} size={28} radius={6} />
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{site.name}</span>
                    </div>
                  </td>
                  {!r ? (
                    <td colSpan={7} style={{ fontSize: 12, color: 'var(--text-muted)' }}>Not audited yet</td>
                  ) : r.error ? (
                    <td colSpan={7} style={{ fontSize: 12, color: 'var(--error)' }}>✗ {r.error}</td>
                  ) : (
                    <>
                      <td><ScoreBadge value={r.performance} /></td>
                      <td><ScoreBadge value={r.accessibility} /></td>
                      <td><ScoreBadge value={r.bestPractices} /></td>
                      <td><ScoreBadge value={r.seo} /></td>
                      <td style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{r.lcp}</td>
                      <td style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{r.cls}</td>
                      <td style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{r.tbt}</td>
                    </>
                  )}
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r?.checkedAt ? new Date(r.checkedAt).toLocaleTimeString() : '—'}</td>
                  <td>
                    <button className="ps-rerun-btn" onClick={() => runSingle(site)} disabled={running || singleRunning === site.id} title="Re-run this site">
                      {singleRunning === site.id ? '⟳' : '↻'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {!hasResults && !running && (
        <div className="ps-cta">
          <svg width="48" height="48" viewBox="0 0 20 20" fill="currentColor" style={{ color: 'var(--border)' }}><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/></svg>
          <p>No audits yet</p>
          <span>Click "Run All Audits" to score every site's Core Web Vitals and SEO health</span>
        </div>
      )}
    </div>
  )
}
