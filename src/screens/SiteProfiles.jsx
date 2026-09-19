import React, { useState } from 'react'
import { useApp } from '../context/AppContext'
import SiteAvatar from '../components/SiteAvatar'
import './SiteProfiles.css'

const GENRES = [
  'News & Current Affairs', 'Health & Fitness', 'Finance & Investing', 'Jobs & Careers',
  'Self-Improvement', 'Real Estate & Property', 'Travel', 'Legal', 'Technology',
  'Personal Blog', 'Parenting & Family', 'Fashion & Footwear', 'Food & Recipes',
  'Education', 'Entertainment', 'Sports', 'Automotive', 'Other',
]

function ProfileCard({ site, onUpdate }) {
  const [email, setEmail]       = useState(site.email || '')
  const [writer, setWriter]     = useState(site.writer || '')
  const [genre, setGenre]       = useState(site.genre || '')
  const [description, setDescription] = useState(site.description || '')
  const [saved, setSaved]       = useState(false)
  const [copied, setCopied]     = useState(false)

  const filledCount = [email, writer, genre, description].filter(v => v.trim()).length
  const complete = filledCount === 4

  const handleSave = () => {
    onUpdate(site.id, {
      email: email.trim(),
      writer: writer.trim(),
      genre,
      description: description.trim(),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 1200)
  }

  const handleCopyEmail = () => {
    if (!email.trim()) return
    navigator.clipboard.writeText(email.trim())
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className={`sp-card${complete ? ' complete' : ''}`} style={{ borderTopColor: site.color }}>
      <div className="sp-card-head">
        <SiteAvatar site={site} size={34} radius={8} />
        <div className="sp-card-info">
          <strong>{site.name}</strong>
          <span>{site.url}</span>
        </div>
        <span className={`sp-complete-badge${complete ? ' on' : ''}`} title={`${filledCount}/4 fields filled`}>
          {complete ? '✓ Complete' : `${filledCount}/4`}
        </span>
      </div>

      <div className="sp-form">
        <div className="form-group">
          <label className="form-label">📧 Email ID (for this site's mails)</label>
          <div className="sp-input-row">
            <input className="input" type="email" placeholder="site.email@gmail.com"
              value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" />
            <button className="btn btn-secondary btn-sm" onClick={handleCopyEmail} disabled={!email.trim()} title="Copy email">
              {copied ? '✓' : '📋'}
            </button>
          </div>
        </div>

        <div className="sp-row-2">
          <div className="form-group">
            <label className="form-label">✍️ Main Writer Name</label>
            <input className="input" placeholder="Author / pen name"
              value={writer} onChange={e => setWriter(e.target.value)} autoComplete="off" />
          </div>
          <div className="form-group">
            <label className="form-label">🗂 Genre / Niche</label>
            <select className="input" value={genre} onChange={e => setGenre(e.target.value)}>
              <option value="">Select genre…</option>
              {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">📝 Short Description (what this website is about)</label>
          <textarea className="input sp-textarea" rows={3}
            placeholder="e.g. Covers daily hard news, politics and current affairs for Indian readers. Hub site of the network — receives links from all niche sites."
            value={description} onChange={e => setDescription(e.target.value)} />
        </div>

        <div className="sp-actions">
          <button className="btn btn-primary btn-sm" onClick={handleSave}>
            {saved ? '✓ Saved!' : 'Save Profile'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SiteProfiles() {
  const { sites, updateSite } = useApp()
  const completeCount = sites.filter(s => s.email && s.writer && s.genre && s.description).length

  const handleExport = () => {
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
    const header = ['Website', 'URL', 'Email', 'Writer', 'Genre', 'Description'].join(',')
    const lines = sites.map(s => [s.name, s.url, s.email || '', s.writer || '', s.genre || '', s.description || ''].map(esc).join(','))
    const blob = new Blob(['﻿' + [header, ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `site-profiles-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="sp-screen">
      <div className="sp-top">
        <div>
          <h1>Site Profiles</h1>
          <p>Email, writer, genre and description for each website — so you never have to remember them again</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={handleExport}>⬇ Export to Excel</button>
      </div>

      <div className="sp-summary">
        <div className="sp-stat"><span>{sites.length}</span><small>Websites</small></div>
        <div className="sp-stat"><span style={{ color: 'var(--success)' }}>{completeCount}</span><small>Profiles Complete</small></div>
        <div className="sp-stat"><span style={{ color: completeCount < sites.length ? '#f59e0b' : 'var(--success)' }}>{sites.length - completeCount}</span><small>Still Missing Info</small></div>
      </div>

      <div className="sp-grid">
        {sites.map(site => (
          <ProfileCard key={site.id} site={site} onUpdate={updateSite} />
        ))}
      </div>
    </div>
  )
}
