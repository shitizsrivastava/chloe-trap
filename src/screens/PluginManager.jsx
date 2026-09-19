import React, { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useNotify } from '../context/NotificationContext'
import {
  bridgeStatus, fetchSitePlugins, uploadPluginToSite,
  updatePluginOnSite, activatePluginOnSite, deactivatePluginOnSite, deletePluginOnSite, restorePluginOnSite,
  runAcrossSites,
} from '../utils/pluginBridge'
import { createZip, detectZipSlug } from '../utils/miniZip'
import SiteAvatar from '../components/SiteAvatar'
import bridgeSource from '../../bridge-plugin/chloe-trap-bridge.php?raw'
import './PluginManager.css'

function downloadBridgeZip() {
  const zip = createZip([{ name: 'chloe-trap-bridge/chloe-trap-bridge.php', content: bridgeSource }])
  const url = URL.createObjectURL(zip)
  const a = document.createElement('a')
  a.href = url
  a.download = 'chloe-trap-bridge.zip'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

function StatusPill({ status }) {
  if (!status) return <span className="pm-pill idle">Not checked</span>
  if (!status.installed) return <span className="pm-pill missing">Not installed</span>
  if (!status.ok) return <span className="pm-pill error" title={status.error}>Auth error</span>
  if (!status.canManagePlugins) return <span className="pm-pill error">Insufficient permissions</span>
  return <span className="pm-pill ok">Bridge v{status.bridgeVersion}</span>
}

export default function PluginManager() {
  const { sites } = useApp()
  const { notifySuccess, notifyError, notifyWarning } = useNotify()

  const eligibleSites = useMemo(() => sites.filter(s => s.connected && s.username && s.password), [sites])

  const [tab, setTab] = useState('setup')

  // ── Bridge status per site ────────────────────────────────────────────
  const [bridgeStatuses, setBridgeStatuses] = useState({})
  const [checkingBridge, setCheckingBridge] = useState(false)

  const checkAllBridges = async () => {
    if (eligibleSites.length === 0) return
    setCheckingBridge(true)
    await runAcrossSites(eligibleSites, async site => {
      const status = await bridgeStatus(site)
      setBridgeStatuses(prev => ({ ...prev, [site.id]: status }))
      return status
    }, { concurrency: 4 })
    setCheckingBridge(false)
  }

  useEffect(() => { checkAllBridges() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const bridgeReadySites = useMemo(
    () => eligibleSites.filter(s => bridgeStatuses[s.id]?.installed && bridgeStatuses[s.id]?.ok && bridgeStatuses[s.id]?.canManagePlugins),
    [eligibleSites, bridgeStatuses]
  )
  const bridgeMissingCount = eligibleSites.length - bridgeReadySites.length

  // ── Installed plugins + updates across sites ──────────────────────────
  // Declared here (ahead of the upload-mode logic below) because
  // 'update-only' mode's site filtering reads pluginsBySite/refreshSitesPlugins
  // directly — referencing a const before its declaration in the same
  // component body throws at render time, which is fatal since there's no
  // error boundary (the whole screen goes blank).
  const [pluginsBySite, setPluginsBySite] = useState({})
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0 })
  const [busyAction, setBusyAction] = useState(null) // e.g. `${siteId}:${file}`
  const [updatingGroup, setUpdatingGroup] = useState(null)

  const refreshSitesPlugins = async (targetSites, { refresh = false } = {}) => {
    const list = targetSites.filter(s => bridgeReadySites.some(b => b.id === s.id))
    if (list.length === 0) return
    await runAcrossSites(list, async site => {
      const res = await fetchSitePlugins(site, { refresh })
      setPluginsBySite(prev => ({ ...prev, [site.id]: res }))
      return res
    }, { concurrency: 3 })
  }

  const scanAllPlugins = async (refresh = false) => {
    if (bridgeReadySites.length === 0) { notifyWarning('No sites have the bridge installed yet — set that up in the Setup tab first.'); return }
    setScanning(true)
    setScanProgress({ done: 0, total: bridgeReadySites.length })
    await runAcrossSites(bridgeReadySites, async site => {
      const res = await fetchSitePlugins(site, { refresh })
      setPluginsBySite(prev => ({ ...prev, [site.id]: res }))
      return res
    }, { concurrency: 3, onProgress: (done, total) => setScanProgress({ done, total }) })
    setScanning(false)
  }

  const aggregated = useMemo(() => {
    const map = new Map()
    for (const site of bridgeReadySites) {
      const res = pluginsBySite[site.id]
      if (!res?.success) continue
      for (const p of res.plugins) {
        if (!map.has(p.name)) map.set(p.name, { name: p.name, entries: [] })
        map.get(p.name).entries.push({ site, ...p })
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [pluginsBySite, bridgeReadySites])

  const updateGroups = aggregated.filter(g => g.entries.some(e => e.updateAvailable))
  const hasScanned = bridgeReadySites.some(s => pluginsBySite[s.id])

  const updatePluginEverywhere = async (group) => {
    const targets = group.entries.filter(e => e.updateAvailable)
    setUpdatingGroup(group.name)
    const results = await runAcrossSites(targets.map(t => t.site), async site => {
      const entry = targets.find(t => t.site.id === site.id)
      return updatePluginOnSite(site, entry.file)
    }, { concurrency: 2 })
    setUpdatingGroup(null)
    const okCount = Object.values(results).filter(r => r.success).length
    if (okCount === targets.length) notifySuccess(`✓ Updated "${group.name}" on all ${okCount} site(s)`)
    else notifyError(`Updated "${group.name}" on ${okCount}/${targets.length} sites — some failed`, { action: 'Plugin Update' })
    refreshSitesPlugins(targets.map(t => t.site))
  }

  const runSingle = async (site, file, kind, fn) => {
    setBusyAction(`${site.id}:${file}:${kind}`)
    const res = await fn(site, file)
    setBusyAction(null)
    if (res.success) {
      notifySuccess(`✓ ${kind === 'delete' ? 'Deleted' : kind === 'activate' ? 'Activated' : 'Deactivated'} on ${site.name}`)
      refreshSitesPlugins([site])
    } else {
      notifyError(`Failed to ${kind} on ${site.name}: ${res.error}`, { site: site.name, action: 'Plugin Manage' })
    }
  }

  // ── Upload / install to many sites at once ────────────────────────────
  // 'install' = push to whichever sites you pick, fresh install or overwrite.
  // 'update-only' = you never pick sites yourself — the target list is
  // auto-restricted to sites that already have this exact plugin, detected
  // from the zip itself. This exists because "install to sites I checked"
  // and "update sites that already have this" look like the same action but
  // aren't: a plugin that's genuinely new to a site (e.g. Elementor Pro
  // landing on a site that never had it) should never happen from an
  // update-only run.
  const [uploadMode, setUploadMode] = useState('install')
  const [uploadFile, setUploadFile] = useState(null)
  const [detectedSlug, setDetectedSlug] = useState(null)
  const [detectingSlug, setDetectingSlug] = useState(false)
  const [activateAfterUpload, setActivateAfterUpload] = useState(true)
  const [selectedSiteIds, setSelectedSiteIds] = useState(new Set())
  const [uploadResults, setUploadResults] = useState({})
  const [uploading, setUploading] = useState(false)
  const [lastBatch, setLastBatch] = useState(null) // { entries: [{site, plugin, name, wasUpdate, backupFile}] }
  const [undoResults, setUndoResults] = useState({})
  const [undoing, setUndoing] = useState(false)

  useEffect(() => {
    if (!uploadFile) { setDetectedSlug(null); return }
    setDetectingSlug(true)
    detectZipSlug(uploadFile).then(slug => { setDetectedSlug(slug); setDetectingSlug(false) })
  }, [uploadFile])

  // Sites (among bridge-ready ones) that a plugins scan has confirmed
  // already have the detected slug installed — this is the entire target
  // list in 'update-only' mode, full stop, regardless of what's checked.
  const sitesWithDetectedPlugin = useMemo(() => {
    if (!detectedSlug) return []
    return bridgeReadySites.filter(s => {
      const res = pluginsBySite[s.id]
      return res?.success && res.plugins.some(p => p.file.startsWith(detectedSlug + '/'))
    })
  }, [detectedSlug, bridgeReadySites, pluginsBySite])

  const unscannedSites = bridgeReadySites.filter(s => !pluginsBySite[s.id])
  const targetPool = uploadMode === 'update-only' ? sitesWithDetectedPlugin : bridgeReadySites

  useEffect(() => {
    setSelectedSiteIds(new Set(targetPool.map(s => s.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadMode, detectedSlug, targetPool.map(s => s.id).join(',')])

  const toggleSite = (id) => {
    if (uploadMode === 'update-only' && !targetPool.some(s => s.id === id)) return
    setSelectedSiteIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const scanForUpdateOnly = () => refreshSitesPlugins(unscannedSites)

  const handleUploadToSites = async () => {
    if (!uploadFile) { notifyWarning('Choose a .zip file first.'); return }
    const targets = targetPool.filter(s => selectedSiteIds.has(s.id))
    if (targets.length === 0) {
      notifyWarning(uploadMode === 'update-only'
        ? 'No sites have this plugin installed yet — scan first, or switch to Install mode.'
        : 'Select at least one site with the bridge installed.')
      return
    }

    setUploading(true)
    setLastBatch(null)
    setUndoResults({})
    setUploadResults(Object.fromEntries(targets.map(s => [s.id, { status: 'pending' }])))

    const batchEntries = []
    const results = await runAcrossSites(targets, async site => {
      setUploadResults(prev => ({ ...prev, [site.id]: { status: 'uploading' } }))
      const res = await uploadPluginToSite(site, uploadFile, { activate: activateAfterUpload })
      setUploadResults(prev => ({
        ...prev,
        [site.id]: res.success
          ? { status: 'ok', message: `${res.name}${res.version ? ` v${res.version}` : ''}${res.activated ? ' — active' : ''}${res.wasUpdate ? ' (updated)' : ' (installed)'}` }
          : { status: 'fail', message: res.error },
      }))
      if (res.success) batchEntries.push({ site, plugin: res.plugin, name: res.name, wasUpdate: res.wasUpdate, backupFile: res.backupFile })
      return res
    }, { concurrency: 3 })

    setUploading(false)
    const okCount = Object.values(results).filter(r => r.success).length
    if (okCount === targets.length) notifySuccess(`✓ "${uploadFile.name}" uploaded to all ${okCount} site(s)`)
    else notifyError(`Uploaded to ${okCount}/${targets.length} sites — see results below for what failed`, { action: 'Bulk Plugin Upload' })
    if (batchEntries.length > 0) setLastBatch({ entries: batchEntries })
    refreshSitesPlugins(targets)
  }

  const handleUndo = async (entries) => {
    setUndoing(true)
    setUndoResults(prev => ({ ...prev, ...Object.fromEntries(entries.map(e => [e.site.id, { status: 'pending' }])) }))
    const results = await runAcrossSites(entries.map(e => e.site), async site => {
      const entry = entries.find(e => e.site.id === site.id)
      setUndoResults(prev => ({ ...prev, [site.id]: { status: 'undoing' } }))
      let res
      if (entry.wasUpdate) {
        res = entry.backupFile
          ? await restorePluginOnSite(site, entry.plugin, entry.backupFile)
          : { success: false, error: 'No backup was captured for this update — cannot undo automatically.' }
      } else {
        res = await deletePluginOnSite(site, entry.plugin)
      }
      setUndoResults(prev => ({
        ...prev,
        [site.id]: res.success
          ? { status: 'ok', message: entry.wasUpdate ? 'Reverted to previous version' : 'Removed' }
          : { status: 'fail', message: res.error },
      }))
      return res
    }, { concurrency: 2 })
    setUndoing(false)
    const okCount = Object.values(results).filter(r => r.success).length
    if (okCount === entries.length) notifySuccess(`✓ Undone on ${okCount} site(s)`)
    else notifyError(`Undo finished on ${okCount}/${entries.length} sites — see results for what failed`, { action: 'Undo Plugin Upload' })
    refreshSitesPlugins(entries.map(e => e.site))
  }

  return (
    <div className="pm-screen">
      <div className="page-header-row">
        <div>
          <h1>Plugins</h1>
          <p className="pm-subtitle">
            Upload a plugin, install it, or push an update to some or all of your {sites.length} sites in one click.
          </p>
        </div>
      </div>

      <div className="pm-tabs">
        <button className={`pm-tab${tab === 'setup' ? ' active' : ''}`} onClick={() => setTab('setup')}>
          Setup {bridgeMissingCount > 0 && <span className="pm-tab-badge">{bridgeMissingCount}</span>}
        </button>
        <button className={`pm-tab${tab === 'upload' ? ' active' : ''}`} onClick={() => setTab('upload')}>Upload / Install</button>
        <button className={`pm-tab${tab === 'updates' ? ' active' : ''}`} onClick={() => setTab('updates')}>
          Updates {updateGroups.length > 0 && <span className="pm-tab-badge warn">{updateGroups.length}</span>}
        </button>
      </div>

      {tab === 'setup' && (
        <div className="pm-panel">
          <div className="pm-setup-intro">
            <p>
              WordPress's own REST API can't accept a plugin zip file — so each site needs a tiny one-time
              companion plugin (the <strong>Chloe Trap Bridge</strong>) that lets this app push uploads and updates to it.
              Install it once per site, the same way you'd install any plugin: download the zip below, then on each
              site go to <strong>WP Admin → Plugins → Add New Plugin → Upload Plugin</strong>, choose the zip, click
              <strong> Install Now</strong>, then <strong>Activate</strong>.
            </p>
            <div className="pm-setup-actions">
              <button className="btn btn-primary btn-sm" onClick={downloadBridgeZip}>⬇ Download Bridge Plugin (.zip)</button>
              <button className="btn btn-secondary btn-sm" onClick={checkAllBridges} disabled={checkingBridge}>
                {checkingBridge ? 'Checking…' : '⟳ Re-check All Sites'}
              </button>
            </div>
          </div>

          <div className="pm-table-wrap">
            <table className="pm-table">
              <thead>
                <tr>
                  <th className="pm-th">Site</th>
                  <th className="pm-th">Bridge Status</th>
                </tr>
              </thead>
              <tbody>
                {eligibleSites.length === 0 && (
                  <tr><td colSpan={2} className="pm-empty-cell">No connected sites yet — add credentials in Site Manager first.</td></tr>
                )}
                {eligibleSites.map(site => (
                  <tr key={site.id} className="pm-row">
                    <td className="pm-td">
                      <div className="pm-site-cell">
                        <SiteAvatar site={site} size={26} radius={7} />
                        {site.name}
                      </div>
                    </td>
                    <td className="pm-td"><StatusPill status={bridgeStatuses[site.id]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'upload' && (
        <div className="pm-panel">
          {bridgeReadySites.length === 0 ? (
            <div className="pm-empty">
              <div style={{ fontSize: 40, marginBottom: 12 }}>🔌</div>
              <p>No sites have the bridge installed yet.</p>
              <p className="pm-empty-sub">Set that up in the Setup tab first — it only takes a minute per site.</p>
              <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => setTab('setup')}>Go to Setup →</button>
            </div>
          ) : (
            <>
              <div className="pm-mode-toggle">
                <button className={`pm-mode-btn${uploadMode === 'install' ? ' active' : ''}`} onClick={() => setUploadMode('install')} disabled={uploading}>
                  <div className="pm-mode-title">📥 Install</div>
                  <div className="pm-mode-desc">Push to sites you pick — fresh install, or overwrite if already there.</div>
                </button>
                <button className={`pm-mode-btn${uploadMode === 'update-only' ? ' active' : ''}`} onClick={() => setUploadMode('update-only')} disabled={uploading}>
                  <div className="pm-mode-title">🔄 Update Only</div>
                  <div className="pm-mode-desc">Only touches sites that already have this exact plugin — nowhere else, no manual picking.</div>
                </button>
              </div>

              <div className="pm-upload-box">
                <div className="pm-upload-row">
                  <label className="pm-file-label">
                    <input type="file" accept=".zip" onChange={e => setUploadFile(e.target.files?.[0] || null)} />
                    {uploadFile ? `📦 ${uploadFile.name}` : '📦 Choose plugin .zip…'}
                  </label>
                  {uploadMode === 'install' && (
                    <label className="pm-checkbox">
                      <input type="checkbox" checked={activateAfterUpload} onChange={e => setActivateAfterUpload(e.target.checked)} />
                      Activate after install
                    </label>
                  )}
                </div>
                {uploadFile && (
                  <p className="pm-hint">
                    {detectingSlug ? 'Reading zip…' : detectedSlug
                      ? <>Detected plugin folder: <strong>{detectedSlug}</strong></>
                      : "Couldn't detect a plugin folder in this zip — it may not be a standard WordPress plugin package."}
                  </p>
                )}
                {uploadMode === 'install' ? (
                  <p className="pm-hint">
                    If a plugin with the same folder name is already installed on a site, it's overwritten in place
                    (an update) and its active/inactive state is preserved automatically.
                  </p>
                ) : (
                  <p className="pm-hint">
                    Its active/inactive state is preserved automatically, and a backup of the previous version is taken
                    first so this can be undone.
                  </p>
                )}
              </div>

              {uploadMode === 'update-only' && detectedSlug && unscannedSites.length > 0 && (
                <div className="pm-scan-notice">
                  {unscannedSites.length} site{unscannedSites.length === 1 ? " hasn't" : "s haven't"} been scanned yet, so
                  they can't be checked for "{detectedSlug}" — scan them to include them if they have it.
                  <button className="pm-link-btn" onClick={scanForUpdateOnly} disabled={scanning}>{scanning ? 'Scanning…' : 'Scan now'}</button>
                </div>
              )}

              <div className="pm-site-select-header">
                <span>
                  {uploadMode === 'update-only'
                    ? `Sites with "${detectedSlug || '…'}" installed (${selectedSiteIds.size}/${targetPool.length})`
                    : `Target sites (${selectedSiteIds.size}/${targetPool.length})`}
                </span>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="pm-link-btn" onClick={() => setSelectedSiteIds(new Set(targetPool.map(s => s.id)))}>Select All</button>
                  <button className="pm-link-btn" onClick={() => setSelectedSiteIds(new Set())}>Unselect All</button>
                </div>
              </div>

              {uploadMode === 'update-only' && detectedSlug && targetPool.length === 0 && (
                <div className="pm-empty" style={{ padding: '24px 20px' }}>
                  <p>No scanned site has "{detectedSlug}" installed.</p>
                  <p className="pm-empty-sub">Nothing will be touched — switch to Install mode if you actually want to add it somewhere new.</p>
                </div>
              )}

              <div className="pm-site-grid">
                {targetPool.map(site => {
                  const result = uploadResults[site.id]
                  return (
                    <label key={site.id} className={`pm-site-check${result ? ` ${result.status}` : ''}`}>
                      <input type="checkbox" checked={selectedSiteIds.has(site.id)} onChange={() => toggleSite(site.id)} disabled={uploading} />
                      <SiteAvatar site={site} size={22} radius={6} />
                      <span className="pm-site-check-name">{site.name}</span>
                      {result?.status === 'pending' && <span className="pm-site-check-status">queued</span>}
                      {result?.status === 'uploading' && <span className="pm-site-check-status busy">uploading…</span>}
                      {result?.status === 'ok' && <span className="pm-site-check-status ok" title={result.message}>✓ {result.message}</span>}
                      {result?.status === 'fail' && <span className="pm-site-check-status fail" title={result.message}>✗ {result.message}</span>}
                    </label>
                  )
                })}
              </div>

              <button className="btn btn-primary" onClick={handleUploadToSites} disabled={uploading || !uploadFile || selectedSiteIds.size === 0}>
                {uploading ? 'Uploading…' : `⬆ Upload to ${selectedSiteIds.size} Site${selectedSiteIds.size === 1 ? '' : 's'}`}
              </button>

              {lastBatch && (
                <div className="pm-undo-box">
                  <div className="pm-undo-head">
                    <span>Last upload — {lastBatch.entries.length} site{lastBatch.entries.length === 1 ? '' : 's'} touched</span>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleUndo(lastBatch.entries.filter(e => !undoResults[e.site.id] || undoResults[e.site.id].status === 'fail'))}
                      disabled={undoing || lastBatch.entries.every(e => undoResults[e.site.id]?.status === 'ok')}
                    >
                      {undoing ? 'Undoing…' : '↩ Undo All'}
                    </button>
                  </div>
                  <div className="pm-undo-list">
                    {lastBatch.entries.map(e => {
                      const u = undoResults[e.site.id]
                      return (
                        <div key={e.site.id} className="pm-undo-row">
                          <SiteAvatar site={e.site} size={20} radius={5} />
                          <span className="pm-undo-site">{e.site.name}</span>
                          <span className="pm-undo-action">{e.wasUpdate ? 'Updated' : 'Installed'}</span>
                          {u?.status === 'ok' ? (
                            <span className="pm-undo-status ok">✓ {u.message}</span>
                          ) : u?.status === 'fail' ? (
                            <span className="pm-undo-status fail" title={u.message}>✗ Undo failed</span>
                          ) : u?.status === 'undoing' ? (
                            <span className="pm-undo-status busy">Undoing…</span>
                          ) : e.wasUpdate && !e.backupFile ? (
                            <span className="pm-undo-status fail" title="No backup was captured for this update — the site's PHP may be missing the ZipArchive extension.">No backup available</span>
                          ) : (
                            <button className="pm-link-btn" onClick={() => handleUndo([e])} disabled={undoing}>↩ Undo</button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'updates' && (
        <div className="pm-panel">
          <div className="pm-updates-toolbar">
            <button className="btn btn-secondary btn-sm" onClick={() => scanAllPlugins(false)} disabled={scanning || bridgeReadySites.length === 0}>
              {scanning ? `Scanning ${scanProgress.done}/${scanProgress.total}…` : hasScanned ? '⟳ Rescan' : '🔍 Scan All Sites'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => scanAllPlugins(true)} disabled={scanning || bridgeReadySites.length === 0} title="Force each site to check wordpress.org / vendor servers for new versions — slower">
              {scanning ? '…' : '🌐 Force Update-Check'}
            </button>
            {hasScanned && (
              <span className="pm-updates-summary">
                {updateGroups.length > 0 ? `${updateGroups.length} plugin(s) have updates pending` : 'Everything is up to date 🎉'}
              </span>
            )}
          </div>

          {!hasScanned && !scanning && (
            <div className="pm-empty">
              <div style={{ fontSize: 40, marginBottom: 12 }}>🧩</div>
              <p>Scan your sites to see what's installed and what needs updating.</p>
            </div>
          )}

          {hasScanned && updateGroups.length > 0 && (
            <div className="pm-updates-list">
              {updateGroups.map(group => {
                const pending = group.entries.filter(e => e.updateAvailable)
                return (
                  <div key={group.name} className="pm-update-card">
                    <div className="pm-update-card-head">
                      <div>
                        <div className="pm-update-name">{group.name}</div>
                        <div className="pm-update-sites">
                          needs updating on {pending.length} site{pending.length === 1 ? '' : 's'} →{' '}
                          {pending.map(e => `${e.version}→${e.newVersion}`).join(', ')}
                        </div>
                      </div>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => updatePluginEverywhere(group)}
                        disabled={updatingGroup === group.name}
                      >
                        {updatingGroup === group.name ? 'Updating…' : `Update on ${pending.length} Site${pending.length === 1 ? '' : 's'}`}
                      </button>
                    </div>
                    <div className="pm-update-site-pills">
                      {pending.map(e => (
                        <span key={e.site.id} className="pm-mini-pill" title={e.site.name}>
                          <SiteAvatar site={e.site} size={16} radius={4} /> {e.site.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {hasScanned && (
            <div className="pm-allplugins">
              <div className="pm-allplugins-head">All plugins by site</div>
              <div className="pm-table-wrap">
                <table className="pm-table">
                  <thead>
                    <tr>
                      <th className="pm-th">Plugin</th>
                      <th className="pm-th">Site</th>
                      <th className="pm-th">Version</th>
                      <th className="pm-th">Status</th>
                      <th className="pm-th"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {aggregated.flatMap(group => group.entries.map(e => {
                      const key = `${e.site.id}:${e.file}`
                      return (
                        <tr key={key} className="pm-row">
                          <td className="pm-td">{group.name}</td>
                          <td className="pm-td">
                            <div className="pm-site-cell"><SiteAvatar site={e.site} size={20} radius={5} />{e.site.name}</div>
                          </td>
                          <td className="pm-td mono">
                            {e.version}{e.updateAvailable && <span className="pm-newver"> → {e.newVersion}</span>}
                          </td>
                          <td className="pm-td">
                            <span className={`pm-status-dot ${e.active ? 'on' : 'off'}`} /> {e.active ? 'Active' : 'Inactive'}
                          </td>
                          <td className="pm-td pm-td-actions">
                            <button
                              className="pm-icon-btn" title={e.active ? 'Deactivate' : 'Activate'}
                              disabled={busyAction === `${key}:activate` || busyAction === `${key}:deactivate`}
                              onClick={() => runSingle(e.site, e.file, e.active ? 'deactivate' : 'activate', e.active ? deactivatePluginOnSite : activatePluginOnSite)}
                            >
                              {e.active ? '⏸' : '▶'}
                            </button>
                            <button
                              className="pm-icon-btn danger" title="Delete"
                              disabled={busyAction === `${key}:delete`}
                              onClick={() => {
                                if (window.confirm(`Delete "${group.name}" from ${e.site.name}?`)) runSingle(e.site, e.file, 'delete', deletePluginOnSite)
                              }}
                            >
                              🗑
                            </button>
                          </td>
                        </tr>
                      )
                    }))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
