import React, { useState, useRef, useEffect, useCallback } from 'react'
import TipTapEditor from '../components/TipTapEditor'
import RankMathPanel from '../components/RankMathPanel'
import AIWritePanel from '../components/AIWritePanel'
import SiteAvatar from '../components/SiteAvatar'
import { useApp } from '../context/AppContext'
import { useNotify } from '../context/NotificationContext'
import { createPost, updatePost as wpUpdatePost, uploadMedia, resolveTaxonomyTerms } from '../utils/wordpress'
import { callAI } from '../utils/aiCall'
import './CreatePost.css'

const AUTO_SAVE_KEY = 'ct_autosave_draft'
const SOCIAL_PLATFORMS = [
  { key: 'twitter',   label: 'X / Twitter', icon: '𝕏',  limit: 280,  color: '#000' },
  { key: 'linkedin',  label: 'LinkedIn',    icon: 'in', limit: 3000, color: '#0077b5' },
  { key: 'instagram', label: 'Instagram',   icon: '📸', limit: 2200, color: '#e1306c' },
]

const DEFAULT_SEO = { focusKeyword: '', seoTitle: '', metaDesc: '', noindex: false, nofollow: false }

function countWords(html) {
  if (!html) return 0
  return html.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()
    .split(' ').filter(w => w.length > 0).length
}

// Converts the editor's plain HTML into real Gutenberg block markup — the
// <!-- wp:xxx --> comments WordPress's block editor reads to reconstruct
// actual editable blocks on paste, instead of dumping everything into one
// Classic/HTML block with no block boundaries.
function htmlToGutenberg(html) {
  if (!html) return ''
  const wrapper = document.createElement('div')
  wrapper.innerHTML = html
  const blocks = []

  wrapper.childNodes.forEach(node => {
    if (node.nodeType !== 1) return
    const tag = node.tagName.toLowerCase()

    if (tag === 'p') {
      blocks.push(`<!-- wp:paragraph -->\n${node.outerHTML}\n<!-- /wp:paragraph -->`)
    } else if (/^h[1-6]$/.test(tag)) {
      const level = tag[1]
      node.setAttribute('class', 'wp-block-heading')
      const attrs = level === '2' ? '' : ` {"level":${level}}`
      blocks.push(`<!-- wp:heading${attrs} -->\n${node.outerHTML}\n<!-- /wp:heading -->`)
    } else if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(node.children)
        .map(li => `<!-- wp:list-item -->\n<li>${li.innerHTML}</li>\n<!-- /wp:list-item -->`)
        .join('\n\n')
      const ordered = tag === 'ol' ? ' {"ordered":true}' : ''
      blocks.push(`<!-- wp:list${ordered} -->\n<${tag} class="wp-block-list">\n${items}\n</${tag}>\n<!-- /wp:list -->`)
    } else if (tag === 'blockquote') {
      node.setAttribute('class', 'wp-block-quote')
      blocks.push(`<!-- wp:quote -->\n${node.outerHTML}\n<!-- /wp:quote -->`)
    } else if (tag === 'pre') {
      blocks.push(`<!-- wp:code -->\n${node.outerHTML}\n<!-- /wp:code -->`)
    } else if (tag === 'hr') {
      blocks.push(`<!-- wp:separator -->\n<hr class="wp-block-separator"/>\n<!-- /wp:separator -->`)
    } else if (tag === 'img') {
      blocks.push(`<!-- wp:image -->\n<figure class="wp-block-image">${node.outerHTML}</figure>\n<!-- /wp:image -->`)
    } else {
      // Anything TipTap can produce that isn't covered above (e.g. a raw
      // div) — wrap as a generic HTML block so content is never dropped.
      blocks.push(`<!-- wp:html -->\n${node.outerHTML}\n<!-- /wp:html -->`)
    }
  })

  return blocks.join('\n\n')
}

// Known LLM "tells" — phrases that show up disproportionately often in
// ChatGPT/Gemini/Claude output vs. human writing. Kept lowercase for matching.
const AI_PHRASES = [
  'furthermore','additionally','moreover','in conclusion','it is worth noting',
  'it is important to','it should be noted','in today\'s world','in today\'s fast-paced',
  'in the realm of','when it comes to','plays a crucial role','delve into','delving into',
  'a comprehensive','a plethora','underscore the importance','navigate the',
  'leveraging','harnessing','transformative','unlock the potential','game-changer',
  'tapestry','multifaceted','at its core','it\'s essential to understand',
  'cutting-edge','robust','empower','foster','facilitate','dive deep',
  'in today\'s digital','the importance of','cannot be overstated',
  'it goes without saying','needless to say','as we can see',
  'in summary','to summarize','in essence','it is crucial to','holistic',
  'unlock','unleash','elevate your','seamless','seamlessly','game changer',
  'in the world of','landscape of','ever-evolving','ever changing','myriad of',
  'a testament to','a journey','embark on','paving the way','pave the way',
  'shed light on','bridging the gap','at the end of the day','last but not least',
  'on the other hand','that being said','with that said','it\'s no secret that',
  'whether you\'re','look no further','in this article, we','in this post, we',
  'let\'s dive in','let\'s explore','without further ado','in other words',
  'first and foremost','not only... but also','plays a significant role',
  'in the digital age','rapidly evolving','game-changing','top-notch','one-stop shop',
]

const HEDGE_PHRASES = [
  'it is important to note','it is worth noting','it should be noted',
  'it is essential to','one must consider','it can be argued',
  'in many cases','in some cases','generally speaking','broadly speaking',
  'it is generally','it is often','can vary depending on','may vary depending on',
  'it is possible that','there are several factors',
]

const TRANSITION_WORDS = [
  'furthermore','moreover','additionally','consequently','nevertheless',
  'nonetheless','therefore','thus','hence','accordingly','subsequently',
]

const STOPWORDS = new Set([
  'the','a','an','is','are','was','were','in','on','at','to','for','of','and',
  'or','but','with','how','what','why','when','which','who','can','do','does',
  'did','will','would','could','should','this','that','these','those','its',
  'our','your','my','their','be','been','being','have','has','had','not','by',
  'as','from','into','through','about','up','down','out','i','you','we','they',
  'he','she','it','all','any','more','most','also','than','then','so','if',
  'just','like','even','very','too','only','such','no','yes','said','says',
])

