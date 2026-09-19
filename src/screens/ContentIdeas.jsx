import React, { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { callAI } from '../utils/aiCall'
import './ContentIdeas.css'

const TYPES = ['All','How-to','Listicle','Guide','Review','Comparison','Tips','Case Study','FAQ','Opinion']
const TYPE_COLORS = {
  'How-to': '#6366f1', 'Listicle': '#f59e0b', 'Guide': '#10b981',
  'Review': '#ef4444', 'Comparison': '#3b82f6', 'Tips': '#8b5cf6',
  'Case Study': '#06b6d4', 'FAQ': '#84cc16', 'Opinion': '#f97316',
}

function buildIdeasPrompt(niche, keyword, count) {
  return `Generate ${count} unique, SEO-friendly blog post title ideas for a ${niche} website.
${keyword ? `Focus around the keyword or topic: "${keyword}"` : ''}

For each idea, provide:
1. The blog post title
2. The type (one of: How-to, Listicle, Guide, Review, Comparison, Tips, Case Study, FAQ, Opinion)
3. A one-sentence description of what the post would cover

Format EXACTLY like this (one per line, no numbering):
TITLE | TYPE | DESCRIPTION

Example:
10 Proven Ways to Lose Weight Without Starving | Listicle | Practical weight loss strategies that don't require extreme dieting
How to Start Intermittent Fasting: A Beginner's Guide | How-to | Step-by-step guide for starting IF safely

Generate exactly ${count} ideas. Output ONLY the lines, no intro or explanation.`
}

function parseIdeas(raw) {
  return raw.split('\n')
    .map(line => line.trim())
    .filter(line => line.includes('|'))
    .map((line, i) => {
      const parts = line.split('|').map(p => p.trim())
      return {
        id: i,
        title: parts[0] || '',
        type: parts[1] || 'Tips',
        desc: parts[2] || '',
        saved: false,
      }
    })
    .filter(idea => idea.title.length > 3)
}

export default function ContentIdeas({ navigate }) {
  const { sites, settings } = useApp()

  const [niche,    setNiche]    = useState('')
  const [keyword,  setKeyword]  = useState('')
  const [count,    setCount]    = useState(30)
  const [loading,  setLoading]  = useState(false)
  const [ideas,    setIdeas]    = useState([])
  const [saved,    setSaved]    = useState(() => {
    try { return JSON.parse(localStorage.getItem('ct_idea_bank') || '[]') } catch { return [] }
  })
  const [typeFilter, setTypeFilter] = useState('All')
  const [search,     setSearch]     = useState('')
  const [error,      setError]      = useState('')
  const [tab,        setTab]        = useState('generate') // generate | bank

  const generate = async () => {
    if (!niche.trim()) { setError('Enter a niche first.'); return }
    setError(''); setLoading(true); setIdeas([])
    try {
      const raw = await callAI(settings, buildIdeasPrompt(niche, keyword, count), 3000)
      const parsed = parseIdeas(raw)
      setIdeas(parsed)
      setTab('generate')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const saveIdea = (idea) => {
    const newBank = [{ ...idea, id: Date.now(), savedAt: new Date().toISOString() }, ...saved]
    setSaved(newBank)
    localStorage.setItem('ct_idea_bank', JSON.stringify(newBank))
  }

  const removeFromBank = (id) => {
    const newBank = saved.filter(i => i.id !== id)
    setSaved(newBank)
    localStorage.setItem('ct_idea_bank', JSON.stringify(newBank))
  }

  const writeIdea = (idea) => {
    localStorage.setItem('ct_prefill_title', idea.title)
    navigate('create')
  }

  const filterIdeas = (list) => {
    let res = list
    if (typeFilter !== 'All') res = res.filter(i => i.type === typeFilter)
    if (search) res = res.filter(i => i.title.toLowerCase().includes(search.toLowerCase()))
    return res
  }

  const displayList = filterIdeas(tab === 'generate' ? ideas : saved)

  return (
    <div className="ci-screen">
      <div className="page-header-row">
        <div>
          <h1>Content Ideas Generator</h1>
          <p className="page-subtitle">Generate 30 ready-to-write blog post ideas sorted by type — never run out of content</p>
        </div>
      </div>

      {/* Generator controls */}
      <div className="ci-controls">
        <div className="ci-ctrl-row">
          <div className="ci-ctrl-group">
            <label className="ci-ctrl-label">Site Niche <span style={{color:'var(--error)'}}>*</span></label>
            <input className="ci-input" placeholder="e.g. men's health and fitness" value={niche} onChange={e => setNiche(e.target.value)} />
          </div>
          <div className="ci-ctrl-group">
            <label className="ci-ctrl-label">Focus Keyword / Topic <span className="ci-opt">(optional)</span></label>
            <input className="ci-input" placeholder="e.g. intermittent fasting" value={keyword} onChange={e => setKeyword(e.target.value)} />
          </div>
          <div className="ci-ctrl-group ci-ctrl-count">
            <label className="ci-ctrl-label">Count</label>
            <select className="ci-select" value={count} onChange={e => setCount(+e.target.value)}>
              <option value={10}>10 ideas</option>
              <option value={20}>20 ideas</option>
              <option value={30}>30 ideas</option>
              <option value={50}>50 ideas</option>
            </select>
          </div>
          <button className="ci-gen-btn" onClick={generate} disabled={loading || !niche.trim()}>
            {loading ? <><span className="ci-spin">⟳</span> Generating…</> : '💡 Generate Ideas'}
          </button>
        </div>
        {error && <div className="ci-error">{error}</div>}
      </div>

      {/* Tabs */}
      <div className="ci-tabs">
        <button className={`ci-tab${tab === 'generate' ? ' active' : ''}`} onClick={() => setTab('generate')}>
          Generated ({ideas.length})
        </button>
        <button className={`ci-tab${tab === 'bank' ? ' active' : ''}`} onClick={() => setTab('bank')}>
          💾 Saved Bank ({saved.length})
        </button>
      </div>

      {/* Filters */}
      {displayList.length > 0 || typeFilter !== 'All' || search ? (
        <div className="ci-filters">
          <div className="ci-type-chips">
            {TYPES.map(t => {
              const cnt = t === 'All'
                ? (tab === 'generate' ? ideas : saved).length
                : (tab === 'generate' ? ideas : saved).filter(i => i.type === t).length
              return cnt > 0 || t === 'All' ? (
                <button
                  key={t}
                  className={`ci-type-chip${typeFilter === t ? ' active' : ''}`}
                  style={typeFilter === t && t !== 'All' ? { background: TYPE_COLORS[t], borderColor: TYPE_COLORS[t], color: 'white' } : {}}
                  onClick={() => setTypeFilter(t)}
                >
                  {t} {cnt > 0 ? `(${cnt})` : ''}
                </button>
              ) : null
            })}
          </div>
          <input className="ci-search" placeholder="Search ideas…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      ) : null}

      {/* Ideas list */}
      {loading ? (
        <div className="ci-loading">
          <div className="ci-loading-dots"><span>💡</span><span>💡</span><span>💡</span></div>
          <div>Generating {count} ideas…</div>
        </div>
      ) : displayList.length === 0 ? (
        <div className="ci-empty">
          {tab === 'bank'
            ? '💾 Your idea bank is empty. Generate ideas and save the best ones.'
            : ideas.length > 0
              ? 'No ideas match the filter.'
              : '↑ Enter your niche and click Generate Ideas to get started'}
        </div>
      ) : (
        <div className="ci-ideas-grid">
          {displayList.map((idea, i) => (
            <div key={idea.id ?? i} className="ci-idea-card">
              <div className="ci-idea-top">
                <span
                  className="ci-type-badge"
                  style={{ background: (TYPE_COLORS[idea.type] || '#6b7280') + '22', color: TYPE_COLORS[idea.type] || '#6b7280', borderColor: (TYPE_COLORS[idea.type] || '#6b7280') + '55' }}
                >
                  {idea.type}
                </span>
              </div>
              <div className="ci-idea-title">{idea.title}</div>
              {idea.desc && <div className="ci-idea-desc">{idea.desc}</div>}
              <div className="ci-idea-actions">
                <button className="ci-write-btn" onClick={() => writeIdea(idea)}>✍️ Write This</button>
                {tab === 'generate'
                  ? <button className="ci-save-btn" onClick={() => saveIdea(idea)} title="Save to idea bank">💾 Save</button>
                  : <button className="ci-del-btn" onClick={() => removeFromBank(idea.id)} title="Remove from bank">🗑</button>
                }
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
