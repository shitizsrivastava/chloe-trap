import React, { useMemo, useState } from 'react'
import { useNotify } from '../context/NotificationContext'
import './ErrorLog.css'

function formatTime(iso) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ErrorLog() {
  const { errorLog, clearError, clearAllErrors } = useNotify()
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return errorLog
    const q = search.toLowerCase()
    return errorLog.filter(e =>
      e.message.toLowerCase().includes(q) ||
      (e.context?.site || '').toLowerCase().includes(q) ||
      (e.context?.action || '').toLowerCase().includes(q)
    )
  }, [errorLog, search])

  return (
    <div className="el-screen">
      <div className="page-header-row">
        <div>
          <h1>Error Log</h1>
          <p className="page-subtitle">Every failed action across ChloeTrap shows up here — nothing fails silently anymore.</p>
        </div>
        {errorLog.length > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={() => window.confirm(`Clear all ${errorLog.length} logged errors?`) && clearAllErrors()}>
            🗑 Clear All
          </button>
        )}
      </div>

      {errorLog.length > 0 && (
        <input
          className="el-search"
          placeholder="Search errors by message, site, or action…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      )}

      {errorLog.length === 0 ? (
        <div className="el-empty">
          <div className="el-empty-icon">🎉</div>
          <p>No errors logged. Everything that's run has succeeded.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="el-empty">
          <p>No errors match "{search}".</p>
        </div>
      ) : (
        <div className="el-list">
          {filtered.map(err => (
            <div key={err.id} className="el-row">
              <div className="el-row-main">
                <div className="el-row-top">
                  {err.context?.site && <span className="el-site-pill">{err.context.site}</span>}
                  {err.context?.action && <span className="el-action-pill">{err.context.action}</span>}
                  <span className="el-time">{formatTime(err.timestamp)}</span>
                </div>
                <div className="el-message">{err.message}</div>
              </div>
              <button className="el-dismiss" onClick={() => clearError(err.id)} title="Dismiss">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
