import React, { useMemo } from 'react'
import './RankMathPanel.css'

const TITLE_MIN = 50
const TITLE_MAX = 60
const DESC_MIN = 120
const DESC_MAX = 160

function scoreColor(score) {
  if (score >= 80) return '#10b981'
  if (score >= 50) return '#f59e0b'
  return '#ef4444'
}

function scoreGrade(score) {
  if (score >= 80) return 'Good — Ready to publish'
  if (score >= 50) return 'Needs improvement'
  return 'Poor — Add more SEO details'
}

function CharCount({ value, min, max }) {
  const len = value.length
  const cls = len === 0 ? 'info' : len > max ? 'over' : len < min ? 'low' : 'ok'
  return (
    <span className={`rm-char-count ${cls}`}>
      {len}/{max}
    </span>
  )
}

function Check({ pass, warn, text }) {
  const cls = pass ? 'pass' : warn ? 'warn' : 'fail'
  const icon = pass
    ? <svg className="rm-check-icon" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
    : warn
      ? <svg className="rm-check-icon" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
      : <svg className="rm-check-icon" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/></svg>
  return <div className={`rm-check ${cls}`}>{icon}{text}</div>
}

export default function RankMathPanel({ title, content, seo, onChange, siteUrl }) {
  const { focusKeyword, seoTitle, metaDesc, noindex, nofollow } = seo

  const plainContent = useMemo(() => content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(), [content])
  const wordCount = plainContent.split(/\s+/).filter(Boolean).length
  const kw = focusKeyword.toLowerCase().trim()

  // Run checks
  const checks = useMemo(() => {
    const list = []
    if (!kw) {
      list.push({ id: 'kw', pass: false, text: 'Focus keyword not set' })
    } else {
      const kwInTitle = title.toLowerCase().includes(kw)
      const kwInDesc = metaDesc.toLowerCase().includes(kw)
      const kwInContent = plainContent.toLowerCase().includes(kw)
      const kwInFirst100 = plainContent.toLowerCase().slice(0, 300).includes(kw)
      list.push({ id: 'kwTitle', pass: kwInTitle, text: kwInTitle ? `Focus keyword in title ✓` : `Add "${focusKeyword}" to the title` })
      list.push({ id: 'kwDesc', pass: kwInDesc, text: kwInDesc ? `Focus keyword in meta description ✓` : `Add "${focusKeyword}" to meta description` })
      list.push({ id: 'kwContent', pass: kwInContent, text: kwInContent ? 'Focus keyword used in content ✓' : 'Focus keyword not found in content' })
      list.push({ id: 'kwFirst', pass: kwInFirst100, warn: kwInContent && !kwInFirst100, text: kwInFirst100 ? 'Keyword appears early in content ✓' : 'Use keyword in the first paragraph' })
    }

    // Title checks
    const tLen = seoTitle.length || title.length
    list.push({ id: 'titleLen', pass: tLen >= TITLE_MIN && tLen <= TITLE_MAX, warn: tLen > 0 && tLen < TITLE_MIN, text: tLen === 0 ? 'SEO title not set' : tLen < TITLE_MIN ? `SEO title too short (${tLen} chars, aim for ${TITLE_MIN}–${TITLE_MAX})` : tLen > TITLE_MAX ? `SEO title too long (${tLen} chars, max ${TITLE_MAX})` : `SEO title length is good (${tLen} chars) ✓` })

    // Desc checks
    const dLen = metaDesc.length
    list.push({ id: 'descLen', pass: dLen >= DESC_MIN && dLen <= DESC_MAX, warn: dLen > 0 && dLen < DESC_MIN, text: dLen === 0 ? 'Meta description not set' : dLen < DESC_MIN ? `Meta description too short (${dLen} chars, aim for ${DESC_MIN}–${DESC_MAX})` : dLen > DESC_MAX ? `Meta description too long (${dLen} chars, max ${DESC_MAX})` : `Meta description length good (${dLen} chars) ✓` })

    // Content length
    list.push({ id: 'wordCount', pass: wordCount >= 600, warn: wordCount >= 300 && wordCount < 600, text: wordCount < 300 ? `Content too short (${wordCount} words — aim for 600+)` : wordCount < 600 ? `Content could be longer (${wordCount} words — aim for 600+)` : `Content length good (${wordCount} words) ✓` })

    return list
  }, [kw, title, metaDesc, seoTitle, plainContent, wordCount, focusKeyword])

  // Score: each passing check is worth points
  const score = useMemo(() => {
    if (checks.length === 0) return 0
    const passed = checks.filter(c => c.pass).length
    return Math.round((passed / checks.length) * 100)
  }, [checks])

  const color = scoreColor(score)
  const displayTitle = seoTitle || title || 'Post title'
  const displayDesc = metaDesc || 'No meta description set — add one to improve click-through rate.'
  const displayUrl = siteUrl ? siteUrl.replace(/https?:\/\//, '') + '/post-slug' : 'example.com/post-slug'

  return (
    <div className="rm-panel">
      {/* Score */}
      <div className="rm-score-bar">
        <div className="rm-score-circle" style={{ background: color }}>{score}</div>
        <div className="rm-score-info">
          <div className="rm-score-label">SEO Score</div>
          <div className="rm-score-grade" style={{ color }}>{scoreGrade(score)}</div>
          <div className="rm-score-track">
            <div className="rm-score-fill" style={{ width: `${score}%`, background: color }} />
          </div>
        </div>
      </div>

      {/* Checks */}
      <div className="rm-checks">
        {checks.map(c => <Check key={c.id} pass={c.pass} warn={c.warn} text={c.text} />)}
      </div>

      {/* Focus Keyword */}
      <div className="rm-field">
        <div className="rm-field-label">
          <span>Focus Keyword</span>
        </div>
        <input
          className="rm-input"
          placeholder="e.g. chicken skewers recipe"
          value={focusKeyword}
          onChange={e => onChange({ ...seo, focusKeyword: e.target.value })}
        />
      </div>

      {/* SEO Title */}
      <div className="rm-field">
        <div className="rm-field-label">
          <span>SEO Title</span>
          <CharCount value={seoTitle} min={TITLE_MIN} max={TITLE_MAX} />
        </div>
        <input
          className="rm-input"
          placeholder={title || 'SEO title (defaults to post title)'}
          value={seoTitle}
          onChange={e => onChange({ ...seo, seoTitle: e.target.value })}
        />
      </div>

      {/* Meta Description */}
      <div className="rm-field">
        <div className="rm-field-label">
          <span>Meta Description</span>
          <CharCount value={metaDesc} min={DESC_MIN} max={DESC_MAX} />
        </div>
        <textarea
          className="rm-input"
          rows={3}
          placeholder="Write a compelling description for search results…"
          value={metaDesc}
          onChange={e => onChange({ ...seo, metaDesc: e.target.value })}
        />
      </div>

      {/* Google Preview */}
      <div className="rm-field">
        <div className="rm-field-label"><span>Google Preview</span></div>
        <div className="rm-preview">
          <div className="rm-preview-url">{displayUrl}</div>
          <div className="rm-preview-title">{displayTitle}</div>
          <div className="rm-preview-desc">{displayDesc}</div>
        </div>
      </div>

      {/* Robots */}
      <div className="rm-field">
        <div className="rm-field-label"><span>Robots Meta</span></div>
        <div className="rm-robots">
          {[
            { key: 'noindex', label: 'No Index' },
            { key: 'nofollow', label: 'No Follow' },
          ].map(({ key, label }) => (
            <label key={key} className={`rm-robot-toggle ${seo[key] ? 'active' : ''}`}>
              <input type="checkbox" checked={!!seo[key]} onChange={e => onChange({ ...seo, [key]: e.target.checked })} />
              {label}
            </label>
          ))}
          <span style={{ fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center' }}>
            {seo.noindex ? '⚠ Page hidden from Google' : '✓ Indexable'}
          </span>
        </div>
      </div>
    </div>
  )
}
