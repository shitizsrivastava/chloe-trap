import React, { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import SiteAvatar from '../components/SiteAvatar'
import './WritingGoals.css'

function getWeekKey(date = new Date()) {
  const d = new Date(date)
  d.setHours(0,0,0,0)
  d.setDate(d.getDate() - d.getDay())
  return d.toISOString().split('T')[0]
}

function getLast8Weeks() {
  const weeks = []
  for (let i = 7; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i * 7)
    weeks.push(getWeekKey(d))
  }
  return weeks
}

export default function WritingGoals({ navigate }) {
  const { sites, posts, settings, setSettings } = useApp()

  const [editGoals, setEditGoals] = useState(false)
  const [draft, setDraft] = useState({})

  const goals = settings.writingGoals || {}

  const saveGoals = () => {
    setSettings(prev => ({ ...prev, writingGoals: { ...prev.writingGoals, ...draft } }))
    setEditGoals(false)
    setDraft({})
  }

  const thisWeek = getWeekKey()
  const last8 = getLast8Weeks()

  // Posts this week per site
  const postsThisWeek = useMemo(() => {
    const map = {}
    posts.forEach(p => {
      const wk = getWeekKey(new Date(p.createdAt))
      if (wk === thisWeek) {
        map[p.siteId] = (map[p.siteId] || 0) + 1
      }
    })
    return map
  }, [posts, thisWeek])

  // Posts per week per site (last 8 weeks)
  const weeklyHistory = useMemo(() => {
    const map = {}
    posts.forEach(p => {
      const wk = getWeekKey(new Date(p.createdAt))
      if (last8.includes(wk)) {
        if (!map[p.siteId]) map[p.siteId] = {}
        map[p.siteId][wk] = (map[p.siteId][wk] || 0) + 1
      }
    })
    return map
  }, [posts])

  // Overall weekly totals
  const overallWeekly = useMemo(() =>
    last8.map(wk => ({ week: wk, count: Object.values(weeklyHistory).reduce((sum, s) => sum + (s[wk] || 0), 0) }))
  , [weeklyHistory])

  const maxBar = Math.max(...overallWeekly.map(w => w.count), 1)

  const totalGoal  = Object.values(goals).reduce((s, v) => s + (v || 0), 0)
  const totalDone  = Object.values(postsThisWeek).reduce((s, v) => s + v, 0)
  const overallPct = totalGoal ? Math.min(100, Math.round((totalDone / totalGoal) * 100)) : 0

  const sitesWithGoals = sites.filter(s => goals[s.id] > 0)
  const sitesMissingGoal = sites.filter(s => !goals[s.id])

  return (
    <div className="wg-screen">
      <div className="page-header-row">
        <div>
          <h1>Writing Goals</h1>
          <p className="page-subtitle">Track your weekly posting targets across all 13 sites</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => { setEditGoals(v => !v); setDraft({}) }}>
          {editGoals ? 'Cancel' : '⚙ Set Goals'}
        </button>
      </div>

      {/* Goal editor */}
      {editGoals && (
        <div className="wg-goal-editor">
          <div className="wg-ge-title">Set weekly post targets per site</div>
          <div className="wg-ge-grid">
            {sites.map(site => (
              <div key={site.id} className="wg-ge-row">
                <span className="wg-ge-dot" style={{ background: site.color }} />
                <span className="wg-ge-name">{site.name}</span>
                <input
                  type="number"
                  className="wg-ge-input"
                  min={0} max={20}
                  defaultValue={goals[site.id] || 0}
                  onChange={e => setDraft(prev => ({ ...prev, [site.id]: +e.target.value }))}
                />
                <span className="wg-ge-unit">posts/week</span>
              </div>
            ))}
          </div>
          <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={saveGoals}>Save Goals</button>
        </div>
      )}

      {/* Overall this week */}
      <div className="wg-overall-card">
        <div className="wg-oc-header">
          <div>
            <div className="wg-oc-title">This Week's Overall Progress</div>
            <div className="wg-oc-subtitle">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          </div>
          <div className="wg-oc-nums">
            <span className="wg-oc-done">{totalDone}</span>
            <span className="wg-oc-sep">/</span>
            <span className="wg-oc-goal">{totalGoal || '—'}</span>
            <span className="wg-oc-unit">posts</span>
          </div>
        </div>
        {totalGoal > 0 && (
          <div className="wg-oc-bar-wrap">
            <div className="wg-oc-bar-track">
              <div className="wg-oc-bar-fill" style={{
                width: `${overallPct}%`,
                background: overallPct >= 100 ? '#16a34a' : overallPct >= 60 ? '#d97706' : '#6366f1',
              }} />
            </div>
            <span className="wg-oc-pct">{overallPct}%</span>
          </div>
        )}
        {totalGoal === 0 && (
          <div className="wg-no-goals-hint">
            ↑ Click "Set Goals" to set weekly targets for each site
          </div>
        )}
      </div>

      {/* Per-site progress */}
      {sitesWithGoals.length > 0 && (
        <div className="wg-sites-grid">
          {sites.filter(s => goals[s.id] > 0).map(site => {
            const done = postsThisWeek[site.id] || 0
            const goal = goals[site.id] || 0
            const pct  = Math.min(100, Math.round((done / goal) * 100))
            const isComplete = done >= goal
            return (
              <div key={site.id} className={`wg-site-card${isComplete ? ' complete' : ''}`} style={{ borderColor: site.color + '44' }}>
                <div className="wg-sc-header">
                  <SiteAvatar site={site} size={32} radius={8} />
                  <div className="wg-sc-info">
                    <div className="wg-sc-name">{site.name}</div>
                    <div className="wg-sc-sub">{done}/{goal} this week</div>
                  </div>
                  {isComplete
                    ? <span className="wg-sc-check">✅</span>
                    : <span className="wg-sc-remain">{goal - done} left</span>
                  }
                </div>
                <div className="wg-sc-bar-track">
                  <div className="wg-sc-bar-fill" style={{ width: `${pct}%`, background: isComplete ? '#16a34a' : site.color }} />
                </div>
                <button className="wg-sc-write-btn" onClick={() => navigate('create')}>+ Write Post</button>
              </div>
            )
          })}
        </div>
      )}

      {/* 8-week chart */}
      <div className="wg-chart-section">
        <div className="wg-chart-title">📊 Weekly Activity — Last 8 Weeks</div>
        <div className="wg-chart">
          {overallWeekly.map((w, i) => {
            const isThis = w.week === thisWeek
            const h = maxBar ? Math.max(4, (w.count / maxBar) * 120) : 4
            return (
              <div key={w.week} className="wg-chart-col">
                <div className="wg-chart-count">{w.count || ''}</div>
                <div className="wg-chart-bar-wrap">
                  <div
                    className={`wg-chart-bar${isThis ? ' current' : ''}`}
                    style={{ height: h }}
                    title={`${w.count} posts`}
                  />
                </div>
                <div className={`wg-chart-label${isThis ? ' current' : ''}`}>
                  {isThis ? 'Now' : `W${i + 1}`}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Sites without goals reminder */}
      {sitesMissingGoal.length > 0 && (
        <div className="wg-missing">
          <span>⚠️ {sitesMissingGoal.length} sites have no goal set:</span>
          {sitesMissingGoal.slice(0, 5).map(s => (
            <span key={s.id} className="wg-miss-chip" style={{ background: s.color + '22', color: s.color }}>{s.name}</span>
          ))}
          {sitesMissingGoal.length > 5 && <span className="wg-miss-more">+{sitesMissingGoal.length - 5} more</span>}
          <button className="wg-miss-btn" onClick={() => setEditGoals(true)}>Set Goals</button>
        </div>
      )}
    </div>
  )
}
