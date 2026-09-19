import React, { useState } from 'react'

export function faviconUrl(site, px = 64) {
  const domain = (site?.url || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!domain) return ''
  return `https://www.google.com/s2/favicons?sz=${px}&domain=${domain}`
}

// Drop-in replacement for the old colored-circle-with-initials badge — shows
// the site's real favicon, falling back to the initials badge if the
// favicon fails to load (offline site, no icon set, blocked request, etc).
export default function SiteAvatar({ site, size = 24, radius, style = {}, className }) {
  const [failed, setFailed] = useState(false)
  if (!site) return null
  const r = radius ?? Math.round(size * 0.3)
  const url = faviconUrl(site, Math.max(32, size * 2))

  const base = {
    width: size, height: size, borderRadius: r,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, overflow: 'hidden', ...style,
  }

  if (failed || !url) {
    return (
      <span className={className} style={{ ...base, background: site.color, fontSize: Math.round(size * 0.42), fontWeight: 700, color: 'white' }}>
        {site.initials}
      </span>
    )
  }

  return (
    <span className={className} style={{ ...base, background: site.color + '1a' }}>
      <img
        src={url}
        alt={site.name || ''}
        width={Math.round(size * 0.7)}
        height={Math.round(size * 0.7)}
        onError={() => setFailed(true)}
        style={{ display: 'block' }}
      />
    </span>
  )
}
