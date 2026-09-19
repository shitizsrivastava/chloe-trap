import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'

const NotificationContext = createContext(null)
const ERROR_LOG_KEY = 'ct_error_log'
const MAX_ERROR_LOG = 200

function loadErrorLog() {
  try {
    const raw = localStorage.getItem(ERROR_LOG_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [errorLog, setErrorLog] = useState(loadErrorLog)

  useEffect(() => {
    localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(errorLog.slice(0, MAX_ERROR_LOG)))
  }, [errorLog])

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const addError = useCallback((message, context = null) => {
    setErrorLog(prev => [{ id: Date.now() + Math.random(), timestamp: new Date().toISOString(), message, context }, ...prev])
  }, [])

  const clearError = useCallback((id) => {
    setErrorLog(prev => prev.filter(e => e.id !== id))
  }, [])

  const clearAllErrors = useCallback(() => setErrorLog([]), [])

  // type: 'success' | 'error' | 'warning' | 'info'
  const notify = useCallback((type, message, context = null) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, type, message }])

    if (type === 'error') addError(message, context)

    // Success/info/error toasts auto-dismiss. Warnings stay until the user
    // acknowledges them — the user explicitly asked to never have a warning
    // slip by unnoticed.
    if (type !== 'warning') {
      const delay = type === 'error' ? 6000 : 3500
      setTimeout(() => dismissToast(id), delay)
    }
    return id
  }, [addError, dismissToast])

  const notifySuccess = useCallback((message) => notify('success', message), [notify])
  const notifyError   = useCallback((message, context) => notify('error', message, context), [notify])
  const notifyWarning = useCallback((message) => notify('warning', message), [notify])
  const notifyInfo    = useCallback((message) => notify('info', message), [notify])

  return (
    <NotificationContext.Provider value={{
      toasts, dismissToast,
      notify, notifySuccess, notifyError, notifyWarning, notifyInfo,
      errorLog, clearError, clearAllErrors,
    }}>
      {children}
    </NotificationContext.Provider>
  )
}

export const useNotify = () => useContext(NotificationContext)
