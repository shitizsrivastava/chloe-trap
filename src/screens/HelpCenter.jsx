import React, { useState, useRef, useEffect } from 'react'
import './HelpCenter.css'

// __APP_VERSION__ / __BUILD_DATE__ are injected by vite.config.js at build time —
// every rebuild (including "Update App") bakes in a fresh timestamp, so this is
// the fastest way to confirm whether the app you're looking at is actually current.
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '—'
const BUILD_DATE = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : null
const buildDateLabel = BUILD_DATE
  ? new Date(BUILD_DATE).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : 'Unknown'

const SECTIONS = [
  { id: 'updates', label: 'Update App' },
  { id: 'quickstart', label: '🚀 Quick Start' },
  { id: 'shortcuts', label: '⌨️ Keyboard Shortcuts' },
  { id: 'content', label: '✍️ Content' },
  { id: 'seo-growth', label: '📈 Growth Tools' },
  { id: 'seo-compliance', label: '🔍 SEO & Compliance' },
  { id: 'media-tools', label: '🖼 Media & Tools' },
  { id: 'taxonomy', label: '🗂 Taxonomy' },
  { id: 'admin', label: '⚙️ Admin' },
  { id: 'tips', label: '💡 Pro Tips' },
]

const FEATURES = [
  // Content
  {
    section: 'content', key: 'dashboard', icon: '📊', name: 'Dashboard',
    what: 'Your command centre — shows today\'s writing stats, upcoming content plan posts, recent activity, and site connection status at a glance.',
    how: ['Check the "Up Next" card to see which post you should write today based on your content plan.', 'Hit "Sync All Sites" to pull the latest posts from all connected WordPress sites.', 'The activity feed shows every post published or drafted this session.'],
    tip: 'Start every session here. The Up Next card tells you exactly what to write.',
  },
  {
    section: 'content', key: 'create', icon: '✏️', name: 'Create New Post',
    what: 'A full WordPress editor with a live AI risk meter, auto internal link suggester, SEO panel, featured image upload, Pixabay image search, schedule picker, and pre-publish checklist.',
    how: [
      'Select which sites to publish to using the checkboxes on the right panel — you can cross-post to multiple sites at once.',
      'The "🔗 Internal Links" panel suggests relevant posts from the same site as you type. Click "⚡ Auto-link" to insert a hyperlink automatically.',
      'The AI Risk meter shows how AI-sounding your content is. Red = high risk — click "✨ Humanize this" to clean it up.',
      'Set a Schedule date/time to publish automatically at a future date (uses WordPress "future" status).',
      'Click "🔍 Find image on Pixabay" in the Featured Image panel to search and pick a free stock photo (requires Pixabay API key in Settings).',
      'Pre-Publish Checklist tracks title, word count (800+ needed), categories, meta description, and more.',
      'After publishing, ChloeTrap automatically pings Google and Bing sitemaps to speed up indexing.',
    ],
    tip: 'Use "Content Brief" first to generate your outline, then come here — the outline pre-fills the editor.',
  },
  {
    section: 'content', key: 'content-plan', icon: '📋', name: 'Content Plan',
    what: 'A structured editorial calendar across all 13 sites showing which series you should write posts for, what\'s already done, and what\'s next.',
    how: [
      'Each series tracks progress — green = written, empty = pending.',
      '"Up Next" per site shows the first unwritten post in each series.',
      'Click any unwritten post to jump directly to the editor with the title pre-filled.',
    ],
    tip: 'Follow the content plan religiously — consistency is the #1 ranking factor for new sites.',
  },
  {
    section: 'content', key: 'bulk-generator', icon: '⚡', name: 'Bulk Generator',
    what: 'Generate multiple AI posts at once. Enter a list of titles, choose a site and tone, and ChloeTrap writes them all in sequence.',
    how: [
      'Enter one title per line in the input box.',
      'Select tone (professional, casual, SEO-optimised) and target site.',
      'Click "Generate All" — posts are created one by one and saved as drafts.',
      'Review each draft in the Drafts screen before publishing.',
    ],
    tip: 'Use this to fill out a whole month of content in one sitting. Then humanize them all before publishing.',
  },
  {
    section: 'content', key: 'humanizer', icon: '✨', name: 'AI Humanizer',
    what: 'Rewrites AI-generated content to sound natural and human, with multiple modes: Standard, Deep, Conversational, Expert, and FAQ/Schema.',
    how: [
      'Paste or load AI content into the left panel.',
      'Choose a mode — "Deep" is best for removing obvious AI patterns, "Conversational" adds a personal tone.',
      'Click "Humanize" and review the result on the right.',
      'The FAQ mode adds Schema.org structured data for rich snippets in Google.',
      'Content Refresh sends stale posts here automatically with content pre-loaded.',
    ],
    tip: 'Always humanize AI bulk content before publishing. Google penalises detectable AI writing.',
  },
  {
    section: 'content', key: 'suggestions', icon: '✦', name: 'Smart Suggestions',
    what: 'Scans all your posts and surfaces actionable suggestions: missing meta descriptions, thin content, content plan gaps, posts needing internal links, and more.',
    how: [
      'Scan results are cached for 5 minutes — the app won\'t re-scan on every click.',
      'Click "↻ Refresh" to force a fresh scan.',
      'Each suggestion links directly to the relevant screen or post.',
    ],
    tip: 'Check this weekly and act on at least 3 suggestions per session.',
  },
  {
    section: 'content', key: 'content-brief', icon: '📄', name: 'Content Brief',
    what: 'AI generates a full writing brief before you start — title options, meta description, H2/H3 outline, focus keyword, secondary keywords, word count target, and People Also Ask questions.',
    how: [
      'Enter your target keyword and pick content type (guide, listicle, review, comparison, etc.).',
      'Optionally add target audience and niche for more tailored output.',
      'Click "Start Writing →" — the outline, keyword, and meta auto-fill into the Create Post editor.',
    ],
    tip: 'This is the single biggest improvement to post quality. A brief post takes 2 hours; a brief-first post ranks 3× better.',
  },
  {
    section: 'content', key: 'calendar', icon: '📅', name: 'Content Calendar',
    what: 'A visual monthly calendar showing all your scheduled and published posts across all sites, with drag-reschedule support.',
    how: [
      'Colour-coded by site so you can spot gaps at a glance.',
      'Click any day to see posts scheduled for that date.',
      'Use the month navigation arrows to plan ahead.',
    ],
  },
  {
    section: 'content', key: 'templates', icon: '📝', name: 'Templates',
    what: 'Save any post structure as a reusable template. Load it in Create Post to start with a pre-built outline and formatting.',
    how: [
      'Create a template from scratch or save any post as a template.',
      'Templates appear in the "Load template…" dropdown at the top of Create Post.',
    ],
    tip: 'Create templates for your most common post types: product review, how-to guide, news roundup.',
  },
  {
    section: 'content', key: 'all-posts', icon: '📁', name: 'Drafts',
    what: 'All posts saved as drafts — both local ChloeTrap drafts and drafts synced from WordPress. Available as the "Drafts" status filter inside All Posts.',
    how: ['Open All Posts and set the status filter to "Drafts".', 'Edit any draft to continue writing.', 'Use the sync button to pull fresh drafts from WordPress.'],
  },
  {
    section: 'content', key: 'comments', icon: '💬', name: 'Comments',
    what: 'View and manage WordPress comments across all connected sites from one place.',
    how: ['Filter by site or status.', 'Approve, reply to, or delete comments directly.'],
  },

  // Growth Tools
  {
    section: 'seo-growth', key: 'bulk-seo', icon: '🎯', name: 'Bulk SEO Editor',
    what: 'A spreadsheet-style editor for all your posts. Edit focus keyword, meta description, and post title in bulk — with an AI-generate button per row — then push everything to WordPress in one click.',
    how: [
      'The alert banner shows how many posts are missing meta descriptions.',
      'Filter to "Missing meta desc" to focus only on posts that need work.',
      'Click ✨ next to any meta description to AI-generate one from that post\'s content, or click "✨ AI-fill Missing" in the header to fill every visible empty one in sequence.',
      'The meta description character counter turns green at 120–160 chars (ideal for Google).',
      'Click ⬆ to push one row, or "Push All" for all unsaved changes at once.',
    ],
    tip: 'Do this for every post before any other SEO work — meta descriptions affect click-through rate in search results.',
  },
  {
    section: 'seo-growth', key: 'content-refresh', icon: '🔄', name: 'Content Refresh',
    what: 'Identifies old, thin, or declining posts that need updating. Google rewards freshness — updated posts can jump 20–50 positions.',
    how: [
      'Critical = 6+ months old AND under 600 words. These hurt you most.',
      'Stale = over 1 year old. These need a date update and content expansion.',
      'Thin = under 400 words. These may fail AdSense policy review.',
      'Click "✨ Refresh" to send the post to the Humanizer for rewriting.',
      'Click "✏ Edit" to open in the post editor to expand manually.',
    ],
    tip: 'Prioritise Critical posts first — they\'re actively dragging down your site\'s authority.',
  },
  {
    section: 'seo-growth', key: 'social-snippets', icon: '📣', name: 'Social Snippets',
    what: 'AI converts any blog post into platform-specific social content: a 5-tweet X/Twitter thread, a LinkedIn post, or an Instagram caption with hashtags.',
    how: [
      'Select a post from the left panel.',
      'Choose the platform tab (X, LinkedIn, or Instagram).',
      'Click "✨ Generate" — the content appears on the right.',
      'Click "📋 Copy all" to copy everything to clipboard.',
      'Regenerate as many times as you like — results are cached per post per platform.',
    ],
    tip: 'Do this for every post you publish. Social signals drive traffic back to your site and build backlinks.',
  },
  {
    section: 'seo-growth', key: 'social-tracker', icon: '🎲', name: 'Social Poster Tracker',
    what: 'Tracks which published posts you\'ve already shared on social media and which you haven\'t, across every connected site.',
    how: [
      'Filter by site or by posted/unposted status, or search by title.',
      'Mark a post as "Posted" once you\'ve shared it — the progress bar and per-site stats update instantly.',
      'Use the "Suggest" action to get a randomly picked unposted article when you\'re not sure what to share next.',
    ],
    tip: 'Check this after a Social Snippets session so you don\'t forget which posts still need to go out.',
  },
  {
    section: 'seo-growth', key: 'topic-cluster', icon: '🕸', name: 'Topic Cluster Builder',
    what: 'Enter one keyword and AI builds a complete content strategy: a pillar page + 5 subtopics with 3 articles each — 16 pieces of content from one search.',
    how: [
      'Enter your seed keyword and optionally specify a niche.',
      'The visual view shows the pillar centre with subtopic cards branching out.',
      'Posts you\'ve already written show a ✓ "Written" badge.',
      'Intent badges (Informational, Commercial, Transactional) help you prioritise.',
      'Click "Write →" on any article to open it in the editor with the title pre-filled.',
      'Switch to List view for a simpler text format you can copy.',
    ],
    tip: 'Build one topic cluster per site per month. This is how sites go from 0 to 10,000 visitors/month.',
  },
  {
    section: 'seo-growth', key: 'orphan-posts', icon: '🔍', name: 'Orphan Posts',
    what: 'Finds published posts that no other post links to. Google\'s crawler can\'t discover orphan posts through internal linking — they get less PageRank and rank lower.',
    how: [
      'The orphan rate shows what percentage of your posts are invisible to Google\'s internal crawler.',
      'Click "✏ Edit & fix" to open a post and add links to the orphan from within it.',
      'The Internal Links panel in the editor will suggest the orphan as a link target.',
      'Or click "+ New post linking to it" to write fresh content that links to the orphan.',
    ],
    tip: 'Aim for 0% orphan rate. Every post should have at least 2–3 posts linking to it.',
  },

  // SEO & Compliance
  {
    section: 'seo-compliance', key: 'adsense', icon: '💰', name: 'AdSense Checker',
    what: 'Checks each site against Google AdSense policy requirements — word count, required pages (Privacy Policy, About, Contact), content quality signals.',
    how: ['Run a check per site.', 'Red items are blockers that will get your AdSense application rejected.', 'Fix all red items before applying.'],
    tip: 'You need all sites to pass before applying. One bad site can get your entire account rejected.',
  },
  {
    section: 'seo-compliance', key: 'thin-content', icon: '📉', name: 'Thin Content Scanner',
    what: 'Scans all synced posts for posts under the word-count threshold that may trigger Google quality filters or AdSense rejection.',
    how: ['Posts under 300 words are flagged as critical.', 'Posts 300–800 words are flagged as thin.', 'Click any post to edit and expand it.'],
  },
  {
    section: 'seo-compliance', key: 'writing-goals', icon: '🎯', name: 'Writing Goals',
    what: 'Set and track daily/weekly post count targets per site. Keeps you accountable when managing 13+ sites.',
    how: ['Set a goal for each site in the Goals tab.', 'The progress bar shows how many posts you\'ve published toward the goal this week.'],
  },
  {
    section: 'seo-compliance', key: 'kanban', icon: '📌', name: 'Content Pipeline',
    what: 'A Kanban board showing all posts across stages: Idea → Writing → Review → Scheduled → Published.',
    how: ['Drag cards between columns to update their stage.', 'Use this to manage posts in progress across all sites.'],
  },
  {
    section: 'seo-compliance', key: 'crosslinks', icon: '🔗', name: 'Cross-Link Tracker',
    what: 'Shows how many cross-site links exist between your network of sites. Cross-linking between your own sites passes authority.',
    how: ['See which sites link to which.', 'Identify sites that are isolated and need cross-linking.'],
  },
  {
    section: 'seo-compliance', key: 'duplicate-checker', icon: '🔁', name: 'Duplicate Checker',
    what: 'Detects duplicate or near-duplicate titles and content across your network, which can cause keyword cannibalisation.',
    how: ['Run a scan across all posts.', 'Posts above the similarity threshold are flagged.', 'Merge, delete, or differentiate the duplicates.'],
  },

  // Media & Tools
  {
    section: 'media-tools', key: 'media', icon: '🖼', name: 'Media Library',
    what: 'Browse and manage images uploaded to each connected WordPress site.',
    how: ['Filter by site.', 'Copy image URLs for use in posts.', 'Upload new images directly.'],
  },
  {
    section: 'media-tools', key: 'pages', icon: '📄', name: 'Pages Manager',
    what: 'View and manage WordPress Pages (not posts) — About, Privacy Policy, Contact, etc. — across all connected sites.',
    how: ['Sync pages from connected sites.', 'Edit page titles.', 'Check which required pages exist (needed for AdSense).'],
    tip: 'Every site must have Privacy Policy, About Us, and Contact pages before applying for AdSense.',
  },
  {
    section: 'media-tools', key: 'broken-links', icon: '🔴', name: 'Broken Links',
    what: 'Scans posts for internal and external links that return 404 or other errors. Broken links hurt SEO and user experience.',
    how: ['Run a scan across all posts.', 'Broken links are listed with the post they appear in.', 'Click "Fix" to open the post and repair the link.'],
  },
  {
    section: 'media-tools', key: 'uptime', icon: '⏱', name: 'Uptime Monitor',
    what: 'Monitors whether each site is online and measures response time.',
    how: ['All sites are checked on load.', 'Red = site is down or unreachable.', 'Use this to catch hosting issues before they hurt your rankings.'],
  },
  {
    section: 'media-tools', key: 'export-center', icon: '⬇️', name: 'Downloads (Export Center)',
    what: 'The one-stop download hub — on screen it\'s titled "Downloads", in the sidebar it\'s "Export Center" under Media & Tools. Three tabs, each downloading an Excel/CSV file: Quick CSV Export (raw post/page/category links), Posts & Articles Report (full formatted .xlsx with status, dates, categories and word count), and Categories Report (category name, slug, parent and post count).',
    how: [
      'Quick CSV Export: choose "🌐 All Sites" or one site, toggle Posts/Pages/Categories, click "Fetch Links", then download as CSV — works for one site or every site.',
      'Posts & Articles Report: pick a website OR "🌐 All Websites" from the dropdown, choose Published/Draft/All, click "Load Articles", then "Download Excel (.xlsx)". Every row already includes that post\'s categories, so this covers "posts with categories" too.',
      'Categories Report: pick a connected website or "🌐 All Connected Websites", click "Load Categories", then "Download Excel (.xlsx)".',
      'Whenever you pick "All Websites/Sites", the downloaded workbook includes a Summary sheet, a combined sheet, and one sheet per site — everything in a single file.',
    ],
    tip: 'Connect a website in Site Manager first so categories, word counts, dates and URLs are pulled live — unconnected sites fall back to whatever ChloeTrap has already synced locally.',
  },

  // Taxonomy
  {
    section: 'taxonomy', key: 'categories', icon: '📊', name: 'All Categories Overview',
    what: 'Cross-site view of all categories across every WordPress site, with post counts. Available as the "🌐 All Sites" tab inside Categories.',
    how: ['See which categories have too few or too many posts.', 'Spot over-stuffed categories that may need splitting.'],
  },
  {
    section: 'taxonomy', key: 'categories', icon: '🗂', name: 'Categories',
    what: 'Manage categories for each individual WordPress site — add, rename, or delete.',
    how: ['Select a site from the dropdown.', 'Add new categories.', 'Categories here sync to WordPress.'],
  },

  // Admin
  {
    section: 'admin', key: 'sites', icon: '🌐', name: 'Site Manager',
    what: 'Add, edit, and connect your WordPress sites. Each site needs a URL, WordPress application password, and username to connect.',
    how: [
      'Go to your WordPress Dashboard → Users → Profile → Application Passwords → create a new one.',
      'Paste the application password (not your login password) into ChloeTrap.',
      'Click "Test Connection" — you should see a green ✓ Connected.',
    ],
    tip: 'Application passwords are safer than your real password. Create one named "ChloeTrap" so you know what it\'s for.',
  },
  {
    section: 'admin', key: 'site-profiles', icon: '👤', name: 'Site Profiles',
    what: 'Store the "voice", niche, target audience, and content guidelines for each site. Used by AI tools to produce on-brand content.',
    how: ['Fill in the niche, tone, target audience, and any content rules.', 'AI Humanizer and Bulk Generator use these profiles automatically.'],
  },
  {
    section: 'admin', key: 'error-log', icon: '⚠️', name: 'Error Log',
    what: 'Every failed action across ChloeTrap — a bad API call, a sync failure, a rejected WordPress request — is logged here instead of failing silently.',
    how: [
      'The sidebar badge next to "Error Log" shows how many unread errors are waiting.',
      'Search by message, site, or action to find a specific failure.',
      'Clear a single error or use "Clear All" once you\'ve resolved the underlying issue.',
    ],
    tip: 'Check this first whenever a sync or publish silently seems to do nothing — the reason is almost always logged here.',
  },
  {
    section: 'admin', key: 'settings', icon: '⚙️', name: 'Settings',
    what: 'Configure your Gemini API key, Pixabay key, default post status, posts per page, and autosave behaviour.',
    how: [
      'Gemini Flash is the AI engine — get your free key at aistudio.google.com (no card needed).',
      'Pixabay API key unlocks the featured image finder in Create Post — get it free at pixabay.com/api/docs.',
      'Default status controls whether new posts save as Draft or Publish.',
    ],
    tip: 'Gemini Flash (free tier) is fast and supports long outputs — perfect for Humanizer, Bulk Generator, and Meta Writer.',
  },
]

