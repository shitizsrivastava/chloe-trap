import React, { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import './ContentCalendar.css'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function getCalendarDays(year, month) {
  const first = new Date(year, month, 1).getDay()
  const last  = new Date(year, month + 1, 0).getDate()
  const days  = []
  for (let i = 0; i < first; i++) days.push(null)
  for (let i = 1; i <= last; i++) days.push(i)
  return days
}

export default function ContentCalendar({ navigate }) {
  const { posts, sites } = useApp()
  const today = new Date()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selected, setSelected] = useState(null)

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0)  } else setMonth(m => m + 1) }

  // Map day → posts
  const postsByDay = useMemo(() => {
    const map = {}
    posts.forEach(p => {
      const d = new Date(p.createdAt)
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate()
        if (!map[day]) map[day] = []
        map[day].push(p)
      }
    })
    return map
  }, [posts, year, month])

  const calDays  = getCalendarDays(year, month)
  const todayDay = today.getFullYear() === year && today.getMonth() === month ? today.getDate() : null

  const siteColor = (siteId) => sites.find(s => s.id === siteId)?.color || '#6366f1'
  const siteName  = (siteId) => sites.find(s => s.id === siteId)?.name || siteId

  const monthStats = Object.values(postsByDay).flat()
  const publishedCount = monthStats.filter(p => p.status === 'publish').length
  const draftCount     = monthStats.filter(p => p.status === 'draft').length

  // Stagger check: days where 3+ different sites published
  const staggerWarnings = useMemo(() => {
    const warnings = []
    Object.entries(postsByDay).forEach(([day, dayPosts]) => {
      const uniqueSites = [...new Set(dayPosts.map(p => p.siteId))]
      if (uniqueSites.length >= 3) {
        warnings.push({ day: +day, count: uniqueSites.length, sites: uniqueSites })
      }
    })
    return warnings
  }, [postsByDay])

  return (
    <div className="cal-screen">
      <div className="cal-top">
        <div>
          <h1>Content Calendar</h1>
          <p>Visual overview of your publishing schedule</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => navigate('create')}>+ New Post</button>
      </div>

      {/* Stats */}
      <div className="cal-stats">
        <div className="cal-stat"><strong>{monthStats.length}</strong><span>Total This Month</span></div>
        <div className="cal-stat"><strong style={{ color: 'var(--success)' }}>{publishedCount}</strong><span>Published</span></div>
        <div className="cal-stat"><strong style={{ color: 'var(--warning)' }}>{draftCount}</strong><span>Drafts</span></div>
        <div className="cal-stat"><strong style={{ color: 'var(--primary)' }}>{Object.keys(postsByDay).length}</strong><span>Active Days</span></div>
        <div className="cal-stat"><strong style={{ color: staggerWarnings.length > 0 ? '#f59e0b' : 'var(--success)' }}>{staggerWarnings.length}</strong><span>Stagger Alerts</span></div>
      </div>

      {staggerWarnings.length > 0 && (
        <div style={{ margin: '0 0 12px', padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 'var(--radius)', fontSize: 12, color: '#92400e' }}>
          <strong>⚠️ Stagger Alert:</strong> {staggerWarnings.map(w => `${MONTHS[month]} ${w.day} (${w.count} sites)`).join(', ')} — too many sites published same day. Spread posts across different days to look natural to Google.
        </div>
      )}

      {/* Calendar nav */}
      <div className="cal-nav">
        <button className="cal-nav-btn" onClick={prevMonth}>‹</button>
        <h2 className="cal-month-title">{MONTHS[month]} {year}</h2>
        <button className="cal-nav-btn" onClick={nextMonth}>›</button>
      </div>

      {/* Grid */}
      <div className="cal-grid">
        {DAYS.map(d => <div key={d} className="cal-day-hdr">{d}</div>)}
        {calDays.map((day, i) => {
          const dayPosts = day ? (postsByDay[day] || []) : []
          const isToday  = day === todayDay
          return (
            <div
              key={i}
              className={`cal-cell${!day ? ' cal-cell-empty' : ''}${isToday ? ' cal-cell-today' : ''}`}
              onClick={() => day && setSelected({ day, posts: dayPosts })}
            >
              {day && <span className="cal-day-num">{day}</span>}
              <div className="cal-dots">
                {dayPosts.slice(0, 4).map((p, j) => (
                  <span key={j} className="cal-dot" style={{ background: siteColor(p.siteId) }} title={p.title} />
                ))}
                {dayPosts.length > 4 && <span className="cal-dot-more">+{dayPosts.length - 4}</span>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Day detail panel */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="cal-detail-box" onClick={e => e.stopPropagation()}>
            <div className="cal-detail-header">
              <strong>{MONTHS[month]} {selected.day}, {year}</strong>
              <button onClick={() => setSelected(null)}>✕</button>
            </div>
            {selected.posts.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                No posts on this day.
                <br />
                <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={() => { setSelected(null); navigate('create') }}>+ Create Post</button>
              </div>
            ) : selected.posts.map((p, i) => (
              <div key={i} className="cal-detail-post" style={{ borderLeft: `3px solid ${siteColor(p.siteId)}` }}>
                <div className="cal-detail-title">{p.title}</div>
                <div className="cal-detail-meta">
                  <span style={{ color: siteColor(p.siteId), fontWeight: 600, fontSize: 11 }}>{siteName(p.siteId)}</span>
                  <span className={`badge badge-${p.status}`}>{p.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="cal-legend">
        {sites.filter(s => s.connected).map(s => (
          <div key={s.id} className="cal-legend-item">
            <span className="cal-dot" style={{ background: s.color }} />
            <span>{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
