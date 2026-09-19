// Minimal ZIP writer — stores files uncompressed (method 0, "store"). Good
// enough for bundling the one small bridge-plugin PHP file into a .zip that
// WordPress's native "Upload Plugin" screen (which only accepts .zip) can
// install directly, without pulling in a full compression library.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes) {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function dosDateTime(date = new Date()) {
  const time = ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff
  const dosDate = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff
  return { time, dosDate }
}

// files: [{ name: 'folder/file.php', content: string }]
export function createZip(files) {
  const encoder = new TextEncoder()
  const { time, dosDate } = dosDateTime()
  const localParts = []
  const centralParts = []
  let offset = 0

  for (const f of files) {
    const nameBytes = encoder.encode(f.name)
    const dataBytes = encoder.encode(f.content)
    const crc = crc32(dataBytes)

    const localHeader = new DataView(new ArrayBuffer(30))
    localHeader.setUint32(0, 0x04034b50, true)
    localHeader.setUint16(4, 20, true)
    localHeader.setUint16(6, 0, true)
    localHeader.setUint16(8, 0, true)
    localHeader.setUint16(10, time, true)
    localHeader.setUint16(12, dosDate, true)
    localHeader.setUint32(14, crc, true)
    localHeader.setUint32(18, dataBytes.length, true)
    localHeader.setUint32(22, dataBytes.length, true)
    localHeader.setUint16(26, nameBytes.length, true)
    localHeader.setUint16(28, 0, true)
    localParts.push(new Uint8Array(localHeader.buffer), nameBytes, dataBytes)

    const centralHeader = new DataView(new ArrayBuffer(46))
    centralHeader.setUint32(0, 0x02014b50, true)
    centralHeader.setUint16(4, 20, true)
    centralHeader.setUint16(6, 20, true)
    centralHeader.setUint16(8, 0, true)
    centralHeader.setUint16(10, 0, true)
    centralHeader.setUint16(12, time, true)
    centralHeader.setUint16(14, dosDate, true)
    centralHeader.setUint32(16, crc, true)
    centralHeader.setUint32(20, dataBytes.length, true)
    centralHeader.setUint32(24, dataBytes.length, true)
    centralHeader.setUint16(28, nameBytes.length, true)
    centralHeader.setUint16(30, 0, true)
    centralHeader.setUint16(32, 0, true)
    centralHeader.setUint16(34, 0, true)
    centralHeader.setUint16(36, 0, true)
    centralHeader.setUint32(38, 0, true)
    centralHeader.setUint32(42, offset, true)
    centralParts.push(new Uint8Array(centralHeader.buffer), nameBytes)

    offset += localHeader.byteLength + nameBytes.length + dataBytes.length
  }

  const centralStart = offset
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)

  const eocd = new DataView(new ArrayBuffer(22))
  eocd.setUint32(0, 0x06054b50, true)
  eocd.setUint16(4, 0, true)
  eocd.setUint16(6, 0, true)
  eocd.setUint16(8, files.length, true)
  eocd.setUint16(10, files.length, true)
  eocd.setUint32(12, centralSize, true)
  eocd.setUint32(16, centralStart, true)
  eocd.setUint16(20, 0, true)

  return new Blob([...localParts, ...centralParts, new Uint8Array(eocd.buffer)], { type: 'application/zip' })
}

// Reads just the entry names out of a .zip File/Blob by walking its central
// directory — used to detect a plugin's slug (its top-level folder name)
// from a file the user picked, without extracting anything or involving a
// site at all. Returns [] if the file isn't a valid zip.
export async function readZipEntryNames(file) {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  const view = new DataView(buf)

  // Find the End Of Central Directory record by scanning backward for its
  // signature — it can be preceded by a variable-length comment, so it isn't
  // at a fixed offset from the end of the file.
  const maxCommentLen = 65535
  const searchStart = Math.max(0, bytes.length - 22 - maxCommentLen)
  let eocdOffset = -1
  for (let i = bytes.length - 22; i >= searchStart; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocdOffset = i; break }
  }
  if (eocdOffset === -1) return []

  const entryCount = view.getUint16(eocdOffset + 10, true)
  let offset = view.getUint32(eocdOffset + 16, true)
  const decoder = new TextDecoder()
  const names = []

  for (let i = 0; i < entryCount; i++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) break
    const nameLen = view.getUint16(offset + 28, true)
    const extraLen = view.getUint16(offset + 30, true)
    const commentLen = view.getUint16(offset + 32, true)
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLen))
    names.push(name)
    offset += 46 + nameLen + extraLen + commentLen
  }
  return names
}

// The plugin slug is the top-level folder every properly-packaged WordPress
// plugin zip has — e.g. "elementor-pro/elementor-pro.php" → "elementor-pro".
export async function detectZipSlug(file) {
  try {
    const names = await readZipEntryNames(file)
    const withFolder = names.find(n => n.includes('/'))
    return withFolder ? withFolder.slice(0, withFolder.indexOf('/')) : null
  } catch {
    return null
  }
}