const SHORTCUTS = [
  {
    group: 'Editor (TipTap)',
    items: [
      { keys: ['Ctrl', 'B'], desc: 'Bold' },
      { keys: ['Ctrl', 'I'], desc: 'Italic' },
      { keys: ['Ctrl', 'U'], desc: 'Underline' },
      { keys: ['Ctrl', 'Z'], desc: 'Undo' },
      { keys: ['Ctrl', 'Shift', 'Z'], desc: 'Redo' },
      { keys: ['Ctrl', 'A'], desc: 'Select all' },
      { keys: ['Ctrl', 'C'], desc: 'Copy' },
      { keys: ['Ctrl', 'V'], desc: 'Paste' },
      { keys: ['Ctrl', 'X'], desc: 'Cut' },
    ],
  },
  {
    group: 'Markdown Shortcuts (type in editor)',
    items: [
      { keys: ['# ', 'Space'], desc: 'Heading 1' },
      { keys: ['## ', 'Space'], desc: 'Heading 2' },
      { keys: ['### ', 'Space'], desc: 'Heading 3' },
      { keys: ['- ', 'Space'], desc: 'Bullet list' },
      { keys: ['1. ', 'Space'], desc: 'Numbered list' },
      { keys: ['> ', 'Space'], desc: 'Blockquote' },
      { keys: ['**text**'], desc: 'Bold' },
      { keys: ['*text*'], desc: 'Italic' },
      { keys: ['`code`'], desc: 'Inline code' },
      { keys: ['---'], desc: 'Horizontal divider' },
    ],
  },
  {
    group: 'Publishing',
    items: [
      { keys: ['Ctrl', 'S'], desc: 'Save draft (click Save Draft button)' },
      { keys: ['Enter'], desc: 'Confirm schedule date input' },
    ],
  },
  {
    group: 'General',
    items: [
      { keys: ['Ctrl', 'F'], desc: 'Find in page (browser/Electron)' },
      { keys: ['F5'], desc: 'Reload the app' },
      { keys: ['Alt', '←'], desc: 'Back (Electron)' },
    ],
  },
]

