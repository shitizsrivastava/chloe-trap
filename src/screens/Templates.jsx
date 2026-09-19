import React, { useState } from 'react'
import { useApp } from '../context/AppContext'
import './Templates.css'

export default function Templates({ navigate }) {
  const { templates, addTemplate, deleteTemplate } = useApp()
  const [creating, setCreating] = useState(false)
  const [name, setName]         = useState('')
  const [desc, setDesc]         = useState('')
  const [title, setTitle]       = useState('')
  const [content, setContent]   = useState('')
  const [categories, setCategories] = useState('')
  const [tags, setTags]         = useState('')

  const handleSave = () => {
    if (!name.trim()) { alert('Template name is required.'); return }
    addTemplate({ name: name.trim(), desc, title, content, categories, tags })
    setCreating(false); setName(''); setDesc(''); setTitle(''); setContent(''); setCategories(''); setTags('')
  }

  const useTemplate = (tpl) => {
    navigate('create', {
      title: tpl.title || '',
      content: tpl.content || '',
      categories: (tpl.categories || '').split(',').map(c => c.trim()).filter(Boolean),
      tags: (tpl.tags || '').split(',').map(t => t.trim()).filter(Boolean),
      status: 'draft',
    })
  }

  return (
    <div className="tpl-screen">
      <div className="tpl-top">
        <div>
          <h1>Post Templates</h1>
          <p>Save skeleton posts and reuse them across all 13 sites</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>+ New Template</button>
      </div>

      {creating && (
        <div className="tpl-create-box">
          <div className="tpl-create-header">
            <span>Create New Template</span>
            <button onClick={() => setCreating(false)}>✕</button>
          </div>
          <div className="tpl-create-body">
            <div className="tpl-row">
              <label>Template Name <span style={{ color: 'var(--error)' }}>*</span></label>
              <input className="tpl-input" placeholder="e.g. Standard News Article" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="tpl-row">
              <label>Description</label>
              <input className="tpl-input" placeholder="What is this template for?" value={desc} onChange={e => setDesc(e.target.value)} />
            </div>
            <div className="tpl-row">
              <label>Default Title</label>
              <input className="tpl-input" placeholder="e.g. [TOPIC]: Everything You Need to Know" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="tpl-row">
              <label>Default Categories (comma separated)</label>
              <input className="tpl-input" placeholder="e.g. News, Analysis" value={categories} onChange={e => setCategories(e.target.value)} />
            </div>
            <div className="tpl-row">
              <label>Default Tags (comma separated)</label>
              <input className="tpl-input" placeholder="e.g. trending, news" value={tags} onChange={e => setTags(e.target.value)} />
            </div>
            <div className="tpl-row">
              <label>Content Skeleton (HTML or plain text)</label>
              <textarea className="tpl-textarea" rows={6}
                placeholder={`<h2>Introduction</h2>\n<p>Write your intro here...</p>\n\n<h2>Main Points</h2>\n<p>...</p>\n\n<h2>Conclusion</h2>\n<p>...</p>`}
                value={content} onChange={e => setContent(e.target.value)} />
            </div>
            <div className="tpl-create-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setCreating(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleSave}>Save Template</button>
            </div>
          </div>
        </div>
      )}

      {templates.length === 0 && !creating ? (
        <div className="tpl-empty">
          <svg width="48" height="48" viewBox="0 0 20 20" fill="currentColor" style={{ color: 'var(--border)' }}><path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"/></svg>
          <p>No templates yet</p>
          <span>Create templates to quickly start new posts with pre-filled structure</span>
          <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => setCreating(true)}>+ Create First Template</button>
        </div>
      ) : (
        <div className="tpl-grid">
          {templates.map(tpl => (
            <div key={tpl.id} className="tpl-card">
              <div className="tpl-card-icon">
                <svg viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"/></svg>
              </div>
              <div className="tpl-card-body">
                <div className="tpl-card-name">{tpl.name}</div>
                {tpl.desc && <div className="tpl-card-desc">{tpl.desc}</div>}
                <div className="tpl-card-meta">
                  {tpl.categories && <span className="tpl-meta-chip">{tpl.categories}</span>}
                  {tpl.tags && <span className="tpl-meta-chip">{tpl.tags}</span>}
                </div>
                {tpl.title && (
                  <div className="tpl-card-preview">Title: <em>{tpl.title}</em></div>
                )}
              </div>
              <div className="tpl-card-actions">
                <button className="btn btn-primary btn-sm" onClick={() => useTemplate(tpl)}>Use Template</button>
                <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm(`Delete "${tpl.name}"?`)) deleteTemplate(tpl.id) }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
