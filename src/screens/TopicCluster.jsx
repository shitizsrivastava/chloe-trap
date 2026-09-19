import React, { useState } from 'react'
import { useApp } from '../context/AppContext'
import { callAI } from '../utils/aiCall'
import './TopicCluster.css'

function parseCluster(text) {
  const lines = text.split('\n').filter(l => l.trim())
  const cluster = { pillar: '', subtopics: [] }
  let current = null
  for (const line of lines) {
    const clean = line.replace(/^[\s*#\-–]+/, '').trim()
    if (!clean) continue
    if (line.match(/^#+\s/) || line.match(/^\*\*[^*]+\*\*/)) {
      const label = clean.replace(/\*\*/g, '')
      if (!cluster.pillar) {
        cluster.pillar = label
      } else {
        current = { title: label, articles: [] }
        cluster.subtopics.push(current)
      }
    } else if (current && clean.length > 0) {
      current.articles.push(clean.replace(/^\d+\.\s*/, '').replace(/^-\s*/, ''))
    } else if (!cluster.pillar) {
      cluster.pillar = clean
    }
  }
  return cluster
}

const INTENT_COLORS = {
  'Informational': '#3b82f6',
  'Commercial': '#8b5cf6',
  'Transactional': '#f59e0b',
  'Navigational': '#10b981',
}

function intentBadge(title) {
  if (/best|vs|compare|review/i.test(title)) return 'Commercial'
  if (/buy|price|cheap|deal|discount/i.test(title)) return 'Transactional'
  if (/how|what|why|when|guide|tips|ways/i.test(title)) return 'Informational'
  return 'Informational'
}

export default function TopicCluster({ navigate }) {
  const { posts, settings } = useApp()
  const [seed, setSeed] = useState('')
  const [niche, setNiche] = useState('')
  const [loading, setLoading] = useState(false)
  const [cluster, setCluster] = useState(null)
  const [rawText, setRawText] = useState('')
  const [copied, setCopied] = useState(null)
  const [view, setView] = useState('visual')

  const apiKey = settings?.geminiApiKey || ''
  const hasKey = !!apiKey

  const existingTitles = new Set(posts.map(p => (p.title || '').replace(/<[^>]+>/g, '').toLowerCase().trim()))

  const generate = async () => {
    if (!seed.trim() || !hasKey) return
    setLoading(true)
    setCluster(null)
    const prompt = `Create a comprehensive SEO topic cluster for the keyword: "${seed.trim()}"${niche ? ` in the niche: ${niche}` : ''}.

Structure your response exactly like this:

# [Pillar Page Title]

## [Subtopic 1 Name]
- Article title 1
- Article title 2
- Article title 3

## [Subtopic 2 Name]
- Article title 1
- Article title 2
- Article title 3

## [Subtopic 3 Name]
- Article title 1
- Article title 2
- Article title 3

## [Subtopic 4 Name]
- Article title 1
- Article title 2
- Article title 3

## [Subtopic 5 Name]
- Article title 1
- Article title 2
- Article title 3

Rules:
- The pillar page should be a comprehensive guide (3000+ words)
- Each subtopic should have exactly 3 article titles
- Article titles should be specific, long-tail, SEO-optimized titles
- Cover informational, commercial, and transactional intent
- Make titles practical and useful for readers`

    try {
      const text = await callAI(settings, prompt)
      setRawText(text)
      setCluster(parseCluster(text))
    } catch (e) {
      setRawText(`Error: ${e.message}`)
    }
    setLoading(false)
  }

  const totalArticles = cluster ? cluster.subtopics.reduce((sum, st) => sum + st.articles.length, 0) + 1 : 0

  const copyAll = () => {
    if (!cluster) return
    const lines = [`📌 PILLAR: ${cluster.pillar}`, '']
    cluster.subtopics.forEach(st => {
      lines.push(`📂 ${st.title}`)
      st.articles.forEach((a, i) => lines.push(`  ${i + 1}. ${a}`))
      lines.push('')
    })
    navigator.clipboard.writeText(lines.join('\n'))
    setCopied('all')
    setTimeout(() => setCopied(null), 2000)
  }

  const isWritten = (title) => existingTitles.has(title.toLowerCase().trim())

  return (
    <div className="tc-screen">
      <div className="page-header-row">
        <div>
          <h1>AI Topic Cluster Builder</h1>
          <p className="page-subtitle">Generate a complete content strategy: pillar page + supporting articles, mapped by intent.</p>
        </div>
        {cluster && (
          <button className="btn btn-secondary btn-sm" onClick={copyAll}>
            {copied === 'all' ? '✓ Copied!' : '📋 Copy All Titles'}
          </button>
        )}
      </div>

      {!hasKey && (
        <div className="tc-alert">
          ⚠ No AI API key configured. <button className="tc-alert-link" onClick={() => navigate('settings')}>Go to Settings →</button>
        </div>
      )}

      {/* Input */}
      <div className="tc-input-card">
        <div className="tc-input-row">
          <div className="tc-field">
            <label className="tc-label">Seed Keyword / Topic</label>
            <input
              className="tc-input"
              placeholder="e.g. intermittent fasting, personal injury lawyer, best running shoes…"
              value={seed}
              onChange={e => setSeed(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && generate()}
            />
          </div>
          <div className="tc-field tc-field-sm">
            <label className="tc-label">Niche (optional)</label>
            <input
              className="tc-input"
              placeholder="e.g. health & wellness, legal services…"
              value={niche}
              onChange={e => setNiche(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && generate()}
            />
          </div>
          <button
            className="tc-generate-btn"
            onClick={generate}
            disabled={!seed.trim() || loading || !hasKey}
          >
            {loading ? '⟳ Building…' : '✨ Build Cluster'}
          </button>
        </div>
      </div>

      {/* Results */}
      {cluster && (
        <>
          <div className="tc-meta-row">
            <span className="tc-meta-item">🗂 {cluster.subtopics.length} subtopics</span>
            <span className="tc-meta-item">📄 {totalArticles} total articles</span>
            <span className="tc-meta-item">✅ {cluster.subtopics.reduce((sum, st) => sum + st.articles.filter(a => isWritten(a)).length, 0)} already written</span>
            <div className="tc-view-toggle">
              <button className={`tc-view-btn${view === 'visual' ? ' active' : ''}`} onClick={() => setView('visual')}>Visual</button>
              <button className={`tc-view-btn${view === 'list' ? ' active' : ''}`} onClick={() => setView('list')}>List</button>
            </div>
          </div>

          {view === 'visual' ? (
            <div className="tc-visual">
              {/* Pillar center */}
              <div className="tc-pillar-wrap">
                <div className="tc-pillar">
                  <div className="tc-pillar-label">PILLAR PAGE</div>
                  <div className="tc-pillar-title">{cluster.pillar}</div>
                  <div className="tc-pillar-sub">Comprehensive long-form guide</div>
                  <button className="tc-write-btn" onClick={() => navigate('create')}>✏ Write this</button>
                </div>
              </div>

              {/* Subtopics grid */}
              <div className="tc-subtopics">
                {cluster.subtopics.map((st, si) => (
                  <div key={si} className="tc-subtopic">
                    <div className="tc-subtopic-head">
                      <span className="tc-subtopic-icon">📂</span>
                      <span className="tc-subtopic-title">{st.title}</span>
                    </div>
                    <div className="tc-articles">
                      {st.articles.map((a, ai) => {
                        const intent = intentBadge(a)
                        const written = isWritten(a)
                        return (
                          <div key={ai} className={`tc-article${written ? ' written' : ''}`}>
                            <div className="tc-article-main">
                              <span className="tc-article-title">{a}</span>
                              {written && <span className="tc-written-badge">✓ Written</span>}
                            </div>
                            <div className="tc-article-foot">
                              <span className="tc-intent" style={{ color: INTENT_COLORS[intent] }}>{intent}</span>
                              {!written && (
                                <button
                                  className="tc-article-write"
                                  onClick={() => {
                                    localStorage.setItem('ct_prefill_title', a)
                                    navigate('create')
                                  }}
                                >
                                  Write →
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="tc-list-view">
              <div className="tc-list-pillar">
                <span className="tc-list-pillar-tag">PILLAR</span>
                <span className="tc-list-pillar-title">{cluster.pillar}</span>
                <button className="tc-article-write" onClick={() => navigate('create')}>Write →</button>
              </div>
              {cluster.subtopics.map((st, si) => (
                <div key={si} className="tc-list-group">
                  <div className="tc-list-group-head">📂 {st.title}</div>
                  {st.articles.map((a, ai) => {
                    const intent = intentBadge(a)
                    const written = isWritten(a)
                    return (
                      <div key={ai} className={`tc-list-row${written ? ' written' : ''}`}>
                        <span className="tc-list-num">{ai + 1}</span>
                        <span className="tc-list-title">{a}</span>
                        <span className="tc-intent" style={{ color: INTENT_COLORS[intent] }}>{intent}</span>
                        {written
                          ? <span className="tc-written-badge">✓ Written</span>
                          : <button className="tc-article-write" onClick={() => { localStorage.setItem('ct_prefill_title', a); navigate('create') }}>Write →</button>
                        }
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {loading && (
        <div className="tc-loading">
          <div className="tc-spinner" />
          <p>Building your topic cluster with AI…</p>
        </div>
      )}
    </div>
  )
}
