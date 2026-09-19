import React, { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import './ArticleExporter.css'

const STATUS_OPTIONS = [
  { value: 'publish', label: 'Published articles' },
  { value: 'draft', label: 'Draft articles' },
  { value: 'all', label: 'All written articles' },
]

function authHeader(site) {
  return 'Basic ' + btoa(`${site.username}:${site.password}`)
}

function decodeHtml(value = '') {
  const el = document.createElement('textarea')
  el.innerHTML = value
  return el.value.replace(/<[^>]+>/g, '').trim()
}

function plainText(value = '') {
  const el = document.createElement('div')
  el.innerHTML = value
  return (el.textContent || '').replace(/\s+/g, ' ').trim()
}

function safeSlug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function sheetName(value) {
  const cleaned = value.replace(/[\\/?*[\]:]/g, '').trim()
  return (cleaned || 'Site').slice(0, 31)
}

async function fetchAllCategories(site) {
  const map = new Map()
  for (let page = 1; page <= 20; page++) {
    const query = new URLSearchParams({ per_page: 100, page, _fields: 'id,name' })
    const response = await fetch(`${site.url}/wp-json/wp/v2/categories?${query}`, {
      headers: { Authorization: authHeader(site) },
    })
    if (!response.ok) break
    const batch = await response.json()
    batch.forEach(category => map.set(category.id, decodeHtml(category.name)))
    const totalPages = Number(response.headers.get('X-WP-TotalPages') || 1)
    if (page >= totalPages) break
  }
  return map
}

async function fetchAllArticles(site, status) {
  const categories = await fetchAllCategories(site)
  const articles = []
  const wpStatus = status === 'all' ? 'publish,draft,future,pending,private' : status

  for (let page = 1; page <= 50; page++) {
    const query = new URLSearchParams({
      per_page: 100,
      page,
      status: wpStatus,
      orderby: 'date',
      order: 'desc',
      _fields: 'id,title,status,date,modified,link,slug,categories,content',
    })
    const response = await fetch(`${site.url}/wp-json/wp/v2/posts?${query}`, {
      headers: { Authorization: authHeader(site) },
    })
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}))
      throw new Error(detail.message || `WordPress returned HTTP ${response.status}`)
    }

    const batch = await response.json()
    batch.forEach(post => {
      const text = plainText(post.content?.rendered || post.content?.raw || '')
      articles.push({
        id: post.id,
        title: decodeHtml(post.title?.rendered || post.title?.raw || '(Untitled)'),
        status: post.status,
        publishedDate: post.date ? post.date.slice(0, 10) : '',
        modifiedDate: post.modified ? post.modified.slice(0, 10) : '',
        categories: (post.categories || []).map(id => categories.get(id) || `Category ${id}`).join(', '),
        wordCount: text ? text.split(/\s+/).length : 0,
        slug: post.slug || '',
        url: post.link || '',
      })
    })

    const totalPages = Number(response.headers.get('X-WP-TotalPages') || 1)
    if (page >= totalPages || batch.length === 0) break
  }

  return articles
}

function localArticles(posts, siteId, status) {
  return posts
    .filter(post => post.siteId === siteId && (status === 'all' || post.status === status))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .map(post => {
      const text = plainText(post.content || '')
      return {
        id: post.wpPostId || '',
        title: decodeHtml(post.title || '(Untitled)'),
        status: post.status || 'draft',
        publishedDate: post.createdAt ? post.createdAt.slice(0, 10) : '',
        modifiedDate: '',
        categories: Array.isArray(post.categories) ? post.categories.join(', ') : '',
        wordCount: text ? text.split(/\s+/).length : 0,
        slug: '',
        url: post.wpLink || '',
      }
    })
}

function articleColumns(withWebsite) {
  return [
    { header: '#', key: 'number', width: 7 },
    ...(withWebsite ? [{ header: 'Website', key: 'website', width: 22 }] : []),
    { header: 'Article Title', key: 'title', width: 58 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Published Date', key: 'publishedDate', width: 17 },
    { header: 'Modified Date', key: 'modifiedDate', width: 17 },
    { header: 'Categories', key: 'categories', width: 34 },
    { header: 'Word Count', key: 'wordCount', width: 14 },
    { header: 'WordPress ID', key: 'id', width: 15 },
    { header: 'Slug', key: 'slug', width: 34 },
    { header: 'Article URL', key: 'url', width: 62 },
  ]
}

function styleArticleSheet(sheet, lastColLetter) {
  sheet.autoFilter = { from: 'A1', to: `${lastColLetter}1` }
  const header = sheet.getRow(1)
  header.height = 26
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }
  header.alignment = { vertical: 'middle', horizontal: 'center' }

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    row.height = 22
    row.alignment = { vertical: 'middle', wrapText: false }
    if (rowNumber % 2 === 0) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
    }
    const urlCell = row.getCell('url')
    if (urlCell.value) {
      urlCell.value = { text: String(urlCell.value), hyperlink: String(urlCell.value) }
      urlCell.font = { color: { argb: 'FF2563EB' }, underline: true }
    }
  })
}

