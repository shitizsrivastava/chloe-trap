import React, { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useNotify } from '../context/NotificationContext'
import './ImageAltAuditor.css'

function authHeader(site) {
  return 'Basic ' + btoa(`${site.username}:${site.password}`)
}

function decodeHtml(value = '') {
  const el = document.createElement('textarea')
  el.innerHTML = value
  return el.value.replace(/<[^>]+>/g, '').trim()
}

async function fetchAllImages(site) {
  const items = []
  for (let page = 1; page <= 40; page++) {
    const query = new URLSearchParams({
      per_page: 100,
      page,
      media_type: 'image',
      _fields: 'id,source_url,alt_text,title,media_details,date',
    })
    const res = await fetch(`${site.url}/wp-json/wp/v2/media?${query}`, {
      headers: { Authorization: authHeader(site) },
    })
    if (!res.ok) break
    const batch = await res.json()
    if (!batch.length) break
    items.push(...batch.map(item => ({
      id: item.id,
      src: item.media_details?.sizes?.thumbnail?.source_url || item.source_url,
      fullSrc: item.source_url,
      title: decodeHtml(item.title?.rendered || ''),
      altText: item.alt_text || '',
      date: item.date ? item.date.slice(0, 10) : '',
    })))
    const totalPages = Number(res.headers.get('X-WP-TotalPages') || 1)
    if (page >= totalPages) break
  }
  return items
}

