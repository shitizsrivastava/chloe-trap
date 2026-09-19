import React, { useState } from 'react'
import { useApp } from '../context/AppContext'
import './Settings.css'

// __APP_VERSION__ / __BUILD_DATE__ are injected by vite.config.js at build time
// (see the `define` block there) — every rebuild, including "Update App", bakes
// in a fresh timestamp so it's obvious whether the running app is current.
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '—'
const BUILD_DATE = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : null
const buildDateLabel = BUILD_DATE
  ? new Date(BUILD_DATE).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : 'Unknown'

function Toggle({ checked, onChange }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="toggle-slider" />
    </label>
  )
}

export default function Settings() {
  const { sites, posts, activity, settings, setSettings, setSites, setPosts } = useApp()
  const [saved, setSaved] = useState(false)

  const update = (key, val) => {
    setSettings(prev => ({ ...prev, [key]: val }))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const clearActivity = () => {
    if (window.confirm('Clear all activity history?')) {
      localStorage.setItem('ct_activity', '[]')
      window.location.reload()
    }
  }

  const clearPosts = () => {
    if (window.confirm('Delete ALL locally tracked posts? This does not affect your WordPress sites.')) {
      setPosts([])
    }
  }

  const clearAll = () => {
    if (window.confirm('Reset ALL ChloeTrap data? This clears posts, credentials, and settings. Cannot be undone.')) {
      localStorage.clear()
      window.location.reload()
    }
  }

  const exportData = () => {
    const data = {
      sites: sites.map(s => ({ ...s, password: '' })),
      posts,
      settings,
      exportedAt: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `chloe-trap-backup-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const connectedSites = sites.filter(s => s.connected).length
  const publishedPosts = posts.filter(p => p.status === 'publish').length

  return (
    <div className="settings">
      <div className="page-header-row">
        <div>
          <h1>Settings</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
            App preferences and defaults
          </p>
        </div>
        {saved && (
          <span className="settings-saved">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
            Settings saved
          </span>
        )}
      </div>

      <div className="settings-grid">
        {/* Publishing defaults */}
        <div className="settings-section">
          <div className="settings-section-title">Publishing Defaults</div>
          <div className="settings-section-desc">Default behavior when creating posts</div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Default Post Status</div>
              <div className="setting-hint">Status applied when saving</div>
            </div>
            <select
              className="setting-select"
              value={settings.defaultStatus}
              onChange={e => update('defaultStatus', e.target.value)}
            >
              <option value="draft">Draft</option>
              <option value="publish">Published</option>
              <option value="pending">Pending Review</option>
            </select>
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Posts Per Page</div>
              <div className="setting-hint">In All Posts view</div>
            </div>
            <select
              className="setting-select"
              value={settings.postsPerPage}
              onChange={e => update('postsPerPage', parseInt(e.target.value))}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Auto-save Drafts</div>
              <div className="setting-hint">Periodically save while writing</div>
            </div>
            <Toggle
              checked={settings.autosave ?? true}
              onChange={v => update('autosave', v)}
            />
          </div>
        </div>

        {/* AI Configuration */}
        <div className="settings-section">
          <div className="settings-section-title">AI Configuration</div>
          <div className="settings-section-desc">Gemini Flash powers all AI features — free at aistudio.google.com</div>

          <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
            <div>
              <div className="setting-label">Gemini API Key</div>
              <div className="setting-hint">Free key from aistudio.google.com — no credit card needed</div>
            </div>
            <input
              type="password"
              className="setting-input"
              placeholder="AIza…"
              value={settings.geminiApiKey || ''}
              onChange={e => update('geminiApiKey', e.target.value)}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: 13 }}
            />
            {settings.geminiApiKey && (
              <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>✓ Key saved</span>
            )}
          </div>

          <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6, marginTop: 8 }}>
            <div>
              <div className="setting-label">Pixabay API Key</div>
              <div className="setting-hint">Free stock images in Create Post — get key at pixabay.com/api/docs</div>
            </div>
            <input
              type="password"
              className="setting-input"
              placeholder="Pixabay API key…"
              value={settings.pixabayApiKey || ''}
              onChange={e => update('pixabayApiKey', e.target.value)}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: 13 }}
            />
            {settings.pixabayApiKey && (
              <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>✓ Key saved</span>
            )}
          </div>

          <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6, marginTop: 8 }}>
            <div>
              <div className="setting-label">PageSpeed Insights API Key</div>
              <div className="setting-hint">Optional — raises the rate limit for the PageSpeed Audit tool. Free key at console.cloud.google.com (enable "PageSpeed Insights API")</div>
            </div>
            <input
              type="password"
              className="setting-input"
              placeholder="AIza… (optional, works without a key too)"
              value={settings.pageSpeedApiKey || ''}
              onChange={e => update('pageSpeedApiKey', e.target.value)}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: 13 }}
            />
            {settings.pageSpeedApiKey && (
              <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>✓ Key saved</span>
            )}
          </div>
        </div>

        {/* Social Accounts */}
        <div className="settings-section">
          <div className="settings-section-title">Social Accounts</div>
          <div className="settings-section-desc">One shared Facebook Page and X account for all 13 sites — the Social Poster Tracker links here before you compose, so you can confirm you're logged into the right one.</div>

          <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
            <div>
              <div className="setting-label">Facebook Page URL</div>
              <div className="setting-hint">e.g. https://facebook.com/YourPageName</div>
            </div>
            <input
              type="text"
              className="setting-input"
              placeholder="https://facebook.com/YourPageName"
              value={settings.facebookPageUrl || ''}
              onChange={e => update('facebookPageUrl', e.target.value)}
              style={{ width: '100%', fontSize: 13 }}
            />
          </div>

          <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6, marginTop: 8 }}>
            <div>
              <div className="setting-label">X (Twitter) Profile URL</div>
              <div className="setting-hint">e.g. https://x.com/YourHandle</div>
            </div>
            <input
              type="text"
              className="setting-input"
              placeholder="https://x.com/YourHandle"
              value={settings.xProfileUrl || ''}
              onChange={e => update('xProfileUrl', e.target.value)}
              style={{ width: '100%', fontSize: 13 }}
            />
          </div>
        </div>

        {/* App stats */}
        <div className="settings-section stats-section">
          <div className="settings-section-title">App Statistics</div>
          <div className="settings-section-desc">Your ChloeTrap usage overview</div>
          <div className="app-stats-grid">
            <div className="app-stat">
              <div className="app-stat-value">{sites.length}</div>
              <div className="app-stat-label">Total Sites</div>
            </div>
            <div className="app-stat">
              <div className="app-stat-value">{connectedSites}</div>
              <div className="app-stat-label">Connected</div>
            </div>
            <div className="app-stat">
              <div className="app-stat-value">{posts.length}</div>
              <div className="app-stat-label">Total Posts</div>
            </div>
            <div className="app-stat">
              <div className="app-stat-value">{publishedPosts}</div>
              <div className="app-stat-label">Published</div>
            </div>
          </div>
        </div>

        {/* Data & Backup */}
        <div className="settings-section">
          <div className="settings-section-title">Data & Backup</div>
          <div className="settings-section-desc">Export and manage your data</div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Export Data</div>
              <div className="setting-hint">Download JSON backup (no passwords exported)</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={exportData}>
              Export
            </button>
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Activity History</div>
              <div className="setting-hint">{activity?.length || 0} events recorded</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={clearActivity}>
              Clear
            </button>
          </div>
        </div>

        {/* About */}
        <div className="settings-section">
          <div className="settings-section-title">About ChloeTrap</div>
          <div className="settings-section-desc">WordPress content manager</div>
          <div className="setting-row">
            <div className="setting-label">Version</div>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>{APP_VERSION}</span>
          </div>
          <div className="setting-row">
            <div>
              <div className="setting-label">Last Updated</div>
              <div className="setting-hint">When this build was compiled — changes rebuild via "Update App"</div>
            </div>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>{buildDateLabel}</span>
          </div>
          <div className="setting-row">
            <div className="setting-label">Tech Stack</div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Electron + React + TipTap</span>
          </div>
          <div className="setting-row">
            <div className="setting-label">API</div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>WordPress REST API</span>
          </div>
          <div className="setting-row">
            <div className="setting-label">Storage</div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>localStorage (local only)</span>
          </div>
        </div>

        {/* Danger zone */}
        <div className="settings-section danger-zone">
          <div className="settings-section-title">Danger Zone</div>
          <div className="settings-section-desc">Irreversible actions — proceed with care</div>
          <button className="danger-btn" onClick={clearPosts}>
            Delete All Local Posts
          </button>
          <button className="danger-btn" onClick={clearAll}>
            Reset All Data & Credentials
          </button>
        </div>
      </div>
    </div>
  )
}
