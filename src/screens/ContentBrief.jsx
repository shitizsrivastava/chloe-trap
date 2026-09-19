import React, { useState } from 'react'
import { useApp } from '../context/AppContext'
import { callAI } from '../utils/aiCall'
import './ContentBrief.css'

const CONTENT_TYPES = [
  { key: 'guide', label: '📘 How-to Guide', wc: '1500–2500' },
  { key: 'listicle', label: '📋 Listicle', wc: '1200–2000' },
  { key: 'review', label: '⭐ Review', wc: '1000–1800' },
  { key: 'comparison', label: '⚖️ Comparison', wc: '1500–2500' },
  { key: 'opinion', label: '💬 Opinion / Editorial', wc: '800–1500' },
  { key: 'news', label: '📰 News Article', wc: '600–1200' },
]

function buildPrompt(keyword, contentType, audience, niche) {
  const typeMap = { guide: 'comprehensive how-to guide', listicle: 'listicle', review: 'detailed review', comparison: 'comparison article', opinion: 'opinion/editorial', news: 'news article' }
  const type = typeMap[contentType] || 'blog post'
  return `Create a detailed SEO content brief for a ${type} targeting the keyword: "${keyword}"${niche ? ` in the ${niche} niche` : ''}${audience ? ` for ${audience}` : ''}.

Output the brief in this EXACT format:

**TITLE OPTIONS**
1. [Title option 1 — include the keyword, power word]
2. [Title option 2 — question format]
3. [Title option 3 — number-based or "how to"]

**META DESCRIPTION**
[One 130–155 character meta description with the focus keyword]

**FOCUS KEYWORD**
${keyword}

**SECONDARY KEYWORDS**
- [related keyword 1]
- [related keyword 2]
- [related keyword 3]
- [related keyword 4]
- [LSI keyword 5]

**TARGET WORD COUNT**
[Specific number, e.g. 1800 words]

**ARTICLE OUTLINE**
## Introduction
[2-sentence description of what the intro should cover]

## H2: [Section title]
### H3: [Subsection if needed]
[1-sentence brief of what to cover]

## H2: [Section title]
[1-sentence brief]

## H2: [Section title]
### H3: [Subsection]
[1-sentence brief]

## H2: [Section title]
[1-sentence brief]

## H2: [Section title]
[1-sentence brief]

## Conclusion + CTA
[1-sentence brief]

**PAA QUESTIONS** (People Also Ask)
1. [Question]
2. [Question]
3. [Question]
4. [Question]
5. [Question]

**WRITING NOTES**
- [Tone tip]
- [Differentiation tip — what makes this better than competing content]
- [CTA tip]`
}

function parseBrief(text) {
  const sections = {}
  const sectionPatterns = [
    { key: 'titles', label: 'TITLE OPTIONS' },
    { key: 'meta', label: 'META DESCRIPTION' },
    { key: 'focus', label: 'FOCUS KEYWORD' },
    { key: 'secondary', label: 'SECONDARY KEYWORDS' },
    { key: 'wordcount', label: 'TARGET WORD COUNT' },
    { key: 'outline', label: 'ARTICLE OUTLINE' },
    { key: 'paa', label: 'PAA QUESTIONS' },
    { key: 'notes', label: 'WRITING NOTES' },
  ]
  const parts = text.split(/\*\*([A-Z][A-Z\s()]+)\*\*/)
  for (let i = 1; i < parts.length; i += 2) {
    const header = parts[i].trim()
    const body = (parts[i + 1] || '').trim()
    const match = sectionPatterns.find(p => header.includes(p.label))
    if (match) sections[match.key] = body
  }
  return sections
}

