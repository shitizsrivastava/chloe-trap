const { app, BrowserWindow, shell, ipcMain, dialog, Menu, MenuItem, safeStorage } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const fs = require('fs')
const crypto = require('crypto')
const https = require('https')

const isDev = !app.isPackaged
const PROJECT_ROOT = path.join(__dirname, '..')

let mainWindow = null
let updateProcess = null
let updateInProgress = false

// Without this, launching the app a second time (double-clicking the
// shortcut again, or a previous instance not fully closed) starts a whole
// separate process with its own separate renderer — which looks identical
// to the real window but is a completely different one, and can show a
// blank/reset UI if that second launch happens before this one has finished
// its own startup. Requesting the lock makes any second launch just hand
// off to this instance and focus its window instead of opening a new one.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
}

function updateSettingsPath() {
  return path.join(app.getPath('userData'), 'update-source.json')
}

function isSourceFolder(folder) {
  if (!folder) return false
  return fs.existsSync(path.join(folder, 'package.json')) &&
    fs.existsSync(path.join(folder, 'vite.config.js')) &&
    fs.existsSync(path.join(folder, 'src'))
}

function getSavedSourceFolder() {
  try {
    const saved = JSON.parse(fs.readFileSync(updateSettingsPath(), 'utf8'))
    return isSourceFolder(saved.folder) ? saved.folder : ''
  } catch {
    return ''
  }
}

function saveSourceFolder(folder) {
  fs.mkdirSync(path.dirname(updateSettingsPath()), { recursive: true })
  fs.writeFileSync(updateSettingsPath(), JSON.stringify({ folder }, null, 2))
}

// Always loads the app's own bundled dist/index.html — never a build from an
// external "update source" folder. Electron partitions localStorage by the
// exact file:// path a page is loaded from, so pointing the window at a
// different folder's dist/index.html silently swaps in a brand-new, empty
// localStorage (site credentials, synced posts, targets...) even though
// nothing was actually deleted. Because this path never changes, "Update
// App" (below) has to update the bundled app.asar in place instead.
function loadAppContent(win) {
  if (isDev) {
    win.loadURL('http://localhost:5173')
    return
  }
  win.loadFile(path.join(__dirname, '../dist/index.html'))
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#ffffff',
    title: 'ChloeTrap',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
    webPreferences: {
      webSecurity: false,
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })
  mainWindow = win

  // Window is created hidden (show: false above) so it never flashes a blank
  // white frame while the page loads. Showing it on ready-to-show also means
  // it always appears in front and focused, instead of opening behind other
  // windows or staying minimized in the taskbar.
  win.once('ready-to-show', () => {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })

  // Electron's built-in Chromium spellchecker is on by default (that's why
  // misspelled words get the red squiggly underline) but ships with no UI of
  // its own — without this, right-clicking shows nothing at all. Set an
  // explicit dictionary and build a real context menu with suggestions.
  win.webContents.session.setSpellCheckerLanguages(['en-US'])

  win.webContents.on('context-menu', (event, params) => {
    const menu = new Menu()

    if (params.misspelledWord) {
      if (params.dictionarySuggestions.length > 0) {
        params.dictionarySuggestions.forEach(suggestion => {
          menu.append(new MenuItem({
            label: suggestion,
            click: () => win.webContents.replaceMisspelling(suggestion),
          }))
        })
      } else {
        menu.append(new MenuItem({ label: 'No suggestions', enabled: false }))
      }
      menu.append(new MenuItem({ type: 'separator' }))
      menu.append(new MenuItem({
        label: `Add "${params.misspelledWord}" to dictionary`,
        click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      }))
      menu.append(new MenuItem({ type: 'separator' }))
    }

    if (params.editFlags.canCut) menu.append(new MenuItem({ label: 'Cut', role: 'cut' }))
    if (params.editFlags.canCopy) menu.append(new MenuItem({ label: 'Copy', role: 'copy' }))
    if (params.editFlags.canPaste) menu.append(new MenuItem({ label: 'Paste', role: 'paste' }))
    if (params.editFlags.canSelectAll) menu.append(new MenuItem({ label: 'Select All', role: 'selectAll' }))

    if (menu.items.length > 0) menu.popup()
  })

  loadAppContent(win)

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

ipcMain.handle('get-update-source', () => {
  const folder = getSavedSourceFolder() || (isDev ? PROJECT_ROOT : '')
  return { folder, valid: isSourceFolder(folder), isDev }
})

