import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { callAI } from '../utils/aiCall'
import SiteAvatar from '../components/SiteAvatar'
import './SocialSnippets.css'

const PLATFORMS = [
  { key: 'twitter', label: 'X / Twitter Thread', icon: '𝕏', limit: 280 },
  { key: 'linkedin', label: 'LinkedIn Post', icon: 'in', limit: 3000 },
  { key: 'instagram', label: 'Instagram Caption', icon: '📸', limit: 2200 },
]

function buildPrompt(platform, title, content, url) {
  const plain = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 800)
  const urlLine = url ? `\n\nPost URL: ${url}` : ''
  if (platform === 'twitter') {
    return `Create a Twitter/X thread for this blog post. Format as exactly 5 tweets numbered 1/ through 5/. Tweet 1 must be a hook that grabs attention. Tweets 2-4 share the key insights. Tweet 5 is a call to action with the URL. Keep each tweet under 270 characters. No hashtags except tweet 5 (max 2).

Title: ${title}
Content summary: ${plain}${urlLine}

Output only the 5 tweets, one per line starting with the number.`
  }
  if (platform === 'linkedin') {
    return `Write a professional LinkedIn post promoting this blog post. Start with a strong opening line (no "Excited to share" or "I'm thrilled"). Use short paragraphs (1-2 sentences each). Include 3 key insights from the article. End with a question to drive comments. Add 3 relevant hashtags at the bottom. 150-250 words total.

Title: ${title}
Content summary: ${plain}${urlLine}`
  }
  if (platform === 'instagram') {
    return `Write an Instagram caption for this blog post. Start with an attention-grabbing first line. Use 4-6 short punchy lines. Add a clear call to action (e.g. "Link in bio"). Then on a new line, add exactly 15 relevant hashtags. Keep it engaging and casual.

Title: ${title}
Content summary: ${plain}${urlLine}`
  }
  return ''
}

export default function SocialSnippets({ navigate }) {
  const { posts, sites, settings } = useApp()
  const [selectedPost, setSelectedPost] = useState(null)
  const [platform, setPlatform] = useState('twitter')
  const [output, setOutput] = useState({})
  const [loading, setLoading] = useState({})
  const [copied, setCopied] = useState(null)
  const [search, setSearch] = useState('')
  const [siteFilter, setSiteFilter] = useState('all')

  const apiKey = settings?.geminiApiKey || ''
  const hasKey = !!apiKey

  const filteredPosts = posts.filter(p => {
    if (siteFilter !== 'all' && p.siteId !== siteFilter) return false
    if (search) {
      const t = (p.title || '').replace(/<[^>]+>/g, '').toLowerCase()
      if (!t.includes(search.toLowerCase())) return false
    }
    return true
  }).slice(0, 100)

  const generate = async () => {
    if (!selectedPost || !hasKey) return
    const key = `${selectedPost.localId}_${platform}`
    setLoading(prev => ({ ...prev, [key]: true }))
    try {
      const title = selectedPost.title?.replace(/<[^>]+>/g, '') || ''
      const prompt = buildPrompt(platform, title, selectedPost.content || '', selectedPost.wpLink || '')
      const text = await callAI(settings, prompt)
      setOutput(prev => ({ ...prev, [key]: text }))
    } catch (e) {
      setOutput(prev => ({ ...prev, [key]: `Error: ${e.message}` }))
    }
    setLoading(prev => { const n = { ...prev }; delete n[key]; return n })
  }

  const currentKey = selectedPost ? `${selectedPost.localId}_${platform}` : null
  const currentOutput = currentKey ? output[currentKey] : null
  const isLoading = currentKey ? loading[currentKey] : false

  const handleCopy = () => {
    if (!currentOutput) return
    navigator.clipboard.writeText(currentOutput)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="ss2-screen">
      <div className="page-header-row">
        <div>
          <h1>Social Snippet Generator</h1>
          <p className="page-subtitle">Turn any blog post into a Twitter thread, LinkedIn post, or Instagram caption instantly.</p>
        </div>
      </div>

      {!hasKey && (
        <div className="ss2-alert">
          ⚠ No AI API key configured. <button className="ss2-alert-link" onClick={() => navigate('settings')}>Go to Settings →</button>
        </div>
      )}

      <div className="ss2-layout">
        {/* Left: post picker */}
        <div className="ss2-picker">
          <div className="ss2-picker-head">
            <div className="ss2-picker-title">Select a post</div>
            <input className="ss2-search" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
            <select className="ss2-select" value={siteFilter} onChange={e => setSiteFilter(e.target.value)}>
              <option value="all">All sites</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="ss2-post-list">
            {filteredPosts.length === 0 && (
              <div className="ss2-empty">No posts found.</div>
            )}
            {filteredPosts.map(p => {
              const site = sites.find(s => s.id === p.siteId)
              return (
                <button
                  key={p.localId}
                  className={`ss2-post-item${selectedPost?.localId === p.localId ? ' active' : ''}`}
                  onClick={() => setSelectedPost(p)}
                >
                  {site && <SiteAvatar site={site} size={28} radius={7} />}
                  <span className="ss2-post-title" dangerouslySetInnerHTML={{ __html: p.title || '(Untitled)' }} />
                </button>
              )
            })}
          </div>
        </div>

        {/* Right: generator */}
        <div className="ss2-generator">
          {/* Platform tabs */}
          <div className="ss2-tabs">
            {PLATFORMS.map(pl => (
              <button
                key={pl.key}
                className={`ss2-tab${platform === pl.key ? ' active' : ''}`}
                onClick={() => setPlatform(pl.key)}
              >
                <span className="ss2-tab-icon">{pl.icon}</span>
                {pl.label}
              </button>
            ))}
          </div>

          {!selectedPost ? (
            <div className="ss2-placeholder">
              <div style={{ fontSize: 40, marginBottom: 12 }}>👈</div>
              <p>Select a post from the left to get started.</p>
            </div>
          ) : (
            <>
              <div className="ss2-selected">
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Generating for:</span>
                <strong style={{ fontSize: 13 }} dangerouslySetInnerHTML={{ __html: selectedPost.title || '(Untitled)' }} />
              </div>

              <button
                className="ss2-generate-btn"
                onClick={generate}
                disabled={isLoading || !hasKey}
              >
                {isLoading ? '⟳ Generating…' : `✨ Generate ${PLATFORMS.find(p => p.key === platform)?.label}`}
              </button>

              {currentOutput && (
                <div className="ss2-output-wrap">
                  <div className="ss2-output-head">
                    <span className="ss2-output-label">{PLATFORMS.find(p => p.key === platform)?.label}</span>
                    <button className="ss2-copy-btn" onClick={handleCopy}>
                      {copied ? '✓ Copied!' : '📋 Copy all'}
                    </button>
                  </div>
                  <div className="ss2-output">
                    {currentOutput.split('\n').map((line, i) => (
                      <p key={i} className={line.match(/^\d\//) ? 'ss2-tweet' : ''}>{line}</p>
                    ))}
                  </div>
                  <div className="ss2-char-info">
                    {currentOutput.length} characters
                    {platform === 'twitter' && currentOutput.split('\n').filter(l => l.trim()).length > 0 && (
                      <span> · {currentOutput.split('\n').filter(l => l.match(/^\d\//)).length} tweets</span>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