const TIPS = [
  { icon: '🏁', title: 'Day 1: Connect your sites', body: 'Go to Site Manager → add your WordPress URL + application password for each site. Test connection. Without this nothing syncs.' },
  { icon: '🔑', title: 'Day 1: Add your Gemini API key', body: 'Settings → Gemini API Key → paste your free key from aistudio.google.com (no card needed). This unlocks all AI features: Humanizer, Bulk Generator, Meta Writer, Topic Clusters, and more.' },
  { icon: '📋', title: 'Follow the Content Plan', body: 'Content Plan → check "Up Next" per site → write that post. The plan is designed so every series gets coverage. Consistency beats quantity.' },
  { icon: '⚡', title: 'The fastest workflow', body: 'Content Brief (generate outline) → Create Post (outline pre-fills) → AI Risk meter (humanize if needed) → Pixabay image → Publish. Full SEO-ready post in 30 minutes.' },
  { icon: '🤖', title: 'Never publish raw AI content', body: 'Always run AI-generated content through the Humanizer before publishing. Google\'s quality systems detect AI writing patterns and can demote your site.' },
  { icon: '🔗', title: 'Internal links = free SEO', body: 'Every post you write should link to 3–5 other posts on the same site. The Auto-link button in the Internal Links panel does this with one click.' },
  { icon: '📸', title: 'Always set a featured image', body: 'Posts with featured images get 30–40% more clicks in Google search results. Use the Pixabay finder for free high-quality photos — search with your post\'s main keyword.' },
  { icon: '🔄', title: 'Refresh beats writing new', body: 'Updating a 1-year-old post often produces faster rankings than writing a new one. Check Content Refresh weekly and prioritise Critical posts.' },
  { icon: '📊', title: 'Meta descriptions drive clicks', body: 'Even if you rank #3, a compelling meta description can out-click the #1 result. Use Bulk AI Meta to fix all missing descriptions in one session.' },
  { icon: '🕸', title: 'One topic cluster per site per month', body: 'Use Topic Cluster Builder → pick your site\'s best keyword → generate 16 article ideas → work through them over 4 weeks. This is how sites reach 10k visitors.' },
]

