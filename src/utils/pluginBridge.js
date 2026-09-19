// Talks to the "Chloe Trap Bridge" companion plugin installed on each managed
// site (see bridge-plugin/chloe-trap-bridge.php). WordPress's own REST API
// has no endpoint for uploading a zip and installing/updating it — this
// bridge is what makes real cross-site plugin upload/update possible.

const BRIDGE = 'wp-json/chloe-bridge/v1'

function authHeader(site) {
  return 'Basic ' + btoa(`${site.username}:${site.password}`)
}

export async function bridgeStatus(site) {
  try {
    const res = await fetch(`${site.url}/${BRIDGE}/status`, {
      headers: { Authorization: authHeader(site) },
      signal: AbortSignal.timeout(15000),
    })
    if (res.status === 404) return { installed: false }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { installed: true, ok: false, error: err.message || `HTTP ${res.status}` }
    }
    const data = await res.json()
    return { installed: true, ok: true, ...data }
  } catch (e) {
    return { installed: false, error: e.message }
  }
}

export async function fetchSitePlugins(site, { refresh = false } = {}) {
  try {
    const q = refresh ? '?refresh=1' : ''
    const res = await fetch(`${site.url}/${BRIDGE}/plugins${q}`, {
      headers: { Authorization: authHeader(site) },
      signal: AbortSignal.timeout(refresh ? 45000 : 15000),
    })
    const data = await res.json().catch(() => ([]))
    if (!res.ok) return { success: false, error: data.message || `HTTP ${res.status}` }
    return { success: true, plugins: data }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

export async function uploadPluginToSite(site, file, { activate = false } = {}) {
  try {
    const form = new FormData()
    form.append('file', file)
    form.append('activate', activate ? '1' : '0')
    const res = await fetch(`${site.url}/${BRIDGE}/upload`, {
      method: 'POST',
      headers: { Authorization: authHeader(site) },
      body: form,
      signal: AbortSignal.timeout(90000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { success: false, error: data.message || `HTTP ${res.status}` }
    return { success: true, ...data }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

async function postAction(site, action, body, timeout = 60000) {
  try {
    const res = await fetch(`${site.url}/${BRIDGE}/${action}`, {
      method: 'POST',
      headers: { Authorization: authHeader(site), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { success: false, error: data.message || `HTTP ${res.status}` }
    return { success: true, ...data }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

export const updatePluginOnSite     = (site, plugin) => postAction(site, 'update', { plugin }, 90000)
export const activatePluginOnSite   = (site, plugin) => postAction(site, 'activate', { plugin })
export const deactivatePluginOnSite = (site, plugin) => postAction(site, 'deactivate', { plugin })
export const deletePluginOnSite     = (site, plugin) => postAction(site, 'delete', { plugin })
export const restorePluginOnSite    = (site, plugin, backupFile) => postAction(site, 'restore', { plugin, backupFile }, 90000)

// Concurrency-limited fan-out across many sites at once — used for "upload
// to all sites" / "update on all sites" so 13 sites don't all fire at the
// same instant and flood slower hosts.
export async function runAcrossSites(sites, worker, { concurrency = 3, onProgress } = {}) {
  const results = {}
  let i = 0
  let done = 0
  async function lane() {
    while (i < sites.length) {
      const site = sites[i++]
      results[site.id] = await worker(site)
      done++
      onProgress?.(done, sites.length, site)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, sites.length) }, lane))
  return results
}
