import React, { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import SiteAvatar from '../components/SiteAvatar'
import './CrossLinkTracker.css'

function loadLinks() {
  try { return JSON.parse(localStorage.getItem('ct_crosslinks') || '[]') } catch { return [] }
}
function saveLinks(links) { localStorage.setItem('ct_crosslinks', JSON.stringify(links)) }

const LAST_30 = new Date(Date.now() - 30 * 86400000)
const LAST_90 = new Date(Date.now() - 90 * 86400000)

export default function CrossLinkTracker({ navigate }) {
  const { sites } = useApp()

  const [links, setLinks]         = useState(loadLinks)
  const [showForm, setShowForm]   = useState(false)
  const [title, setTitle]         = useState('')
  const [url, setUrl]             = useState('')
  const [date, setDate]           = useState(new Date().toISOString().split('T')[0])
  const [linked, setLinked]       = useState([])
  const [notes, setNotes]         = useState('')
  const [view, setView]           = useState('log')   // log | matrix
  const [del, setDel]             = useState(null)

  // Hard News Daily site (find by name)
  const hnd = sites.find(s => s.name?.toLowerCase().includes('hard news') || s.name?.toLowerCase().includes('hardnews'))
  const nicheSites = sites.filter(s => s.id !== hnd?.id)

  const update = (next) => { setLinks(next); saveLinks(next) }

  const addLink = () => {
    if (!title.trim() || linked.length === 0) return
    const entry = { id: Date.now(), title: title.trim(), url: url.trim(), date, linked, notes: notes.trim() }
    update([entry, ...links])
    setTitle(''); setUrl(''); setLinked([]); setNotes(''); setShowForm(false)
  }

  const toggleLinked = (id) =>
    setLinked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  // Stats per niche site
  const siteStats = useMemo(() => {
    const map = {}
    nicheSites.forEach(site => {
      const all   = links.filter(l => l.linked.includes(site.id))
      const last30 = all.filter(l => new Date(l.date) >= LAST_30)
      const last90 = all.filter(l => new Date(l.date) >= LAST_90)
      const lastLinked = all.sort((a,b) => new Date(b.date) - new Date(a.date))[0]
      const daysSince = lastLinked ? Math.floor((Date.now() - new Date(lastLinked.date)) / 86400000) : 999
      map[site.id] = { total: all.length, last30: last30.length, last90: last90.length, daysSince }
    })
    return map
  }, [links, nicheSites])

  // Risk: if linked 5+ times in 30 days = over-linked
  const riskLevel = (stat) => {
    if (stat.last30 >= 5) return { label: 'Over-linked', color: '#dc2626', bg: '#fee2e2' }
    if (stat.last30 >= 3) return { label: 'Watch', color: '#d97706', bg: '#fef3c7' }
    if (stat.daysSince > 60) return { label: 'Needs link', color: '#6366f1', bg: '#ede9fe' }
    return { label: 'Good', color: '#10b981', bg: '#dcfce7' }
  }

  const sortedNiches = [...nicheSites].sort((a, b) => {
    const ra = riskLevel(siteStats[a.id] || {})
    const rb = riskLevel(siteStats[b.id] || {})
    const order = { 'Over-linked': 0, 'Watch': 1, 'Needs link': 2, 'Good': 3 }
    return (order[ra.label] ?? 4) - (order[rb.label] ?? 4)
  })

  return (
    <div className="clt-screen">
      <div className="page-header-row">
        <div>
          <h1>Cross-Link Tracker</h1>
          <p className="page-subtitle">Track Hard News Daily → niche site links to stay natural and avoid over-linking</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn btn-sm ${view === 'log' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('log')}>📋 Log</button>
          <button className={`btn btn-sm ${view === 'matrix' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('matrix')}>📊 Matrix</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(v => !v)}>
            {showForm ? '✕ Cancel' : '+ Log Article'}
          </button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="clt-form">
          <div className="clt-form-title">Log a Hard News Daily article with niche site links</div>
          <div className="clt-form-row">
            <div style={{ flex: 2 }}>
              <label className="clt-label">Article Title *</label>
              <input className="clt-input" placeholder="e.g. Top Health Trends in 2025…" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="clt-label">Published Date</label>
              <input type="date" className="clt-input" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="clt-label">Article URL (optional)</label>
            <input className="clt-input" placeholder="https://hardnewsdaily.com/article-slug" value={url} onChange={e => setUrl(e.target.value)} />
          </div>
          <div>
            <label className="clt-label">Which niche sites did you link to? *</label>
            <div className="clt-site-grid">
              {nicheSites.map(site => {
                const stat = siteStats[site.id] || {}
                const risk = riskLevel(stat)
                const sel = linked.includes(site.id)
                return (
                  <label key={site.id} className={`clt-site-chip ${sel ? 'selected' : ''}`} style={sel ? { borderColor: site.color, background: site.color + '15' } : {}}>
                    <input type="checkbox" style={{ display: 'none' }} checked={sel} onChange={() => toggleLinked(site.id)} />
                    <SiteAvatar site={site} size={18} radius={4} />
                    <span className="clt-chip-name">{site.name}</span>
                    {stat.last30 >= 5 && <span className="clt-chip-warn">⚠</span>}
                  </label>
                )
              })}
            </div>
            {linked.length > 2 && (
              <div className="clt-form-warning">⚠️ Linking to {linked.length} sites in one article looks unnatural. Google recommends 1-2 outbound links per article.</div>
            )}
          </div>
          <div>
            <label className="clt-label">Notes (optional)</label>
            <input className="clt-input" placeholder="e.g. Linked in paragraph 3, natural anchor text used" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={addLink} disabled={!title.trim() || linked.length === 0}>
            Save Entry
          </button>
        </div>
      )}

      {view === 'matrix' && (
        <>
          {/* Site status matrix */}
          <div className="clt-matrix-title">Link Distribution per Niche Site</div>
          <div className="clt-matrix">
            {sortedNiches.map(site => {
              const stat = siteStats[site.id] || {}
              const risk = riskLevel(stat)
              return (
                <div key={site.id} className="clt-matrix-row">
                  <div className="clt-matrix-site">
                    <SiteAvatar site={site} size={26} radius={6} />
                    <span className="clt-matrix-name">{site.name}</span>
                  </div>
                  <div className="clt-matrix-bars">
                    <div className="clt-matrix-bar-wrap">
                      <div className="clt-matrix-bar" style={{ width: `${Math.min(100, (stat.last30 / 8) * 100)}%`, background: stat.last30 >= 5 ? '#dc2626' : '#6366f1' }} />
                    </div>
                    <span className="clt-matrix-count">{stat.last30} in 30d</span>
                  </div>
                  <div className="clt-matrix-bars">
                    <div className="clt-matrix-bar-wrap">
                      <div className="clt-matrix-bar" style={{ width: `${Math.min(100, (stat.last90 / 15) * 100)}%`, background: '#8b5cf6' }} />
                    </div>
                    <span className="clt-matrix-count">{stat.last90} in 90d</span>
                  </div>
                  <div className="clt-matrix-since">
                    {stat.daysSince === 999 ? 'Never linked' : `Last: ${stat.daysSince}d ago`}
                  </div>
                  <span className="clt-risk-badge" style={{ background: risk.bg, color: risk.color }}>{risk.label}</span>
                </div>
              )
            })}
          </div>

          {/* Rules reminder */}
          <div className="clt-rules">
            <div className="clt-rules-title">🛡️ Safe Linking Rules</div>
            <div className="clt-rules-grid">
              <div className="clt-rule good">✅ Max 1-2 links per Hard News Daily article</div>
              <div className="clt-rule good">✅ Vary anchor text each time you link</div>
              <div className="clt-rule good">✅ Links inside article body (not footer)</div>
              <div className="clt-rule good">✅ Only link when genuinely relevant</div>
              <div className="clt-rule bad">❌ Don't link same site 5+ times in 30 days</div>
              <div className="clt-rule bad">❌ Don't link all 12 niche sites from one article</div>
              <div className="clt-rule bad">❌ Don't use exact-match keyword anchors</div>
              <div className="clt-rule bad">❌ Never use footer/navigation links</div>
            </div>
          </div>
        </>
      )}

      {view === 'log' && (
        <div className="clt-log">
          {links.length === 0 && (
            <div className="clt-empty">
              No entries yet. Click <strong>"+ Log Article"</strong> each time you publish a Hard News Daily article that links to a niche site.
            </div>
          )}
          {links.map(entry => {
            const linkedSites = nicheSites.filter(s => entry.linked.includes(s.id))
            return (
              <div key={entry.id} className="clt-entry">
                <div className="clt-entry-header">
                  <div className="clt-entry-title">
                    {entry.url
                      ? <a href="#" onClick={e => { e.preventDefault(); window.open(entry.url) }} style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 700 }}>{entry.title} ↗</a>
                      : <span style={{ fontWeight: 700, color: 'var(--text)' }}>{entry.title}</span>
                    }
                  </div>
                  <div className="clt-entry-date">{new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                  <button className="clt-entry-del" onClick={() => setDel(entry.id)}>✕</button>
                </div>
                <div className="clt-entry-sites">
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 6 }}>Linked to:</span>
                  {linkedSites.map(s => (
                    <span key={s.id} className="clt-entry-chip" style={{ background: s.color + '22', color: s.color, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <SiteAvatar site={s} size={14} radius={4} />
                      {s.name}
                    </span>
                  ))}
                </div>
                {entry.notes && <div className="clt-entry-notes">{entry.notes}</div>}
              </div>
            )
          })}
        </div>
      )}

      {/* Delete confirm */}
      {del && (
        <div className="kb-modal-overlay" onClick={() => setDel(null)}>
          <div className="kb-modal" style={{ width: 340 }} onClick={e => e.stopPropagation()}>
            <div className="kb-modal-header"><span>Delete Entry?</span><button className="kb-modal-close" onClick={() => setDel(null)}>✕</button></div>
            <div className="kb-modal-body" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>This will remove the log entry. Your actual WordPress articles are not affected.</div>
            <div className="kb-modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setDel(null)}>Cancel</button>
              <button className="btn btn-sm" style={{ background: '#dc2626', color: 'white' }} onClick={() => { update(links.filter(l => l.id !== del)); setDel(null) }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
