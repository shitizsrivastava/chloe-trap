import React, { useState, useRef } from 'react'
import { useApp } from '../context/AppContext'
import SiteAvatar from '../components/SiteAvatar'
import './ContentKanban.css'

const COLS = [
  { id: 'idea',      label: '💡 Ideas',     color: '#8b5cf6' },
  { id: 'writing',   label: '✍️ Writing',   color: '#f59e0b' },
  { id: 'review',    label: '👀 Review',    color: '#3b82f6' },
  { id: 'published', label: '✅ Published', color: '#10b981' },
]

function loadCards() {
  try { return JSON.parse(localStorage.getItem('ct_kanban') || '[]') } catch { return [] }
}
function saveCards(cards) { localStorage.setItem('ct_kanban', JSON.stringify(cards)) }

export default function ContentKanban({ navigate }) {
  const { sites } = useApp()
  const [cards, setCards]         = useState(loadCards)
  const [dragId, setDragId]       = useState(null)
  const [overCol, setOverCol]     = useState(null)
  const [addingCol, setAddingCol] = useState(null)
  const [newTitle, setNewTitle]   = useState('')
  const [newSite,  setNewSite]    = useState('')
  const [editCard, setEditCard]   = useState(null)
  const [siteFilter, setSiteFilter] = useState('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const inputRef = useRef()

  const update = (next) => { setCards(next); saveCards(next) }

  // Drag handlers
  const onDragStart = (e, id) => { setDragId(id); e.dataTransfer.effectAllowed = 'move' }
  const onDragOver  = (e, colId) => { e.preventDefault(); setOverCol(colId) }
  const onDrop      = (e, colId) => {
    e.preventDefault()
    if (!dragId) return
    update(cards.map(c => c.id === dragId ? { ...c, col: colId } : c))
    setDragId(null); setOverCol(null)
  }
  const onDragEnd   = () => { setDragId(null); setOverCol(null) }

  const addCard = (colId) => {
    if (!newTitle.trim()) return
    const card = { id: Date.now(), col: colId, title: newTitle.trim(), siteId: newSite, createdAt: new Date().toISOString(), notes: '', assignee: '' }
    update([...cards, card])
    setNewTitle(''); setNewSite(''); setAddingCol(null)
  }

  const deleteCard = (id) => update(cards.filter(c => c.id !== id))

  const saveEdit = () => {
    if (!editCard) return
    update(cards.map(c => c.id === editCard.id ? editCard : c))
    setEditCard(null)
  }

  const filtered = cards
    .filter(c => siteFilter === 'all' || c.siteId === siteFilter)
    .filter(c => assigneeFilter === 'all' || (c.assignee || 'Unassigned') === assigneeFilter)

  const sitesWithCards = [...new Set(cards.map(c => c.siteId).filter(Boolean))]
    .map(id => sites.find(s => s.id === id)).filter(Boolean)

  const assigneesWithCards = [...new Set(cards.map(c => c.assignee?.trim() || 'Unassigned'))]

  // Small deterministic color per assignee name so the same person always
  // gets the same chip color across columns without storing it anywhere.
  const ASSIGNEE_COLORS = ['#6366f1', '#ef4444', '#10b981', '#f59e0b', '#06b6d4', '#8b5cf6', '#ec4899']
  const assigneeColor = (name) => {
    let hash = 0
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
    return ASSIGNEE_COLORS[hash % ASSIGNEE_COLORS.length]
  }

  return (
    <div className="kb-screen">
      <div className="page-header-row">
        <div>
          <h1>Content Pipeline</h1>
          <p className="page-subtitle">Drag cards between columns to track your content from idea to published</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {sitesWithCards.length > 0 && (
            <select className="kb-filter-select" value={siteFilter} onChange={e => setSiteFilter(e.target.value)}>
              <option value="all">All Sites</option>
              {sitesWithCards.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          {assigneesWithCards.length > 0 && (
            <select className="kb-filter-select" value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}>
              <option value="all">All Assignees</option>
              {assigneesWithCards.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          )}
          <div className="kb-totals">
            {COLS.map(col => (
              <span key={col.id} className="kb-total-chip" style={{ background: col.color + '22', color: col.color }}>
                {filtered.filter(c => c.col === col.id).length}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="kb-board">
        {COLS.map(col => {
          const colCards = filtered.filter(c => c.col === col.id)
          const isOver   = overCol === col.id
          return (
            <div
              key={col.id}
              className={`kb-col${isOver ? ' kb-col-over' : ''}`}
              style={{ '--col-color': col.color }}
              onDragOver={e => onDragOver(e, col.id)}
              onDrop={e => onDrop(e, col.id)}
            >
              <div className="kb-col-header" style={{ borderTopColor: col.color }}>
                <span className="kb-col-label">{col.label}</span>
                <span className="kb-col-count" style={{ background: col.color + '22', color: col.color }}>{colCards.length}</span>
              </div>

              <div className="kb-col-cards">
                {colCards.map(card => {
                  const site = sites.find(s => s.id === card.siteId)
                  return (
                    <div
                      key={card.id}
                      className={`kb-card${dragId === card.id ? ' kb-card-drag' : ''}`}
                      draggable
                      onDragStart={e => onDragStart(e, card.id)}
                      onDragEnd={onDragEnd}
                      onClick={() => setEditCard({ ...card })}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {site && (
                          <div className="kb-card-site" style={{ background: site.color + '22', color: site.color, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <SiteAvatar site={site} size={13} radius={3} />
                            {site.name}
                          </div>
                        )}
                        {card.assignee?.trim() && (
                          <span className="kb-card-assignee" style={{ background: assigneeColor(card.assignee) + '22', color: assigneeColor(card.assignee) }}>
                            👤 {card.assignee}
                          </span>
                        )}
                      </div>
                      <div className="kb-card-title">{card.title}</div>
                      {card.notes && <div className="kb-card-notes">{card.notes}</div>}
                      <div className="kb-card-footer">
                        <span className="kb-card-date">{new Date(card.createdAt).toLocaleDateString()}</span>
                        <button className="kb-card-del" onClick={e => { e.stopPropagation(); deleteCard(card.id) }}>✕</button>
                      </div>
                    </div>
                  )
                })}

                {/* Add card form */}
                {addingCol === col.id ? (
                  <div className="kb-add-form">
                    <input
                      ref={inputRef}
                      className="kb-add-input"
                      placeholder="Post title or idea…"
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addCard(col.id); if (e.key === 'Escape') setAddingCol(null) }}
                      autoFocus
                    />
                    <select className="kb-add-site" value={newSite} onChange={e => setNewSite(e.target.value)}>
                      <option value="">No site</option>
                      {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <div className="kb-add-actions">
                      <button className="kb-add-confirm" onClick={() => addCard(col.id)}>Add</button>
                      <button className="kb-add-cancel" onClick={() => { setAddingCol(null); setNewTitle('') }}>✕</button>
                    </div>
                  </div>
                ) : (
                  <button className="kb-add-btn" onClick={() => setAddingCol(col.id)}>+ Add card</button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Edit modal */}
      {editCard && (
        <div className="kb-modal-overlay" onClick={() => setEditCard(null)}>
          <div className="kb-modal" onClick={e => e.stopPropagation()}>
            <div className="kb-modal-header">
              <span>Edit Card</span>
              <button className="kb-modal-close" onClick={() => setEditCard(null)}>✕</button>
            </div>
            <div className="kb-modal-body">
              <label className="kb-modal-label">Title</label>
              <input className="kb-modal-input" value={editCard.title} onChange={e => setEditCard(p => ({ ...p, title: e.target.value }))} />
              <label className="kb-modal-label">Site</label>
              <select className="kb-modal-input" value={editCard.siteId || ''} onChange={e => setEditCard(p => ({ ...p, siteId: e.target.value }))}>
                <option value="">No site</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <label className="kb-modal-label">Assignee</label>
              <input className="kb-modal-input" value={editCard.assignee || ''} onChange={e => setEditCard(p => ({ ...p, assignee: e.target.value }))} placeholder="Who's working on this?" />
              <label className="kb-modal-label">Column</label>
              <select className="kb-modal-input" value={editCard.col} onChange={e => setEditCard(p => ({ ...p, col: e.target.value }))}>
                {COLS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <label className="kb-modal-label">Notes</label>
              <textarea className="kb-modal-input" style={{ minHeight: 80, resize: 'vertical' }} value={editCard.notes || ''} onChange={e => setEditCard(p => ({ ...p, notes: e.target.value }))} placeholder="Any notes, outline, keywords…" />
            </div>
            <div className="kb-modal-footer">
              <button className="btn btn-primary btn-sm" onClick={saveEdit}>Save</button>
              <button className="btn btn-secondary btn-sm" onClick={() => navigate('create')}>✍️ Write Now</button>
              <button className="kb-del-modal-btn" onClick={() => { deleteCard(editCard.id); setEditCard(null) }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