export default function HelpCenter({ navigate }) {
  const [search, setSearch] = useState('')
  const [activeSection, setActiveSection] = useState('quickstart')
  const [updateFolder, setUpdateFolder] = useState('')
  const [updateStatus, setUpdateStatus] = useState('idle')
  const [updateText, setUpdateText] = useState('')
  const [updateLog, setUpdateLog] = useState([])
  const sectionRefs = useRef({})

  useEffect(() => {
    if (!window.electronAPI?.getUpdateSource || !window.electronAPI?.onUpdateProgress) return

    window.electronAPI.getUpdateSource().then(result => {
      if (result?.valid) setUpdateFolder(result.folder)
    })

    return window.electronAPI.onUpdateProgress(({ status, text }) => {
      setUpdateStatus(status)
      setUpdateText(text || '')
      if (!text) return
      // A fresh run always starts with "Building from <folder>" — reset the
      // log there so old output doesn't bleed into the next attempt.
      if (status === 'building' && /^Building from/.test(text)) {
        setUpdateLog([text])
      } else {
        setUpdateLog(prev => [...prev, text])
      }
    })
  }, [])

  const chooseUpdateFolder = async () => {
    if (!window.electronAPI?.chooseUpdateSource) return
    const result = await window.electronAPI.chooseUpdateSource()
    if (result?.valid) {
      setUpdateFolder(result.folder)
      setUpdateStatus('idle')
      setUpdateText('Project folder selected. You can update the app now.')
    } else if (result?.error) {
      setUpdateStatus('error')
      setUpdateText(result.error)
    }
  }

  const updateFromFolder = async () => {
    if (!window.electronAPI?.triggerUpdate) return
    if (!updateFolder) {
      await chooseUpdateFolder()
      return
    }
    setUpdateStatus('building')
    setUpdateText('Starting update...')
    await window.electronAPI.triggerUpdate()
  }

  const scrollTo = (id) => {
    setActiveSection(id)
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const filteredFeatures = search
    ? FEATURES.filter(f =>
        f.name.toLowerCase().includes(search.toLowerCase()) ||
        f.what.toLowerCase().includes(search.toLowerCase()) ||
        f.how?.some(h => h.toLowerCase().includes(search.toLowerCase()))
      )
    : null

  return (
    <div className="hc-screen">
      {/* Header */}
      <div className="hc-header">
        <div className="hc-header-left">
          <h1>Help Center</h1>
          <p className="page-subtitle">Everything you need to master ChloeTrap — {FEATURES.length} features explained, shortcuts, and pro tips.</p>
          <div className="hc-version-badge" title="Injected at build time — changes after a rebuild via Update App">
            v{APP_VERSION} · Last updated {buildDateLabel}
          </div>
        </div>
        <div className="hc-search-wrap">
          <svg className="hc-search-icon" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/></svg>
          <input
            className="hc-search"
            placeholder="Search features…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button className="hc-search-clear" onClick={() => setSearch('')}>✕</button>}
        </div>
      </div>

      <div className="hc-layout">
        {/* Left nav */}
        {!search && (
          <nav className="hc-nav">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                className={`hc-nav-item${activeSection === s.id ? ' active' : ''}`}
                onClick={() => scrollTo(s.id)}
              >
                {s.label}
              </button>
            ))}
          </nav>
        )}

        {/* Content */}
        <div className="hc-content">

          {/* SEARCH RESULTS */}
          {search && (
            <>
              <div className="hc-section-title" style={{ marginBottom: 16 }}>
                {filteredFeatures.length} result{filteredFeatures.length !== 1 ? 's' : ''} for "{search}"
              </div>
              {filteredFeatures.length === 0 ? (
                <div className="hc-empty">No features match your search. Try a different keyword.</div>
              ) : (
                filteredFeatures.map(f => <FeatureCard key={`${f.key}-${f.name}`} f={f} navigate={navigate} />)
              )}
            </>
          )}

          {!search && (
            <>
              {/* QUICK START */}
              <section ref={el => sectionRefs.current['quickstart'] = el} className="hc-section">
                <div className="hc-section-head">🚀 Quick Start</div>
                <div className="hc-qs-grid">
                  {[
                    { step: '1', title: 'Connect your WordPress sites', desc: 'Site Manager → add site URL + WordPress application password. Go to your WP Dashboard → Users → Profile → Application Passwords to generate one.', action: 'sites' },
                    { step: '2', title: 'Add your Gemini API key', desc: 'Settings → Gemini API Key. Get a free key at aistudio.google.com (no card needed). This powers all AI features in the app.', action: 'settings' },
                    { step: '3', title: 'Sync your posts', desc: 'Dashboard → "Sync All Sites" to pull existing posts from WordPress into ChloeTrap.', action: 'dashboard' },
                    { step: '4', title: 'Check the Content Plan', desc: 'Content Plan shows what to write next per site. Follow it — consistency is the #1 ranking factor.', action: 'content-plan' },
                    { step: '5', title: 'Generate a content brief', desc: 'Content Brief → enter keyword → AI builds your full outline. Then click "Start Writing →" to open the editor.', action: 'content-brief' },
                    { step: '6', title: 'Fix your SEO gaps', desc: 'Bulk SEO Editor → click ✨ AI-fill Missing → push to WordPress. Do this once a week.', action: 'bulk-seo' },
                  ].map(s => (
                    <button key={s.step} className="hc-qs-card" onClick={() => navigate(s.action)}>
                      <span className="hc-qs-step">{s.step}</span>
                      <div>
                        <div className="hc-qs-title">{s.title}</div>
                        <div className="hc-qs-desc">{s.desc}</div>
                      </div>
                      <span className="hc-qs-arrow">→</span>
                    </button>
                  ))}
                </div>
              </section>

              {/* APP UPDATES */}
              <section ref={el => sectionRefs.current['updates'] = el} className="hc-section">
                <div className="hc-section-head">Update App From Project Folder</div>
                <div className={`hc-update-card ${updateStatus}`}>
                  <div className="hc-update-copy">
                    <div className="hc-update-title">Load the latest changes without reinstalling</div>
                    <p>
                      Select the Chloe Trap source folder once. Clicking update rebuilds that folder,
                      reloads the app, and remembers it for future restarts.
                    </p>
                  </div>

                  <div className="hc-update-folder-row">
                    <div className="hc-update-folder">
                      <span className="hc-update-folder-label">Project folder</span>
                      <span className="hc-update-folder-path">
                        {updateFolder || 'No project folder selected'}
                      </span>
                    </div>
                    <button className="hc-update-secondary" onClick={chooseUpdateFolder} disabled={updateStatus === 'building'}>
                      {updateFolder ? 'Change Folder' : 'Choose Folder'}
                    </button>
                    {updateFolder && (
                      <button className="hc-update-secondary" onClick={() => window.electronAPI?.openUpdateSource?.()}>
                        Open Folder
                      </button>
                    )}
                  </div>

                  <div className="hc-update-actions">
                    <button
                      className="hc-update-primary"
                      onClick={updateFromFolder}
                      disabled={!window.electronAPI?.chooseUpdateSource || updateStatus === 'building'}
                    >
                      {updateStatus === 'building' ? 'Updating...' : updateStatus === 'done' ? 'Updated' : 'Build and Update App'}
                    </button>
                    <span className={`hc-update-status ${updateStatus}`}>
                      {updateText || (window.electronAPI?.chooseUpdateSource
                        ? 'Use this after changes are made in the project folder.'
                        : 'Folder updates are available in the desktop app only.')}
                    </span>
                  </div>

                  {updateLog.length > 0 && (
                    <div
                      style={{
                        marginTop: 12, padding: 10, background: '#0f172a', color: '#e2e8f0',
                        borderRadius: 8, fontSize: 11.5, fontFamily: 'monospace', lineHeight: 1.6,
                        maxHeight: 220, overflowY: 'auto', whiteSpace: 'pre-wrap',
                      }}
                    >
                      {updateLog.map((line, i) => <div key={i}>{line}</div>)}
                    </div>
                  )}
                </div>
              </section>

              {/* SHORTCUTS */}
              <section ref={el => sectionRefs.current['shortcuts'] = el} className="hc-section">
                <div className="hc-section-head">⌨️ Keyboard Shortcuts</div>
                <div className="hc-shortcuts-grid">
                  {SHORTCUTS.map(group => (
                    <div key={group.group} className="hc-shortcut-group">
                      <div className="hc-shortcut-group-title">{group.group}</div>
                      <div className="hc-shortcut-list">
                        {group.items.map((item, i) => (
                          <div key={i} className="hc-shortcut-row">
                            <div className="hc-keys">
                              {item.keys.map((k, ki) => (
                                <React.Fragment key={ki}>
                                  <kbd className="hc-key">{k}</kbd>
                                  {ki < item.keys.length - 1 && <span className="hc-plus">+</span>}
                                </React.Fragment>
                              ))}
                            </div>
                            <span className="hc-shortcut-desc">{item.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* FEATURE SECTIONS */}
              {[
                { id: 'content', title: '✍️ Content Features', emoji: '' },
                { id: 'seo-growth', title: '📈 Growth Tools', emoji: '' },
                { id: 'seo-compliance', title: '🔍 SEO & Compliance', emoji: '' },
                { id: 'media-tools', title: '🖼 Media & Tools', emoji: '' },
                { id: 'taxonomy', title: '🗂 Taxonomy', emoji: '' },
                { id: 'admin', title: '⚙️ Admin', emoji: '' },
              ].map(({ id, title }) => (
                <section key={id} ref={el => sectionRefs.current[id] = el} className="hc-section">
                  <div className="hc-section-head">{title}</div>
                  {FEATURES.filter(f => f.section === id).map(f => (
                    <FeatureCard key={`${f.key}-${f.name}`} f={f} navigate={navigate} />
                  ))}
                </section>
              ))}

              {/* PRO TIPS */}
              <section ref={el => sectionRefs.current['tips'] = el} className="hc-section">
                <div className="hc-section-head">💡 Pro Tips</div>
                <div className="hc-tips-grid">
                  {TIPS.map((tip, i) => (
                    <div key={i} className="hc-tip-card">
                      <div className="hc-tip-icon">{tip.icon}</div>
                      <div>
                        <div className="hc-tip-title">{tip.title}</div>
                        <div className="hc-tip-body">{tip.body}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function FeatureCard({ f, navigate }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`hc-feature-card${open ? ' open' : ''}`}>
      <button className="hc-feature-head" onClick={() => setOpen(v => !v)}>
        <span className="hc-feature-icon">{f.icon}</span>
        <div className="hc-feature-name-wrap">
          <span className="hc-feature-name">{f.name}</span>
          <span className="hc-feature-what">{f.what}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {navigate && (
            <button
              className="hc-feature-goto"
              onClick={e => { e.stopPropagation(); navigate(f.key) }}
            >
              Open →
            </button>
          )}
          <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/>
          </svg>
        </div>
      </button>
      {open && (
        <div className="hc-feature-body">
          {f.how && f.how.length > 0 && (
            <div className="hc-feature-how">
              <div className="hc-feature-how-title">How to use it:</div>
              <ol className="hc-feature-steps">
                {f.how.map((step, i) => <li key={i}>{step}</li>)}
              </ol>
            </div>
          )}
          {f.tip && (
            <div className="hc-feature-tip">
              <span className="hc-feature-tip-icon">💡</span>
              <span>{f.tip}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