async function downloadWorkbook({ scope, statusLabel, results }) {
  const excelModule = await import('exceljs')
  const ExcelJS = excelModule.default || excelModule
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ChloeTrap'
  workbook.created = new Date()
  workbook.subject = scope === 'all' ? `${statusLabel} across all websites` : `${statusLabel} for ${results[0].site.name}`

  const allArticles = results.flatMap(r => r.articles)

  const summary = workbook.addWorksheet('Summary', { views: [{ showGridLines: false }] })
  summary.columns = [{ width: 26 }, { width: 54 }]

  if (scope === 'all') {
    summary.addRows([
      ['Export type', `${statusLabel} — All Websites`],
      ['Websites included', results.length],
      ['Total articles', allArticles.length],
      ['Published', allArticles.filter(article => article.status === 'publish').length],
      ['Drafts', allArticles.filter(article => article.status === 'draft').length],
      ['Exported on', new Date().toLocaleString('en-IN')],
      [],
      ['Website', 'Articles'],
    ])
    results.forEach(r => summary.addRow([r.site.name, r.articles.length]))
  } else {
    const site = results[0].site
    summary.addRows([
      ['Website', site.name],
      ['Website URL', site.url],
      ['Export type', statusLabel],
      ['Total articles', allArticles.length],
      ['Published', allArticles.filter(article => article.status === 'publish').length],
      ['Drafts', allArticles.filter(article => article.status === 'draft').length],
      ['Exported on', new Date().toLocaleString('en-IN')],
    ])
  }
  summary.getColumn(1).font = { bold: true, color: { argb: 'FF1E293B' } }
  summary.getColumn(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
  summary.eachRow(row => {
    row.height = 22
    row.alignment = { vertical: 'middle' }
  })

  if (scope === 'all') {
    const allSheet = workbook.addWorksheet('All Posts', {
      views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    })
    allSheet.columns = articleColumns(true)
    let counter = 1
    results.forEach(r => r.articles.forEach(article => {
      allSheet.addRow({ number: counter++, website: r.site.name, ...article })
    }))
    styleArticleSheet(allSheet, 'K')

    const usedNames = new Set(['Summary', 'All Posts'])
    results.forEach(r => {
      let name = sheetName(r.site.name)
      while (usedNames.has(name)) name = sheetName(`${name}_`)
      usedNames.add(name)
      const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] })
      sheet.columns = articleColumns(false)
      r.articles.forEach((article, index) => sheet.addRow({ number: index + 1, ...article }))
      styleArticleSheet(sheet, 'J')
    })
  } else {
    const sheet = workbook.addWorksheet('Articles', {
      views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    })
    sheet.columns = articleColumns(false)
    results[0].articles.forEach((article, index) => sheet.addRow({ number: index + 1, ...article }))
    styleArticleSheet(sheet, 'J')
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  const namePart = scope === 'all' ? 'all-websites' : safeSlug(results[0].site.name)
  link.download = `${namePart}-written-articles-${new Date().toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default function ArticleExporter() {
  const { sites, posts } = useApp()
  const [selectedSiteId, setSelectedSiteId] = useState(sites[0]?.id || '')
  const [status, setStatus] = useState('publish')
  const [results, setResults] = useState(null) // [{ site, articles, source }]
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [exporting, setExporting] = useState(false)
  const [message, setMessage] = useState('')

  const scope = selectedSiteId === 'all' ? 'all' : 'selected'
  const selectedSite = sites.find(site => site.id === selectedSiteId)
  const statusLabel = STATUS_OPTIONS.find(option => option.value === status)?.label || 'Articles'
  const connected = Boolean(selectedSite?.connected && selectedSite?.username && selectedSite?.password)

  const allArticles = useMemo(() => results ? results.flatMap(r => r.articles) : [], [results])
  const preview = useMemo(() => allArticles.slice(0, 8), [allArticles])

  const reset = () => { setResults([]); setResults(null); setMessage('') }

  const loadArticles = async () => {
    setLoading(true)
    setMessage('')
    setResults(null)
    try {
      const targets = scope === 'all' ? sites : (selectedSite ? [selectedSite] : [])
      const out = []
      for (const site of targets) {
        setProgress(`Loading ${site.name}…`)
        const siteConnected = Boolean(site.connected && site.username && site.password)
        const articles = siteConnected
          ? await fetchAllArticles(site, status)
          : localArticles(posts, site.id, status)
        out.push({ site, articles, source: siteConnected ? 'Live WordPress data' : 'ChloeTrap synced data' })
      }
      setResults(out)
      const total = out.reduce((sum, r) => sum + r.articles.length, 0)
      setMessage(scope === 'all'
        ? `${total} article${total === 1 ? '' : 's'} loaded across ${out.length} website${out.length === 1 ? '' : 's'}.`
        : (out[0]?.articles.length
          ? `${out[0].articles.length} article${out[0].articles.length === 1 ? '' : 's'} loaded from ${out[0].site.name}.`
          : 'No synced articles found. Connect this website in Site Manager and try again.'))
    } catch (error) {
      setMessage(error.message || 'Could not load articles from WordPress.')
    } finally {
      setLoading(false)
      setProgress('')
    }
  }

  const exportExcel = async () => {
    if (!results || allArticles.length === 0) return
    setExporting(true)
    setMessage('Creating Excel workbook...')
    try {
      await downloadWorkbook({ scope, statusLabel, results })
      setMessage(`Excel file downloaded with ${allArticles.length} articles.`)
    } catch (error) {
      setMessage(error.message || 'Could not create the Excel file.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="ae-screen">
      <div className="ae-header">
        <div>
          <h1>Posts &amp; Articles Report</h1>
          <p className="page-subtitle">Export written posts — with title, status, dates, categories and word count — from one website or every website, into a formatted Excel workbook.</p>
        </div>
      </div>

      <div className="ae-panel">
        <div className="ae-controls">
          <label>
            <span>Website</span>
            <select value={selectedSiteId} onChange={event => { setSelectedSiteId(event.target.value); setResults(null); setMessage('') }}>
              <option value="all">🌐 All Websites ({sites.length})</option>
              {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
          </label>
          <label>
            <span>Articles to export</span>
            <select value={status} onChange={event => { setStatus(event.target.value); setResults(null); setMessage('') }}>
              {STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <button className="btn btn-secondary" onClick={loadArticles} disabled={loading}>
            {loading ? (progress || 'Loading articles...') : 'Load Articles'}
          </button>
          <button className="btn btn-primary" onClick={exportExcel} disabled={exporting || allArticles.length === 0}>
            {exporting ? 'Creating Excel...' : 'Download Excel (.xlsx)'}
          </button>
        </div>

        {scope === 'selected' ? (
          <div className={`ae-connection ${connected ? 'connected' : 'local'}`}>
            <span className="ae-dot" />
            {connected
              ? `Connected to ${selectedSite?.name}. Articles will be fetched live from WordPress.`
              : 'Website is not connected. The exporter will use articles already synced into ChloeTrap.'}
          </div>
        ) : (
          <div className="ae-connection connected">
            <span className="ae-dot" />
            All {sites.length} websites will be included — connected sites are fetched live, others use ChloeTrap synced data.
          </div>
        )}

        {message && <div className="ae-message">{message}</div>}
      </div>

      {results && allArticles.length > 0 && (
        <>
          <div className="ae-stats">
            <div><strong>{allArticles.length}</strong><span>Total loaded</span></div>
            <div><strong>{allArticles.filter(article => article.status === 'publish').length}</strong><span>Published</span></div>
            <div><strong>{allArticles.filter(article => article.status === 'draft').length}</strong><span>Drafts</span></div>
            <div><strong>{allArticles.reduce((sum, article) => sum + article.wordCount, 0).toLocaleString()}</strong><span>Total words</span></div>
          </div>

          {scope === 'all' && (
            <div className="ae-site-breakdown">
              {results.map(r => (
                <div key={r.site.id} className="ae-site-row">
                  <strong>{r.site.name}</strong>
                  <span>{r.articles.length} article{r.articles.length === 1 ? '' : 's'}</span>
                  <span className={`ae-source-badge ${r.source.startsWith('Live') ? 'live' : 'local'}`}>{r.source}</span>
                </div>
              ))}
            </div>
          )}

          <div className="ae-table-card">
            <div className="ae-table-head">
              <div>
                <strong>Workbook preview</strong>
                <span>showing {preview.length} of {allArticles.length}{scope === 'all' ? ' (one sheet per website will be included in the download)' : ''}</span>
              </div>
            </div>
            <div className="ae-table-wrap">
              <table>
                <thead><tr><th>#</th>{scope === 'all' && <th>Website</th>}<th>Title</th><th>Status</th><th>Date</th><th>Categories</th><th>Words</th></tr></thead>
                <tbody>
                  {(scope === 'all'
                    ? results.flatMap(r => r.articles.map(article => ({ ...article, websiteName: r.site.name })))
                    : preview
                  ).slice(0, 8).map((article, index) => (
                    <tr key={`${article.id}-${index}`}>
                      <td>{index + 1}</td>
                      {scope === 'all' && <td>{article.websiteName}</td>}
                      <td>{article.title}</td>
                      <td><span className={`ae-status ${article.status}`}>{article.status}</span></td>
                      <td>{article.publishedDate || '-'}</td>
                      <td>{article.categories || '-'}</td>
                      <td>{article.wordCount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
