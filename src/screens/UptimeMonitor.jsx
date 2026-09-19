import React, { useState } from 'react'
import { useApp } from '../context/AppContext'
import SiteAvatar from '../components/SiteAvatar'
import './UptimeMonitor.css'

export default function UptimeMonitor() {
  // Monitoring itself runs in AppContext so it keeps polling — and can still
  // fire a desktop notification the moment a site goes down — even when this
  // screen isn't the one currently open.
  const { sites, uptimeResults: results, uptimeAutoCheck: autoCheck, setUptimeAutoCheck: setAutoCheck, checkAllUptime } = useApp()
  const [checking, setChecking] = useState(false)
  const [lastCheck, setLastCheck] = useState(null)

  const checkAll = async () => {
    setChecking(true)
    await checkAllUptime()
    setLastCheck(new Date())
    setChecking(false)
  }

  const upCount   = sites.filter(s => results[s.id]?.up === true).length
  const downCount = sites.filter(s => results[s.id]?.up === false).length
  const hasResults = Object.keys(results).length > 0

  return (
    <div className="uptime-screen">
      <div className="uptime-top">
        <div>
          <h1>Site Uptime Monitor</h1>
          <p>Check whether all 13 sites are online and responding. Auto-check keeps running in the background even after you leave this screen.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label className="uptime-auto-toggle">
            <input type="checkbox" checked={autoCheck} onChange={e => setAutoCheck(e.target.checked)} />
            <span>Auto-check every 3 min + desktop alert if down</span>
          </label>
          <button className="btn btn-primary btn-sm" onClick={checkAll} disabled={checking}>
            {checking ? '⟳ Checking…' : '↻ Check All Now'}
          </button>
        </div>
      </div>

      {hasResults && (
        <div className="uptime-summary">
          <div className="uptime-stat green"><span>{upCount}</span><small>Online</small></div>
          <div className="uptime-stat red"><span>{downCount}</span><small>Offline</small></div>
          <div className="uptime-stat"><span>{sites.length - upCount - downCount}</span><small>Unchecked</small></div>
          {lastCheck && <div className="uptime-lastcheck">Last checked: {lastCheck.toLocaleTimeString()}</div>}
        </div>
      )}

      <div className="uptime-table-wrap">
        <table className="uptime-table">
          <thead>
            <tr>
              <th>Site</th>
              <th>URL</th>
              <th>Status</th>
              <th>Response Time</th>
              <th>HTTP Code</th>
              <th>Checked At</th>
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
                  <td style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{site.url}</td>
                  <td>
                    {!r ? (
                      <span className="uptime-badge unknown">Not checked</span>
                    ) : r.checking ? (
                      <span className="uptime-badge checking">⟳ Checking…</span>
                    ) : r.up ? (
                      <span className="uptime-badge up">● Online</span>
                    ) : (
                      <span className="uptime-badge down">● Offline</span>
                    )}
                  </td>
                  <td style={{ fontSize: 13, fontWeight: 600, color: r?.ms < 500 ? 'var(--success)' : r?.ms < 2000 ? 'var(--warning)' : 'var(--error)' }}>
                    {r && !r.checking ? `${r.ms}ms` : '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                    {r && !r.checking ? (r.status || 'timeout') : '—'}
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {r?.checkedAt ? new Date(r.checkedAt).toLocaleTimeString() : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {!hasResults && (
        <div className="uptime-cta">
          <svg width="48" height="48" viewBox="0 0 20 20" fill="currentColor" style={{ color: 'var(--border)' }}><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/></svg>
          <p>No results yet</p>
          <span>Click "Check All Now" to ping all your sites</span>
        </div>
      )}
    </div>
  )
}
