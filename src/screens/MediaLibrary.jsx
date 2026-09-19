import React, { useState, useRef, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { useNotify } from '../context/NotificationContext'
import { fetchMedia, uploadMedia } from '../utils/wordpress'
import './MediaLibrary.css'

export default function MediaLibrary() {
  const { sites } = useApp()
  const { notifySuccess, notifyError, notifyWarning } = useNotify()
  const [selectedSite, setSelectedSite] = useState('all')
  const [media, setMedia] = useState([])
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef()

  const connectedSites = sites.filter(s => s.connected && s.username && s.password)

  useEffect(() => {
    if (selectedSite === 'all' || !selectedSite) {
      setMedia([])
      return
    }
    const site = sites.find(s => s.id === selectedSite)
    if (!site || !site.connected) return
    loadMedia(site)
  }, [selectedSite])

  const loadMedia = async (site) => {
    setLoading(true)
    // Clear immediately rather than leaving the previous site's media on
    // screen — a failed fetch below used to leave stale items visible with
    // no indication they belong to the site you just switched away from.
    setMedia([])
    const result = await fetchMedia(site)
    if (result.success) {
      setMedia(result.items.map(item => ({
        id: item.id,
        src: item.source_url,
        thumb: item.media_details?.sizes?.thumbnail?.source_url || item.source_url,
        name: item.title?.rendered || item.slug,
        date: item.date,
        mime: item.mime_type,
        siteId: site.id,
      })))
    } else {
      notifyError(`Failed to load media from ${site.name}${result.error ? `: ${result.error}` : ''}`, { site: site.name, action: 'Load Media' })
    }
    setLoading(false)
  }

  const handleUpload = async (files) => {
    if (!files.length) return
    const site = sites.find(s => s.id === selectedSite)
    if (!site || !site.connected) { notifyWarning('Select a connected site first.'); return }
    setUploading(true)
    let succeeded = 0
    let failed = 0
    for (const file of files) {
      const result = await uploadMedia(site, file)
      if (result.success) {
        succeeded++
        const item = result.media
        setMedia(prev => [{
          id: item.id,
          src: item.source_url,
          thumb: item.media_details?.sizes?.thumbnail?.source_url || item.source_url,
          name: item.title?.rendered || file.name,
          date: item.date,
          mime: item.mime_type,
          siteId: site.id,
        }, ...prev])
      } else {
        failed++
        notifyError(`Failed to upload "${file.name}" to ${site.name}: ${result.error}`, { site: site.name, action: 'Media Upload' })
      }
    }
    setUploading(false)
    if (succeeded > 0) notifySuccess(`✓ Uploaded ${succeeded} file(s) to ${site.name}${failed > 0 ? ` (${failed} failed)` : ''}`)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    handleUpload(Array.from(e.dataTransfer.files))
  }

  const copyUrl = (url) => {
    navigator.clipboard.writeText(url).then(() => alert('URL copied to clipboard!'))
  }

  return (
    <div className="media-library">
      <div className="page-header-row">
        <div>
          <h1>Media Library</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
            Images and files from your WordPress sites
          </p>
        </div>
        {selectedSite && selectedSite !== 'all' && (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Uploading…' : '↑ Upload Media'}
          </button>
        )}
      </div>

      <div className="media-controls">
        <select
          className="filter-select"
          value={selectedSite}
          onChange={e => setSelectedSite(e.target.value)}
        >
          <option value="all">Select a site…</option>
          {connectedSites.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
          {connectedSites.length === 0 && (
            <option disabled>No connected sites</option>
          )}
        </select>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept="image/*,video/*,application/pdf"
        multiple
        onChange={e => handleUpload(Array.from(e.target.files))}
      />

      <div className="media-grid">
        {selectedSite === 'all' || !selectedSite ? (
          <div className="connect-prompt">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd"/></svg>
            <p>Select a site to browse its media</p>
            <span>Connect sites in Site Manager to get started</span>
          </div>
        ) : connectedSites.length === 0 ? (
          <div className="connect-prompt">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v2a1 1 0 001 1h2a1 1 0 001-1V8a1 1 0 00-1-1H8zm1 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/></svg>
            <p>No connected sites</p>
            <span>Go to Site Manager and add your credentials</span>
          </div>
        ) : loading ? (
          <div className="media-loading">Loading media…</div>
        ) : (
          <>
            <div
              className={`upload-zone ${dragging ? 'dragging' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd"/></svg>
              <p>{uploading ? 'Uploading…' : 'Drop files here or click to upload'}</p>
              <span>Images, videos, PDFs supported</span>
            </div>
            {media.length === 0 ? (
              <div className="connect-prompt" style={{ gridColumn: '1/-1' }}>
                <p>No media found for this site.</p>
              </div>
            ) : media.map(item => (
              <div key={item.id} className="media-item" onClick={() => copyUrl(item.src)} title="Click to copy URL">
                {item.thumb ? (
                  <img className="media-item-img" src={item.thumb} alt={item.name} loading="lazy" />
                ) : (
                  <div className="media-item-placeholder">
                    <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd"/></svg>
                  </div>
                )}
                <div className="media-item-info">
                  <div className="media-item-name">{item.name}</div>
                  <div className="media-item-meta">{item.mime?.split('/')[1]?.toUpperCase() || 'FILE'}</div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