ipcMain.handle('choose-update-source', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose the Chloe Trap project folder',
    defaultPath: getSavedSourceFolder() || PROJECT_ROOT,
    properties: ['openDirectory'],
  })
  if (result.canceled || !result.filePaths[0]) return { canceled: true }

  const folder = result.filePaths[0]
  if (!isSourceFolder(folder)) {
    return {
      canceled: false,
      valid: false,
      error: 'That is not a Chloe Trap source folder. Choose the folder containing package.json, vite.config.js, and src.',
    }
  }

  saveSourceFolder(folder)
  return { canceled: false, valid: true, folder }
})

ipcMain.handle('open-update-source', () => {
  const folder = getSavedSourceFolder() || (isDev ? PROJECT_ROOT : '')
  if (!isSourceFolder(folder)) return false
  shell.openPath(folder)
  return true
})

// Wipes any leftover dist-update-* build dirs in the source folder. Safe to
// call freely — these are always fully consumed (copied out or discarded)
// before trigger-update returns, so nothing has an open handle on them.
function cleanupStaleBuildDirs(sourceFolder) {
  try {
    fs.readdirSync(sourceFolder)
      .filter(name => /^dist-update-\d+$/.test(name))
      .forEach(name => { try { fs.rmSync(path.join(sourceFolder, name), { recursive: true, force: true }) } catch {} })
  } catch {}
}

// Wipes any leftover app.asar.bak-* or app.asar.update-* files next to
// app.asar. These only survive a crash mid-update (see repackAppAsar and
// the swap helper below) — if we've reached a normal startup, the swap
// either fully succeeded or never got that far, so anything lying around
// here is stale.
function cleanupStaleAsarBackups() {
  try {
    fs.readdirSync(process.resourcesPath)
      .filter(name => /^app\.asar\.(bak|update)-\d+$/.test(name))
      .forEach(name => { try { fs.rmSync(path.join(process.resourcesPath, name), { force: true }) } catch {} })
  } catch {}
}

// Runs a Node script (e.g. vite's or asar's CLI entry point) directly through
// Electron's own Node runtime (ELECTRON_RUN_AS_NODE) instead of spawning a
// .cmd shim through cmd.exe. cmd.exe treats & | < > as command separators
// even inside quoted arguments, so any project path containing one of those
// (e.g. a folder named "05 Apps & Code") silently splits the command in two
// and the process fails with a bogus "Cannot find module" error. Invoking
// Node directly with an args array sidesteps cmd.exe's parser entirely.
function runNodeScript(scriptPath, args, { cwd, onOutput } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [scriptPath, ...args], {
      cwd,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    })
    let stderr = ''
    proc.stdout.on('data', data => onOutput?.(data.toString()))
    proc.stderr.on('data', data => { stderr += data.toString(); onOutput?.(data.toString()) })
    proc.on('error', reject)
    proc.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `exited with code ${code}`))
    })
  })
}

function findAsarCli(sourceFolder) {
  const candidates = [
    path.join(sourceFolder, 'node_modules', '@electron', 'asar', 'bin', 'asar.js'),
    path.join(sourceFolder, 'node_modules', 'asar', 'bin', 'asar.js'),
  ]
  return candidates.find(p => fs.existsSync(p)) || null
}

// Source for a small standalone helper script that performs the actual
// app.asar swap. It has to run as a *separate* process from this one: while
// ChloeTrap is running, its renderer keeps resources/app.asar open (it's
// serving dist/index.html and its assets straight out of the archive), so
// Windows refuses to rename that file out from under it — renaming it from
// inside this same process fails with EBUSY every time. Written out to a
// plain temp file (not read from inside app.asar) and launched detached, it
// waits for this process to fully exit — which releases the window's handle
// on the archive — before it dares touch app.asar.
const ASAR_SWAP_HELPER_SRC = `
const fs = require('fs')
const { spawn } = require('child_process')

const [ppid, asarPath, newAsarPath, bakPath, exePath, relaunchArgsJson] = process.argv.slice(2)
const pid = Number(ppid)
const relaunchArgs = JSON.parse(relaunchArgsJson)

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function isRunning(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function main() {
  const deadline = Date.now() + 30000
  while (isRunning(pid) && Date.now() < deadline) await wait(250)
  // The renderer/gpu/utility child processes can take a moment to fully
  // release their handle on app.asar after the main process itself exits.
  await wait(500)

  let renamedOldAside = false
  for (let i = 0; i < 20 && !renamedOldAside; i++) {
    try {
      fs.renameSync(asarPath, bakPath)
      renamedOldAside = true
    } catch {
      await wait(300)
    }
  }

  if (renamedOldAside) {
    try {
      fs.renameSync(newAsarPath, asarPath)
      fs.rmSync(bakPath, { force: true })
    } catch {
      try { fs.renameSync(bakPath, asarPath) } catch {}
    }
  }
  try { fs.rmSync(newAsarPath, { force: true }) } catch {}

  spawn(exePath, relaunchArgs, { detached: true, stdio: 'ignore' }).unref()
  process.exit(0)
}

main()
`

