import React, { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useNotify } from '../context/NotificationContext'
import { createSocialImage, downloadDataUrl } from '../utils/socialImage'
import './SocialPublishing.css'

const PLATFORMS = [
  { key: 'x', label: 'X', icon: '𝕏' },
  { key: 'facebook', label: 'Facebook Page', icon: '📘' },
  { key: 'instagram', label: 'Instagram', icon: '📸' },
]

function cleanTitle(value) {
  return (value || '(Untitled)').replace(/<[^>]+>/g, '').trim()
}

function nextRandomDate() {
  const date = new Date()
  date.setDate(date.getDate() + 1 + Math.floor(Math.random() * 7))
  date.setHours(9 + Math.floor(Math.random() * 11), Math.floor(Math.random() * 4) * 15, 0, 0)
  return date.toISOString().slice(0, 16)
}

export default function SocialPublishing() {
  const { posts, sites, publishingQueue, addPublishingItem, updatePublishingItem, deletePublishingItem } = useApp()
  const { notifySuccess, notifyInfo } = useNotify()
  const [selectedPostId, setSelectedPostId] = useState('')
  const [platforms, setPlatforms] = useState(['x', 'facebook', 'instagram'])
  const [caption, setCaption] = useState('')
  const [imageDataUrl, setImageDataUrl] = useState('')
  const [scheduledFor, setScheduledFor] = useState(nextRandomDate)
  const [approval, setApproval] = useState('draft')
  const [search, setSearch] = useState('')

  const eligiblePosts = useMemo(() => {
    const seen = new Set()
    return posts.filter(post => {
      if (post.status !== 'publish' || !post.wpLink || seen.has(post.wpLink)) return false
      seen.add(post.wpLink)
      return !search || cleanTitle(post.title).toLowerCase().includes(search.toLowerCase())
    }).slice(0, 200)
  }, [posts, search])

  const selectedPost = posts.find(post => String(post.localId) === String(selectedPostId))

  const choosePost = (post) => {
    setSelectedPostId(String(post.localId))
    setCaption(`Read “${cleanTitle(post.title)}” and discover the key insights. ${post.wpLink}`)
    setImageDataUrl('')
  }

  const generateImage = () => {
    if (!selectedPost) return notifyInfo('Select an article first.')
    const site = sites.find(item => item.id === selectedPost.siteId)
    try {
      setImageDataUrl(createSocialImage({
        title: cleanTitle(selectedPost.title),
        siteName: site?.name || selectedPost.siteId,
        siteUrl: site?.url || selectedPost.wpLink,
      }))
      notifySuccess('Branded article image created.')
    } catch (error) {
      notifyInfo(error.message || 'Could not create the article image.')
    }
  }

  const togglePlatform = (key) => {
    setPlatforms(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key])
  }

  const queueItem = () => {
    if (!selectedPost) return notifyInfo('Select a published article first.')
    if (!platforms.length) return notifyInfo('Select at least one platform.')
    addPublishingItem({
      postId: selectedPost.localId,
      articleUrl: selectedPost.wpLink,
      title: cleanTitle(selectedPost.title),
      siteId: selectedPost.siteId,
      platforms,
      caption: caption.trim() || cleanTitle(selectedPost.title),
      imageDataUrl,
      scheduledFor: new Date(scheduledFor).toISOString(),
      approval,
      status: approval === 'approved' ? 'ready' : 'draft',
      platformStatus: Object.fromEntries(platforms.map(platform => [platform, 'queued'])),
    })
    notifySuccess('Article added to the publishing queue.')
    setSelectedPostId('')
    setCaption('')
    setImageDataUrl('')
    setScheduledFor(nextRandomDate())
  }

  const randomArticle = () => {
    if (!eligiblePosts.length) return notifyInfo('No published articles with links are available.')
    choosePost(eligiblePosts[Math.floor(Math.random() * eligiblePosts.length)])
    setScheduledFor(nextRandomDate())
  }

  const siteName = (siteId) => sites.find(site => site.id === siteId)?.name || siteId
  const queued = publishingQueue.filter(item => item.status !== 'published')
  const published = publishingQueue.filter(item => item.status === 'published')

  return (
    <div className="sp-screen">
      <div className="page-header-row">
        <div>
          <h1>Social Publishing Center</h1>
          <p className="page-subtitle">Prepare articles for X, Facebook, and Instagram from one desktop queue.</p>
        </div>
        <button className="btn btn-secondary" onClick={randomArticle}>🎲 Choose Random Article</button>
      </div>

      <div className="sp-notice"><strong>Desktop mode:</strong> this first version saves your queue locally. Publishing connections and background posting will be added after the workflow is tested.</div>

      <div className="sp-grid">
        <section className="sp-card">
          <div className="sp-card-head"><h2>Add to queue</h2><span>{eligiblePosts.length} available</span></div>
          <input className="sp-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search published articles…" />
          <div className="sp-post-picker">
            {eligiblePosts.map(post => (
              <button key={post.localId} className={`sp-post-option${String(post.localId) === String(selectedPostId) ? ' active' : ''}`} onClick={() => choosePost(post)}>
                <span className="sp-post-title">{cleanTitle(post.title)}</span>
                <span className="sp-post-meta">{siteName(post.siteId)}</span>
              </button>
            ))}
            {!eligiblePosts.length && <div className="sp-empty">Sync published articles from your connected sites first.</div>}
          </div>
          <label className="sp-label">Caption</label>
          <textarea className="sp-textarea" rows={4} value={caption} onChange={event => setCaption(event.target.value)} placeholder="Write or generate a caption…" />
          <div className="sp-label-row"><label className="sp-label">Article image</label><span className="sp-muted">1080 × 1080 branded card</span></div>
          <div className="sp-image-tools">
            <button className="btn btn-secondary btn-sm" onClick={generateImage} disabled={!selectedPost}>✨ Create image</button>
            {imageDataUrl && <button className="btn btn-ghost btn-sm" onClick={() => downloadDataUrl(imageDataUrl, 'chloe-trap-social-image.jpg')}>Download</button>}
          </div>
          {imageDataUrl && <img className="sp-image-preview" src={imageDataUrl} alt="Generated article social preview" />}
          <div className="sp-label-row"><label className="sp-label">Publish to</label><span className="sp-muted">Choose one or more</span></div>
          <div className="sp-platforms">
            {PLATFORMS.map(platform => (
              <button key={platform.key} className={`sp-platform${platforms.includes(platform.key) ? ' active' : ''}`} onClick={() => togglePlatform(platform.key)}>
                <span>{platform.icon}</span>{platform.label}<b>{platforms.includes(platform.key) ? '✓' : '+'}</b>
              </button>
            ))}
          </div>
          <div className="sp-form-row">
            <div><label className="sp-label">Scheduled time</label><input className="sp-input" type="datetime-local" value={scheduledFor} onChange={event => setScheduledFor(event.target.value)} /></div>
            <div><label className="sp-label">Approval</label><select className="sp-input" value={approval} onChange={event => setApproval(event.target.value)}><option value="draft">Needs approval</option><option value="approved">Approved for publishing</option></select></div>
          </div>
          <button className="btn btn-primary sp-queue-btn" onClick={queueItem} disabled={!selectedPost}>＋ Add to publishing queue</button>
        </section>

        <section className="sp-card">
          <div className="sp-card-head"><h2>Queue</h2><span>{queued.length} waiting</span></div>
          <div className="sp-queue-list">
            {queued.map(item => (
              <article className="sp-queue-item" key={item.id}>
                <div className="sp-queue-main"><strong>{item.title}</strong><span>{siteName(item.siteId)} · {new Date(item.scheduledFor).toLocaleString()}</span></div>
                <div className="sp-queue-tags">{item.platforms.map(platform => <span key={platform}>{PLATFORMS.find(p => p.key === platform)?.icon} {platform}</span>)}<em>{item.approval === 'approved' ? 'Approved' : 'Needs approval'}</em></div>
                <div className="sp-queue-actions">
                  {item.approval !== 'approved' && <button className="btn btn-secondary btn-sm" onClick={() => updatePublishingItem(item.id, { approval: 'approved', status: 'ready' })}>Approve</button>}
                  <button className="btn btn-ghost btn-sm" onClick={() => deletePublishingItem(item.id)}>Remove</button>
                </div>
              </article>
            ))}
            {!queued.length && <div className="sp-empty">Your scheduled articles will appear here.</div>}
          </div>
          <div className="sp-history-head"><h2>History</h2><span>{published.length} published</span></div>
          <div className="sp-history-list">
            {published.slice(0, 8).map(item => <div className="sp-history-row" key={item.id}><span>✓</span><strong>{item.title}</strong><small>{new Date(item.publishedAt || item.scheduledFor).toLocaleString()}</small></div>)}
            {!published.length && <div className="sp-empty">Publishing history will appear here.</div>}
          </div>
        </section>
      </div>
    </div>
  )
}
