import React, { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import './CategoriesExporter.css'

function authHeader(site) {
  return 'Basic ' + btoa(`${site.username}:${site.password}`)
}

function decodeHtml(value = '') {
  const el = document.createElement('textarea')
  el.innerHTML = value
  return el.value.replace(/<[^>]+>/g, '').trim()
}

function safeSlug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function sheetName(value) {
  const cleaned = value.replace(/[\\/?*[\]:]/g, '').trim()
  return (cleaned || 'Site').slice(0, 31)
}

async function fetchCategoriesForSite(site) {
  const byId = new Map()
  for (let page = 1; page <= 20; page++) {
    const query = new URLSearchParams({ per_page: 100, page, _fields: 'id,name,slug,count,parent,link' })
    const response = await fetch(`${site.url}/wp-json/wp/v2/categories?${query}`, {
      headers: { Authorization: authHeader(site) },
    })
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}))
      throw new Error(detail.message || `WordPress returned HTTP ${response.status}`)
    }
    const batch = await response.json()
    batch.forEach(category => byId.set(category.id, category))
    const totalPages = Number(response.headers.get('X-WP-TotalPages') || 1)
    if (page >= totalPages || batch.length === 0) break
  }

  return [...byId.values()]
    .sort((a, b) => b.count - a.count)
    .map(category => ({
      id: category.id,
      name: decodeHtml(category.name),
      slug: category.slug || '',
      parent: category.parent ? (decodeHtml(byId.get(category.parent)?.name) || `Category ${category.parent}`) : '— top level —',
      postCount: category.count || 0,
      url: category.link || '',
    }))
}

function categoryColumns(withWebsite) {
  return [
    { header: '#', key: 'number', width: 6 },
    ...(withWebsite ? [{ header: 'Website', key: 'website', width: 22 }] : []),
    { header: 'Category Name', key: 'name', width: 40 },
    { header: 'Slug', key: 'slug', width: 30 },
    { header: 'Parent Category', key: 'parent', width: 26 },
    { header: 'Post Count', key: 'postCount', width: 13 },
    { header: 'Category URL', key: 'url', width: 60 },
  ]
}

function styleCategorySheet(sheet, lastColLetter) {
  sheet.autoFilter = { from: 'A1', to: `${lastColLetter}1` }
  const header = sheet.getRow(1)
  header.height = 26
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }
  header.alignment = { vertical: 'middle', horizontal: 'center' }

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    row.height = 22
    row.alignment = { vertical: 'middle' }
    if (rowNumber % 2 === 0) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDFA' } }
    }
    const urlCell = row.getCell('url')
    if (urlCell.value) {
      urlCell.value = { text: String(urlCell.value), hyperlink: String(urlCell.value) }
      urlCell.font = { color: { argb: 'FF2563EB' }, underline: true }
    }
  })
}