// Replaces the packaged app.asar in place with a freshly-built one, using
// the asar CLI from the source project's own node_modules to extract,
// patch, and repack it. The window always loads dist/index.html from the
// same resources/app.asar path (see loadAppContent) — updating the archive's
// contents rather than pointing the window at a different folder means that
// path never changes, so the browser keeps treating it as the same origin
// and existing localStorage data survives the update.
//
// The new archive is packed and left in place as a sibling file; the actual
// swap happens after this process quits (see ASAR_SWAP_HELPER_SRC above and
// installUpdateAndQuit below).
async function buildUpdatedAsar(sourceFolder, freshDist, send) {
  const asarCli = findAsarCli(sourceFolder)
  if (!asarCli) {
    throw new Error('Could not find the asar packager in the project folder. Run npm install there first.')
  }

  const asarPath = path.join(process.resourcesPath, 'app.asar')
  const stamp = Date.now()
  const extractDir = path.join(app.getPath('temp'), `chloetrap-update-${stamp}`)
  const newAsarPath = path.join(process.resourcesPath, `app.asar.update-${stamp}`)

  send({ status: 'building', text: 'Unpacking current app...' })
  await runNodeScript(asarCli, ['extract', asarPath, extractDir])

  send({ status: 'building', text: 'Applying new build...' })
  fs.rmSync(path.join(extractDir, 'dist'), { recursive: true, force: true })
  fs.cpSync(freshDist, path.join(extractDir, 'dist'), { recursive: true })
  fs.rmSync(path.join(extractDir, 'electron'), { recursive: true, force: true })
  fs.cpSync(path.join(sourceFolder, 'electron'), path.join(extractDir, 'electron'), { recursive: true })

  send({ status: 'building', text: 'Repacking app...' })
  await runNodeScript(asarCli, ['pack', extractDir, newAsarPath])
  fs.rmSync(extractDir, { recursive: true, force: true })

  return { asarPath, newAsarPath }
}

// Hands off to the detached swap helper and quits so it's free to replace
// app.asar, then relaunches the app once the swap is done.
function installUpdateAndQuit(asarPath, newAsarPath) {
  const helperPath = path.join(app.getPath('temp'), `chloetrap-swap-${Date.now()}.js`)
  fs.writeFileSync(helperPath, ASAR_SWAP_HELPER_SRC)
  const bakPath = `${asarPath}.bak-${Date.now()}`
  // Preserve whatever this process was launched with (mirrors app.relaunch()'s
  // own default of reusing process.argv), so a custom --user-data-dir or
  // similar flag isn't dropped by the relaunch.
  const relaunchArgs = JSON.stringify(process.argv.slice(1))

  spawn(process.execPath, [helperPath, String(process.pid), asarPath, newAsarPath, bakPath, process.execPath, relaunchArgs], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  }).unref()

  setTimeout(() => app.quit(), 500)
}

