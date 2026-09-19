import React, { useState } from 'react'
import { useApp } from '../context/AppContext'
import { callAI } from '../utils/aiCall'
import './AIWritePanel.css'

const TONES = ['Informative', 'Professional', 'Casual', 'Conversational', 'Persuasive', 'SEO-Optimised']
const LENGTHS = [
  { label: '~500 words',  tokens: 800  },
  { label: '~1000 words', tokens: 1600 },
  { label: '~1500 words', tokens: 2400 },
  { label: '~2000+ words', tokens: 3500 },
]

const GEMINI_HINT = 'Get your free key at aistudio.google.com — no card needed'

function buildPrompt({ topic, niche, tone, lengthLabel, keyword }) {
  return `You are an expert WordPress blog writer. Write a complete, well-structured blog post for a ${niche} website.

Topic: ${topic}
${keyword ? `Focus Keyword: ${keyword}` : ''}
Tone: ${tone}
Target Length: ${lengthLabel}

Requirements:
- Start with an engaging H1 title on the very first line (no "Title:" prefix, just the title text)
- Write a proper introduction paragraph
- Use H2 subheadings to organise sections
- Include practical, useful information
- End with a conclusion or call-to-action
- Naturally use the focus keyword throughout if provided
- Format using HTML tags: <h1>, <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>

Output the title on the first line, then the full HTML content. Do NOT wrap in \`\`\`html blocks.`
}

export default function AIWritePanel({ onUseDraft, onClose }) {
  const { settings } = useApp()

  const [topic,    setTopic]    = useState('')
  const [niche,    setNiche]    = useState('')
  const [tone,     setTone]     = useState('Informative')
  const [length,   setLength]   = useState(LENGTHS[1])
  const [keyword,  setKeyword]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [output,   setOutput]   = useState('')
  const [error,    setError]    = useState('')

  const apiKey = settings.geminiApiKey?.trim()
  const hasKey = !!apiKey

  const handleGenerate = async () => {
    if (!topic.trim()) { setError('Please enter a topic.'); return }
    if (!niche.trim()) { setError('Please enter the site niche.'); return }
    if (!hasKey) {
      setError(`No Gemini API key. Add it in Settings → AI Configuration.`)
      return
    }
    setError(''); setOutput(''); setLoading(true)
    try {
      const prompt = buildPrompt({ topic, niche, tone, lengthLabel: length.label, keyword })
      const text = await callAI(settings, prompt, length.tokens)
      setOutput(text)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const parseDraft = () => {
    const lines = output.split('\n')
    const titleLine = lines.find(l => l.trim()) || ''
    const title = titleLine.replace(/<[^>]*>/g, '').replace(/^#+\s*/, '').trim()
    const contentStart = lines.indexOf(lines.find(l => l.trim())) + 1
    const content = lines.slice(contentStart).join('\n').trim()
    return { title, content }
  }

  const handleUseDraft = () => {
    if (!output) return
    const { title, content } = parseDraft()
    onUseDraft({ title, content, keyword })
    onClose()
  }

  return (
    <div className="ai-panel">
      <div className="ai-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="ai-panel-icon">✦</span>
          <span className="ai-panel-title">AI Writing Assistant</span>
          <span className="ai-free-badge">100% FREE</span>
        </div>
        <button className="ai-panel-close" onClick={onClose}>✕</button>
      </div>

      <div className="ai-panel-body">

        {/* API key status */}
        <div className="ai-field">
          <div className="ai-key-info">
            {!hasKey ? (
              <div className="ai-key-warn">
                🔑 {GEMINI_HINT} — then add in <strong>Settings → AI Configuration</strong>
              </div>
            ) : (
              <div className="ai-key-ok">✓ Gemini API key set — ready to generate</div>
            )}
          </div>
        </div>

        {/* Topic */}
        <div className="ai-field">
          <label className="ai-label">Topic / Title Idea <span className="ai-required">*</span></label>
          <input
            className="ai-input"
            placeholder="e.g. 10 benefits of intermittent fasting"
            value={topic}
            onChange={e => setTopic(e.target.value)}
          />
        </div>

        {/* Niche */}
        <div className="ai-field">
          <label className="ai-label">Site Niche / Context <span className="ai-required">*</span></label>
          <input
            className="ai-input"
            placeholder="e.g. health & wellness blog for men"
            value={niche}
            onChange={e => setNiche(e.target.value)}
          />
        </div>

        {/* Keyword */}
        <div className="ai-field">
          <label className="ai-label">Focus Keyword <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
          <input
            className="ai-input"
            placeholder="e.g. intermittent fasting for men"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
          />
        </div>

        {/* Tone */}
        <div className="ai-field">
          <label className="ai-label">Tone</label>
          <div className="ai-chips">
            {TONES.map(t => (
              <button key={t} className={`ai-chip${tone === t ? ' active' : ''}`} onClick={() => setTone(t)}>{t}</button>
            ))}
          </div>
        </div>

        {/* Length */}
        <div className="ai-field">
          <label className="ai-label">Target Length</label>
          <div className="ai-chips">
            {LENGTHS.map(l => (
              <button key={l.label} className={`ai-chip${length.label === l.label ? ' active' : ''}`} onClick={() => setLength(l)}>{l.label}</button>
            ))}
          </div>
        </div>

        {error && <div className="ai-error">{error}</div>}

        <button className="ai-generate-btn" onClick={handleGenerate} disabled={loading || !hasKey}>
          {loading
            ? <><span className="ai-spin">⟳</span> Generating…</>
            : <><span>✦</span> Generate Post</>
          }
        </button>

        {output && (
          <div className="ai-output">
            <div className="ai-output-header">
              <span>Draft Ready</span>
              <button className="ai-use-btn" onClick={handleUseDraft}>↑ Use this draft</button>
            </div>
            <div className="ai-output-preview" dangerouslySetInnerHTML={{ __html: output.slice(0, 600) + (output.length > 600 ? '…' : '') }} />
            <div className="ai-output-footer">~{Math.round(output.replace(/<[^>]*>/g, '').split(/\s+/).length)} words generated</div>
          </div>
        )}
      </div>
    </div>
  )
}
