import React, { useState, useRef, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import SiteAvatar from '../components/SiteAvatar'
import './ArticleTargets.css'

function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

function TargetCard({ site, note, onChange, onClear, onSubmit }) {
  const [value, setValue] = useState(note?.text || '')
  const [confirming, setConfirming] = useState(false)
  const [justLogged, setJustLogged] = useState(false)
  const debounceRef = useRef(null)
  const loggedRef = useRef(false)

  useEffect(() => { setValue(note?.text || '') }, [note?.text])

  const handleChange = (e) => {
    const text = e.target.value
    setValue(text)
    loggedRef.current = false
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => onChange(text), 300)
  }

  const handleBlur = () => {
    clearTimeout(debounceRef.current)
    onChange(value)
  }

  // Explicit commit — fires on the Enter key or the Save button, not on
  // every keystroke, so Recent Activity gets one entry per finished note
  // instead of one per character typed.
  const handleSubmit = () => {
    clearTimeout(debounceRef.current)
    onChange(value)
    if (value.trim() && !loggedRef.current) {
      onSubmit(value.trim())
      loggedRef.current = true
      setJustLogged(true)
      setTimeout(() => setJustLogged(false), 1500)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
      e.target.blur()
    }
  }

  const handleClear = () => {
    if (!confirming) { setConfirming(true); return }
    setConfirming(false)
    setValue('')
    loggedRef.current = false
    onClear()
  }

  return (
    <div className="at-card" style={{ '--card-color': site.color }}>
      <div className="at-card-head">
        <SiteAvatar site={site} size={28} radius={7} />
        <div className="at-card-titles">
          <div className="at-card-name">{site.name}</div>
          {note?.updatedAt && <div className="at-card-time">Updated {timeAgo(note.updatedAt)}</div>}
        </div>
        {value && (
          <button
            className={`at-clear-btn${confirming ? ' confirming' : ''}`}
            onClick={handleClear}
            onBlur={() => setConfirming(false)}
            title={confirming ? 'Click again to confirm' : 'Clear this note'}
          >
            {confirming ? 'Confirm?' : '✕'}
          </button>
        )}
      </div>
      <textarea
        className="at-textarea"
        placeholder="Today's target / next article for this site…"
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        rows={4}
      />
      <div className="at-card-foot">
        <span className="at-hint">Enter to log · Shift+Enter for new line</span>
        <button className="at-enter-btn" onClick={handleSubmit} title="Log this as today's target">
          {justLogged ? '✓ Logged' : '↵ Enter'}
        </button>
      </div>
    </div>
  )
}

export default function ArticleTargets() {
  const { sites, articleTargets, setArticleTargetNote, clearArticleTargetNote, clearAllArticleTargets, addActivity } = useApp()
  const [clearAllOpen, setClearAllOpen] = useState(false)
  const [clearAllInput, setClearAllInput] = useState('')

  const filledCount = sites.filter(s => articleTargets[s.id]?.text?.trim()).length

  const handleClearAllKeyDown = (e) => {
    if (e.key === 'Enter' && clearAllInput.trim().toUpperCase() === 'CLEAR') {
      clearAllArticleTargets()
      setClearAllOpen(false)
      setClearAllInput('')
    }
    if (e.key === 'Escape') {
      setClearAllOpen(false)
      setClearAllInput('')
    }
  }

  return (
    <div className="at-screen">
      <div className="page-header-row">
        <div>
          <h1>Article Targets</h1>
          <p className="page-subtitle">
            One note per site — today's target, next up, whatever you need. Nothing here disappears until you clear it.
            {filledCount > 0 && ` · ${filledCount}/${sites.length} sites have a note`}
          </p>
        </div>
        {!clearAllOpen ? (
          <button className="at-clearall-btn" onClick={() => setClearAllOpen(true)}>
            Clear All
          </button>
        ) : (
          <div className="at-clearall-confirm">
            <span>Type <strong>CLEAR</strong> and press Enter to wipe every note</span>
            <input
              autoFocus
              className="at-clearall-input"
              value={clearAllInput}
              placeholder="CLEAR"
              onChange={e => setClearAllInput(e.target.value)}
              onKeyDown={handleClearAllKeyDown}
              onBlur={() => { setClearAllOpen(false); setClearAllInput('') }}
            />
            <button className="at-clearall-cancel" onMouseDown={() => { setClearAllOpen(false); setClearAllInput('') }}>Cancel</button>
          </div>
        )}
      </div>

      <div className="at-grid">
        {sites.map(site => (
          <TargetCard
            key={site.id}
            site={site}
            note={articleTargets[site.id]}
            onChange={(text) => text.trim() ? setArticleTargetNote(site.id, text) : clearArticleTargetNote(site.id)}
            onClear={() => clearArticleTargetNote(site.id)}
            onSubmit={(text) => addActivity({
              type: 'target_set',
              title: text,
              siteId: site.id,
              siteName: site.name,
              timestamp: new Date().toISOString(),
            })}
          />
        ))}
      </div>
    </div>
  )
}
