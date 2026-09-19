import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { useNotify } from '../context/NotificationContext'
import AllCategoriesOverview from './AllCategoriesOverview'
import './Categories.css'

const BAR_COLORS = [
  '#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b',
  '#ef4444','#ec4899','#3b82f6','#f97316','#84cc16',
]

function decodeHtml(value = '') {
  if (typeof document === 'undefined') return String(value)
  const textarea = document.createElement('textarea')
  textarea.innerHTML = String(value)
  return textarea.value
}

function cleanText(value = '') {
  return decodeHtml(String(value).replace(/<[^>]*>/g, '')).trim()
}

function safeSlug(value = 'categories') {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'categories'
}

function filterLabel(filter) {
  if (filter === 'empty') return 'Empty categories'
  if (filter === 'top') return '10+ posts'
  return 'All categories'
}

const EMPTY_CATEGORY_FORM = {
  name: '',
  slug: '',
  parent: '0',
  description: '',
}

// Categories are hierarchical (parent field); tags are flat — WordPress's
// tags endpoint doesn't support a parent relationship at all.
function categoryPayloadFromForm(form, taxonomy) {
  const payload = {
    name: form.name.trim(),
    description: form.description.trim(),
  }
  if (taxonomy === 'categories') payload.parent = Number(form.parent) || 0
  const slug = form.slug.trim()
  if (slug) payload.slug = slug
  return payload
}

async function requestCategory(site, taxonomy, path = '', options = {}) {
  const creds = btoa(`${site.username}:${site.password}`)
  const hasBody = options.body !== undefined
  const res = await fetch(`${site.url}/wp-json/wp/v2/${taxonomy}${path}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Basic ${creds}`,
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    },
    body: hasBody ? JSON.stringify(options.body) : undefined,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(data?.message || `WordPress returned HTTP ${res.status}`)
  }
  return data
}

async function fetchAllCategories(site, taxonomy) {
  const results = []
  let page = 1
  while (true) {
    try {
      const creds = btoa(`${site.username}:${site.password}`)
      const res = await fetch(
        `${site.url}/wp-json/wp/v2/${taxonomy}?per_page=100&page=${page}`,
        { headers: { Authorization: `Basic ${creds}` } }
      )
      if (!res.ok) break
      const batch = await res.json()
      if (!batch.length) break
      results.push(...batch)
      const totalPages = parseInt(res.headers.get('X-WP-TotalPages') || '1')
      if (page >= totalPages) break
      page++
    } catch { break }
  }
  return results
}

