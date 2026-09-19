import React from 'react'
import { useNotify } from '../context/NotificationContext'
import './ToastContainer.css'

const ICONS = {
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
}

export default function ToastContainer({ navigate }) {
  const { toasts, dismissToast } = useNotify()
  if (!toasts.length) return null

  return (
    <div className="toast-stack">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span className="toast-icon">{ICONS[t.type] || 'ℹ'}</span>
          <span className="toast-msg">{t.message}</span>
          {t.type === 'error' && navigate && (
            <button className="toast-action" onClick={() => { dismissToast(t.id); navigate('error-log') }}>
              View Error Log
            </button>
          )}
          {t.type === 'warning' ? (
            <button className="toast-ok" onClick={() => dismissToast(t.id)}>OK</button>
          ) : (
            <button className="toast-close" onClick={() => dismissToast(t.id)}>×</button>
          )}
        </div>
      ))}
    </div>
  )
}
