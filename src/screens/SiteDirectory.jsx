import React, { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useNotify } from '../context/NotificationContext'
import SiteAvatar from '../components/SiteAvatar'
import './SiteDirectory.css'

const FORMATS = [
  { key: 'name-url', label: 'Name + Link', build: (s) => `${s.name} — ${s.url}` },
  { key: 'url',      label: 'Link only',   build: (s) => s.url },
  { key: 'name',     label: 'Name only',   build: (s) => s.name },
]

// A flat, copyable list of every managed site — for the recurring "WhatsApp
// someone a few of our website links" chore. Nothing here is a WordPress
// call; it just turns the sites already in AppContext into clipboard text,
// so ticking a handful and hitting Copy is faster than opening each site to
// grab its URL.
export default function SiteDirectory() {
  const { sites } = useApp()
  const { notifySuccess, notifyError } = useNotify()
  const [selected, setSelected] = useState(() => new Set(sites.map(s => s.id)))
  const [format, setFormat] = useState('name-url')
  const [filter, setFilter] = useState('')

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return sites
    return sites.filter(s => s.name.toLowerCase().includes(q) || s.url.toLowerCase().includes(q))
  }, [sites, filter])

  const toggleSite = (id) =>
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const selectAll  = () => setSelected(new Set(sites.map(s => s.id)))
  const selectNone = () => setSelected(new Set())
  const selectVisible = () => setSelected(prev => new Set([...prev, ...filtered.map(s => s.id)]))

  const buildText = (list) => {
    const fmt = FORMATS.find(f => f.key === format) || FORMATS[0]
    return list.map(fmt.build).join('\n')
  }

  const copyToClipboard = async (text, label) => {
    if (!text) { notifyError('Nothing selected to copy.'); return }
    try {
      await navigator.clipboard.writeText(text)
      notifySuccess(label)
    } catch {
      notifyError('Could not copy to clipboard.')
    }
  }

  const copySelected = () => {
    const list = sites.filter(s => selected.has(s.id))
    copyToClipboard(buildText(list), `Copied ${list.length} site${list.length === 1 ? '' : 's'} to clipboard.`)
  }

  const copyAll = () => copyToClipboard(buildText(sites), `Copied all ${sites.length} sites to clipboard.`)

  const copyOne = (site) => {
    const fmt = FORMATS.find(f => f.key === format) || FORMATS[0]
    copyToClipboard(fmt.build(site), `Copied ${site.name}.`)
  }

  const selectedCount = selected.size

  return (
    <div className="sd-screen">
      <div className="sd-intro">
        <h1>Site Directory</h1>
        <p className="page-subtitle">
          Tick the sites you need to share, then copy them in one go — for when someone
          asks over WhatsApp/email and you don't want to go open each website to grab its link.
        </p>
      </div>

      <div className="sd-toolbar">
        <input
          className="sd-search"
          type="text"
          placeholder="Filter sites…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />

        <div className="sd-format-group">
          {FORMATS.map(f => (
            <button
              key={f.key}
              className={`sd-format-btn${format === f.key ? ' active' : ''}`}
              onClick={() => setFormat(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="sd-select-group">
          <button className="sd-link-btn" onClick={selectAll}>Select All</button>
          <button className="sd-link-btn" onClick={selectNone}>Select None</button>
          {filter && <button className="sd-link-btn" onClick={selectVisible}>Select Visible</button>}
        </div>
      </div>

      <div className="sd-actions">
        <button className="sd-copy-btn primary" onClick={copySelected} disabled={selectedCount === 0}>
          📋 Copy Selected ({selectedCount})
        </button>
        <button className="sd-copy-btn" onClick={copyAll}>
          📋 Copy All ({sites.length})
        </button>
      </div>

      <div className="sd-list">
        {filtered.map(site => (
          <label key={site.id} className={`sd-row${selected.has(site.id) ? ' checked' : ''}`}>
            <input
              type="checkbox"
              checked={selected.has(site.id)}
              onChange={() => toggleSite(site.id)}
            />
            <SiteAvatar site={site} size={28} radius={7} />
            <div className="sd-row-text">
              <span className="sd-row-name">{site.name}</span>
              <span className="sd-row-url">{site.url}</span>
            </div>
            <button
              type="button"
              className="sd-row-copy"
              title={`Copy ${site.name}`}
              onClick={(e) => { e.preventDefault(); copyOne(site) }}
            >
              📋
            </button>
          </label>
        ))}
        {filtered.length === 0 && (
          <div className="sd-empty">No sites match "{filter}".</div>
        )}
      </div>
    </div>
  )
}
