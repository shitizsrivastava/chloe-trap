import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'

const SITE_COLORS = [
  '#6366f1','#ef4444','#f59e0b','#10b981','#3b82f6',
  '#8b5cf6','#06b6d4','#84cc16','#f97316','#14b8a6',
  '#ec4899','#a855f7','#64748b',
]

export const DEFAULT_SITES = [
  { id: 'shitizsays',                name: 'Shitiz Says',                  url: 'https://shitizsays.com',                username: '', password: '', connected: false, color: SITE_COLORS[10], initials: 'SZ' },
  { id: 'legalsandook',              name: 'Legal Sandook',                url: 'https://legalsandook.com',              username: '', password: '', connected: false, color: SITE_COLORS[8],  initials: 'LS' },
  { id: 'dubaitaxandproperty',       name: 'Dubai Tax & Property',         url: 'https://dubaitaxandproperty.com',       username: '', password: '', connected: false, color: SITE_COLORS[4],  initials: 'DT' },
  { id: 'thehardnewsdaily',          name: 'Hard News Daily',              url: 'https://thehardnewsdaily.com',          username: '', password: '', connected: false, color: SITE_COLORS[1],  initials: 'HD' },
  { id: 'monkmodehealth',            name: 'Monk Mode Health',             url: 'https://monkmodehealth.com',            username: '', password: '', connected: false, color: SITE_COLORS[0],  initials: 'MM' },
  { id: 'manofdeterminedintentions', name: 'Man of Determined Intentions', url: 'https://manofdeterminedintentions.com', username: '', password: '', connected: false, color: SITE_COLORS[3],  initials: 'MD' },
  { id: 'neelumummy',                name: 'Neelu Mummy',                  url: 'https://neelumummy.com',                username: '', password: '', connected: false, color: SITE_COLORS[11], initials: 'NM' },
  { id: 'everythingaboutshoes',      name: 'Everything About Shoes',       url: 'https://everythingaboutshoes.com',      username: '', password: '', connected: false, color: SITE_COLORS[12], initials: 'ES' },
  { id: 'toptechcompare',            name: 'Top Tech Compare',             url: 'https://toptechcompare.com',            username: '', password: '', connected: false, color: SITE_COLORS[9],  initials: 'TC' },
  { id: 'financemanifesto',          name: 'Finance Manifesto',            url: 'https://financemanifesto.com',          username: '', password: '', connected: false, color: SITE_COLORS[6],  initials: 'FM' },
  { id: 'russianjobsonline',         name: 'Russian Jobs Online',          url: 'https://russianjobsonline.com',         username: '', password: '', connected: false, color: SITE_COLORS[2],  initials: 'RJ' },
  { id: 'soqutar',                   name: 'Soqutar',                      url: 'https://soqutar.com',                   username: '', password: '', connected: false, color: SITE_COLORS[5],  initials: 'SQ' },
  { id: 'nomadtraveltales',          name: 'Nomad Travel Tales',           url: 'https://nomadtraveltales.com',          username: '', password: '', connected: false, color: SITE_COLORS[7],  initials: 'NT' },
]

const DEFAULT_SETTINGS = {
  defaultStatus: 'draft',
  postsPerPage: 20,
  autosave: true,
  geminiApiKey: '',
  pixabayApiKey: '',
  pageSpeedApiKey: '',
  writingGoals: {},
  // One shared Facebook Page / X account for all 13 sites — everything gets
  // posted through these, so there's a single place to point to rather than
  // per-site social links.
  facebookPageUrl: '',
  xProfileUrl: '',
}

const AppContext = createContext(null)

function mergeSites(saved) {
  return DEFAULT_SITES.map(def => {
    const found = saved.find(s => s.id === def.id)
    return found ? { ...def, ...found } : def
  }).concat(saved.filter(s => !DEFAULT_SITES.find(d => d.id === s.id)))
}

