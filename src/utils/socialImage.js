const PALETTE = ['#312e81', '#1d4ed8', '#0f766e', '#9a3412', '#7e22ce', '#be123c']

function wrapText(ctx, text, maxWidth, maxLines = 4) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (ctx.measureText(candidate).width <= maxWidth || !line) line = candidate
    else {
      lines.push(line)
      line = word
      if (lines.length === maxLines - 1) break
    }
  }
  if (line && lines.length < maxLines) lines.push(line)
  if (words.length && lines.length === maxLines) {
    const joined = words.slice(0, words.length).join(' ')
    if (joined.length > lines.join(' ').length && lines[maxLines - 1]) {
      let last = lines[maxLines - 1]
      while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 2) last = last.slice(0, -1)
      lines[maxLines - 1] = `${last}…`
    }
  }
  return lines
}

export function createSocialImage({ title, siteName, siteUrl, width = 1080, height = 1080 }) {
  if (typeof document === 'undefined') throw new Error('Image generation requires the desktop app window.')
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  const seed = String(siteName || title || '').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
  const base = PALETTE[seed % PALETTE.length]
  const gradient = ctx.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, base)
  gradient.addColorStop(1, '#111827')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  ctx.globalAlpha = 0.16
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < 7; i++) {
    ctx.beginPath()
    ctx.arc(width * (0.08 + i * 0.18), height * (0.12 + (i % 3) * 0.35), 90 + i * 20, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  ctx.fillStyle = '#ffffff'
  ctx.font = '700 32px Arial, sans-serif'
  ctx.fillText(String(siteName || 'Chloe Trap').slice(0, 42), 76, 100)
  ctx.fillStyle = 'rgba(255,255,255,.7)'
  ctx.font = '500 20px Arial, sans-serif'
  ctx.fillText('NEW ARTICLE', 78, 145)

  ctx.fillStyle = '#ffffff'
  ctx.font = '700 58px Arial, sans-serif'
  const lines = wrapText(ctx, title || 'Read the latest article', width - 152, 4)
  lines.forEach((line, index) => ctx.fillText(line, 76, 430 + index * 72))

  ctx.fillStyle = 'rgba(255,255,255,.8)'
  ctx.font = '500 22px Arial, sans-serif'
  const shortUrl = String(siteUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
  ctx.fillText(shortUrl.slice(0, 58), 78, height - 86)
  ctx.fillStyle = '#fbbf24'
  ctx.fillRect(78, height - 62, 170, 6)
  return canvas.toDataURL('image/jpeg', 0.9)
}

export function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
}
