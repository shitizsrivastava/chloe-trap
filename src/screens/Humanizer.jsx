import React, { useState, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { callAI } from '../utils/aiCall'
import './Humanizer.css'

const MODES = [
  {
    key: 'humanize',
    label: '🧠 Humanize',
    desc: 'Make AI text sound genuinely human — natural rhythm, personality, first-person voice',
    prompt: (text) => `You are a world-class content humanizer. Your sole job is to rewrite AI-generated text so it reads like it was written by a real, experienced human expert blogger.

STRICT RULES:
1. VARY SENTENCE LENGTH drastically — mix 5-word punchy sentences with 20-word detailed ones. Never have 3+ sentences the same length in a row.
2. ADD NATURAL IMPERFECTIONS: start some sentences with "And", "But", "So", "Plus", "Look,", "Here's the thing —". This is now standard in editorial writing.
3. USE CONTRACTIONS: don't, it's, you'll, that's, can't, won't, I've, they're. Never write "do not" or "it is" when a contraction works.
4. REPLACE robotic transitions: delete "Furthermore", "Additionally", "Moreover", "In conclusion", "It is worth noting". Replace with "Plus", "And honestly,", "Here's what matters", "The bottom line:", "Worth mentioning:".
5. ADD EM DASHES for natural rhythm — like this — at least 2-3 times in the text.
6. ADD RHETORICAL QUESTIONS: "Sound familiar?", "Why does this matter?", "What does that mean for you?", "Make sense?" — at least 1 per 500 words.
7. BREAK up any paragraph longer than 4 sentences into smaller chunks. 2-3 sentence paragraphs feel more natural.
8. ADD SPECIFIC EXAMPLES wherever you see vague general statements. Replace "many people" with "think about a freelancer who..."
9. INJECT FIRST-PERSON PERSPECTIVE where natural: "In my experience...", "I've found that...", "What I tell people is..."
10. VARY OPENINGS: don't start every paragraph with "The" or "This". Mix in "There's a reason...", "When you...", "Most people...", "Here's something..."

CRITICAL: Output ONLY the rewritten text. No preamble, no "Here is the humanized version:", no explanations. Just the content.

TEXT TO HUMANIZE:
${text}`
  },
  {
    key: 'paraphrase',
    label: '🔄 Paraphrase',
    desc: 'Rewrite the same meaning with completely different wording — avoids duplicate content',
    prompt: (text) => `You are an expert editor. Paraphrase the following text completely — same meaning, totally different words and sentence structures. Every sentence must be rewritten from scratch. Change the order of ideas within paragraphs where it improves flow. Do not just swap synonyms — restructure each sentence entirely.

Output ONLY the paraphrased text. No explanations.

TEXT TO PARAPHRASE:
${text}`
  },
  {
    key: 'simplify',
    label: '✂️ Simplify',
    desc: 'Make complex text easier to read — shorter sentences, plain English, no jargon',
    prompt: (text) => `You are a plain-English editor. Simplify the following text so an average reader can understand it easily. Rules:
- Replace jargon and technical terms with plain English (explain in brackets if the term must stay)
- Cut sentences longer than 20 words in half
- Replace passive voice with active voice
- Remove redundant phrases ("in order to" → "to", "due to the fact that" → "because")
- Target a reading level of Grade 8 (13–14 year old can understand it)
- Keep all the important information — don't remove key points

Output ONLY the simplified text.

TEXT TO SIMPLIFY:
${text}`
  },
  {
    key: 'expand',
    label: '📈 Expand',
    desc: 'Add depth, examples, and detail to thin content — hit the 800+ word target',
    prompt: (text) => `You are a professional content writer. Expand the following text to be significantly more detailed and useful. Rules:
- Add relevant examples and case studies
- Add a FAQ section at the end with 3-5 common questions and detailed answers
- Expand each main point with supporting evidence, statistics, or step-by-step explanation
- Add a brief introduction and conclusion if missing
- Keep the original tone and style
- Do NOT add fluff — every added sentence must add real value
- Target: at least double the original length

Output ONLY the expanded text.

TEXT TO EXPAND:
${text}`
  },
  {
    key: 'formal',
    label: '👔 Make Formal',
    desc: 'Professional tone for legal, finance, or B2B content while keeping it readable',
    prompt: (text) => `You are a professional business writer. Rewrite the following text in a formal, professional tone suitable for a business audience. Rules:
- Remove casual language, slang, and overly friendly phrases
- Use professional but accessible vocabulary (not unnecessarily complex)
- Ensure statements are precise and qualified where needed ("may", "typically", "in most cases")
- Maintain a confident, authoritative voice
- Keep paragraphs logical and well-structured
- Remove first-person informal language ("I think", "I guess")
- Replace contractions with full forms in formal contexts

Output ONLY the rewritten text.

TEXT TO FORMALIZE:
${text}`
  },
  {
    key: 'adsense',
    label: '💰 AdSense Ready',
    desc: 'Full rewrite — 1000+ words, E-E-A-T signals, proper structure, FAQ with JSON-LD schema for rich snippets',
    prompt: (text) => `You are a Google AdSense content specialist. Rewrite the article below to fully satisfy Google AdSense approval requirements.

REQUIREMENTS:

1. MINIMUM 1000 WORDS. Expand with real value — no padding.

2. STRUCTURE:
   - Keep the H1 title at the top
   - At least 4 H2 subheadings (use <h2> tags)
   - H3 subheadings inside sections where relevant (use <h3> tags)
   - Short paragraphs: 2-4 sentences max. Wrap each in <p> tags.

3. E-E-A-T SIGNALS:
   - At least 2 first-person lines: "In my experience...", "I've personally found...", "Having researched this extensively..."
   - One specific real-world example or scenario
   - One cited fact/statistic ("Research suggests...", "According to studies...")
   - Confident conclusion paragraph

4. HUMAN WRITING — strip all AI patterns:
   - Use contractions: don't, it's, you'll, can't, I've
   - Mix sentence lengths — short punchy + longer explanatory
   - Remove: Furthermore, Moreover, Additionally, In conclusion, It is worth noting, It is important to, plays a crucial role
   - Add 2 rhetorical questions
   - Start some sentences with: And, But, So, Here's the thing —

5. FAQ WITH PROPER SCHEMA — this is critical for Google rich snippets. At the end of the article output EXACTLY this structure (replace the example Q&As with 4 real questions about the article topic):

<h2>Frequently Asked Questions</h2>
<div itemscope itemtype="https://schema.org/FAQPage">
  <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
    <h3 itemprop="name">Question one here?</h3>
    <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
      <p itemprop="text">Detailed answer here, 3-4 sentences.</p>
    </div>
  </div>
  <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
    <h3 itemprop="name">Question two here?</h3>
    <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
      <p itemprop="text">Detailed answer here, 3-4 sentences.</p>
    </div>
  </div>
  <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
    <h3 itemprop="name">Question three here?</h3>
    <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
      <p itemprop="text">Detailed answer here, 3-4 sentences.</p>
    </div>
  </div>
  <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
    <h3 itemprop="name">Question four here?</h3>
    <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
      <p itemprop="text">Detailed answer here, 3-4 sentences.</p>
    </div>
  </div>
</div>

NOTE: This uses Schema.org Microdata inline in HTML — Google reads this for FAQ rich snippets without needing a separate JSON-LD block. RankMath also recognises it.

6. At the very end, on its own line, add the meta description:
[META: 150-160 character meta description here]

CRITICAL: Output ONLY the full rewritten HTML article. No preamble, no "Here is your article". Start directly with the content.

ARTICLE TO REWRITE:
${text}`
  },
  {
    key: 'faqschema',
    label: '📋 FAQ Schema',
    desc: 'Generate FAQ questions + answers with JSON-LD schema markup for Google rich snippets',
    prompt: (text) => `You are an SEO schema specialist. Your job is to generate a FAQ section WITH proper structured data markup for Google rich snippets.

The user has provided either an article or a topic. Generate 5 highly relevant FAQ questions that real people would search on Google about this topic.

OUTPUT FORMAT — produce exactly this, replacing the placeholders:

First output the visible HTML FAQ section:

<h2>Frequently Asked Questions</h2>
<div itemscope itemtype="https://schema.org/FAQPage">
  <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
    <h3 itemprop="name">[Question 1?]</h3>
    <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
      <p itemprop="text">[Detailed answer, 3-5 sentences. No AI phrases. Natural language.]</p>
    </div>
  </div>
  <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
    <h3 itemprop="name">[Question 2?]</h3>
    <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
      <p itemprop="text">[Detailed answer, 3-5 sentences.]</p>
    </div>
  </div>
  <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
    <h3 itemprop="name">[Question 3?]</h3>
    <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
      <p itemprop="text">[Detailed answer, 3-5 sentences.]</p>
    </div>
  </div>
  <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
    <h3 itemprop="name">[Question 4?]</h3>
    <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
      <p itemprop="text">[Detailed answer, 3-5 sentences.]</p>
    </div>
  </div>
  <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
    <h3 itemprop="name">[Question 5?]</h3>
    <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
      <p itemprop="text">[Detailed answer, 3-5 sentences.]</p>
    </div>
  </div>
</div>

Then on a new line, output the JSON-LD block (this is the backup schema — paste this too if RankMath is not active):

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "[Question 1?]",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "[Answer 1 — plain text, no HTML tags]"
      }
    },
    {
      "@type": "Question",
      "name": "[Question 2?]",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "[Answer 2]"
      }
    },
    {
      "@type": "Question",
      "name": "[Question 3?]",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "[Answer 3]"
      }
    },
    {
      "@type": "Question",
      "name": "[Question 4?]",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "[Answer 4]"
      }
    },
    {
      "@type": "Question",
      "name": "[Question 5?]",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "[Answer 5]"
      }
    }
  ]
}
</script>

RULES FOR QUESTIONS:
- Must be real questions people type into Google ("How long does...", "Is X safe for...", "What is the difference between...")
- Answers must be genuinely useful, 3-5 sentences, no AI filler phrases
- Do not repeat information between answers
- Do not start answers with "Great question" or similar

OUTPUT ONLY the HTML block + JSON-LD block. Nothing else.

TOPIC/ARTICLE:
${text}`
  },
  {
    key: 'seo',
    label: '🔍 SEO Optimize',
    desc: 'Naturally weave in keywords and improve structure for search engines',
    prompt: (text, keyword) => `You are an SEO content specialist. Rewrite the following text to be better optimized for search engines. Focus keyword: "${keyword || 'the main topic of the article'}". Rules:
- Include the focus keyword naturally in the first paragraph, at least one H2 subheading, and the conclusion
- Do NOT keyword-stuff — max density of 1–2%
- Add related/LSI keywords naturally (synonyms and related terms)
- Break content into clear sections with H2/H2 subheadings where appropriate
- Ensure the first paragraph hooks the reader and answers search intent immediately
- Add a clear meta description suggestion at the very end in the format: [META: your meta description here]

Output the optimized text followed by the meta description.

FOCUS KEYWORD: ${keyword || '(same topic as the text)'}
TEXT TO OPTIMIZE:
${text}`
  },
]

// Flesch-Kincaid readability approximation
function readabilityScore(text) {
  const clean = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  const sentences = clean.split(/[.!?]+/).filter(s => s.trim().length > 3).length || 1
  const words = clean.split(/\s+/).filter(w => w.length > 0)
  const wordCount = words.length || 1
  const syllables = words.reduce((sum, w) => sum + Math.max(1, w.replace(/[^aeiou]/gi,'').length), 0)
  const score = 206.835 - 1.015 * (wordCount / sentences) - 84.6 * (syllables / wordCount)
  const clamped = Math.max(0, Math.min(100, Math.round(score)))
  if (clamped >= 80) return { score: clamped, label: 'Very Easy', color: '#16a34a' }
  if (clamped >= 60) return { score: clamped, label: 'Easy',      color: '#65a30d' }
  if (clamped >= 50) return { score: clamped, label: 'Medium',    color: '#d97706' }
  if (clamped >= 30) return { score: clamped, label: 'Difficult', color: '#dc2626' }
  return { score: clamped, label: 'Very Hard', color: '#9f1239' }
}

// Rough AI detection risk based on patterns
function aiRiskScore(text) {
  const clean = text.replace(/<[^>]*>/g, ' ').toLowerCase()
  const aiPhrases = [
    'furthermore','additionally','moreover','in conclusion','it is worth noting',
    'it is important to','it should be noted','in today\'s world','in today\'s fast-paced',
    'in the realm of','when it comes to','plays a crucial role','delve into',
    'a comprehensive','a plethora','underscore the importance','navigate the',
    'leveraging','harnessing','transformative','unlock the potential','game-changer',
    'tapestry','multifaceted','at its core','it\'s essential to understand',
    'dive deep','cutting-edge','robust','empower','foster','facilitate',
  ]
  const matches = aiPhrases.filter(p => clean.includes(p)).length
  const sentences = clean.split(/[.!?]+/).filter(s => s.trim().length > 3)
  const lengths = sentences.map(s => s.split(/\s+/).length)
  const avgLen = lengths.reduce((a, b) => a + b, 0) / (lengths.length || 1)
  const variance = lengths.reduce((a, b) => a + Math.abs(b - avgLen), 0) / (lengths.length || 1)
  const lowVariance = variance < 3

  let risk = Math.min(100, matches * 8 + (lowVariance ? 20 : 0))
  const label = risk >= 70 ? 'High Risk' : risk >= 40 ? 'Medium Risk' : 'Low Risk'
  const color = risk >= 70 ? '#dc2626' : risk >= 40 ? '#d97706' : '#16a34a'
  return { score: risk, label, color }
}

function wordCount(text) {
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(w => w.length > 0).length
}

export default function Humanizer() {
  const { settings } = useApp()
  const [mode,      setMode]      = useState('humanize')
  const [input,     setInput]     = useState(() => {
    const prefill = localStorage.getItem('hz_prefill_content') || ''
    localStorage.removeItem('hz_prefill_content')
    localStorage.removeItem('hz_prefill_title')
    return prefill
  })
  const [keyword,   setKeyword]   = useState('')
  const [output,    setOutput]    = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [copied,    setCopied]    = useState(false)
  const [showDiff,  setShowDiff]  = useState(false)
  const outputRef = useRef(null)

  const currentMode = MODES.find(m => m.key === mode) || MODES[0]
  const inputStats  = input  ? { wc: wordCount(input),  read: readabilityScore(input),  ai: aiRiskScore(input)  } : null
  const outputStats = output ? { wc: wordCount(output), read: readabilityScore(output), ai: aiRiskScore(output) } : null

  const run = async () => {
    if (!input.trim()) { setError('Paste your content first.'); return }
    setError(''); setOutput(''); setLoading(true)
    try {
      const prompt = currentMode.prompt(input.trim(), keyword)
      const result = await callAI(settings, prompt, 8192)
      setOutput(result)
      setTimeout(() => outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const copy = () => {
    navigator.clipboard.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const useAsInput = () => {
    setInput(output)
    setOutput('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const hasKey = !!settings.geminiApiKey?.trim()

  return (
    <div className="hum-screen">
      <div className="page-header-row">
        <div>
          <h1>AI Humanizer & Paraphraser</h1>
          <p className="page-subtitle">Paste AI content → choose mode → get natural, human-sounding text that passes AI detectors</p>
        </div>
        <div className="hum-provider-badge">
          Powered by <strong>Gemini Flash</strong>
          {!hasKey && <span className="hum-no-key">⚠ No key — set in Settings</span>}
        </div>
      </div>

      {/* Mode selector */}
      <div className="hum-modes">
        {MODES.map(m => (
          <button
            key={m.key}
            className={`hum-mode-btn${mode === m.key ? ' active' : ''}`}
            onClick={() => setMode(m.key)}
          >
            <span className="hum-mode-label">{m.label}</span>
            <span className="hum-mode-desc">{m.desc}</span>
          </button>
        ))}
      </div>

      {/* SEO keyword field — only show for SEO mode */}
      {mode === 'seo' && (
        <div className="hum-keyword-row">
          <label className="hum-kw-label">🔑 Focus Keyword</label>
          <input
            className="hum-kw-input"
            placeholder="e.g. intermittent fasting for men"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
          />
        </div>
      )}

      <div className="hum-columns">
        {/* Input */}
        <div className="hum-col">
          <div className="hum-col-header">
            <span className="hum-col-title">📥 Original Content</span>
            {inputStats && (
              <div className="hum-stats">
                <span>{inputStats.wc.toLocaleString()} words</span>
                <span className="hum-stat-badge" style={{ background: inputStats.read.color + '22', color: inputStats.read.color }}>
                  Readability: {inputStats.read.label}
                </span>
                <span className="hum-stat-badge" style={{ background: inputStats.ai.color + '22', color: inputStats.ai.color }}>
                  AI Risk: {inputStats.ai.label}
                </span>
              </div>
            )}
            <button className="hum-clear-btn" onClick={() => { setInput(''); setOutput('') }}>Clear</button>
          </div>
          <textarea
            className="hum-textarea"
            placeholder={`Paste your AI-generated or any text here…\n\nYou can paste plain text or HTML content.`}
            value={input}
            onChange={e => setInput(e.target.value)}
          />
          {error && <div className="hum-error">{error}</div>}
          <button
            className="hum-run-btn"
            onClick={run}
            disabled={loading || !input.trim() || !hasKey}
          >
            {loading
              ? <><span className="hum-spin">⟳</span> Processing…</>
              : <>{currentMode.label} →</>
            }
          </button>
          {!hasKey && (
            <div className="hum-key-warn">
              No Gemini key set. Go to <strong>Settings → AI Configuration</strong> and add your free key from aistudio.google.com.
            </div>
          )}
        </div>

        {/* Output */}
        <div className="hum-col" ref={outputRef}>
          <div className="hum-col-header">
            <span className="hum-col-title">✨ Humanized Output</span>
            {outputStats && (
              <div className="hum-stats">
                <span>{outputStats.wc.toLocaleString()} words</span>
                <span className="hum-stat-badge" style={{ background: outputStats.read.color + '22', color: outputStats.read.color }}>
                  Readability: {outputStats.read.label}
                </span>
                <span className="hum-stat-badge" style={{ background: outputStats.ai.color + '22', color: outputStats.ai.color }}>
                  AI Risk: {outputStats.ai.label}
                </span>
              </div>
            )}
            {output && (
              <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                <button className="hum-copy-btn" onClick={copy}>{copied ? '✓ Copied!' : '📋 Copy'}</button>
                <button className="hum-use-btn" onClick={useAsInput} title="Use output as new input for another pass">↩ Re-process</button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="hum-loading">
              <div className="hum-loading-animation">
                <span>✦</span><span>✦</span><span>✦</span>
              </div>
              <div>Humanizing your content…</div>
              <div className="hum-loading-tip">Tip: You can run the output through the Humanizer again for an extra layer of naturalness.</div>
            </div>
          ) : output ? (
            <>
              <textarea
                className="hum-textarea output"
                value={output}
                onChange={e => setOutput(e.target.value)}
                placeholder="Output will appear here…"
              />
              {/* Improvement metrics */}
              {inputStats && outputStats && (
                <div className="hum-improvement">
                  <div className="hum-improve-title">📊 Before vs After</div>
                  <div className="hum-improve-row">
                    <span>Words</span>
                    <span>{inputStats.wc} → {outputStats.wc}
                      {outputStats.wc > inputStats.wc
                        ? <span className="hum-delta good">+{outputStats.wc - inputStats.wc}</span>
                        : <span className="hum-delta neutral">{outputStats.wc - inputStats.wc}</span>}
                    </span>
                  </div>
                  <div className="hum-improve-row">
                    <span>Readability</span>
                    <span style={{ color: inputStats.read.color }}>{inputStats.read.label}</span>
                    <span>→</span>
                    <span style={{ color: outputStats.read.color }}>{outputStats.read.label}</span>
                    {outputStats.read.score > inputStats.read.score
                      ? <span className="hum-delta good">improved</span>
                      : null}
                  </div>
                  <div className="hum-improve-row">
                    <span>AI Risk</span>
                    <span style={{ color: inputStats.ai.color }}>{inputStats.ai.label}</span>
                    <span>→</span>
                    <span style={{ color: outputStats.ai.color }}>{outputStats.ai.label}</span>
                    {outputStats.ai.score < inputStats.ai.score
                      ? <span className="hum-delta good">reduced ✓</span>
                      : null}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="hum-output-empty">
              <div className="hum-empty-icon">✦</div>
              <div>Your {currentMode.label.split(' ').slice(1).join(' ')} output will appear here</div>
              <div className="hum-empty-tip">{currentMode.desc}</div>
            </div>
          )}
        </div>
      </div>

      {/* Tips */}
      <div className="hum-tips-bar">
        <div className="hum-tip">💡 <strong>Best workflow:</strong> Humanize first → then check with Thin Content Scanner → if still under 800 words, use Expand mode</div>
        <div className="hum-tip">🔄 <strong>Double pass:</strong> Copy the output and paste it back as input, then Humanize again for maximum naturalness</div>
        <div className="hum-tip">🔍 <strong>AI Risk score</strong> is based on common AI writing patterns (robotic transitions, low sentence variety). Lower = more human.</div>
      </div>
    </div>
  )
}