async function downloadCategoryWorkbook({ site, taxonomy, rows, totals, filter, search, sortKey, sortDir }) {
  const label = taxonomy === 'tags' ? 'Tag' : 'Category'
  const excelModule = await import('exceljs')
  const ExcelJS = excelModule.default || excelModule
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ChloeTrap'
  workbook.created = new Date()
  workbook.subject = `${label} Explorer export for ${site.name}`

  const summary = workbook.addWorksheet('Summary', { views: [{ showGridLines: false }] })
  summary.columns = [{ width: 24 }, { width: 54 }]
  const isTags = taxonomy === 'tags'
  summary.addRows([
    ['Website', site.name],
    ['Website URL', site.url],
    ['Exported rows', rows.length],
    [`Total ${label.toLowerCase()}s on site`, totals.categoryCount],
    ['Total posts tagged', totals.totalPosts],
    ['10+ post ' + label.toLowerCase() + 's', totals.topCount],
    [`Empty ${label.toLowerCase()}s`, totals.emptyCount],
    ...(isTags ? [] : [['Sub-categories', totals.subCount]]),
    ['Filter', filterLabel(filter)],
    ['Search', search.trim() || 'None'],
    ['Sorted by', `${sortKey} (${sortDir})`],
    ['Exported on', new Date().toLocaleString('en-IN')],
  ])
  summary.getColumn(1).font = { bold: true, color: { argb: 'FF1E293B' } }
  summary.getColumn(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
  summary.eachRow(row => {
    row.height = 22
    row.alignment = { vertical: 'middle' }
  })

  const sheet = workbook.addWorksheet(isTags ? 'Tags' : 'Categories', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
  })
  sheet.columns = [
    { header: '#', key: 'number', width: 7 },
    { header: `${label} Name`, key: 'name', width: 36 },
    { header: 'Slug', key: 'slug', width: 34 },
    { header: 'Posts', key: 'count', width: 12 },
    { header: '% Share', key: 'share', width: 12 },
    ...(isTags ? [] : [
      { header: 'Type', key: 'type', width: 14 },
      { header: 'Parent ID', key: 'parent', width: 12 },
    ]),
    { header: 'WordPress ID', key: 'id', width: 14 },
    { header: 'Description', key: 'description', width: 54 },
    { header: `${label} URL`, key: 'link', width: 62 },
  ]

  rows.forEach((cat, index) => {
    const share = totals.totalPosts > 0 ? cat.count / totals.totalPosts : 0
    sheet.addRow({
      number: index + 1,
      name: cleanText(cat.name),
      slug: cat.slug || '',
      count: cat.count || 0,
      share,
      ...(isTags ? {} : { type: cat.parent > 0 ? 'Sub' : 'Parent', parent: cat.parent || '' }),
      id: cat.id,
      description: cleanText(cat.description || ''),
      link: cat.link || '',
    })
  })
  sheet.autoFilter = { from: 'A1', to: `${isTags ? 'H' : 'J'}1` }
  sheet.getColumn('share').numFmt = '0.0%'

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
    const linkCell = row.getCell('link')
    if (linkCell.value) {
      linkCell.value = { text: String(linkCell.value), hyperlink: String(linkCell.value) }
      linkCell.font = { color: { argb: 'FF2563EB' }, underline: true }
    }
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${safeSlug(site.name)}-${isTags ? 'tags' : 'categories'}-${new Date().toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function SortTh({ label, colKey, sortKey, sortDir, onSort, style }) {
  const active = sortKey === colKey
  return (
    <th
      className={active ? 'sorted' : ''}
      onClick={() => onSort(colKey)}
      style={style}
    >
      {label}
      <span className="sort-arrow">
        {active ? (sortDir === 'asc' ? ' ^' : ' v') : ' -'}
      </span>
    </th>
  )
}

export default function Categories({ navigate, initialSiteId }) {
  const { sites } = useApp()
  const { notifySuccess, notifyError } = useNotify()
  const connectedSites = sites.filter(s => s.connected && s.username && s.password)

  const [selectedSiteId, setSelectedSiteId] = useState(() => {
    if (initialSiteId && connectedSites.some(s => s.id === initialSiteId)) return initialSiteId
    return connectedSites[0]?.id || ''
  })
  const [categories, setCategories]         = useState([])
  const [loading, setLoading]               = useState(false)
  const [search, setSearch]                 = useState('')
  const [sortKey, setSortKey]               = useState('count')
  const [sortDir, setSortDir]               = useState('desc')
  const [filter, setFilter]                 = useState('all') // all | empty | top
  const [exporting, setExporting]           = useState(false)
  const [exportMessage, setExportMessage]   = useState('')
  const [actionMessage, setActionMessage]   = useState('')
  const [formMode, setFormMode]             = useState('closed') // closed | add | edit
  const [categoryForm, setCategoryForm]     = useState(EMPTY_CATEGORY_FORM)
  const [editingCategoryId, setEditingCategoryId] = useState(null)
  const [savingCategory, setSavingCategory] = useState(false)
  const [selectedIds, setSelectedIds]       = useState([])
  const [bulkDeleting, setBulkDeleting]     = useState(false)
  const [viewMode, setViewMode]             = useState('site') // site | network
  const [taxonomy, setTaxonomy]             = useState('categories') // categories | tags

  const selectedSite = sites.find(s => s.id === selectedSiteId)
  const label = taxonomy === 'tags' ? 'Tag' : 'Category'
  const labelLower = label.toLowerCase()

  const reloadCategories = useCallback(async () => {
    if (!selectedSite) return
    setLoading(true)
    setExportMessage('')
    try {
      const cats = await fetchAllCategories(selectedSite, taxonomy)
      setCategories(cats)
      setSelectedIds(ids => ids.filter(id => cats.some(cat => cat.id === id)))
    } finally {
      setLoading(false)
    }
  }, [selectedSite, taxonomy])

  useEffect(() => {
    setCategories([])
    setSelectedIds([])
    setFormMode('closed')
    setCategoryForm(EMPTY_CATEGORY_FORM)
    setEditingCategoryId(null)
    setActionMessage('')
    reloadCategories()
  }, [reloadCategories])

  const totalPosts = useMemo(() => categories.reduce((s, c) => s + c.count, 0), [categories])
  const maxCount   = useMemo(() => Math.max(...categories.map(c => c.count), 1), [categories])
  const emptyCount = useMemo(() => categories.filter(c => c.count === 0).length, [categories])
  const subCount   = useMemo(() => categories.filter(c => c.parent > 0).length, [categories])
  const topCount   = useMemo(() => categories.filter(c => c.count >= 10).length, [categories])

  const displayCats = useMemo(() => {
    let list = [...categories]
    if (filter === 'empty') list = list.filter(c => c.count === 0)
    if (filter === 'top')   list = list.filter(c => c.count >= 10)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q)
      )
    }
    list.sort((a, b) => {
      let va, vb
      if (sortKey === 'count')     { va = a.count; vb = b.count }
      else if (sortKey === 'name') { va = a.name.toLowerCase(); vb = b.name.toLowerCase() }
      else if (sortKey === 'slug') { va = a.slug; vb = b.slug }
      else                         { va = a.count; vb = b.count }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ?  1 : -1
      return 0
    })
    return list
  }, [categories, search, sortKey, sortDir, filter])

  const selectedCategories = useMemo(
    () => categories.filter(cat => selectedIds.includes(cat.id)),
    [categories, selectedIds]
  )
  const selectedEmptyCategories = useMemo(
    () => selectedCategories.filter(cat => cat.count === 0),
    [selectedCategories]
  )
  const selectableDisplayIds = useMemo(
    () => displayCats.filter(cat => cat.count === 0).map(cat => cat.id),
    [displayCats]
  )
  const allDisplayedEmptySelected = selectableDisplayIds.length > 0 &&
    selectableDisplayIds.every(id => selectedIds.includes(id))

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'count' ? 'desc' : 'asc') }
  }

  const handleExportExcel = async () => {
    if (!selectedSite || displayCats.length === 0 || exporting) return
    setExporting(true)
    setExportMessage('Creating Excel workbook...')
    try {
      await downloadCategoryWorkbook({
        site: selectedSite,
        taxonomy,
        rows: displayCats,
        totals: {
          categoryCount: categories.length,
          totalPosts,
          topCount,
          emptyCount,
          subCount,
        },
        filter,
        search,
        sortKey,
        sortDir,
      })
      setExportMessage(`Exported ${displayCats.length} ${labelLower}s to Excel.`)
    } catch (error) {
      setExportMessage(error.message || 'Could not create the Excel file.')
    } finally {
      setExporting(false)
    }
  }

  const openAddForm = () => {
    setFormMode('add')
    setEditingCategoryId(null)
    setCategoryForm(EMPTY_CATEGORY_FORM)
    setActionMessage('')
  }

  const openEditForm = (cat) => {
    setFormMode('edit')
    setEditingCategoryId(cat.id)
    setCategoryForm({
      name: cleanText(cat.name),
      slug: cat.slug || '',
      parent: String(cat.parent || 0),
      description: cleanText(cat.description || ''),
    })
    setActionMessage('')
  }

  const closeCategoryForm = () => {
    setFormMode('closed')
    setEditingCategoryId(null)
    setCategoryForm(EMPTY_CATEGORY_FORM)
  }

  const handleSaveCategory = async (event) => {
    event.preventDefault()
    if (!selectedSite || savingCategory) return
    if (!categoryForm.name.trim()) {
      setActionMessage(`${label} name is required.`)
      return
    }

    setSavingCategory(true)
    setActionMessage(formMode === 'edit' ? `Updating ${labelLower}...` : `Adding ${labelLower}...`)
    try {
      const payload = categoryPayloadFromForm(categoryForm, taxonomy)
      if (formMode === 'edit' && editingCategoryId) {
        await requestCategory(selectedSite, taxonomy, `/${editingCategoryId}`, {
          method: 'PUT',
          body: payload,
        })
        setActionMessage(`${label} updated.`)
        notifySuccess(`✓ Updated ${labelLower} "${payload.name}" on ${selectedSite.name}`)
      } else {
        await requestCategory(selectedSite, taxonomy, '', {
          method: 'POST',
          body: payload,
        })
        setActionMessage(`${label} added.`)
        notifySuccess(`✓ Added ${labelLower} "${payload.name}" to ${selectedSite.name}`)
      }
      closeCategoryForm()
      await reloadCategories()
    } catch (error) {
      const msg = error.message || `${label} action failed.`
      setActionMessage(msg)
      notifyError(`Failed to save ${labelLower} on ${selectedSite.name}: ${msg}`, { site: selectedSite.name, action: `Save ${label}` })
    } finally {
      setSavingCategory(false)
    }
  }

  const handleDeleteCategory = async (cat) => {
    if (!selectedSite || cat.count > 0) return
    const name = cleanText(cat.name)
    if (!window.confirm(`Delete empty ${labelLower} "${name}" from ${selectedSite.name}?`)) return
    setActionMessage(`Deleting "${name}"...`)
    try {
      await requestCategory(selectedSite, taxonomy, `/${cat.id}?force=true`, { method: 'DELETE' })
      setSelectedIds(ids => ids.filter(id => id !== cat.id))
      setActionMessage(`${label} deleted.`)
      notifySuccess(`✓ Deleted ${labelLower} "${name}" from ${selectedSite.name}`)
      await reloadCategories()
    } catch (error) {
      const msg = error.message || `Could not delete ${labelLower}.`
      setActionMessage(msg)
      notifyError(`Failed to delete ${labelLower} "${name}" on ${selectedSite.name}: ${msg}`, { site: selectedSite.name, action: `Delete ${label}` })
    }
  }

  const toggleCategorySelection = (id) => {
    setSelectedIds(ids => (
      ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id]
    ))
  }

  const toggleDisplayedEmptySelection = () => {
    setSelectedIds(ids => {
      const next = new Set(ids)
      if (allDisplayedEmptySelected) {
        selectableDisplayIds.forEach(id => next.delete(id))
      } else {
        selectableDisplayIds.forEach(id => next.add(id))
      }
      return Array.from(next)
    })
  }

  const handleBulkDeleteEmpty = async () => {
    if (!selectedSite || selectedEmptyCategories.length === 0 || bulkDeleting) return
    const skipped = selectedCategories.length - selectedEmptyCategories.length
    const confirmText = skipped > 0
      ? `Delete ${selectedEmptyCategories.length} empty ${labelLower}s from ${selectedSite.name}? ${skipped} selected non-empty ${labelLower}s will be skipped.`
      : `Delete ${selectedEmptyCategories.length} empty ${labelLower}s from ${selectedSite.name}?`
    if (!window.confirm(confirmText)) return

    setBulkDeleting(true)
    setActionMessage(`Deleting ${selectedEmptyCategories.length} empty ${labelLower}s...`)
    let deleted = 0
    try {
      for (const cat of selectedEmptyCategories) {
        await requestCategory(selectedSite, taxonomy, `/${cat.id}?force=true`, { method: 'DELETE' })
        deleted += 1
      }
      setSelectedIds([])
      setActionMessage(`Deleted ${deleted} empty ${labelLower}s.`)
      notifySuccess(`✓ Deleted ${deleted} empty ${labelLower}s from ${selectedSite.name}`)
      await reloadCategories()
    } catch (error) {
      const msg = error.message || `Deleted ${deleted}, then one ${labelLower} failed.`
      setActionMessage(msg)
      notifyError(`Bulk ${labelLower} delete on ${selectedSite.name} stopped after ${deleted}: ${msg}`, { site: selectedSite.name, action: `Bulk Delete ${label}s` })
      await reloadCategories()
    } finally {
      setBulkDeleting(false)
    }
  }

  if (viewMode === 'network') {
    return (
      <div className="categories-screen">
        <div className="cat-view-tabs">
          <button className={`cat-view-tab${viewMode === 'site' ? ' active' : ''}`} onClick={() => setViewMode('site')}>📁 This Site</button>
          <button className={`cat-view-tab${viewMode === 'network' ? ' active' : ''}`} onClick={() => setViewMode('network')}>🌐 All Sites</button>
        </div>
        <AllCategoriesOverview navigate={navigate} />
      </div>
    )
  }

  return (
    <div className="categories-screen">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{label} Explorer</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Browse all {labelLower}s and see how many posts each one has
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          <div className="cat-view-tabs">
            <button className={`cat-view-tab${taxonomy === 'categories' ? ' active' : ''}`} onClick={() => setTaxonomy('categories')}>🗂 Categories</button>
            <button className={`cat-view-tab${taxonomy === 'tags' ? ' active' : ''}`} onClick={() => setTaxonomy('tags')}>🏷 Tags</button>
          </div>
          {taxonomy === 'categories' && (
            <div className="cat-view-tabs">
              <button className={`cat-view-tab${viewMode === 'site' ? ' active' : ''}`} onClick={() => setViewMode('site')}>📁 This Site</button>
              <button className={`cat-view-tab${viewMode === 'network' ? ' active' : ''}`} onClick={() => setViewMode('network')}>🌐 All Sites</button>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="cat-controls">
        <select
          className="cat-site-select"
          value={selectedSiteId}
          onChange={e => { setSelectedSiteId(e.target.value); setSearch('') }}
        >
          {connectedSites.length === 0
            ? <option value="">No connected sites</option>
            : connectedSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)
          }
        </select>

        <div className="cat-search-wrap">
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/>
          </svg>
          <input
            className="cat-search"
            placeholder={`Search ${labelLower}s...`}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="cat-filter-tabs">
          {[
            { key: 'all',   label: 'All' },
            { key: 'top',   label: '10+ posts' },
            { key: 'empty', label: 'Empty' },
          ].map(t => (
            <button
              key={t.key}
              className={`cat-tab${filter === t.key ? ' active' : ''}`}
              onClick={() => setFilter(t.key)}
            >{t.label}</button>
          ))}
        </div>

        <button
          className="cat-export-btn"
          onClick={handleExportExcel}
          disabled={loading || exporting || displayCats.length === 0}
        >
          {exporting ? 'Creating Excel...' : 'Export Excel'}
        </button>

        <button
          className="cat-secondary-btn"
          onClick={reloadCategories}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>

        <button
          className="cat-primary-btn"
          onClick={openAddForm}
          disabled={!selectedSite}
        >
          Add {label}
        </button>
      </div>

      {exportMessage && (
        <div className={`cat-export-message${exportMessage.startsWith('Could not') ? ' error' : ''}`}>
          {exportMessage}
        </div>
      )}

      {(formMode !== 'closed' || actionMessage || selectedIds.length > 0) && (
        <div className="cat-manager-panel">
          {formMode !== 'closed' && (
            <form className="cat-form" onSubmit={handleSaveCategory}>
              <div className="cat-manager-head">
                <div>
                  <h2>{formMode === 'edit' ? `Edit ${label}` : `Add ${label}`}</h2>
                  <p>{selectedSite?.name || 'No site selected'}</p>
                </div>
              </div>

              <div className="cat-form-grid">
                <label>
                  Name
                  <input
                    value={categoryForm.name}
                    onChange={e => setCategoryForm(form => ({ ...form, name: e.target.value }))}
                    placeholder={`${label} name`}
                    autoFocus
                  />
                </label>

                <label>
                  Slug
                  <input
                    value={categoryForm.slug}
                    onChange={e => setCategoryForm(form => ({ ...form, slug: e.target.value }))}
                    placeholder="leave blank for WordPress"
                  />
                </label>

                {taxonomy === 'categories' && (
                  <label>
                    Parent
                    <select
                      value={categoryForm.parent}
                      onChange={e => setCategoryForm(form => ({ ...form, parent: e.target.value }))}
                    >
                      <option value="0">No parent</option>
                      {categories
                        .filter(cat => cat.id !== editingCategoryId)
                        .sort((a, b) => cleanText(a.name).localeCompare(cleanText(b.name)))
                        .map(cat => (
                          <option key={cat.id} value={cat.id}>{cleanText(cat.name)}</option>
                        ))}
                    </select>
                  </label>
                )}

                <label className="cat-form-wide">
                  Description
                  <input
                    value={categoryForm.description}
                    onChange={e => setCategoryForm(form => ({ ...form, description: e.target.value }))}
                    placeholder="Optional description"
                  />
                </label>
              </div>

              <div className="cat-form-actions">
                <button className="cat-primary-btn" type="submit" disabled={savingCategory}>
                  {savingCategory ? 'Saving...' : formMode === 'edit' ? `Update ${label}` : `Add ${label}`}
                </button>
                <button className="cat-secondary-btn" type="button" onClick={closeCategoryForm} disabled={savingCategory}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="cat-bulk-bar">
            <span>
              {selectedIds.length > 0
                ? `${selectedIds.length} selected, ${selectedEmptyCategories.length} empty`
                : `Select empty ${labelLower}s to bulk delete`}
            </span>
            <button
              className="cat-danger-btn"
              onClick={handleBulkDeleteEmpty}
              disabled={selectedEmptyCategories.length === 0 || bulkDeleting}
            >
              {bulkDeleting ? 'Deleting...' : 'Delete Selected Empty'}
            </button>
          </div>

          {actionMessage && (
            <div className={`cat-action-message${actionMessage.includes('failed') || actionMessage.includes('Could not') || actionMessage.includes('required') ? ' error' : ''}`}>
              {actionMessage}
            </div>
          )}
        </div>
      )}

      {/* Summary strip */}
      {categories.length > 0 && !loading && (
        <div className="cat-summary">
          <div className="cat-summary-item">
            <div className="cat-summary-val purple">{categories.length}</div>
            <div className="cat-summary-lbl">Total {label}s</div>
          </div>
          <div className="cat-summary-item">
            <div className="cat-summary-val">{totalPosts.toLocaleString()}</div>
            <div className="cat-summary-lbl">Total Posts</div>
          </div>
          <div className="cat-summary-item">
            <div className="cat-summary-val green">{topCount}</div>
            <div className="cat-summary-lbl">10+ Posts</div>
          </div>
          <div className="cat-summary-item">
            <div className="cat-summary-val red">{emptyCount}</div>
            <div className="cat-summary-lbl">Empty</div>
          </div>
          {taxonomy === 'categories' && (
            <div className="cat-summary-item">
              <div className="cat-summary-val">{subCount}</div>
              <div className="cat-summary-lbl">Sub-categories</div>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="cat-table-wrap">
        <table className="cat-table">
          <thead>
            <tr>
              <th className="cat-select-col">
                <input
                  type="checkbox"
                  checked={allDisplayedEmptySelected}
                  onChange={toggleDisplayedEmptySelection}
                  disabled={selectableDisplayIds.length === 0}
                  aria-label={`Select displayed empty ${labelLower}s`}
                />
              </th>
              <th style={{ width: 40, textAlign: 'right' }}>#</th>
              <SortTh label={`${label} Name`} colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortTh label="Slug" colKey="slug" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortTh label="Posts" colKey="count" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={{ width: 220 }} />
              <th style={{ width: 72, textAlign: 'right' }}>% Share</th>
              {taxonomy === 'categories' && <th style={{ width: 90 }}>Type</th>}
              <th>Description</th>
              <th style={{ width: 140 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr className="cat-loading-row">
                <td colSpan={taxonomy === 'categories' ? 9 : 8}>
                  <span className="spinner" />
                  Loading {labelLower}s from {selectedSite?.name}...
                </td>
              </tr>
            )}

            {!loading && connectedSites.length === 0 && (
              <tr className="cat-empty-row">
                <td colSpan={taxonomy === 'categories' ? 9 : 8}>
                  No connected sites. Go to{' '}
                  <button
                    onClick={() => navigate?.('sites')}
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0, fontSize: 13 }}
                  >Site Manager</button>{' '}
                  and add credentials first.
                </td>
              </tr>
            )}

            {!loading && connectedSites.length > 0 && displayCats.length === 0 && (
              <tr className="cat-empty-row">
                <td colSpan={taxonomy === 'categories' ? 9 : 8}>
                  {search ? `No ${labelLower}s match "${search}"` : `No ${labelLower}s found for this filter.`}
                </td>
              </tr>
            )}

            {!loading && displayCats.map((cat, idx) => {
              const pct   = totalPosts > 0 ? (cat.count / totalPosts) * 100 : 0
              const barW  = (cat.count / maxCount) * 100
              const color = BAR_COLORS[cat.id % BAR_COLORS.length]
              const isSub = cat.parent > 0

              return (
                <tr key={cat.id}>
                  <td className="cat-select-col">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(cat.id)}
                      onChange={() => toggleCategorySelection(cat.id)}
                      aria-label={`Select ${cleanText(cat.name)}`}
                    />
                  </td>

                  <td className="cat-row-num">{idx + 1}</td>

                  <td>
                    <span
                      className="cat-name"
                      dangerouslySetInnerHTML={{ __html: cat.name }}
                    />
                  </td>

                  <td>
                    <span className="cat-slug">{cat.slug}</span>
                  </td>

                  <td className="cat-count-cell">
                    <div className="cat-count-row">
                      <span className={`cat-count-num${cat.count === 0 ? ' zero' : ''}`}>
                        {cat.count}
                      </span>
                      <div className="cat-bar-track">
                        <div
                          className="cat-bar-fill"
                          style={{ width: `${barW}%`, background: color }}
                        />
                      </div>
                    </div>
                  </td>

                  <td>
                    <span className="cat-pct">
                      {pct > 0 ? pct.toFixed(1) + '%' : '-'}
                    </span>
                  </td>

                  {taxonomy === 'categories' && (
                    <td>
                      <span className={`cat-type ${isSub ? 'sub' : 'parent'}`}>
                        {isSub ? 'Sub' : 'Parent'}
                      </span>
                    </td>
                  )}

                  <td className="cat-desc-cell">
                    {cat.description
                      ? cat.description.replace(/<[^>]*>/g, '')
                      : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 11 }}>-</span>
                    }
                  </td>

                  <td>
                    <div className="cat-row-actions">
                      <button className="cat-text-btn" onClick={() => openEditForm(cat)}>
                        Edit
                      </button>
                      <button
                        className="cat-text-btn danger"
                        onClick={() => handleDeleteCategory(cat)}
                        disabled={cat.count > 0}
                        title={cat.count > 0 ? `Only empty ${labelLower}s can be deleted here` : `Delete empty ${labelLower}`}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {!loading && displayCats.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>
          Showing {displayCats.length} of {categories.length} {labelLower}s
        </div>
      )}
    </div>
  )
}
