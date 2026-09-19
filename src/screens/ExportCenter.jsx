import React, { useState } from 'react'
import LinkExporter from './LinkExporter'
import ArticleExporter from './ArticleExporter'
import CategoriesExporter from './CategoriesExporter'
import './ExportCenter.css'

const TABS = [
  { key: 'links', label: '🔗 Quick CSV Export', hint: 'Posts, pages & categories as raw links — one site or all sites' },
  { key: 'articles', label: '📝 Posts & Articles Report', hint: 'Full Excel report with status, dates, categories & word count — one site or all sites' },
  { key: 'categories', label: '🗂 Categories Report', hint: 'Every category with slug, parent & post count — one site or all sites' },
]

export default function ExportCenter() {
  const [tab, setTab] = useState('links')

  return (
    <div className="ec-screen">
      <div className="ec-intro">
        <h1>Downloads</h1>
        <p className="page-subtitle">Every way to get your website data out as an Excel/CSV file — pick a tab below.</p>
      </div>
      <div className="ec-tabs">
        {TABS.map(t => (
          <button key={t.key} className={`ec-tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)} title={t.hint}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'links' && <LinkExporter />}
      {tab === 'articles' && <ArticleExporter />}
      {tab === 'categories' && <CategoriesExporter />}
    </div>
  )
}