async function updateAltText(site, id, altText) {
  const res = await fetch(`${site.url}/wp-json/wp/v2/media/${id}`, {
    method: 'POST',
    headers: { Authorization: authHeader(site), 'Content-Type': 'application/json' },
    body: JSON.stringify({ alt_text: altText }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.message || `WordPress returned HTTP ${res.status}`)
  }
}

export default function ImageAltAuditor() {
  const { sites } = useApp()
  const { notifySuccess, notifyError } = useNotify()
  const connectedSites = sites.filter(s => s.connected && s.username && s.password)

  const [selectedSiteId, setSelectedSiteId] = useState(connectedSites[0]?.id || '')
  const [images, setImages] = useState(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('missing') // missing | all
  const [drafts, setDrafts] = useState({}) // id -> in-progress alt text edit
  const [saving, setSaving] = useState({}) // id -> true while saving
  const [bulkSaving, setBulkSaving] = useState(false)
  const [message, setMessage] = useState('')

  const selectedSite = sites.find(s => s.id === selectedSiteId)

  const handleScan = async () => {
    if (!selectedSite) return
    setLoading(true)
    setMessage('')
    setImages(null)
    try {
      const items = await fetchAllImages(selectedSite)
      setImages(items)
      setDrafts({})
    } catch (error) {
      setMessage(error.message || 'Could not scan media library.')
    } finally {
      setLoading(false)
    }
  }

  const missingCount = useMemo(() => images?.filter(img => !img.altText.trim()).length || 0, [images])
  const displayImages = useMemo(() => {
    if (!images) return []
    return filter === 'missing' ? images.filter(img => !img.altText.trim()) : images
  }, [images, filter])

  const handleSave = async (image) => {
    if (!selectedSite) return
    const value = drafts[image.id] ?? image.altText
    setSaving(prev => ({ ...prev, [image.id]: true }))
    try {
      await updateAltText(selectedSite, image.id, value)
      setImages(prev => prev.map(img => img.id === image.id ? { ...img, altText: value } : img))
      setDrafts(prev => { const next = { ...prev }; delete next[image.id]; return next })
      notifySuccess(`✓ Updated alt text on ${selectedSite.name}`)
    } catch (error) {
      notifyError(`Failed to update alt text on ${selectedSite.name}: ${error.message}`, { site: selectedSite.name, action: 'Update Alt Text' })
    } finally {
      setSaving(prev => ({ ...prev, [image.id]: false }))
    }
  }

  const handleSaveAllVisible = async () => {
    const pending = displayImages.filter(img => drafts[img.id] !== undefined && drafts[img.id] !== img.altText)
    if (pending.length === 0) return
    setBulkSaving(true)
    let done = 0
    for (const img of pending) {
      try {
        await updateAltText(selectedSite, img.id, drafts[img.id])
        setImages(prev => prev.map(i => i.id === img.id ? { ...i, altText: drafts[img.id] } : i))
        done++
      } catch { /* keep going, individual row still shows its draft */ }
    }
    setDrafts({})
    setBulkSaving(false)
    notifySuccess(`✓ Saved alt text for ${done} of ${pending.length} image(s) on ${selectedSite.name}`)
  }

  const pendingCount = displayImages.filter(img => drafts[img.id] !== undefined && drafts[img.id] !== img.altText).length

  return (
    <div className="ia-screen">
      <div className="ia-top">
        <div>
          <h1>Image Alt-Text Auditor</h1>
          <p>Find images in the Media Library missing alt text and fix them in bulk — alt text helps images rank in Google Image Search and is required for accessibility.</p>
        </div>
      </div>

      <div className="ia-controls">
        <select className="filter-select" value={selectedSiteId} onChange={e => { setSelectedSiteId(e.target.value); setImages(null) }}>
          {connectedSites.length === 0
            ? <option value="">No connected sites</option>
            : connectedSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)
          }
        </select>
        <button className="btn btn-primary btn-sm" onClick={handleScan} disabled={loading || !selectedSite}>
          {loading ? 'Scanning…' : '🔍 Scan Media Library'}
        </button>
        {images && (
          <button className="btn btn-secondary btn-sm" onClick={handleSaveAllVisible} disabled={bulkSaving || pendingCount === 0}>
            {bulkSaving ? 'Saving…' : `Save All Edits (${pendingCount})`}
          </button>
        )}
      </div>

      {message && <div className="ia-error">✗ {message}</div>}

      {images && (
        <>
          <div className="ia-summary">
            <div className="ia-stat"><span>{images.length}</span><small>Total Images</small></div>
            <div className="ia-stat"><span style={{ color: missingCount > 0 ? '#dc2626' : undefined }}>{missingCount}</span><small>Missing Alt Text</small></div>
            <div className="ia-stat"><span>{images.length - missingCount}</span><small>Have Alt Text</small></div>
          </div>

          <div className="ia-filter-tabs">
            <button className={`cat-tab${filter === 'missing' ? ' active' : ''}`} onClick={() => setFilter('missing')}>Missing Only ({missingCount})</button>
            <button className={`cat-tab${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>All Images ({images.length})</button>
          </div>

          <div className="ia-grid">
            {displayImages.length === 0 && (
              <div className="ia-empty">
                {filter === 'missing' ? 'No images are missing alt text. Nice work!' : 'No images found on this site.'}
              </div>
            )}
            {displayImages.map(image => {
              const value = drafts[image.id] ?? image.altText
              const dirty = drafts[image.id] !== undefined && drafts[image.id] !== image.altText
              return (
                <div key={image.id} className={`ia-card${!image.altText.trim() ? ' missing' : ''}`}>
                  <img src={image.src} alt={image.altText || '(no alt text)'} loading="lazy" />
                  <div className="ia-card-body">
                    <div className="ia-card-title" title={image.title}>{image.title || '(untitled)'}</div>
                    <input
                      className="ia-alt-input"
                      placeholder="Describe this image for SEO + accessibility…"
                      value={value}
                      onChange={e => setDrafts(prev => ({ ...prev, [image.id]: e.target.value }))}
                    />
                    <div className="ia-card-footer">
                      <span className="ia-card-date">{image.date}</span>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleSave(image)}
                        disabled={!dirty || saving[image.id]}
                      >
                        {saving[image.id] ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {!images && !loading && (
        <div className="ia-cta">
          <p>Select a connected site and click Scan Media Library</p>
          <span>Every image without alt text will be listed here, ready to fix inline</span>
        </div>
      )}
    </div>
  )
}