async function downloadCategoriesWorkbook({ scope, results }) {
  const excelModule = await import('exceljs')
  const ExcelJS = excelModule.default || excelModule
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ChloeTrap'
  workbook.created = new Date()
  workbook.subject = scope === 'all' ? 'Categories across all websites' : `Categories for ${results[0].site.name}`

  const allCategories = results.flatMap(r => r.categories)

  const summary = workbook.addWorksheet('Summary', { views: [{ showGridLines: false }] })
  summary.columns = [{ width: 26 }, { width: 54 }]

  if (scope === 'all') {
    summary.addRows([
      ['Export type', 'Categories — All Websites'],
      ['Websites included', results.length],
      ['Total categories', allCategories.length],
      ['Exported on', new Date().toLocaleString('en-IN')],
      [],
      ['Website', 'Categories'],
    ])
    results.forEach(r => summary.addRow([r.site.name, r.categories.length]))
  } else {
    const site = results[0].site
    summary.addRows([
      ['Website', site.name],
      ['Website URL', site.url],
      ['Export type', 'Categories'],
      ['Total categories', allCategories.length],
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
    const allSheet = workbook.addWorksheet('All Categories', {
      views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    })
    allSheet.columns = categoryColumns(true)
    let counter = 1
    results.forEach(r => r.categories.forEach(category => {
      allSheet.addRow({ number: counter++, website: r.site.name, ...category })
    }))
    styleCategorySheet(allSheet, 'G')

    const usedNames = new Set(['Summary', 'All Categories'])
    results.forEach(r => {
      let name = sheetName(r.site.name)
      while (usedNames.has(name)) name = sheetName(`${name}_`)
      usedNames.add(name)
      const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] })
      sheet.columns = categoryColumns(false)
      r.categories.forEach((category, index) => sheet.addRow({ number: index + 1, ...category }))
      styleCategorySheet(sheet, 'F')
    })
  } else {
    const sheet = workbook.addWorksheet('Categories', {
      views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    })
    sheet.columns = categoryColumns(false)
    results[0].categories.forEach((category, index) => sheet.addRow({ number: index + 1, ...category }))
    styleCategorySheet(sheet, 'F')
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  const namePart = scope === 'all' ? 'all-websites' : safeSlug(results[0].site.name)
  link.download = `${namePart}-categories-${new Date().toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default function CategoriesExporter() {
  const { sites } = useApp()
  const connectedSites = sites.filter(site => site.connected && site.username && site.password)
  const [selectedSiteId, setSelectedSiteId] = useState(connectedSites[0]?.id || 'all')
  const [results, setResults] = useState(null) // [{ site, categories }]
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [exporting, setExporting] = useState(false)
  const [message, setMessage] = useState('')

  const scope = selectedSiteId === 'all' ? 'all' : 'selected'
  const selectedSite = sites.find(site => site.id === selectedSiteId)
  const selectedConnected = Boolean(selectedSite?.connected && selectedSite?.username && selectedSite?.password)

  const allCategories = useMemo(() => results ? results.flatMap(r => r.categories) : [], [results])
  const preview = useMemo(() => allCategories.slice(0, 8), [allCategories])

  const loadCategories = async () => {
    setLoading(true)
    setMessage('')
    setResults(null)
    try {
      const targets = scope === 'all' ? connectedSites : (selectedConnected ? [selectedSite] : [])
      if (targets.length === 0) {
        setMessage(scope === 'all'
          ? 'No connected websites found. Connect at least one website in Site Manager.'
          : `${selectedSite?.name || 'This website'} is not connected. Connect it in Site Manager to export its categories.`)
        return
      }
      // One site failing (offline, revoked password, etc.) must not throw
      // away categories already fetched for every other site in the batch —
      // it used to, so an "All Websites" export was all-or-nothing against
      // the single flakiest site in the list.
      const out = []
      const failed = []
      for (const site of targets) {
        setProgress(`Loading ${site.name}…`)
        try {
          const categories = await fetchCategoriesForSite(site)
          out.push({ site, categories })
        } catch (error) {
          failed.push({ site, error })
        }
      }
      setResults(out)
      const total = out.reduce((sum, r) => sum + r.categories.length, 0)
      const failedNote = failed.length > 0
        ? ` — ${failed.length} website${failed.length === 1 ? '' : 's'} failed: ${failed.map(f => `${f.site.name} (${f.error.message})`).join(', ')}`
        : ''
      setMessage(scope === 'all'
        ? `${total} categor${total === 1 ? 'y' : 'ies'} loaded across ${out.length} website${out.length === 1 ? '' : 's'}.${failedNote}`
        : out.length > 0
          ? `${out[0].categories.length} categor${out[0].categories.length === 1 ? 'y' : 'ies'} loaded from ${out[0].site.name}.`
          : failedNote.replace(/^ — /, ''))
    } catch (error) {
      setMessage(error.message || 'Could not load categories from WordPress.')
    } finally {
      setLoading(false)
      setProgress('')
    }
  }

  const exportExcel = async () => {
    if (!results || allCategories.length === 0) return
    setExporting(true)
    setMessage('Creating Excel workbook...')
    try {
      await downloadCategoriesWorkbook({ scope, results })
      setMessage(`Excel file downloaded with ${allCategories.length} categories.`)
    } catch (error) {
      setMessage(error.message || 'Could not create the Excel file.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="ce-screen">
      <div className="ce-header">
        <div>
          <h1>Categories Report</h1>
          <p className="page-subtitle">Export every category — with slug, parent, post count and archive link — from one website or every connected website.</p>
        </div>
      </div>

      <div className="ce-panel">
        <div className="ce-controls">
          <label>
            <span>Website</span>
            <select value={selectedSiteId} onChange={event => { setSelectedSiteId(event.target.value); setResults(null); setMessage('') }}>
              <option value="all">🌐 All Connected Websites ({connectedSites.length})</option>
              {sites.map(site => <option key={site.id} value={site.id}>{site.name}{site.connected && site.username && site.password ? '' : ' (not connected)'}</option>)}
            </select>
          </label>
          <button className="btn btn-secondary" onClick={loadCategories} disabled={loading}>
            {loading ? (progress || 'Loading categories...') : 'Load Categories'}
          </button>
          <button className="btn btn-primary" onClick={exportExcel} disabled={exporting || allCategories.length === 0}>
            {exporting ? 'Creating Excel...' : 'Download Excel (.xlsx)'}
          </button>
        </div>

        <div className="ce-note">
          Categories are always pulled live from WordPress, so only connected websites can be included. Connect more sites in Site Manager to widen an "All Websites" export.
        </div>

        {message && <div className="ce-message">{message}</div>}
      </div>

      {results && allCategories.length > 0 && (
        <>
          <div className="ce-stats">
            <div><strong>{allCategories.length}</strong><span>Total categories</span></div>
            <div><strong>{results.length}</strong><span>Websites included</span></div>
            <div><strong>{allCategories.reduce((sum, category) => sum + category.postCount, 0).toLocaleString()}</strong><span>Total tagged posts</span></div>
          </div>

          {scope === 'all' && (
            <div className="ce-site-breakdown">
              {results.map(r => (
                <div key={r.site.id} className="ce-site-row">
                  <strong>{r.site.name}</strong>
                  <span>{r.categories.length} categor{r.categories.length === 1 ? 'y' : 'ies'}</span>
                </div>
              ))}
            </div>
          )}

          <div className="ce-table-card">
            <div className="ce-table-head">
              <div>
                <strong>Workbook preview</strong>
                <span>showing {preview.length} of {allCategories.length}{scope === 'all' ? ' (one sheet per website will be included in the download)' : ''}</span>
              </div>
            </div>
            <div className="ce-table-wrap">
              <table>
                <thead><tr><th>#</th>{scope === 'all' && <th>Website</th>}<th>Category</th><th>Slug</th><th>Parent</th><th>Posts</th></tr></thead>
                <tbody>
                  {(scope === 'all'
                    ? results.flatMap(r => r.categories.map(category => ({ ...category, websiteName: r.site.name })))
                    : preview
                  ).slice(0, 8).map((category, index) => (
                    <tr key={`${category.id}-${index}`}>
                      <td>{index + 1}</td>
                      {scope === 'all' && <td>{category.websiteName}</td>}
                      <td>{category.name}</td>
                      <td>{category.slug}</td>
                      <td>{category.parent}</td>
                      <td>{category.postCount.toLocaleString()}</td>
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