// Build the selected source folder, then install the fresh build.
ipcMain.handle('trigger-update', () => {
  if (!mainWindow || updateProcess || updateInProgress) return { started: false }
  const send = (message) => mainWindow.webContents.send('update-progress', message)
  const sourceFolder = getSavedSourceFolder() || (isDev ? PROJECT_ROOT : '')

  if (!isSourceFolder(sourceFolder)) {
    send({ status: 'error', text: 'Choose the Chloe Trap project folder in Help Center first.' })
    return { started: false }
  }

  const viteJs = path.join(sourceFolder, 'node_modules', 'vite', 'bin', 'vite.js')
  if (!fs.existsSync(viteJs)) {
    send({ status: 'error', text: 'Dependencies are missing. Run npm install in the selected folder first.' })
    return { started: false }
  }

  // Build into a fresh, uniquely-named directory instead of overwriting
  // dist/ in place — Vite would otherwise try to delete/overwrite files
  // that are still open (either the dev server's own dist/, or, for a
  // packaged build, files staged below). This directory is only ever a
  // staging area now; it's copied into app.asar (see repackAppAsar) or
  // discarded, and always cleaned up before this handler's work is done.
  const buildDir = path.join(sourceFolder, `dist-update-${Date.now()}`)
  updateInProgress = true

  send({ status: 'building', text: `Building from ${sourceFolder}` })
  const proc = spawn(process.execPath, [viteJs, 'build', '--outDir', buildDir], {
    cwd: sourceFolder,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })
  updateProcess = proc

  // Without this, a spawn that fails outright (rather than exiting non-zero)
  // can leave updateProcess/updateInProgress set forever with no error ever
  // sent to the UI — every future click then silently no-ops against the
  // `if (updateProcess || updateInProgress) return` guard above, with nothing
  // on screen to explain why, until the app is fully restarted.
  proc.on('error', (err) => {
    updateProcess = null
    updateInProgress = false
    send({ status: 'error', text: `Could not start the build: ${err.message}` })
    try { fs.rmSync(buildDir, { recursive: true, force: true }) } catch {}
  })

  proc.stdout.on('data', data => send({ status: 'building', text: data.toString().trim() }))
  proc.stderr.on('data', data => send({ status: 'building', text: data.toString().trim() }))

  proc.on('close', async (code) => {
    updateProcess = null

    if (code !== 0) {
      send({ status: 'error', text: `Build failed (exit ${code})` })
      try { fs.rmSync(buildDir, { recursive: true, force: true }) } catch {}
      updateInProgress = false
      return
    }

    saveSourceFolder(sourceFolder)

    if (isDev) {
      send({ status: 'done', text: 'Build succeeded. Reloading...' })
      try { fs.rmSync(buildDir, { recursive: true, force: true }) } catch {}
      mainWindow?.webContents.reload()
      updateInProgress = false
      return
    }

    try {
      const { asarPath, newAsarPath } = await buildUpdatedAsar(sourceFolder, buildDir, send)
      send({ status: 'done', text: 'Update ready. Restarting the app...' })
      installUpdateAndQuit(asarPath, newAsarPath)
    } catch (e) {
      send({ status: 'error', text: `Update failed: ${e.message}` })
      updateInProgress = false
    } finally {
      try { fs.rmSync(buildDir, { recursive: true, force: true }) } catch {}
    }
  })

  return { started: true, folder: sourceFolder }
})

// ── Credential encryption ────────────────────────────────────────────────────
// WordPress site passwords used to be written to localStorage in plain text.
// safeStorage encrypts with the OS's own credential store (DPAPI on Windows,
// Keychain on macOS), so the ciphertext is useless outside this machine/user
// account. Falls back to returning null when the OS store isn't available —
// the renderer then falls back to storing plaintext rather than losing data.

ipcMain.handle('encrypt-secret', (_event, plaintext) => {
  if (!plaintext) return ''
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.encryptString(plaintext).toString('base64')
  } catch {
    return null
  }
})

ipcMain.handle('decrypt-secret', (_event, ciphertextBase64) => {
  if (!ciphertextBase64) return ''
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(ciphertextBase64, 'base64'))
  } catch {
    return null
  }
})

// ── GA4 helpers ──────────────────────────────────────────────────────────────

// Shared JWT signer for any Google service-account scope (GA4, Search
// Console, ...) — only the requested scope changes between callers.
function makeGoogleJwt(serviceAccount, scope) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const claims = Buffer.from(JSON.stringify({
    iss: serviceAccount.client_email,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url')
  const input = `${header}.${claims}`
  const sig = crypto.createSign('RSA-SHA256').update(input).sign(serviceAccount.private_key, 'base64url')
  return `${input}.${sig}`
}

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const bodyBuf = Buffer.isBuffer(body) ? body : Buffer.from(body)
    const req = https.request(
      { hostname, path, method: 'POST', headers: { ...headers, 'Content-Length': bodyBuf.length } },
      res => {
        const chunks = []
        res.on('data', d => chunks.push(d))
        res.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
          catch (e) { reject(e) }
        })
      }
    )
    req.on('error', reject)
    req.write(bodyBuf)
    req.end()
  })
}

async function googleGetToken(serviceAccount, scope) {
  const jwt = makeGoogleJwt(serviceAccount, scope)
  const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  const json = await httpsPost('oauth2.googleapis.com', '/token',
    { 'Content-Type': 'application/x-www-form-urlencoded' }, body)
  if (!json.access_token) throw new Error(json.error_description || json.error || 'No access_token returned')
  return json.access_token
}

async function ga4GetToken(serviceAccount) {
  return googleGetToken(serviceAccount, 'https://www.googleapis.com/auth/analytics.readonly')
}