export function AppProvider({ children }) {
  const [sites, setSites] = useState(() => {
    try {
      const raw = localStorage.getItem('ct_sites')
      return raw ? mergeSites(JSON.parse(raw)) : DEFAULT_SITES
    } catch { return DEFAULT_SITES }
  })

  const [posts, setPosts] = useState(() => {
    try {
      const raw = localStorage.getItem('ct_posts')
      const parsed = raw ? JSON.parse(raw) : []
      // One-time migration: the old binary "posted to social" flag becomes a
      // 0-3 share pass counter. Anything already marked posted counts as one
      // pass done, carrying its old timestamp forward as the pass-1 stamp.
      return parsed.map(p => {
        if (p.shareCount !== undefined) return p
        const shared = Boolean(p.socialPosted)
        return {
          ...p,
          shareCount: shared ? 1 : 0,
          shareStamps: shared ? [p.socialPostedAt || null] : [],
        }
      })
    } catch { return [] }
  })

  // A 13-site sync (up to 20 pages each) can take a while. syncAllSites reads
  // this ref instead of the `posts` closure it captured when it started, so
  // an edit made mid-sync (e.g. logging a social-share pass) isn't silently
  // reverted when the sync finishes and rebuilds records from a stale snapshot.
  const postsRef = useRef(posts)
  useEffect(() => { postsRef.current = posts }, [posts])

  const [activity, setActivity] = useState(() => {
    try {
      const raw = localStorage.getItem('ct_activity')
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  })

  const [settings, setSettings] = useState(() => {
    try {
      const raw = localStorage.getItem('ct_settings')
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS
    } catch { return DEFAULT_SETTINGS }
  })

  const [templates, setTemplates] = useState(() => {
    try {
      const raw = localStorage.getItem('ct_templates')
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  })

  // Article Targets board: one persistent scratchpad note per site (e.g.
  // "today's target" / "next up"). Never cleared automatically — survives
  // app restarts via localStorage and only goes away when the user
  // explicitly clears a single site's note or wipes the whole board.
  const [articleTargets, setArticleTargets] = useState(() => {
    try {
      const raw = localStorage.getItem('ct_article_targets')
      return raw ? JSON.parse(raw) : {}
    } catch { return {} }
  })

  // Site passwords live in `sites` state as plaintext (every screen that
  // makes a WordPress Basic Auth call reads site.password directly), but
  // they're encrypted with the OS credential store before ever touching
  // localStorage — only the ciphertext (passwordEnc) is written to disk.
  // Falls back to plaintext when Electron's encryption isn't available
  // (browser dev mode, or an OS without a credential store) so credentials
  // still persist rather than silently vanishing.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const persisted = await Promise.all(sites.map(async (s) => {
        const { password, ...rest } = s
        if (!password) return { ...rest, passwordEnc: s.passwordEnc || '' }
        if (window.electronAPI?.encryptSecret) {
          try {
            const enc = await window.electronAPI.encryptSecret(password)
            if (enc) return { ...rest, passwordEnc: enc }
          } catch { /* fall through to plaintext */ }
        }
        return { ...rest, password }
      }))
      if (!cancelled) localStorage.setItem('ct_sites', JSON.stringify(persisted))
    })()
    return () => { cancelled = true }
  }, [sites])

  // One-time decrypt on startup: any site loaded from disk with only
  // passwordEnc (no plaintext password) needs decrypting back into state
  // before WordPress calls can use it. Sites already holding a plaintext
  // password (pre-encryption data, or this same session) are left alone —
  // the effect above re-encrypts and migrates them on the next save.
  useEffect(() => {
    if (!window.electronAPI?.decryptSecret) return
    let cancelled = false
    ;(async () => {
      const decrypted = await Promise.all(sites.map(async (s) => {
        if (!s.passwordEnc || s.password) return s
        try {
          const pw = await window.electronAPI.decryptSecret(s.passwordEnc)
          return pw ? { ...s, password: pw } : s
        } catch { return s }
      }))
      if (!cancelled && decrypted.some((s, i) => s.password !== sites[i].password)) setSites(decrypted)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { localStorage.setItem('ct_posts',     JSON.stringify(posts))     }, [posts])
  useEffect(() => { localStorage.setItem('ct_activity',  JSON.stringify(activity))  }, [activity])
  useEffect(() => { localStorage.setItem('ct_settings',  JSON.stringify(settings))  }, [settings])
  useEffect(() => { localStorage.setItem('ct_templates', JSON.stringify(templates)) }, [templates])
  useEffect(() => { localStorage.setItem('ct_article_targets', JSON.stringify(articleTargets)) }, [articleTargets])

  const setArticleTargetNote = (siteId, text) =>
    setArticleTargets(prev => ({ ...prev, [siteId]: { text, updatedAt: new Date().toISOString() } }))

  const clearArticleTargetNote = (siteId) =>
    setArticleTargets(prev => {
      const next = { ...prev }
      delete next[siteId]
      return next
    })

  const clearAllArticleTargets = () => setArticleTargets({})

  const updateSite = (id, updates) =>
    setSites(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s))

  // Targets: a total post-count goal per site with a deadline. monthsFromNow
  // defaults to 6 since that's the planning horizon the user works in.
  const setSiteTarget = (id, target, monthsFromNow = 6) => {
    const deadline = new Date()
    deadline.setMonth(deadline.getMonth() + monthsFromNow)
    updateSite(id, {
      target: Number(target) || null,
      targetSetAt: new Date().toISOString(),
      targetDeadline: deadline.toISOString(),
    })
  }

  const clearSiteTarget = (id) =>
    updateSite(id, { target: null, targetSetAt: null, targetDeadline: null })

  const [celebratedTargets, setCelebratedTargets] = useState(() => {
    try {
      const raw = localStorage.getItem('ct_celebrated_targets')
      return raw ? JSON.parse(raw) : {}
    } catch { return {} }
  })
  useEffect(() => { localStorage.setItem('ct_celebrated_targets', JSON.stringify(celebratedTargets)) }, [celebratedTargets])
  const markTargetCelebrated = (id, target) =>
    setCelebratedTargets(prev => ({ ...prev, [id]: target }))

  const addSite = (site) => {
    const id = site.url.replace(/https?:\/\//, '').replace(/\./g, '_').replace(/\//g, '')
    const initials = site.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    const color = SITE_COLORS[sites.length % SITE_COLORS.length]
    setSites(prev => [...prev, { id, initials, color, connected: false, ...site }])
  }

  const removeSite = (id) => setSites(prev => prev.filter(s => s.id !== id))

  const addPost = (post) => {
    const newPost = { ...post, localId: Date.now() + Math.random(), createdAt: new Date().toISOString() }
    setPosts(prev => [newPost, ...prev])
    addActivity({
      type: post.status === 'publish' ? 'published' : 'draft_saved',
      title: post.title,
      siteId: post.siteId,
      siteName: sites.find(s => s.id === post.siteId)?.name || post.siteId,
      timestamp: new Date().toISOString(),
    })
    return newPost
  }

  const updatePost  = (localId, updates) => setPosts(prev => prev.map(p => p.localId === localId ? { ...p, ...updates } : p))
  const deletePost  = (localId) => setPosts(prev => prev.filter(p => p.localId !== localId))

  const addActivity = (item) =>
    setActivity(prev => [{ ...item, id: Date.now() }, ...prev].slice(0, 100))

  // Templates
  const addTemplate = (tpl) => {
    const newTpl = { ...tpl, id: Date.now(), createdAt: new Date().toISOString() }
    setTemplates(prev => [newTpl, ...prev])
    return newTpl
  }
  const deleteTemplate = (id) => setTemplates(prev => prev.filter(t => t.id !== id))
  const updateTemplate = (id, updates) => setTemplates(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))

  // Pull all real posts from every connected WordPress site and replace local data.
  // Pass onlySiteId to reconcile just one site (e.g. from its Site Detail page) —
  // this overwrites local status/title with whatever WordPress actually has,
  // so stale duplicate/mismatched local records get fixed automatically.
  const MAX_SYNC_PAGES = 20
  const syncAllSites = async (onProgress, onlySiteId = null) => {
    const targets = sites.filter(s => s.connected && s.username && s.password && (!onlySiteId || s.id === onlySiteId))
    const synced = []
    const truncatedSites = []
    let done = 0
    for (const site of targets) {
      onProgress?.(`Syncing ${site.name}… (${done + 1}/${targets.length})`)
      try {
        for (let page = 1; page <= MAX_SYNC_PAGES; page++) {
          const q = new URLSearchParams({
            per_page: 100, page,
            status: 'publish,draft,future,pending,private',
            _fields: 'id,title,status,date,link',
          }).toString()
          const res = await fetch(`${site.url}/wp-json/wp/v2/posts?${q}`, {
            headers: { Authorization: 'Basic ' + btoa(`${site.username}:${site.password}`) },
          })
          if (!res.ok) break
          const batch = await res.json()
          if (!batch.length) break
          batch.forEach(p => {
            const localId = `wp-${site.id}-${p.id}`
            // Re-fetching a post rebuilds it from WordPress, but local-only
            // tracking (share passes, etc.) lives nowhere else — carry it
            // forward from the previous record, reading the LIVE state via a
            // ref rather than the `posts` this function closed over when it
            // started. A 13-site sync can run long enough that an edit made
            // mid-sync (e.g. logging a share pass) would otherwise get wiped
            // the moment this function's stale snapshot overwrites it.
            const prev = postsRef.current.find(existing => existing.localId === localId)
            synced.push({
              localId,
              wpPostId: p.id,
              wpLink: p.link,
              siteId: site.id,
              title: (p.title?.rendered || '(Untitled)').replace(/<[^>]+>/g, ''),
              // Keep WordPress's real status — a scheduled ("future") post is
              // not published yet. Collapsing it into 'publish' here used to
              // make Site Targets, the Dashboard's Published Posts count, and
              // every other status==='publish' check count posts that hadn't
              // actually gone live, so daily progress looked frozen even
              // while real publishing was happening.
              status: p.status,
              createdAt: p.date,
              synced: true,
              shareCount: prev?.shareCount || 0,
              shareStamps: prev?.shareStamps || [],
            })
          })
          const totalPages = parseInt(res.headers.get('X-WP-TotalPages') || '1')
          if (page >= totalPages) break
          // Hit the cap with more pages still waiting on the server — flag it
          // rather than silently stopping, since every count derived from
          // `posts` (Site Targets, Published Posts, etc.) would otherwise
          // permanently under-report this site with no indication why.
          if (page === MAX_SYNC_PAGES) truncatedSites.push(site.name)
        }
      } catch { /* skip site on network error */ }
      done++
    }
    const syncedSiteIds = new Set(targets.map(s => s.id))
    // Keep local-only drafts (never published to WP) and posts from sites that couldn't sync
    setPosts(prev => [
      ...synced,
      ...prev.filter(p => !syncedSiteIds.has(p.siteId) || (!p.wpPostId && !p.synced)),
    ])
    localStorage.setItem('ct_lastsync', new Date().toISOString())
    return { sites: targets.length, posts: synced.length, truncatedSites }
  }

  // Uptime monitoring lives here (not in the Uptime Monitor screen) so it
  // keeps running — and can still fire a desktop notification — no matter
  // which screen is currently open, instead of stopping the moment the user
  // navigates away.
  const [uptimeResults, setUptimeResults] = useState({})
  const [uptimeAutoCheck, setUptimeAutoCheckState] = useState(() => {
    try { return localStorage.getItem('ct_uptime_autocheck') === '1' } catch { return false }
  })
  const uptimeResultsRef = useRef(uptimeResults)
  useEffect(() => { uptimeResultsRef.current = uptimeResults }, [uptimeResults])

  const setUptimeAutoCheck = (enabled) => {
    setUptimeAutoCheckState(enabled)
    try { localStorage.setItem('ct_uptime_autocheck', enabled ? '1' : '0') } catch { /* storage unavailable */ }
    if (enabled && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }

  const notifySiteDown = (site) => {
    try {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
      new Notification('ChloeTrap — site down', { body: `${site.name} (${site.url}) is not responding.` })
    } catch { /* notifications unsupported in this environment — ignore */ }
  }

  const pingSiteUptime = async (site) => {
    const start = Date.now()
    try {
      const res = await fetch(`${site.url}/wp-json/wp/v2/`, { method: 'HEAD', signal: AbortSignal.timeout(8000) })
      const ms = Date.now() - start
      return { up: res.ok || res.status < 500, ms, status: res.status }
    } catch {
      return { up: false, ms: Date.now() - start, status: 0 }
    }
  }

  const checkAllUptime = useCallback(async () => {
    await Promise.all(sites.map(async site => {
      const previous = uptimeResultsRef.current[site.id]
      const result = await pingSiteUptime(site)
      // Only alert on the transition into "down" — not on every repeated
      // check while it stays down, or the user gets spammed every 3 minutes.
      if (!result.up && previous?.up !== false) notifySiteDown(site)
      setUptimeResults(prev => ({ ...prev, [site.id]: { ...result, checkedAt: new Date().toISOString() } }))
    }))
  }, [sites])

  useEffect(() => {
    if (!uptimeAutoCheck) return
    checkAllUptime()
    const id = setInterval(checkAllUptime, 3 * 60 * 1000)
    return () => clearInterval(id)
  }, [uptimeAutoCheck, checkAllUptime])

  const connectedSites = sites.filter(s => s.connected)

  const stats = {
    total:     posts.length,
    published: posts.filter(p => p.status === 'publish').length,
    drafts:    posts.filter(p => p.status === 'draft').length,
    today:     posts.filter(p => {
      const d = new Date(p.createdAt); const now = new Date()
      return d.toDateString() === now.toDateString()
    }).length,
  }

  return (
    <AppContext.Provider value={{
      sites, setSites, updateSite, addSite, removeSite, connectedSites, syncAllSites,
      setSiteTarget, clearSiteTarget, celebratedTargets, markTargetCelebrated,
      posts, setPosts, addPost, updatePost, deletePost,
      activity, addActivity,
      settings, setSettings,
      templates, addTemplate, deleteTemplate, updateTemplate,
      articleTargets, setArticleTargetNote, clearArticleTargetNote, clearAllArticleTargets,
      stats,
      uptimeResults, uptimeAutoCheck, setUptimeAutoCheck, checkAllUptime,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