function tokenizeWords(text) {
  return text.toLowerCase().match(/[a-z']+/g) || []
}

function splitSentences(text) {
  return text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 3)
}

// Multi-signal heuristic AI-text detector. Pure/local so it can recompute on
// every keystroke with no network round-trip. Combines 8 independent
// stylometric signals (the same categories real detectors like GPTZero use:
// burstiness, lexical diversity, phrase-level "tells", and human-voice
// markers) into one weighted 0–100 score, plus a per-signal breakdown so the
// effect of any single edit — even a one-word change — is visible somewhere,
// since each signal is a ratio over the full word count.
function calcAIRisk(html, formalMode = false) {
  const empty = { score: 0, label: 'No content', color: '#9ca3af', bg: '#f9fafb', found: [], sentenceVar: 100, signals: [], repetitiveWords: [], topStarterWord: null, emDashTerms: [], hedgeTerms: [] }
  if (!html) return empty
  const plain = html.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ')
  const lower = plain.toLowerCase()
  const words = tokenizeWords(plain)
  const wc = words.length
  if (wc < 15) return { ...empty, label: 'Too short to analyze' }

  const sentences = splitSentences(plain)
  const lengths = sentences.map(s => (s.match(/[a-z']+/gi) || []).length).filter(n => n > 0)
  const avgLen = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0
  const stdDev = lengths.length > 1
    ? Math.sqrt(lengths.reduce((a, b) => a + (b - avgLen) ** 2, 0) / lengths.length)
    : 0
  // Burstiness: humans vary sentence length a lot (high coefficient of
  // variation); AI tends to produce more uniform sentence lengths.
  const burstiness = avgLen > 0 ? stdDev / avgLen : 0
  const burstinessScore = clamp((0.55 - burstiness) / 0.55 * 100)

  // Lexical diversity (type-token ratio) vs. an expected human baseline that
  // naturally decays with text length (longer texts always reuse more words).
  const uniqueWords = new Set(words)
  const ttr = uniqueWords.size / wc
  const expectedTTR = Math.min(0.95, 4.5 / Math.sqrt(wc) + 0.35)
  const diversityScore = clamp((expectedTTR - ttr) / expectedTTR * 100)

  // Which specific words are doing the repeating — the actual locations
  // behind the diversity score, so it can be highlighted in the editor.
  const wordFreq = {}
  words.forEach(w => {
    if (w.length < 4 || STOPWORDS.has(w)) return
    wordFreq[w] = (wordFreq[w] || 0) + 1
  })
  const repetitiveWords = Object.entries(wordFreq)
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w)

  // Density of known AI "tell" phrases, per 1000 words.
  const found = AI_PHRASES.filter(p => lower.includes(p))
  const phraseScore = clamp((found.length / wc) * 1000 * 18)

  // Repetitive sentence openers (e.g. every sentence starting with "The").
  const starters = sentences.map(s => (s.split(/\s+/)[0] || '').toLowerCase().replace(/[^a-z']/g, ''))
  const starterCounts = {}
  starters.forEach(w => { if (w) starterCounts[w] = (starterCounts[w] || 0) + 1 })
  const maxStarterRepeat = Object.values(starterCounts).reduce((a, b) => Math.max(a, b), 0)
  const starterRatio = starters.length ? maxStarterRepeat / starters.length : 0
  const starterScore = clamp((starterRatio - 0.15) / 0.5 * 100)
  const topStarterEntry = Object.entries(starterCounts).sort((a, b) => b[1] - a[1])[0]
  const topStarterWord = topStarterEntry && topStarterEntry[1] >= 2 ? topStarterEntry[0] : null

  // Contractions are a strong human-voice marker — AI defaults to formal text.
  const contractions = plain.match(/\b\w+'(t|re|ve|ll|d|s|m)\b/gi) || []
  const contractionRate = (contractions.length / wc) * 100
  const contractionScore = clamp((1.2 - contractionRate) / 1.2 * 100)

  // First-person / personal-experience markers — another human-voice signal.
  const personal = lower.match(/\b(i|i've|i'm|i'll|i'd|my|me|myself|we've|we're|our|us)\b/g) || []
  const personalRate = (personal.length / wc) * 100
  const personalScore = clamp((1.5 - personalRate) / 1.5 * 100)

  // Em dash overuse — a well-documented post-ChatGPT stylistic tell.
  const emDashes = (plain.match(/—|--/g) || []).length
  const emDashRate = (emDashes / wc) * 1000
  const emDashScore = clamp((emDashRate - 1.5) * 12)
  const emDashTerms = [...new Set(plain.match(/—|--/g) || [])]

  // Hedging language + formal transition words, per 1000 words.
  const hedgeFound = HEDGE_PHRASES.filter(p => lower.includes(p))
  const transitionFound = TRANSITION_WORDS.filter(w => lower.includes(w))
  const hedgeTerms = [...hedgeFound, ...transitionFound]
  const hedgeScore = clamp((hedgeTerms.length / wc) * 1000 * 20)

  // Formal/legal/academic writing legitimately has zero contractions and zero
  // first-person voice regardless of who wrote it — those two signals are
  // poor discriminators for that register, so formal mode shifts their
  // weight onto the more reliable signals (phrases, diversity, em dash).
  const weights = formalMode
    ? { phrase: 0.28, burstiness: 0.20, diversity: 0.20, starter: 0.12, contraction: 0.03, personal: 0.03, emDash: 0.09, hedge: 0.05 }
    : { phrase: 0.22, burstiness: 0.18, diversity: 0.15, starter: 0.10, contraction: 0.12, personal: 0.12, emDash: 0.06, hedge: 0.05 }

  const signals = [
    { key: 'phrase',      label: 'AI buzzwords & phrases',     value: phraseScore,      weight: weights.phrase },
    { key: 'burstiness',  label: 'Uniform sentence rhythm',    value: burstinessScore,  weight: weights.burstiness },
    { key: 'diversity',   label: 'Repetitive vocabulary',      value: diversityScore,   weight: weights.diversity },
    { key: 'starter',     label: 'Repetitive sentence openers',value: starterScore,     weight: weights.starter },
    { key: 'contraction', label: 'Lack of contractions',       value: contractionScore, weight: weights.contraction },
    { key: 'personal',    label: 'Lack of personal voice',     value: personalScore,    weight: weights.personal },
    { key: 'emDash',      label: 'Em dash overuse',            value: emDashScore,      weight: weights.emDash },
    { key: 'hedge',       label: 'Hedging / transition overuse', value: hedgeScore,     weight: weights.hedge },
  ]

  const score = clamp(signals.reduce((sum, s) => sum + s.value * s.weight, 0))
  const sentenceVar = clamp(100 - burstinessScore)

  let label, color, bg
  if (score >= 65)      { label = 'High AI Risk';   color = '#dc2626'; bg = '#fff1f2' }
  else if (score >= 35) { label = 'Medium AI Risk'; color = '#d97706'; bg = '#fffbeb' }
  else if (score >= 12) { label = 'Slightly AI';    color = '#2563eb'; bg = '#eff6ff' }
  else                  { label = 'Looks Human ✓';  color = '#16a34a'; bg = '#f0fdf4' }

  return { score, label, color, bg, found, sentenceVar, signals, repetitiveWords, topStarterWord, emDashTerms, hedgeTerms }
}

function clamp(n) {
  return Math.max(0, Math.min(100, n))
}

// Plain <input> can't wrap long titles to a second line — it just scrolls
// horizontally. A textarea wraps naturally; this just keeps its height in
// sync with content so it still reads as a single growing title field
// rather than a boxed textarea.
function AutoGrowTitle({ value, onChange, onEnter }) {
  const ref = useRef(null)

  const resize = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  useEffect(resize, [value, resize])

  // Height depends on how the text wraps, which depends on width — without
  // this, resizing the window (or the panel layout shifting) leaves the
  // title stuck at whatever height it had at the old width.
  useEffect(() => {
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [resize])

  return (
    <textarea
      ref={ref}
      className="post-title-input"
      placeholder="Add title"
      value={value}
      rows={1}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onEnter?.()
        }
      }}
    />
  )
}

// Which signals can actually be pointed at in the document, and what terms
// to highlight for each. Lack of contractions / personal voice are about
// what's missing, not a specific span of text, so they have no locations.
function highlightTermsFor(key, risk) {
  if (key === 'phrase') return { terms: risk.found, wholeWord: false }
  if (key === 'diversity') return { terms: risk.repetitiveWords, wholeWord: true }
  if (key === 'starter') return { terms: risk.topStarterWord ? [risk.topStarterWord] : [], wholeWord: true }
  if (key === 'emDash') return { terms: risk.emDashTerms, wholeWord: false }
  if (key === 'hedge') return { terms: risk.hedgeTerms, wholeWord: false }
  return null
}

function LiveAIRating({ content, wc, onHumanize, editorRef }) {
  const [showBreakdown, setShowBreakdown] = useState(true)
  const [formalMode, setFormalMode] = useState(() => localStorage.getItem('ct_ai_formal_mode') === '1')
  const [activeSignal, setActiveSignal] = useState(null)
  const risk = calcAIRisk(content, formalMode)

  // Keep an active highlight in sync as the user keeps typing — if they fix
  // (or add) an occurrence, the highlighted set updates live instead of
  // freezing at whatever it was when they clicked.
  useEffect(() => {
    if (!activeSignal || !editorRef?.current) return
    const target = highlightTermsFor(activeSignal, risk)
    if (!target || !target.terms.length) { editorRef.current.clearHighlights(); setActiveSignal(null); return }
    editorRef.current.setHighlights(target.terms, { wholeWord: target.wholeWord })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, activeSignal])

  if (wc < 20) return null

  const toggleFormalMode = () => {
    setFormalMode(prev => {
      const next = !prev
      localStorage.setItem('ct_ai_formal_mode', next ? '1' : '0')
      return next
    })
  }

  const handleSignalClick = (signal) => {
    const target = highlightTermsFor(signal.key, risk)
    if (!target || !editorRef?.current) return
    if (activeSignal === signal.key) {
      editorRef.current.clearHighlights()
      setActiveSignal(null)
      return
    }
    if (!target.terms.length) return
    editorRef.current.setHighlights(target.terms, { wholeWord: target.wholeWord })
    setActiveSignal(signal.key)
  }

  const barWidth = `${risk.score}%`
  const barColor = risk.color

  return (
    <div className="live-ai-rating" style={{ borderColor: risk.color + '44', background: risk.bg }}>
      {/* Header row */}
      <div className="lair-header">
        <div className="lair-label-row">
          <span className="lair-icon">🤖</span>
          <span className="lair-title">AI Content Rating</span>
          <span className="lair-score-badge" style={{ background: risk.color, color: 'white' }}>
            {risk.label}
          </span>
          <span className="lair-score-num" style={{ color: risk.color }}>{risk.score.toFixed(1)}%</span>
        </div>
        <div className="lair-right">
          <button
            className={`lair-formal-toggle${formalMode ? ' active' : ''}`}
            onClick={toggleFormalMode}
            title="For legal/academic/technical writing — formal register naturally has no contractions or first-person voice, so this down-weights those two signals to avoid false positives"
          >
            📜 Formal content
          </button>
          <span className="lair-wc">{wc.toLocaleString()} words</span>
          {risk.score >= 35 && (
            <button className="lair-humanize-btn" onClick={onHumanize}>
              ✨ Humanize this
            </button>
          )}
        </div>
      </div>

      {/* Score bar */}
      <div className="lair-bar-wrap">
        <div className="lair-bar-track">
          <div className="lair-bar-fill" style={{ width: barWidth, background: barColor }} />
          {/* Threshold markers */}
          <div className="lair-marker" style={{ left: '35%' }} title="Medium risk threshold" />
          <div className="lair-marker" style={{ left: '65%' }} title="High risk threshold" />
        </div>
        <div className="lair-bar-labels">
          <span style={{ color: '#16a34a' }}>Human</span>
          <span style={{ color: '#d97706' }}>Mixed</span>
          <span style={{ color: '#dc2626' }}>AI</span>
        </div>
      </div>

      {/* Signal breakdown — every signal is a ratio over total word count, so
          even a one-word edit nudges these (and the overall score) by a
          visible decimal amount, not just whole-article rewrites. */}
      <button className="lair-breakdown-toggle" onClick={() => setShowBreakdown(v => !v)}>
        {showBreakdown ? '▾' : '▸'} Signal breakdown ({risk.signals.length})
      </button>
      {showBreakdown && (
        <div className="lair-signals">
          {risk.signals.map(s => {
            const target = highlightTermsFor(s.key, risk)
            const clickable = !!target && target.terms.length > 0
            const isActive = activeSignal === s.key
            return (
              <div
                key={s.key}
                className={`lair-signal-row${clickable ? ' clickable' : ''}${isActive ? ' active' : ''}`}
                onClick={clickable ? () => handleSignalClick(s) : undefined}
                title={
                  clickable
                    ? (isActive ? 'Click again to clear highlight' : 'Click to highlight in the article')
                    : (target ? 'Nothing to highlight yet' : "This is about what's missing from the text — there's nothing to point at")
                }
              >
                <span className="lair-signal-label">
                  {s.label}
                  {clickable && <span className="lair-signal-pin">{isActive ? '📍' : '👆'}</span>}
                </span>
                <div className="lair-signal-bar-track">
                  <div
                    className="lair-signal-bar-fill"
                    style={{
                      width: `${s.value}%`,
                      background: s.value > 65 ? '#dc2626' : s.value > 35 ? '#d97706' : '#16a34a',
                    }}
                  />
                </div>
                <span className="lair-signal-num">{s.value.toFixed(1)}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Detected phrases — always shown so it's never ambiguous whether
          the text was checked vs. genuinely clean. */}
      <div className="lair-phrases">
        <span className="lair-phrases-label">AI buzzwords & phrases:</span>
        {risk.found.length > 0 ? (
          <div className="lair-phrase-list">
            {risk.found.slice(0, 8).map(p => (
              <span key={p} className="lair-phrase-tag">{p}</span>
            ))}
            {risk.found.length > 8 && (
              <span className="lair-phrase-more">+{risk.found.length - 8} more</span>
            )}
          </div>
        ) : (
          <span className="lair-phrase-clean">✓ None found</span>
        )}
      </div>

      {/* Sentence variety */}
      <div className="lair-variety-row">
        <span className="lair-variety-label">Sentence variety:</span>
        <div className="lair-variety-bar-track">
          <div className="lair-variety-bar-fill" style={{
            width: `${Math.min(100, risk.sentenceVar)}%`,
            background: risk.sentenceVar > 50 ? '#16a34a' : risk.sentenceVar > 25 ? '#d97706' : '#dc2626',
          }} />
        </div>
        <span className="lair-variety-hint" style={{ color: risk.sentenceVar > 50 ? '#16a34a' : '#d97706' }}>
          {risk.sentenceVar > 50 ? 'Good variety' : 'Too uniform — vary sentence lengths'}
        </span>
      </div>

      {/* Tip */}
      {risk.score >= 35 && (
        <div className="lair-tip">
          💡 {risk.score >= 65
            ? 'High AI risk detected. Copy this content to the Humanizer, run it through "🧠 Humanize" mode, then paste back.'
            : 'Some AI patterns found. Add personal examples, contractions (don\'t, you\'ll), and vary your sentence lengths.'}
        </div>
      )}
    </div>
  )
}

function ComplianceChecklist({ title, content, categories, featuredImage, seo, selectedSites }) {
  const [open, setOpen] = React.useState(true)
  const wc = countWords(content)

  const checks = [
    { label: 'Title added',           pass: title.trim().length > 0,   required: true  },
    { label: `800+ words (${wc} now)`,pass: wc >= 800,                  required: true,
      hint: wc < 300 ? '🚨 Under 300 — AdSense will reject' : wc < 800 ? `⚠ Add ${800 - wc} more words` : null },
    { label: 'Category assigned',     pass: categories.trim().length > 0, required: true },
    { label: 'Featured image set',    pass: !!featuredImage,             required: false },
    { label: 'Focus keyword set',     pass: seo.focusKeyword.trim().length > 0, required: false },
    { label: 'Meta description set',  pass: seo.metaDesc.trim().length >= 120, required: false,
      hint: seo.metaDesc.length > 0 && seo.metaDesc.length < 120 ? `${120 - seo.metaDesc.length} more chars` : null },
    { label: 'Site selected',         pass: selectedSites.length > 0,    required: true  },
  ]

  const passed   = checks.filter(c => c.pass).length
  const total    = checks.length
  const reqFail  = checks.filter(c => c.required && !c.pass).length
  const pct      = Math.round((passed / total) * 100)
  const color    = pct === 100 ? '#16a34a' : reqFail > 0 ? '#dc2626' : '#d97706'

  return (
    <div className="panel-section" style={{ padding: 0 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: open ? '1px solid var(--border)' : 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13 }}>✅</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pre-Publish Checklist</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color, background: color + '20', padding: '2px 8px', borderRadius: 99 }}>{passed}/{total}</span>
          <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
        </div>
      </button>
      {open && (
        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Progress bar */}
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 99, marginBottom: 8, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.3s ease' }} />
          </div>
          {checks.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, padding: '3px 0' }}>
              <span style={{ flexShrink: 0, fontSize: 13, marginTop: 0 }}>
                {c.pass ? '✅' : c.required ? '🔴' : '⚪'}
              </span>
              <div>
                <span style={{ color: c.pass ? '#166534' : c.required ? '#dc2626' : 'var(--text-secondary)', fontWeight: c.required ? 600 : 400 }}>
                  {c.label}
                  {c.required && !c.pass && <span style={{ fontSize: 10, marginLeft: 4, color: '#dc2626' }}>required</span>}
                </span>
                {c.hint && !c.pass && (
                  <div style={{ fontSize: 10, color: '#d97706', marginTop: 1 }}>{c.hint}</div>
                )}
              </div>
            </div>
          ))}
          {/* AdSense reminder */}
          <div style={{ marginTop: 8, padding: '8px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontSize: 11, color: '#92400e', lineHeight: 1.5 }}>
            <strong>AdSense reminders:</strong> Ensure your site has Privacy Policy, About Us, and Contact pages. Use the <strong>AI Humanizer</strong> if content was AI-written.
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Internal Link Suggester ── */
const IL_STOP = new Set(['the','a','an','is','are','was','were','in','on','at','to','for','of','and','or','but','with','how','what','why','when','which','who','can','do','does','did','will','would','could','should','this','that','these','those','its','our','your','my','their','be','been','being','have','has','had','not','by','as','from','into','through','about','up','down','out','i','you','we','they','he','she','it','all','any','more','most','also','than','then','so','if','just','like','even','very','too'])

function ilWords(text) {
  return text.toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter(w => w.length > 3 && !IL_STOP.has(w))
}

function ilScore(titleWords, contentWordSet) {
  if (!titleWords.length) return 0
  return titleWords.filter(w => contentWordSet.has(w)).length / titleWords.length
}

function findAnchorPhrase(rawTitle, plainContent) {
  const titleClean = rawTitle.replace(/[^a-z0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim()
  const parts = titleClean.toLowerCase().split(' ').filter(w => w.length > 2)
  const contentLow = plainContent.toLowerCase()
  for (let len = parts.length; len >= 2; len--) {
    for (let i = 0; i <= parts.length - len; i++) {
      const phrase = parts.slice(i, i + len).join(' ')
      if (contentLow.includes(phrase)) return phrase
    }
  }
  return null
}

function isAlreadyLinked(url, htmlContent) {
  return htmlContent.includes(`href="${url}"`) || htmlContent.includes(`href='${url}'`)
}

function InternalLinks({ content, siteId, sites, allPosts, editorRef }) {
  const [open, setOpen] = useState(true)
  const [inserted, setInserted] = useState({})

  const site = sites.find(s => s.id === siteId)
  if (!siteId || !site) return null

  const plainContent = content.replace(/<[^>]+>/g, ' ')
  const contentWordSet = new Set(ilWords(plainContent))

  const sitePosts = allPosts.filter(p => p.siteId === siteId && p.wpLink && p.wpPostId)

  const suggestions = sitePosts
    .map(p => {
      const rawTitle = p.title?.replace(/<[^>]+>/g, '') || ''
      const tWords = ilWords(rawTitle)
      const score = ilScore(tWords, contentWordSet)
      const anchor = findAnchorPhrase(rawTitle, plainContent)
      const linked = isAlreadyLinked(p.wpLink, content)
      return { post: p, rawTitle, score, anchor, linked }
    })
    .filter(s => s.score >= 0.35 && !s.linked)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)

  const handleInsert = (s) => {
    if (!editorRef?.current) return
    const anchor = s.anchor || s.rawTitle
    const success = editorRef.current.autoLinkPhrase(anchor, s.post.wpLink)
    if (!success) {
      editorRef.current.insertAtCursor(s.rawTitle, s.post.wpLink)
    }
    setInserted(prev => ({ ...prev, [s.post.localId]: true }))
    setTimeout(() => setInserted(prev => { const n = { ...prev }; delete n[s.post.localId]; return n }), 3000)
  }

  const noContent = plainContent.trim().length < 100

  return (
    <div className="panel-section" style={{ padding: 0 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: open ? '1px solid var(--border)' : 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13 }}>🔗</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Internal Links</span>
          {suggestions.length > 0 && (
            <span style={{ fontSize: 10, fontWeight: 800, background: '#6366f1', color: '#fff', borderRadius: 99, padding: '1px 6px' }}>{suggestions.length}</span>
          )}
        </div>
        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
      </button>

      {open && (
        <div style={{ padding: '10px 14px 14px' }}>
          {noContent && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
              Write more content to see link suggestions.
            </div>
          )}
          {!noContent && suggestions.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {sitePosts.length === 0
                ? 'Sync your site first — posts appear after syncing from Dashboard.'
                : 'No matching posts found. All relevant posts may already be linked.'}
            </div>
          )}
          {suggestions.map(s => {
            const pct = Math.round(s.score * 100)
            const color = pct >= 70 ? '#16a34a' : pct >= 50 ? '#d97706' : '#6366f1'
            const done = inserted[s.post.localId]
            return (
              <div key={s.post.localId} style={{ marginBottom: 8, padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3, flex: 1 }}
                    dangerouslySetInnerHTML={{ __html: s.post.title || s.rawTitle }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color, background: color + '18', padding: '2px 6px', borderRadius: 99, flexShrink: 0 }}>{pct}%</span>
                </div>
                {s.anchor && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
                    Link phrase: <span style={{ fontStyle: 'italic', color: '#6366f1' }}>"{s.anchor}"</span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 5 }}>
                  <button
                    style={{ flex: 1, padding: '4px 0', fontSize: 10, fontWeight: 700, background: done ? '#16a34a' : '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                    onClick={() => handleInsert(s)}
                    disabled={done}
                  >
                    {done ? '✓ Inserted' : s.anchor ? '⚡ Auto-link' : '+ Insert at cursor'}
                  </button>
                  <button
                    style={{ padding: '4px 8px', fontSize: 10, fontWeight: 600, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }}
                    onClick={() => { navigator.clipboard.writeText(s.post.wpLink); }}
                    title="Copy URL"
                  >
                    URL
                  </button>
                </div>
              </div>
            )
          })}
          {!noContent && sitePosts.length > 0 && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
              Matches based on keyword overlap with your synced posts.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function CreatePost({ navigate, editPost }) {
  const { sites, posts: allPosts, addPost, updatePost: localUpdatePost, settings, templates } = useApp()
  const { notifySuccess, notifyError, notifyInfo, notifyWarning } = useNotify()
  const editorRef = useRef()

  // ── Restore from auto-save if fresh open ──
  const autoSaveData = (() => {
    if (editPost) return null
    const hasPrefill = localStorage.getItem('ct_prefill_title') || localStorage.getItem('ct_prefill_content')
    if (hasPrefill) return null
    try { return JSON.parse(localStorage.getItem(AUTO_SAVE_KEY) || 'null') } catch { return null }
  })()

  const [title, setTitle]       = useState(() => {
    if (editPost?.title) return editPost.title
    const prefill = localStorage.getItem('ct_prefill_title') || ''
    localStorage.removeItem('ct_prefill_title')
    return prefill || autoSaveData?.title || ''
  })
  const [content, setContent]   = useState(() => {
    if (editPost?.content) return editPost.content
    const prefill = localStorage.getItem('ct_prefill_content') || ''
    localStorage.removeItem('ct_prefill_content')
    return prefill || autoSaveData?.content || ''
  })
  const [selectedSites, setSelectedSites] = useState(() => {
    // A template (Templates → Use Template) has no siteId — falling through
    // to [undefined] here used to look like a real selection (length 1) and
    // pass the "select a site" check, so Publish/Save Draft would loop over
    // a site that doesn't exist and silently do nothing at all.
    if (editPost) return editPost.siteId ? [editPost.siteId] : []
    const prefillSite = localStorage.getItem('ct_prefill_site') || ''
    localStorage.removeItem('ct_prefill_site')
    return prefillSite ? [prefillSite] : (autoSaveData?.selectedSites || [])
  })
  const [categories, setCategories] = useState(() => {
    if (editPost?.categories) return editPost.categories.join(', ')
    const prefillCategory = localStorage.getItem('ct_prefill_category') || ''
    localStorage.removeItem('ct_prefill_category')
    return prefillCategory || autoSaveData?.categories || ''
  })
  const [postTags, setPostTags] = useState(() => {
    if (editPost?.tags) return editPost.tags.join(', ')
    return autoSaveData?.tags || ''
  })
  const [postStatus, setPostStatus] = useState(editPost?.status || settings?.defaultStatus || 'draft')
  const [scheduleDate, setScheduleDate] = useState('')
  const [featuredImage, setFeaturedImage] = useState(null)
  const [featuredImagePreview, setFeaturedImagePreview] = useState(editPost?.featuredImageUrl || null)
  const [pixabayOpen, setPixabayOpen] = useState(false)
  const [pixabayQuery, setPixabayQuery] = useState('')
  const [pixabayResults, setPixabayResults] = useState([])
  const [pixabayLoading, setPixabayLoading] = useState(false)
  const [seo, setSeo]           = useState(() => {
    if (editPost?.seo) return editPost.seo
    const kw = localStorage.getItem('ct_prefill_keyword') || ''
    const meta = localStorage.getItem('ct_prefill_meta') || ''
    localStorage.removeItem('ct_prefill_keyword')
    localStorage.removeItem('ct_prefill_meta')
    return { ...DEFAULT_SEO, focusKeyword: kw || autoSaveData?.seo?.focusKeyword || '', metaDesc: meta || autoSaveData?.seo?.metaDesc || '' }
  })
  const [seoOpen, setSeoOpen]   = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [results, setResults]   = useState([])
  const [uploadStatuses, setUploadStatuses] = useState({})
  const fileInputRef = useRef()

  // ── Panel tabs ──
  const [panelTab, setPanelTab] = useState('post')

  // ── WP Categories ──
  const [wpCategories, setWpCategories] = useState([])
  const [catLoading, setCatLoading] = useState(false)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState([])
  const [newCatName, setNewCatName] = useState('')
  const [addingCat, setAddingCat] = useState(false)

  // ── Auto-save ──
  const [autoSaved, setAutoSaved] = useState(!!autoSaveData)
  const [showRestoreNotice, setShowRestoreNotice] = useState(!!autoSaveData && !editPost)

  // ── Inline humanize ──
  const [humanizeLoading, setHumanizeLoading] = useState(false)
  const [humanizeResult, setHumanizeResult] = useState('')
  const [humanizeError, setHumanizeError] = useState('')
  const [showAIWrite, setShowAIWrite] = useState(false)

  // ── SEO auto-fill ──
  const [autoFillLoading, setAutoFillLoading] = useState(false)
  const [autoFillMsg, setAutoFillMsg] = useState('')

  // ── Social ──
  const [socialPlatform, setSocialPlatform] = useState('twitter')
  const [socialOutputs, setSocialOutputs] = useState({})
  const [socialLoading, setSocialLoading] = useState(false)
  const [socialCopied, setSocialCopied] = useState('')
  const [publishedLink, setPublishedLink] = useState('')

  const searchPixabay = async () => {
    const key = settings?.pixabayApiKey
    if (!key || !pixabayQuery.trim()) return
    setPixabayLoading(true)
    try {
      const q = encodeURIComponent(pixabayQuery.trim())
      const r = await fetch(`https://pixabay.com/api/?key=${key}&q=${q}&image_type=photo&per_page=12&safesearch=true&orientation=horizontal`)
      const d = await r.json()
      setPixabayResults(d.hits || [])
    } catch {}
    setPixabayLoading(false)
  }

  const pickPixabayImage = async (hit) => {
    try {
      const resp = await fetch(hit.webformatURL)
      const blob = await resp.blob()
      const file = new File([blob], 'featured.jpg', { type: blob.type })
      setFeaturedImage(file)
      setFeaturedImagePreview(hit.webformatURL)
    } catch {
      setFeaturedImagePreview(hit.webformatURL)
    }
    setPixabayOpen(false)
    setPixabayResults([])
    setUploadStatuses({})
  }

  const pingSitemaps = (siteUrl) => {
    const encoded = encodeURIComponent(`${siteUrl}/sitemap.xml`)
    fetch(`https://www.google.com/ping?sitemap=${encoded}`).catch(() => {})
    fetch(`https://www.bing.com/ping?sitemap=${encoded}`).catch(() => {})
  }

  // ── Auto-save effect ──
  useEffect(() => {
    // Autosave is a single global slot meant for an in-progress NEW post —
    // restoring it explicitly skips editPost (see autoSaveData above).
    // Without the same guard here, opening an existing post to edit would
    // overwrite that slot with the post being edited, so navigating back to
    // "Create New Post" afterward offers the wrong post's content as the
    // "restored" draft and silently loses whatever new draft was there before.
    if (editPost) return
    if (!title && !content) return
    const timer = setTimeout(() => {
      localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify({
        title, content, categories, tags: postTags, seo, selectedSites, savedAt: Date.now()
      }))
      setAutoSaved(true)
      setTimeout(() => setAutoSaved(false), 2500)
    }, 1500)
    return () => clearTimeout(timer)
  }, [title, content, categories, postTags, seo])

  // ── Fetch WP categories when site selection changes ──
  useEffect(() => {
    const site = sites.find(s => s.id === selectedSites[0])
    if (!site?.connected || !site?.username || !site?.password) { setWpCategories([]); return }
    setCatLoading(true)
    fetch(`${site.url}/wp-json/wp/v2/categories?per_page=100&_fields=id,name,slug,count`, {
      headers: { Authorization: 'Basic ' + btoa(`${site.username}:${site.password}`) }
    })
      .then(r => r.json())
      .then(cats => setWpCategories(Array.isArray(cats) ? cats.sort((a, b) => a.name.localeCompare(b.name)) : []))
      .catch(() => setWpCategories([]))
      .finally(() => setCatLoading(false))
  }, [selectedSites[0]])

  // Match a Content Plan category name to its real WordPress category ID.
  useEffect(() => {
    if (!categories || wpCategories.length === 0) return
    const plannedNames = categories.split(',').map(name => name.trim().toLowerCase()).filter(Boolean)
    const matchingIds = wpCategories
      .filter(category => plannedNames.includes(category.name.toLowerCase()))
      .map(category => category.id)
    if (matchingIds.length > 0) setSelectedCategoryIds(matchingIds)
  }, [wpCategories, categories])

  const createWpCategory = async (name) => {
    const site = sites.find(s => s.id === selectedSites[0])
    if (!site?.connected) return
    setAddingCat(true)
    try {
      const r = await fetch(`${site.url}/wp-json/wp/v2/categories`, {
        method: 'POST',
        headers: { Authorization: 'Basic ' + btoa(`${site.username}:${site.password}`), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      })
      const cat = await r.json()
      if (cat.id) {
        setWpCategories(prev => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)))
        setSelectedCategoryIds(prev => [...prev, cat.id])
        setNewCatName('')
      }
    } catch {}
    setAddingCat(false)
  }

  // ── SEO Auto-fill ──
  const autoFillSEO = async () => {
    if (!settings?.geminiApiKey || !content) { setAutoFillMsg('Add Gemini key in Settings and write some content first.'); return }
    setAutoFillLoading(true); setAutoFillMsg('')
    try {
      const plain = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200)
      const catList = wpCategories.map(c => c.name).join(', ')
      const prompt = `Generate SEO fields for this blog post. Output EXACTLY in this format, nothing else:

SEO_TITLE: [50-60 char title with main keyword]
META_DESC: [130-155 char compelling description with keyword]
KEYWORD: [1-3 word focus keyword]
${catList ? `CATEGORY: [pick the most relevant from: ${catList}]` : ''}

Post title: ${title}
Content: ${plain}`
      const text = await callAI(settings, prompt, 400)
      const get = (key) => { const m = text.match(new RegExp(`${key}:\\s*(.+)`)); return m ? m[1].trim() : '' }
      const seoTitle = get('SEO_TITLE')
      const metaDesc = get('META_DESC')
      const keyword  = get('KEYWORD')
      const catName  = get('CATEGORY')
      setSeo(prev => ({ ...prev, ...(seoTitle && { seoTitle }), ...(metaDesc && { metaDesc }), ...(keyword && { focusKeyword: keyword }) }))
      if (catName) {
        const match = wpCategories.find(c => c.name.toLowerCase() === catName.toLowerCase())
        if (match && !selectedCategoryIds.includes(match.id)) setSelectedCategoryIds(prev => [...prev, match.id])
        else if (!match && catName) setCategories(prev => prev ? `${prev}, ${catName}` : catName)
      }
      setAutoFillMsg('✓ SEO fields filled!')
      setPanelTab('seo')
    } catch (e) { setAutoFillMsg(`Error: ${e.message}`) }
    setAutoFillLoading(false)
    setTimeout(() => setAutoFillMsg(''), 4000)
  }

  // ── Inline Humanize ──
  const humanizeContent = async () => {
    if (!settings?.geminiApiKey) { setHumanizeError('Add Gemini key in Settings.'); return }
    if (!content || content.replace(/<[^>]+>/g, '').trim().length < 50) { setHumanizeError('Write some content first.'); return }
    setHumanizeLoading(true); setHumanizeError(''); setHumanizeResult('')
    try {
      const prompt = `You are a world-class content humanizer. Rewrite this blog post so it reads like a real experienced human writer — natural rhythm, contractions, first-person touches, varied sentences, no AI filler phrases.

RULES:
- Keep all HTML tags intact
- Remove: Furthermore, Additionally, Moreover, In conclusion, It is worth noting, plays a crucial role, delve into
- Add contractions (don't, it's, you'll, I've)
- Vary sentence lengths — mix short punchy ones with longer explanatory ones
- Add 1-2 rhetorical questions
- Start some sentences with: And, But, So, Here's the thing —
- Output ONLY the rewritten HTML content. No preamble.

CONTENT:
${content}`
      const result = await callAI(settings, prompt, 8192)
      setHumanizeResult(result)
    } catch (e) { setHumanizeError(e.message) }
    setHumanizeLoading(false)
  }

  const applyHumanized = () => {
    if (!humanizeResult) return
    setContent(humanizeResult)
    editorRef.current?.setContent(humanizeResult)
    setHumanizeResult('')
  }

  // ── Social generation ──
  const generateSocial = async (platform) => {
    if (!settings?.geminiApiKey) return
    setSocialLoading(true)
    const plain = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 800)
    const urlLine = publishedLink ? `\nPost URL: ${publishedLink}` : ''
    let prompt = ''
    if (platform === 'twitter') {
      prompt = `Create a Twitter/X thread for this blog post. Format as exactly 5 tweets numbered 1/ through 5/. Tweet 1 must be a hook. Tweets 2-4 share key insights. Tweet 5 is CTA with URL. Max 270 chars each. No hashtags except tweet 5 (max 2).\n\nTitle: ${title}\nContent: ${plain}${urlLine}\n\nOutput only the 5 tweets, one per line.`
    } else if (platform === 'linkedin') {
      prompt = `Write a professional LinkedIn post for this blog article. Strong opening (no "Excited to share"). Short paragraphs. 3 key insights. End with a question. 3 relevant hashtags. 150-250 words.\n\nTitle: ${title}\nContent: ${plain}${urlLine}`
    } else if (platform === 'instagram') {
      prompt = `Write an Instagram caption for this blog post. Attention-grabbing first line. 4-6 punchy lines. CTA ("Link in bio"). Then exactly 15 relevant hashtags.\n\nTitle: ${title}\nContent: ${plain}${urlLine}`
    }
    try {
      const text = await callAI(settings, prompt, 1000)
      setSocialOutputs(prev => ({ ...prev, [platform]: text }))
    } catch (e) { setSocialOutputs(prev => ({ ...prev, [platform]: `Error: ${e.message}` })) }
    setSocialLoading(false)
  }

  const openSocialPost = (platform) => {
    const text = socialOutputs[platform] || ''
    const url = publishedLink || ''
    const enc = encodeURIComponent
    if (platform === 'twitter')   window.open(`https://twitter.com/intent/tweet?text=${enc(text.slice(0, 280))}&url=${enc(url)}`)
    if (platform === 'linkedin')  window.open(`https://www.linkedin.com/shareArticle?mini=true&url=${enc(url)}&title=${enc(title)}&summary=${enc(text.slice(0, 700))}`)
    if (platform === 'facebook')  window.open(`https://www.facebook.com/sharer/sharer.php?u=${enc(url)}&quote=${enc(text.slice(0, 500))}`)
  }

  const copySocial = (platform) => {
    navigator.clipboard.writeText(socialOutputs[platform] || '')
    setSocialCopied(platform)
    setTimeout(() => setSocialCopied(''), 2000)
  }

  const toggleSite = (id) =>
    setSelectedSites(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])

  const toggleAll = () =>
    setSelectedSites(prev => prev.length === sites.length ? [] : sites.map(s => s.id))

  const handleImageSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setFeaturedImage(file)
    const reader = new FileReader()
    reader.onload = ev => setFeaturedImagePreview(ev.target.result)
    reader.readAsDataURL(file)
    setUploadStatuses({})
  }

  const loadTemplate = (tpl) => {
    if (!tpl) return
    setTitle(tpl.title || '')
    setContent(tpl.content || '')
    setCategories(tpl.categories || '')
  }

  const handleCopyArticle = async () => {
    if (!title.trim() && !content.trim()) { notifyWarning('Nothing to copy yet — write a title or some content first.'); return }
    const gutenberg = htmlToGutenberg(content)
    const text = `${title.trim()}\n\n${gutenberg}`
    try {
      await navigator.clipboard.writeText(text)
      notifySuccess('✓ Copied — title + Gutenberg-formatted article on your clipboard')
    } catch (e) {
      notifyError(`Failed to copy to clipboard: ${e.message}`, { action: 'Copy Article' })
    }
  }

  const handlePublish = async (status) => {
    if (!title.trim()) { notifyWarning('Please enter a post title before publishing.'); return }
    if (selectedSites.length === 0) { notifyWarning('Please select at least one site to publish to.'); return }

    // An explicit "Save Draft" click must always save as a draft — a
    // schedule date picked earlier shouldn't silently turn that into
    // scheduling the post instead, which is what happened when this ignored
    // the requested status any time a date was set.
    const finalStatus = status === 'draft' ? 'draft' : (scheduleDate ? 'future' : status)
    status === 'draft' ? setSavingDraft(true) : setPublishing(true)
    setResults([])
    setUploadStatuses({})

    const newResults = []

    for (const siteId of selectedSites) {
      const site = sites.find(s => s.id === siteId)
      if (!site) continue

      const postData = {
        title: title.trim(),
        content,
        categories: selectedCategoryIds.length > 0
          ? selectedCategoryIds
          : categories.split(',').map(c => c.trim()).filter(Boolean),
        tags: postTags.split(',').map(t => t.trim()).filter(Boolean),
        status: finalStatus,
        seo,
        featuredMedia: 0,
        ...(scheduleDate && { date: scheduleDate }),
      }

      if (site.connected && site.username && site.password) {
        // WP REST requires categories/tags as term IDs, not name strings —
        // resolve (or create) the real terms before sending, otherwise the
        // whole create request is rejected by WordPress with a 400 error.
        const wpPayload = { ...postData }
        if (selectedCategoryIds.length === 0 && categories.trim()) {
          wpPayload.categories = await resolveTaxonomyTerms(site, 'categories', categories.split(','))
        } else if (selectedCategoryIds.length > 0 && siteId !== selectedSites[0]) {
          // selectedCategoryIds are category IDs from selectedSites[0]'s own
          // WordPress install (that's whose category list the checkboxes
          // above are fetched from) — those numeric IDs aren't portable to
          // any other site, so reusing them here could silently file the
          // post under a wrong or nonexistent category. Resolve by name
          // instead for every site but the first.
          const names = selectedCategoryIds.map(id => wpCategories.find(c => c.id === id)?.name).filter(Boolean)
          wpPayload.categories = names.length > 0 ? await resolveTaxonomyTerms(site, 'categories', names) : []
        }
        if (postTags.trim()) {
          wpPayload.tags = await resolveTaxonomyTerms(site, 'tags', postTags.split(','))
        }

        let imageUploadFailed = false
        if (featuredImage) {
          setUploadStatuses(prev => ({ ...prev, [siteId]: 'uploading' }))
          const upRes = await uploadMedia(site, featuredImage)
          if (upRes.success) {
            wpPayload.featuredMedia = upRes.media.id
            setUploadStatuses(prev => ({ ...prev, [siteId]: 'done' }))
          } else {
            setUploadStatuses(prev => ({ ...prev, [siteId]: 'fail' }))
            imageUploadFailed = true
          }
        }

        // Editing an existing WP post must PUT to update it — calling
        // createPost here would silently publish a duplicate post instead
        // of updating the original.
        const isEditingThisPost = editPost?.wpPostId && editPost.siteId === siteId
        const result = isEditingThisPost
          ? await wpUpdatePost(site, editPost.wpPostId, wpPayload)
          : await createPost(site, wpPayload)

        if (result.success) {
          if (isEditingThisPost) {
            localUpdatePost(editPost.localId, { ...postData, siteId, wpPostId: result.post.id, wpLink: result.post.link })
          } else {
            addPost({ ...postData, siteId, wpPostId: result.post.id, wpLink: result.post.link })
          }
          newResults.push({ siteId, siteName: site.name, success: true, link: result.post.link })
          if (finalStatus === 'publish') { pingSitemaps(site.url); setPublishedLink(result.post.link) }
          localStorage.removeItem(AUTO_SAVE_KEY)
          const verb = isEditingThisPost ? 'Updated' : finalStatus === 'publish' ? 'Published' : finalStatus === 'future' ? 'Scheduled' : 'Saved as draft'
          notifySuccess(`✓ ${verb} on ${site.name}`)
          // The post itself saved fine even though the image didn't — that
          // used to be silent (just a small badge in the uploader), easy to
          // miss next to a "success" notification for the post overall.
          if (imageUploadFailed) {
            notifyWarning(`Featured image failed to upload to ${site.name} — the post saved without one. Add it manually in WordPress if needed.`)
          }
        } else {
          if (!isEditingThisPost) addPost({ ...postData, siteId, error: result.error })
          newResults.push({ siteId, siteName: site.name, success: false, error: result.error })
          notifyError(
            `Failed to ${isEditingThisPost ? 'update' : 'publish'} "${title.trim()}" on ${site.name}: ${result.error}`,
            { site: site.name, action: isEditingThisPost ? 'Update Post' : 'Publish Post' }
          )
        }
      } else {
        if (editPost?.localId) {
          localUpdatePost(editPost.localId, { ...postData, siteId })
        } else {
          addPost({ ...postData, siteId })
        }
        newResults.push({ siteId, siteName: site.name, success: true, local: true })
        notifyInfo(`Saved locally for ${site.name} — this site isn't connected, so it was NOT published. Connect it in Site Manager first.`)
      }
    }

    setResults(newResults)
    status === 'draft' ? setSavingDraft(false) : setPublishing(false)
  }

  const seoScore = (() => {
    const kw = seo.focusKeyword.toLowerCase().trim()
    let pts = 0
    if (kw) {
      if (title.toLowerCase().includes(kw)) pts++
      if (seo.metaDesc.toLowerCase().includes(kw)) pts++
      if (content.toLowerCase().includes(kw)) pts++
    }
    if (seo.seoTitle.length >= 50 && seo.seoTitle.length <= 60) pts++
    if (seo.metaDesc.length >= 120 && seo.metaDesc.length <= 160) pts++
    return Math.round((pts / 5) * 100)
  })()

  const scoreColor = seoScore >= 80 ? '#10b981' : seoScore >= 50 ? '#f59e0b' : '#ef4444'
  const firstSelectedSite = sites.find(s => s.id === selectedSites[0])

  return (
    <div className="create-post">
      {/* Top bar */}
      <div className="create-post-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1>{editPost ? 'Edit Post' : 'Create New Post'}</h1>
          {/* Template loader */}
          {templates.length > 0 && (
            <select
              style={{ fontSize: 12, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer' }}
              defaultValue=""
              onChange={e => {
                const tpl = templates.find(t => String(t.id) === e.target.value)
                loadTemplate(tpl)
                e.target.value = ''
              }}
            >
              <option value="" disabled>Load template…</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </div>
        <div className="create-post-actions">
          {autoSaved && <span className="autosave-indicator">✓ Auto-saved</span>}
          {autoFillMsg && <span className={`autosave-indicator${autoFillMsg.startsWith('Error') ? ' error' : ''}`}>{autoFillMsg}</span>}
          <button className="btn btn-ghost btn-sm" onClick={autoFillSEO} disabled={autoFillLoading} title="AI fills SEO title, meta, keyword, tag and category">
            {autoFillLoading ? '…' : '✦ Auto-fill SEO'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleCopyArticle} title="Copy title + article as Gutenberg block markup, ready to paste into WordPress">
            📋 Copy Article
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('all-posts')}>← Back</button>
          <button className="btn btn-secondary btn-sm" onClick={() => handlePublish('draft')} disabled={savingDraft || publishing}>
            {savingDraft ? 'Saving…' : 'Save Draft'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => handlePublish(postStatus)} disabled={publishing || savingDraft}>
            {publishing ? 'Publishing…' : scheduleDate ? 'Schedule' : `Publish${selectedSites.length > 1 ? ` to ${selectedSites.length}` : ''}`}
          </button>
        </div>
      </div>

      <div className="create-post-body">
        {/* Gutenberg-style document editor */}
        <div className="editor-area">
          {showRestoreNotice && (
            <div className="restore-notice">
              <span>📄 Draft restored from auto-save ({autoSaveData?.savedAt ? new Date(autoSaveData.savedAt).toLocaleTimeString() : ''})</span>
              <button onClick={() => { localStorage.removeItem(AUTO_SAVE_KEY); setTitle(''); setContent(''); setShowRestoreNotice(false) }}>Discard</button>
              <button onClick={() => setShowRestoreNotice(false)}>Keep</button>
            </div>
          )}
          <div className="editor-doc">
            <AutoGrowTitle
              value={title}
              onChange={setTitle}
              onEnter={() => editorRef.current?.focus?.()}
            />
            <TipTapEditor ref={editorRef} content={content} onChange={setContent} placeholder="Start writing or type / to insert a block…" />

            {/* Published link */}
            {publishedLink && (
              <div className="published-link-bar">
                <span>🎉 Published!</span>
                <a href="#" onClick={e => { e.preventDefault(); window.open(publishedLink) }}>{publishedLink}</a>
                <button onClick={() => { navigator.clipboard.writeText(publishedLink) }} title="Copy link">📋</button>
              </div>
            )}

            {results.length > 0 && (
              <div className="publish-results">
                {results.map((r, i) => (
                  <div key={i} className={`publish-result-item ${r.success ? 'success' : 'error'}`}>
                    {r.success ? (
                      <>
                        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                        {r.siteName} — {r.local ? 'saved locally' : scheduleDate ? 'scheduled' : 'published'}
                        {r.link && <a href="#" onClick={e => { e.preventDefault(); window.open(r.link) }} style={{ marginLeft: 6, color: 'var(--primary)', fontSize: 11 }}>View →</a>}
                      </>
                    ) : (
                      <>
                        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/></svg>
                        {r.siteName} — {r.error}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* AI Content Rating — at the bottom of the article, not pinned */}
            <LiveAIRating
              content={content}
              wc={countWords(content)}
              onHumanize={() => { setPanelTab('ai'); setShowAIWrite(false) }}
              editorRef={editorRef}
            />
          </div>
        </div>

        {/* Right sidebar — tabbed workspace */}
        <div className="post-panel">
          {/* Tab bar */}
          <div className="panel-tab-bar">
            {[
              { key: 'post',   icon: '📝', label: 'Post'   },
              { key: 'ai',     icon: '🤖', label: 'AI'     },
              { key: 'seo',    icon: '🔍', label: 'SEO'    },
              { key: 'links',  icon: '🔗', label: 'Links'  },
              { key: 'social', icon: '📣', label: 'Social' },
            ].map(t => (
              <button key={t.key} className={`panel-tab${panelTab === t.key ? ' active' : ''}`} onClick={() => setPanelTab(t.key)}>
                <span>{t.icon}</span><span>{t.label}</span>
              </button>
            ))}
          </div>

          {/* ── POST TAB ── */}
          {panelTab === 'post' && <>
          {/* Site selector */}
          <div className="panel-section">
            <div className="panel-section-title">Publish to Sites</div>
            <div className="site-check-all">
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{selectedSites.length} selected</span>
              <button className="check-all-btn" onClick={toggleAll}>
                {selectedSites.length === sites.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div className="site-check-list">
              {sites.map(site => (
                <label key={site.id} className="site-checkbox">
                  <input type="checkbox" checked={selectedSites.includes(site.id)} onChange={() => toggleSite(site.id)} />
                  <SiteAvatar site={site} size={18} radius={4} />
                  <span className="site-checkbox-label">{site.name}</span>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: site.connected ? 'var(--success)' : '#d1d5db', flexShrink: 0 }} />
                </label>
              ))}
            </div>
          </div>

          {/* Status + Schedule */}
          <div className="panel-section">
            <div className="panel-section-title">Publish Settings</div>
            <select className="status-select" value={postStatus} onChange={e => setPostStatus(e.target.value)} style={{ marginBottom: 8 }}>
              <option value="publish">Published</option>
              <option value="draft">Draft</option>
              <option value="pending">Pending Review</option>
            </select>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 5, fontWeight: 600 }}>
              Schedule (optional)
            </div>
            <input
              type="datetime-local"
              className="status-select"
              value={scheduleDate}
              onChange={e => setScheduleDate(e.target.value)}
              style={{ fontSize: 12 }}
            />
            {scheduleDate && (
              <div style={{ fontSize: 11, color: 'var(--primary)', marginTop: 4 }}>
                Will be scheduled for {new Date(scheduleDate).toLocaleString()}
              </div>
            )}
          </div>

          {/* Categories */}
          <div className="panel-section">
            <div className="panel-section-title">
              Categories
              {catLoading && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>Loading…</span>}
            </div>
            {wpCategories.length > 0 ? (
              <div className="wp-cat-list">
                {wpCategories.map(cat => (
                  <label key={cat.id} className="wp-cat-item">
                    <input
                      type="checkbox"
                      checked={selectedCategoryIds.includes(cat.id)}
                      onChange={() => setSelectedCategoryIds(prev =>
                        prev.includes(cat.id) ? prev.filter(id => id !== cat.id) : [...prev, cat.id]
                      )}
                    />
                    <span className="wp-cat-name">{cat.name}</span>
                    <span className="wp-cat-count">{cat.count}</span>
                  </label>
                ))}
              </div>
            ) : (
              <input className="tags-input" placeholder="e.g. News, Technology" value={categories} onChange={e => setCategories(e.target.value)} />
            )}
            {wpCategories.length > 0 && (
              <div className="wp-cat-add">
                <input
                  className="tags-input"
                  placeholder="+ New category"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && newCatName.trim() && createWpCategory(newCatName.trim())}
                />
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => newCatName.trim() && createWpCategory(newCatName.trim())}
                  disabled={addingCat || !newCatName.trim()}
                >
                  {addingCat ? '…' : 'Add'}
                </button>
              </div>
            )}
            {wpCategories.length === 0 && !catLoading && <div className="tags-hint">Connect a site to load WP categories</div>}
          </div>

          {/* Tags */}
          <div className="panel-section">
            <div className="panel-section-title">Tags</div>
            <input
              className="tags-input"
              placeholder="e.g. wordpress, seo, tips (comma separated)"
              value={postTags}
              onChange={e => setPostTags(e.target.value)}
            />
            <div className="tags-hint">New tags are created automatically on WordPress if they don't already exist.</div>
          </div>

          {/* Featured image */}
          <div className="panel-section">
            <div className="panel-section-title">Featured Image</div>
            <div className="featured-image-area" onClick={() => fileInputRef.current?.click()}>
              {featuredImagePreview ? (
                <>
                  <img src={featuredImagePreview} alt="Featured" />
                  <button className="remove-image-btn" onClick={e => { e.stopPropagation(); setFeaturedImage(null); setFeaturedImagePreview(null); setUploadStatuses({}) }}>×</button>
                </>
              ) : (
                <div className="featured-image-placeholder">
                  <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd"/></svg>
                  <span>Click to upload image</span>
                </div>
              )}
            </div>
            <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleImageSelect} />

            {/* Pixabay finder */}
            {settings?.pixabayApiKey ? (
              <div style={{ marginTop: 8 }}>
                <button
                  style={{ width: '100%', padding: '6px 0', fontSize: 11, fontWeight: 700, background: 'transparent', border: '1px dashed var(--border)', borderRadius: 7, cursor: 'pointer', color: 'var(--text-secondary)' }}
                  onClick={() => { setPixabayOpen(v => !v); if (!pixabayQuery && title) setPixabayQuery(title.replace(/<[^>]+>/g,'').slice(0,40)) }}
                >
                  🔍 Find image on Pixabay
                </button>
                {pixabayOpen && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input
                        style={{ flex: 1, padding: '5px 8px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                        value={pixabayQuery}
                        onChange={e => setPixabayQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && searchPixabay()}
                        placeholder="Search Pixabay…"
                      />
                      <button
                        style={{ padding: '5px 10px', fontSize: 11, fontWeight: 700, background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                        onClick={searchPixabay}
                        disabled={pixabayLoading}
                      >
                        {pixabayLoading ? '…' : 'Go'}
                      </button>
                    </div>
                    {pixabayResults.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginTop: 6 }}>
                        {pixabayResults.map(hit => (
                          <button
                            key={hit.id}
                            style={{ padding: 0, border: '2px solid transparent', borderRadius: 6, overflow: 'hidden', cursor: 'pointer', background: 'none' }}
                            onClick={() => pickPixabayImage(hit)}
                            title={hit.tags}
                          >
                            <img src={hit.previewURL} alt={hit.tags} style={{ width: '100%', height: 52, objectFit: 'cover', display: 'block' }} />
                          </button>
                        ))}
                      </div>
                    )}
                    {pixabayResults.length === 0 && !pixabayLoading && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>Search to find free stock photos.</div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Add a Pixabay API key in Settings to auto-find images.</div>
            )}

            {featuredImage && selectedSites.map(sid => {
              const st = uploadStatuses[sid]
              const site = sites.find(s => s.id === sid)
              if (!st) return null
              return (
                <div key={sid} className={`upload-status ${st}`}>
                  {site?.name}: {st === 'uploading' ? 'Uploading…' : st === 'done' ? '✓ Uploaded' : '✗ Failed'}
                </div>
              )
            })}
          </div>

          {/* Pre-Publish Compliance Checklist */}
          <ComplianceChecklist
            title={title}
            content={content}
            categories={selectedCategoryIds.length > 0 ? selectedCategoryIds.join(',') : categories}
            featuredImage={featuredImagePreview}
            seo={seo}
            selectedSites={selectedSites}
          />

          {/* Publish actions */}
          <div className="panel-section">
            <div className="publish-buttons">
              <button className="btn btn-primary" onClick={() => handlePublish(postStatus)} disabled={publishing || savingDraft}>
                {publishing ? 'Publishing…' : scheduleDate ? 'Schedule Post' : postStatus === 'draft' ? 'Save Draft' : 'Publish Now'}
              </button>
              <button className="btn btn-secondary" onClick={() => handlePublish('draft')} disabled={savingDraft || publishing}>
                {savingDraft ? 'Saving…' : 'Save as Draft'}
              </button>
            </div>
          </div>
        </>}

        {/* ── AI TAB ── */}
        {panelTab === 'ai' && (
          <div className="panel-tab-content">
            <div className="panel-section">
              <div className="panel-section-title">AI Write</div>
              <button
                className="btn btn-primary btn-sm"
                style={{ width: '100%', marginBottom: 8 }}
                onClick={() => setShowAIWrite(v => !v)}
              >
                {showAIWrite ? '✕ Close AI Write' : '✨ Open AI Write'}
              </button>
              {showAIWrite && (
                <AIWritePanel
                  onUseDraft={({ title: draftTitle, content: draftContent, keyword }) => {
                    // This replaces the whole title/content outright with no
                    // editor undo-history guarantee — confirm first if there's
                    // actually existing work it would wipe out (a fresh blank
                    // post has nothing to lose, so don't nag there).
                    const hasExistingWork = title.trim() || content.trim()
                    if (hasExistingWork && !window.confirm('Replace your current title and content with this AI draft? This cannot be undone.')) return
                    if (draftTitle) setTitle(draftTitle)
                    if (draftContent) { setContent(draftContent); editorRef.current?.setContent(draftContent) }
                    if (keyword) setSeo(prev => ({ ...prev, focusKeyword: keyword }))
                    setShowAIWrite(false)
                  }}
                  onClose={() => setShowAIWrite(false)}
                />
              )}
            </div>

            <div className="panel-section">
              <div className="panel-section-title">Humanizer</div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                Rewrites your content to remove AI patterns and sound more natural.
              </p>
              <button
                className="btn btn-secondary btn-sm"
                style={{ width: '100%' }}
                onClick={humanizeContent}
                disabled={humanizeLoading}
              >
                {humanizeLoading ? '⟳ Humanizing…' : '🧠 Humanize Content'}
              </button>
              {humanizeError && <div className="panel-msg panel-msg-error">{humanizeError}</div>}
              {humanizeResult && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Preview:</div>
                  <div style={{ fontSize: 11, color: 'var(--text-primary)', background: 'var(--bg-secondary)', borderRadius: 6, padding: 8, maxHeight: 120, overflow: 'auto', lineHeight: 1.5 }}>
                    {humanizeResult.replace(/<[^>]+>/g, ' ').trim().slice(0, 300)}…
                  </div>
                  <button className="btn btn-primary btn-sm" style={{ width: '100%', marginTop: 8 }} onClick={applyHumanized}>
                    ✓ Apply to Editor
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: 4 }} onClick={() => setHumanizeResult('')}>
                    Discard
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SEO TAB ── */}
        {panelTab === 'seo' && (
          <div className="panel-tab-content">
            <div className="panel-section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span className="panel-section-title" style={{ margin: 0 }}>SEO Score</span>
                <span style={{ fontWeight: 800, color: scoreColor, background: scoreColor + '20', padding: '3px 10px', borderRadius: 99, fontSize: 13 }}>{seoScore}%</span>
              </div>
              {autoFillMsg && (
                <div className={`panel-msg${autoFillMsg.startsWith('Error') ? ' panel-msg-error' : ' panel-msg-success'}`}>{autoFillMsg}</div>
              )}
              <button
                className="btn btn-primary btn-sm"
                style={{ width: '100%', marginBottom: 4 }}
                onClick={autoFillSEO}
                disabled={autoFillLoading}
              >
                {autoFillLoading ? '⟳ Auto-filling…' : '✦ Auto-fill SEO with AI'}
              </button>
            </div>
            <RankMathPanel title={title} content={content} seo={seo} onChange={setSeo} siteUrl={firstSelectedSite?.url} />
          </div>
        )}

        {/* ── LINKS TAB ── */}
        {panelTab === 'links' && (
          <div className="panel-tab-content">
            <div className="panel-section">
              <div className="panel-section-title">Internal Links</div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                Insert "Read More" or "Also Read" paragraphs at the end of your post to boost time-on-site and SEO.
              </p>
            </div>
            <InternalLinksParagraph
              content={content}
              siteId={selectedSites[0] || null}
              sites={sites}
              allPosts={allPosts}
              editorRef={editorRef}
            />
          </div>
        )}

        {/* ── SOCIAL TAB ── */}
        {panelTab === 'social' && (
          <div className="panel-tab-content">
            <div className="panel-section">
              <div className="panel-section-title">Social Media Posts</div>
              <div className="social-platform-tabs">
                {SOCIAL_PLATFORMS.map(p => (
                  <button
                    key={p.key}
                    className={`social-platform-tab${socialPlatform === p.key ? ' active' : ''}`}
                    style={{ '--platform-color': p.color }}
                    onClick={() => setSocialPlatform(p.key)}
                  >
                    <span className="spt-icon">{p.icon}</span>
                    <span className="spt-label">{p.label}</span>
                  </button>
                ))}
              </div>
              <button
                className="btn btn-primary btn-sm"
                style={{ width: '100%', marginTop: 10 }}
                onClick={() => generateSocial(socialPlatform)}
                disabled={socialLoading || !settings?.geminiApiKey || !content}
              >
                {socialLoading ? '⟳ Generating…' : `✨ Generate ${SOCIAL_PLATFORMS.find(p => p.key === socialPlatform)?.label} Post`}
              </button>
              {!settings?.geminiApiKey && (
                <div className="panel-msg panel-msg-error">Add Gemini key in Settings to use AI.</div>
              )}
              {socialOutputs[socialPlatform] && (
                <div style={{ marginTop: 12 }}>
                  <textarea
                    className="social-output-textarea"
                    value={socialOutputs[socialPlatform]}
                    onChange={e => setSocialOutputs(prev => ({ ...prev, [socialPlatform]: e.target.value }))}
                    rows={10}
                  />
                  <div className="social-char-count">
                    {socialOutputs[socialPlatform].length} / {SOCIAL_PLATFORMS.find(p => p.key === socialPlatform)?.limit} chars
                  </div>
                  <div className="social-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => copySocial(socialPlatform)}>
                      {socialCopied === socialPlatform ? '✓ Copied!' : '📋 Copy'}
                    </button>
                    {publishedLink && (
                      <button className="btn btn-primary btn-sm" onClick={() => openSocialPost(socialPlatform)}>
                        🚀 Open to Post
                      </button>
                    )}
                  </div>
                  {!publishedLink && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
                      Publish your post first to enable "Open to Post"
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        </div>{/* end post-panel */}
      </div>{/* end create-post-body */}
    </div>
  )
}

/* ── Internal Links — Paragraph Style (for Links Tab) ── */
function InternalLinksParagraph({ content, siteId, sites, allPosts, editorRef }) {
  const [inserted, setInserted] = useState({})
  const [linkStyle, setLinkStyle] = useState('read-more')

  const site = sites.find(s => s.id === siteId)
  if (!siteId || !site) {
    return (
      <div className="panel-section">
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Select a site to see link suggestions.</div>
      </div>
    )
  }

  const plainContent = content.replace(/<[^>]+>/g, ' ')
  const contentWordSet = new Set(ilWords(plainContent))
  const sitePosts = allPosts.filter(p => p.siteId === siteId && p.wpLink && p.wpPostId)

  const suggestions = sitePosts
    .map(p => {
      const rawTitle = p.title?.replace(/<[^>]+>/g, '') || ''
      const tWords = ilWords(rawTitle)
      const score = ilScore(tWords, contentWordSet)
      return { post: p, rawTitle, score }
    })
    .filter(s => s.score >= 0.3 && !isAlreadyLinked(s.post.wpLink, content))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)

  const handleInsert = (s) => {
    if (!editorRef?.current) return
    const label = linkStyle === 'read-more' ? 'Read More' : 'Also Read'
    editorRef.current.insertParagraphLink(label, s.rawTitle, s.post.wpLink)
    setInserted(prev => ({ ...prev, [s.post.localId]: true }))
    setTimeout(() => setInserted(prev => { const n = { ...prev }; delete n[s.post.localId]; return n }), 3000)
  }

  const handleAutoLink = (s) => {
    if (!editorRef?.current) return
    const anchor = findAnchorPhrase(s.rawTitle, plainContent) || s.rawTitle
    const success = editorRef.current.autoLinkPhrase(anchor, s.post.wpLink)
    if (!success) editorRef.current.insertAtCursor(s.rawTitle, s.post.wpLink)
    setInserted(prev => ({ ...prev, [s.post.localId + '-auto']: true }))
    setTimeout(() => setInserted(prev => { const n = { ...prev }; delete n[s.post.localId + '-auto']; return n }), 3000)
  }

  return (
    <div className="panel-section">
      {/* Style toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {['read-more', 'also-read'].map(s => (
          <button
            key={s}
            className={`link-style-btn${linkStyle === s ? ' active' : ''}`}
            onClick={() => setLinkStyle(s)}
          >
            {s === 'read-more' ? '📖 Read More' : '👉 Also Read'}
          </button>
        ))}
      </div>

      {plainContent.trim().length < 100 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Write more content to see suggestions.</div>
      )}
      {plainContent.trim().length >= 100 && suggestions.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {sitePosts.length === 0
            ? 'Sync your site first to see link suggestions.'
            : 'No relevant posts found. All may already be linked.'}
        </div>
      )}

      {suggestions.map(s => {
        const pct = Math.round(s.score * 100)
        const color = pct >= 70 ? '#16a34a' : pct >= 50 ? '#d97706' : '#6366f1'
        const doneP = inserted[s.post.localId]
        const doneA = inserted[s.post.localId + '-auto']
        return (
          <div key={s.post.localId} className="il-suggestion">
            <div className="il-suggestion-title">
              <span dangerouslySetInnerHTML={{ __html: s.post.title || s.rawTitle }} />
              <span className="il-score-badge" style={{ color, background: color + '18' }}>{pct}%</span>
            </div>
            <div className="il-suggestion-actions">
              <button
                className="il-action-btn"
                onClick={() => handleInsert(s)}
                disabled={doneP}
              >
                {doneP ? '✓ Added' : `+ ${linkStyle === 'read-more' ? 'Read More' : 'Also Read'}`}
              </button>
              <button
                className="il-action-btn il-action-secondary"
                onClick={() => handleAutoLink(s)}
                disabled={doneA}
              >
                {doneA ? '✓ Linked' : 'Auto-link'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
