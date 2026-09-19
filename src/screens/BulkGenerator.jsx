import React, { useState } from 'react'
import { useApp } from '../context/AppContext'
import { useNotify } from '../context/NotificationContext'
import { callAI } from '../utils/aiCall'
import { createPost } from '../utils/wordpress'
import './BulkGenerator.css'

const TONES = ['Informative', 'Conversational', 'Professional', 'Casual', 'SEO-Optimised']
const LENGTHS = [
  { label: '~600 words',  tokens: 1000 },
  { label: '~1000 words', tokens: 1600 },
  { label: '~1500 words', tokens: 2400 },
  { label: '~2000 words', tokens: 3200 },
]

function buildPrompt(topic, niche, tone, length) {
  return `Write a complete, well-structured blog post for a ${niche} website.

Topic: ${topic}
Tone: ${tone}
Target Length: ${length}

Rules:
- First line: the H1 title only (no "Title:" prefix)
- Then the full HTML content using <h1><h2><h3><p><ul><li><strong><em>
- At least 3 H2 sections
- Include an intro paragraph and conclusion
- Natural, human-sounding writing — vary sentence lengths, use contractions
- Do NOT wrap in \`\`\`html blocks

Output title on line 1, then full HTML content.`
}

function parsePost(raw) {
  const lines = raw.split('\n')
  const titleLine = lines.find(l => l.trim()) || ''
  const title = titleLine.replace(/<[^>]*>/g, '').replace(/^#+\s*/, '').trim()
  const idx = lines.indexOf(lines.find(l => l.trim()))
  const content = lines.slice(idx + 1).join('\n').trim()
  return { title, content }
}

const STATUS = { pending: '⏳', generating: '⟳', saving: '💾', done: '✅', error: '❌' }

export default function BulkGenerator({ navigate }) {
  const { sites, settings, addPost } = useApp()
  const { notifySuccess, notifyError, notifyWarning } = useNotify()
  const connected = sites.filter(s => s.connected)

  const [topicsText,     setTopicsText]     = useState('')
  const [niche,          setNiche]          = useState('')
  const [tone,           setTone]           = useState('Informative')
  const [length,         setLength]         = useState(LENGTHS[1])
  const [selectedSites,  setSelectedSites]  = useState([])
  const [saveToWP,       setSaveToWP]       = useState(true)
  const [running,        setRunning]        = useState(false)
  const [jobs,           setJobs]           = useState([])  // {topic, status, title, error}
  const [current,        setCurrent]        = useState(-1)

  const topics = topicsText.split('\n').map(t => t.trim()).filter(Boolean)

  const toggleSite = id => setSelectedSites(prev =>
    prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])

  const updateJob = (i, patch) =>
    setJobs(prev => prev.map((j, idx) => idx === i ? { ...j, ...patch } : j))

  const run = async () => {
    if (!topics.length) return notifyWarning('Enter at least one topic.')
    if (!niche.trim())  return notifyWarning('Enter the site niche.')
    const hasKey = !!settings.geminiApiKey?.trim()
    if (!hasKey) return notifyWarning('No AI key set. Go to Settings → AI Writing Assistant.')

    const initial = topics.map(t => ({ topic: t, status: 'pending', title: '', content: '', error: '' }))
    setJobs(initial)
    setRunning(true)

    let doneCount = 0
    let errCount = 0

    for (let i = 0; i < topics.length; i++) {
      setCurrent(i)
      updateJob(i, { status: 'generating' })
      try {
        const raw = await callAI(settings, buildPrompt(topics[i], niche, tone, length.label), length.tokens + 500)
        const { title, content } = parsePost(raw)
        updateJob(i, { status: 'saving', title, content })

        if (saveToWP && selectedSites.length > 0) {
          const errors = []
          let savedAny = false
          for (const siteId of selectedSites) {
            const site = sites.find(s => s.id === siteId)
            // A disconnected/unselected-credential site used to just
            // `continue` here with nothing recorded — if every selected site
            // hit this, the job still reported "✅ Done" despite the AI-
            // generated post never being saved anywhere at all, local or
            // remote. Record it as a failure instead of silently skipping.
            if (!site?.connected || !site.username || !site.password) {
              errors.push(`${site?.name || siteId}: not connected — skipped`)
              continue
            }
            const result = await createPost(site, { title, content, status: 'draft', categories: [] })
            if (result.success) {
              addPost({ title, content, status: 'draft', siteId, wpPostId: result.post.id, wpLink: result.post.link })
              savedAny = true
            } else {
              errors.push(`${site.name}: ${result.error}`)
              notifyError(`Failed to save "${title}" to ${site.name}: ${result.error}`, { site: site.name, action: 'Bulk Generate' })
            }
          }
          if (!savedAny || errors.length) {
            errCount++
            updateJob(i, { status: 'error', error: errors.join('; ') || 'Nothing was saved.', title, content })
          } else {
            doneCount++
            updateJob(i, { status: 'done', title, content })
          }
        } else if (selectedSites[0]) {
          addPost({ title, content, status: 'draft', siteId: selectedSites[0] })
          doneCount++
          updateJob(i, { status: 'done', title, content })
        } else {
          // No site selected at all — saving with siteId: '' used to create
          // an orphaned local draft attached to nothing, reported as "done"
          // with no way to find it associated with any site afterward.
          errCount++
          updateJob(i, { status: 'error', error: 'No site selected — nothing was saved.', title, content })
        }
      } catch (e) {
        errCount++
        updateJob(i, { status: 'error', error: e.message })
      }
    }

    setCurrent(-1)
    setRunning(false)
    if (errCount === 0) notifySuccess(`✓ Generated ${doneCount} post${doneCount !== 1 ? 's' : ''} successfully`)
    else if (doneCount > 0) notifyError(`Generated ${doneCount} post(s), but ${errCount} failed — see Error Log`)
    else notifyError(`All ${errCount} post(s) failed to generate — see Error Log`)
  }

  const doneCount  = jobs.filter(j => j.status === 'done').length
  const errorCount = jobs.filter(j => j.status === 'error').length

  return (
    <div className="bg-screen">
      <div className="page-header-row">
        <div>
          <h1>Bulk Post Generator</h1>
          <p className="page-subtitle">Enter multiple topics — AI writes and saves them all as drafts in one go</p>
        </div>
      </div>

      <div className="bg-layout">
        {/* Left: Config */}
        <div className="bg-config">
          <div className="bg-section">
            <label className="bg-label">Topics <span className="bg-req">*</span></label>
            <div className="bg-topic-hint">One topic per line — enter as many as you want</div>
            <textarea
              className="bg-topics-area"
              placeholder={"10 benefits of intermittent fasting\nBest budget travel tips for India\nHow to start a dropshipping business\nTop 5 WordPress SEO plugins 2025"}
              value={topicsText}
              onChange={e => setTopicsText(e.target.value)}
              disabled={running}
            />
            <div className="bg-topic-count">{topics.length} topic{topics.length !== 1 ? 's' : ''} entered</div>
          </div>

          <div className="bg-section">
            <label className="bg-label">Site Niche / Context <span className="bg-req">*</span></label>
            <input className="bg-input" placeholder="e.g. health & wellness blog for men" value={niche} onChange={e => setNiche(e.target.value)} disabled={running} />
          </div>

          <div className="bg-section">
            <label className="bg-label">Tone</label>
            <div className="bg-chips">
              {TONES.map(t => <button key={t} className={`bg-chip${tone === t ? ' active' : ''}`} onClick={() => setTone(t)} disabled={running}>{t}</button>)}
            </div>
          </div>

          <div className="bg-section">
            <label className="bg-label">Target Length</label>
            <div className="bg-chips">
              {LENGTHS.map(l => <button key={l.label} className={`bg-chip${length.label === l.label ? ' active' : ''}`} onClick={() => setLength(l)} disabled={running}>{l.label}</button>)}
            </div>
          </div>

          <div className="bg-section">
            <label className="bg-label">Save as Draft to WordPress</label>
            <div className="bg-toggle-row">
              <label className="toggle">
                <input type="checkbox" checked={saveToWP} onChange={e => setSaveToWP(e.target.checked)} disabled={running} />
                <span className="toggle-slider" />
              </label>
              <span className="bg-toggle-hint">{saveToWP ? 'Will save drafts to selected sites' : 'Save locally only'}</span>
            </div>
          </div>

          {saveToWP && (
            <div className="bg-section">
              <label className="bg-label">Target Sites</label>
              <div className="bg-site-list">
                {connected.length === 0 && <div className="bg-no-sites">No connected sites</div>}
                {connected.map(site => (
                  <label key={site.id} className="bg-site-check">
                    <input type="checkbox" checked={selectedSites.includes(site.id)} onChange={() => toggleSite(site.id)} disabled={running} />
                    <span className="bg-site-dot" style={{ background: site.color }} />
                    <span>{site.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <button
            className="bg-run-btn"
            onClick={run}
            disabled={running || !topics.length || !niche.trim()}
          >
            {running
              ? <><span className="bg-spin">⟳</span> Generating {current + 1}/{topics.length}…</>
              : <>⚡ Generate {topics.length || ''} Post{topics.length !== 1 ? 's' : ''}</>
            }
          </button>
          {running && (
            <div className="bg-progress-bar">
              <div className="bg-progress-fill" style={{ width: `${topics.length ? ((current) / topics.length) * 100 : 0}%` }} />
            </div>
          )}
        </div>

        {/* Right: Results */}
        <div className="bg-results">
          {jobs.length === 0 ? (
            <div className="bg-empty">
              <div className="bg-empty-icon">⚡</div>
              <div>Enter topics on the left and click Generate</div>
              <div className="bg-empty-sub">All posts will appear here as they're created</div>
            </div>
          ) : (
            <>
              <div className="bg-results-header">
                <span>{doneCount}/{jobs.length} done</span>
                {errorCount > 0 && <span className="bg-error-count">{errorCount} failed</span>}
              </div>
              <div className="bg-job-list">
                {jobs.map((job, i) => (
                  <div key={i} className={`bg-job-card bg-job-${job.status}`}>
                    <div className="bg-job-top">
                      <span className="bg-job-icon">{STATUS[job.status]}</span>
                      <div className="bg-job-info">
                        <div className="bg-job-topic">{job.title || job.topic}</div>
                        <div className="bg-job-status-text">
                          {job.status === 'pending'    && 'Waiting…'}
                          {job.status === 'generating' && <><span className="bg-spin">⟳</span> Writing with AI…</>}
                          {job.status === 'saving'     && <><span className="bg-spin">💾</span> Saving to WordPress…</>}
                          {job.status === 'done'       && 'Done — saved as draft'}
                          {job.status === 'error'      && <span style={{color:'#dc2626'}}>{job.error}</span>}
                        </div>
                      </div>
                      {job.status === 'done' && (
                        <button
                          className="bg-edit-btn"
                          onClick={() => navigate('create')}
                        >Edit →</button>
                      )}
                    </div>
                    {i === current && <div className="bg-job-active-bar" />}
                  </div>
                ))}
              </div>
              {!running && doneCount > 0 && (
                <div className="bg-done-banner">
                  🎉 {doneCount} post{doneCount > 1 ? 's' : ''} generated! Go to <button className="bg-link-btn" onClick={() => navigate('drafts')}>Drafts →</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