export default function ContentBrief({ navigate }) {
  const { settings } = useApp()
  const [keyword, setKeyword] = useState('')
  const [contentType, setContentType] = useState('guide')
  const [audience, setAudience] = useState('')
  const [niche, setNiche] = useState('')
  const [loading, setLoading] = useState(false)
  const [rawText, setRawText] = useState('')
  const [brief, setBrief] = useState(null)
  const [copied, setCopied] = useState(null)
  const [selectedTitle, setSelectedTitle] = useState(0)

  const apiKey = settings?.geminiApiKey || ''
  const hasKey = !!apiKey

  const generate = async () => {
    if (!keyword.trim() || !hasKey) return
    setLoading(true)
    setBrief(null)
    try {
      const text = await callAI(settings, buildPrompt(keyword.trim(), contentType, audience, niche))
      setRawText(text)
      setBrief(parseBrief(text))
    } catch (e) {
      setRawText(`Error: ${e.message}`)
    }
    setLoading(false)
  }

  const startWriting = () => {
    const titles = brief?.titles?.split('\n').filter(l => l.match(/^\d\./)).map(l => l.replace(/^\d+\.\s*/, '').replace(/\*\*/g, ''))
    const chosenTitle = titles?.[selectedTitle] || keyword
    const outlineHtml = brief?.outline
      ? brief.outline.split('\n').map(line => {
          if (line.startsWith('## ')) return `<h2>${line.replace('## ', '').replace(/^H2:\s*/i, '').replace(/\*\*/g,'')}</h2>`
          if (line.startsWith('### ')) return `<h3>${line.replace('### ', '').replace(/^H3:\s*/i, '').replace(/\*\*/g,'')}</h3>`
          if (line.trim()) return `<p>${line.replace(/\*\*/g,'')}</p>`
          return ''
        }).join('')
      : ''
    localStorage.setItem('ct_prefill_title', chosenTitle)
    if (outlineHtml) localStorage.setItem('ct_prefill_content', outlineHtml)
    if (brief?.focus) localStorage.setItem('ct_prefill_keyword', brief.focus.trim())
    if (brief?.meta) localStorage.setItem('ct_prefill_meta', brief.meta.trim())
    navigate('create')
  }

  const copyAll = () => {
    navigator.clipboard.writeText(rawText)
    setCopied('all')
    setTimeout(() => setCopied(null), 2000)
  }

  const copySection = (text) => {
    navigator.clipboard.writeText(text)
    setCopied(text.slice(0, 20))
    setTimeout(() => setCopied(null), 1500)
  }

  const titles = brief?.titles?.split('\n').filter(l => l.match(/^\d+\./)).map(l => l.replace(/^\d+\.\s*/, '').replace(/\*\*/g, ''))
  const secondary = brief?.secondary?.split('\n').filter(l => l.match(/^-/)).map(l => l.replace(/^-\s*/, '').replace(/\*\*/g,''))
  const paa = brief?.paa?.split('\n').filter(l => l.match(/^\d+\./)).map(l => l.replace(/^\d+\.\s*/, '').replace(/\*\*/g,''))
  const notes = brief?.notes?.split('\n').filter(l => l.match(/^-/)).map(l => l.replace(/^-\s*/, '').replace(/\*\*/g,''))

  const outlineLines = brief?.outline?.split('\n') || []

  return (
    <div className="cb-screen">
      <div className="page-header-row">
        <div>
          <h1>Content Brief Generator</h1>
          <p className="page-subtitle">AI creates a full writing brief — title, outline, keywords, PAA — so you write a post that ranks.</p>
        </div>
        {brief && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={copyAll}>{copied === 'all' ? '✓ Copied!' : '📋 Copy brief'}</button>
            <button className="btn btn-primary btn-sm" onClick={startWriting}>✏ Start Writing →</button>
          </div>
        )}
      </div>

      {!hasKey && (
        <div className="cb-alert">
          ⚠ No AI API key configured. <button className="cb-alert-link" onClick={() => navigate('settings')}>Go to Settings →</button>
        </div>
      )}

      {/* Input panel */}
      <div className="cb-input-card">
        <div className="cb-grid">
          <div className="cb-field cb-field-main">
            <label className="cb-label">Focus Keyword / Topic *</label>
            <input
              className="cb-input"
              placeholder="e.g. how to lose weight fast, best budget laptops 2025…"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && generate()}
            />
          </div>
          <div className="cb-field">
            <label className="cb-label">Content Type</label>
            <select className="cb-input cb-select" value={contentType} onChange={e => setContentType(e.target.value)}>
              {CONTENT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label} ({t.wc} words)</option>)}
            </select>
          </div>
          <div className="cb-field">
            <label className="cb-label">Target Audience (optional)</label>
            <input className="cb-input" placeholder="e.g. beginners, working professionals…" value={audience} onChange={e => setAudience(e.target.value)} />
          </div>
          <div className="cb-field">
            <label className="cb-label">Niche (optional)</label>
            <input className="cb-input" placeholder="e.g. health, finance, travel…" value={niche} onChange={e => setNiche(e.target.value)} />
          </div>
        </div>
        <button className="cb-generate-btn" onClick={generate} disabled={!keyword.trim() || loading || !hasKey}>
          {loading ? '⟳ Generating brief…' : '✨ Generate Content Brief'}
        </button>
      </div>

      {loading && (
        <div className="cb-loading">
          <div className="cb-spinner" />
          <p>Building your content brief with AI…</p>
        </div>
      )}

      {brief && (
        <div className="cb-result">
          {/* Title options */}
          {titles?.length > 0 && (
            <div className="cb-card">
              <div className="cb-card-head">
                <span>📝 Title Options</span>
                <span className="cb-hint">Click to select — used when you click Start Writing</span>
              </div>
              <div className="cb-titles">
                {titles.map((t, i) => (
                  <button
                    key={i}
                    className={`cb-title-option${selectedTitle === i ? ' selected' : ''}`}
                    onClick={() => setSelectedTitle(i)}
                  >
                    <span className="cb-title-num">{i + 1}</span>
                    <span className="cb-title-text">{t}</span>
                    {selectedTitle === i && <span className="cb-title-check">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="cb-two-col">
            {/* Left col */}
            <div className="cb-col">
              {/* Meta description */}
              {brief.meta && (
                <div className="cb-card">
                  <div className="cb-card-head">
                    <span>🔍 Meta Description</span>
                    <button className="cb-copy-btn" onClick={() => copySection(brief.meta)}>Copy</button>
                  </div>
                  <p className="cb-meta-text">{brief.meta}</p>
                  <span className="cb-char-badge" style={{ color: brief.meta.length >= 120 && brief.meta.length <= 160 ? '#16a34a' : '#d97706' }}>
                    {brief.meta.length} chars
                  </span>
                </div>
              )}

              {/* Focus keyword */}
              {brief.focus && (
                <div className="cb-card">
                  <div className="cb-card-head"><span>🎯 Focus Keyword</span></div>
                  <span className="cb-keyword-chip">{brief.focus.trim()}</span>
                </div>
              )}

              {/* Secondary keywords */}
              {secondary?.length > 0 && (
                <div className="cb-card">
                  <div className="cb-card-head"><span>🔑 Secondary Keywords</span></div>
                  <div className="cb-keyword-list">
                    {secondary.map((kw, i) => <span key={i} className="cb-keyword-chip cb-keyword-secondary">{kw}</span>)}
                  </div>
                </div>
              )}

              {/* Word count */}
              {brief.wordcount && (
                <div className="cb-card cb-card-inline">
                  <span className="cb-card-head">📏 Target Word Count</span>
                  <span className="cb-wordcount">{brief.wordcount.trim()}</span>
                </div>
              )}

              {/* Writing notes */}
              {notes?.length > 0 && (
                <div className="cb-card">
                  <div className="cb-card-head"><span>💡 Writing Notes</span></div>
                  <ul className="cb-notes-list">
                    {notes.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </div>
              )}
            </div>

            {/* Right col — outline */}
            <div className="cb-col">
              {outlineLines.length > 0 && (
                <div className="cb-card cb-outline-card">
                  <div className="cb-card-head">
                    <span>📑 Article Outline</span>
                    <button className="cb-copy-btn" onClick={() => copySection(brief.outline)}>Copy</button>
                  </div>
                  <div className="cb-outline">
                    {outlineLines.map((line, i) => {
                      if (!line.trim()) return null
                      const isH2 = line.startsWith('## ')
                      const isH3 = line.startsWith('### ')
                      const clean = line.replace(/^#{2,3}\s*/, '').replace(/\*\*/g, '').replace(/^H[23]:\s*/i, '')
                      return (
                        <div key={i} className={`cb-outline-line${isH2 ? ' h2' : isH3 ? ' h3' : ' note'}`}>
                          {isH2 && <span className="cb-outline-tag">H2</span>}
                          {isH3 && <span className="cb-outline-tag cb-h3-tag">H3</span>}
                          <span>{clean}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* PAA */}
              {paa?.length > 0 && (
                <div className="cb-card">
                  <div className="cb-card-head">
                    <span>❓ People Also Ask</span>
                    <span className="cb-hint">Add these as FAQs in your post</span>
                  </div>
                  <ol className="cb-paa-list">
                    {paa.map((q, i) => <li key={i}>{q}</li>)}
                  </ol>
                </div>
              )}
            </div>
          </div>

          {/* CTA */}
          <div className="cb-cta-bar">
            <div>
              <strong>Ready to write?</strong>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
                The outline and keyword will be pre-filled in the editor.
              </span>
            </div>
            <button className="btn btn-primary" onClick={startWriting}>✏ Start Writing →</button>
          </div>
        </div>
      )}
    </div>
  )
}
