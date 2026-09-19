import React from 'react'

// Without this, an uncaught error anywhere in the render tree (a typo, a
// value that's the wrong shape, a reference used before it's declared —
// exactly what happened in the Plugins screen) unmounts the entire app with
// no message at all, just a blank white window. This catches it, shows what
// broke, and offers a way back to Dashboard without losing all app state by
// force-quitting.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('ChloeTrap crashed:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100vh', padding: 40, textAlign: 'center', fontFamily: 'system-ui, sans-serif',
        background: '#fff', color: '#1e293b',
      }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
        <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>Something went wrong on this screen</h1>
        <p style={{ fontSize: 13, color: '#64748b', maxWidth: 480, margin: '0 0 20px' }}>
          {this.state.error?.message || 'An unexpected error occurred.'}
        </p>
        <button
          onClick={() => { this.setState({ error: null }); this.props.onReset?.() }}
          style={{
            padding: '8px 18px', fontSize: 13, fontWeight: 600, borderRadius: 8,
            border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer',
          }}
        >
          ← Back to Dashboard
        </button>
      </div>
    )
  }
}