async function ga4RunReport(token, propertyId, days) {
  const end = new Date()
  const start = new Date(Date.now() - (days - 1) * 86400000)
  const fmt = d => d.toISOString().slice(0, 10)
  const payload = JSON.stringify({
    dateRanges: [{ startDate: fmt(start), endDate: fmt(end) }],
    dimensions: [{ name: 'date' }],
    metrics: [{ name: 'sessions' }, { name: 'screenPageViews' }],
    orderBys: [{ dimension: { dimensionName: 'date' } }],
  })
  const json = await httpsPost(
    'analyticsdata.googleapis.com',
    `/v1beta/properties/${propertyId}:runReport`,
    { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    payload,
  )
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error))
  if (!json.rows) return []
  return json.rows.map(row => ({
    date: row.dimensionValues[0].value,
    sessions: parseInt(row.metricValues[0].value) || 0,
    pageviews: parseInt(row.metricValues[1].value) || 0,
  }))
}

ipcMain.handle('ga4-fetch', async (_event, { serviceAccountJson, propertyId, days }) => {
  try {
    const sa = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson
    const token = await ga4GetToken(sa)
    const data = await ga4RunReport(token, propertyId, days || 30)
    return { success: true, data }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// Per-page breakdown (traffic per post) — same property, dimensioned by
// pagePath and ranked by sessions instead of by date.
async function ga4RunPageReport(token, propertyId, days, limit) {
  const end = new Date()
  const start = new Date(Date.now() - (days - 1) * 86400000)
  const fmt = d => d.toISOString().slice(0, 10)
  const payload = JSON.stringify({
    dateRanges: [{ startDate: fmt(start), endDate: fmt(end) }],
    dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
    metrics: [{ name: 'sessions' }, { name: 'screenPageViews' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: limit || 100,
  })
  const json = await httpsPost(
    'analyticsdata.googleapis.com',
    `/v1beta/properties/${propertyId}:runReport`,
    { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    payload,
  )
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error))
  if (!json.rows) return []
  return json.rows.map(row => ({
    path: row.dimensionValues[0].value,
    title: row.dimensionValues[1].value,
    sessions: parseInt(row.metricValues[0].value) || 0,
    pageviews: parseInt(row.metricValues[1].value) || 0,
  }))
}

ipcMain.handle('ga4-fetch-pages', async (_event, { serviceAccountJson, propertyId, days, limit }) => {
  try {
    const sa = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson
    const token = await ga4GetToken(sa)
    const data = await ga4RunPageReport(token, propertyId, days || 30, limit || 100)
    return { success: true, data }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// ── Search Console helpers ──────────────────────────────────────────────────
// Requires the service account to be added as a user under Search Console →
// Settings → Users and permissions on the property being queried.

async function gscGetToken(serviceAccount) {
  return googleGetToken(serviceAccount, 'https://www.googleapis.com/auth/webmasters.readonly')
}

async function gscRunQuery(token, siteUrl, { days, dimensions, rowLimit, queryFilter }) {
  const end = new Date()
  // Search Console data has a ~2-3 day reporting lag, so "today" is never
  // actually available yet — back the window off to avoid an empty tail.
  end.setDate(end.getDate() - 2)
  const start = new Date(end.getTime() - (days - 1) * 86400000)
  const fmt = d => d.toISOString().slice(0, 10)

  const payload = {
    startDate: fmt(start),
    endDate: fmt(end),
    dimensions,
    rowLimit: rowLimit || 100,
  }
  if (queryFilter) {
    payload.dimensionFilterGroups = [{
      filters: [{ dimension: 'query', operator: 'equals', expression: queryFilter }],
    }]
  }

  const json = await httpsPost(
    'www.googleapis.com',
    `/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    JSON.stringify(payload),
  )
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error))
  if (!json.rows) return []
  return json.rows.map(row => ({
    keys: row.keys,
    clicks: row.clicks || 0,
    impressions: row.impressions || 0,
    ctr: row.ctr || 0,
    position: row.position || 0,
  }))
}

ipcMain.handle('gsc-fetch', async (_event, { serviceAccountJson, siteUrl, days, dimensions, rowLimit, queryFilter }) => {
  try {
    const sa = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson
    const token = await gscGetToken(sa)
    const data = await gscRunQuery(token, siteUrl, { days: days || 28, dimensions: dimensions || ['query'], rowLimit, queryFilter })
    return { success: true, data }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// ─────────────────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Nothing is loaded yet at startup, so any dist-update-* dir or
  // app.asar.bak-* file left over from a previous session (e.g. the app
  // crashed or was closed mid-update) is safe to remove.
  const sourceFolder = getSavedSourceFolder() || (isDev ? PROJECT_ROOT : '')
  if (isSourceFolder(sourceFolder)) cleanupStaleBuildDirs(sourceFolder)
  if (!isDev) cleanupStaleAsarBackups()

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
