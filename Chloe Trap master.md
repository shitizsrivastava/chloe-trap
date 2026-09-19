# Chloe Trap — Master File

**What it is:** A desktop (Electron + React) WordPress content management app that runs Shitiz's entire 13-site blog network from one app, talking to each site over the WordPress REST API. Local package name: `chloe-trap`, v1.1.0. App ID `com.chloe.trap`, product name `ChloeTrap`.

## Location & stack
- Path: `C:\Users\pc\Desktop\05 Apps & Code\MY apps\Chloe Trap`
- Frontend: React 18 + Vite, Tiptap rich-text editor (`@tiptap/*`), Recharts for charts, ExcelJS for spreadsheet export.
- Shell: Electron 29, packaged with `electron-builder` (NSIS installer on Windows, DMG on Mac, AppImage on Linux).
- Dev workflow: `npm run dev` runs Vite + `electron-dev.js` concurrently (also wired as the `.claude/launch.json` preview config, port 5173).
- Build: `npm run build` → `vite build && electron-builder`, output to `release/`.
- Data persistence: browser `localStorage` (keys prefixed `ct_` — `ct_sites`, `ct_posts`, `ct_activity`, `ct_settings`, `ct_templates`, etc.), no external database.
- In-app self-update: a "Update App" button in the sidebar triggers an Electron-side rebuild (`window.electronAPI.triggerUpdate()` / `onUpdateProgress`).

## The 13 managed sites
Defined as `DEFAULT_SITES` in [src/context/AppContext.jsx](src/context/AppContext.jsx):

| Site | URL |
|---|---|
| Shitiz Says | shitizsays.com |
| Legal Sandook | legalsandook.com |
| Dubai Tax & Property | dubaitaxandproperty.com |
| Hard News Daily | thehardnewsdaily.com |
| Monk Mode Health | monkmodehealth.com |
| Man of Determined Intentions | manofdeterminedintentions.com |
| Neelu Mummy | neelumummy.com |
| Everything About Shoes | everythingaboutshoes.com |
| Top Tech Compare | toptechcompare.com |
| Finance Manifesto | financemanifesto.com |
| Russian Jobs Online | russianjobsonline.com |
| Soqutar | soqutar.com |
| Nomad Travel Tales | nomadtraveltales.com |

Each site has WP username/password (app password), a connection status, a brand color, and initials for its sidebar avatar. Settings also hold one shared Facebook Page URL and one shared X (Twitter) profile URL used across all 13 sites for social posting/tracking.

## WordPress Bridge plugin
[bridge-plugin/chloe-trap-bridge.php](bridge-plugin/chloe-trap-bridge.php) — a companion WordPress plugin ("Chloe Trap Bridge", v1.0.0) installed on each managed site. It extends the REST API so the desktop app can install, update, activate, deactivate, and delete plugins on that site remotely, using a silent WP_Upgrader skin (collects plain-text progress instead of admin-page HTML) and a backup/restore mechanism (zips a plugin's folder to `wp-content/chloe-trap-backups/` before overwriting).

### Fleet-wide plugin management ([src/screens/PluginManager.jsx](src/screens/PluginManager.jsx))
This is a standout feature, not just a nice-to-have:
- **Updates tab** — scans every connected/bridged site, groups installed plugins by name across the whole fleet, and shows which sites have a pending update for each plugin. One click ("Update on N Sites") pushes that update to every affected site in parallel (concurrency-limited via `runAcrossSites`), with per-site success/failure reporting and an automatic post-update rescan.
- **Upload/Install tab** — push a plugin zip to some or all sites at once, in two modes: "Install" (fresh install or overwrite anywhere you pick) and "Update Only" (auto-restricts targets to sites that already have that exact plugin, detected from the zip's slug — prevents accidentally introducing a plugin to a site that never had it).
- **Backup + one-click undo** — every overwrite/update takes a zip backup first; a failed or unwanted batch update/install can be reverted per-site or in bulk straight from the UI.
- **Setup tab** — per-site bridge health check (installed / auth ok / has plugin-management capability) with a one-click bridge-plugin zip download for sites that don't have it yet.

## Feature map (sidebar navigation, [src/components/Sidebar.jsx](src/components/Sidebar.jsx))

**Content**
- Content Plan, Article Targets, Bulk Generator, AI Humanizer, Smart Suggestions
- Create New Post (Tiptap editor, [src/components/TipTapEditor.jsx](src/components/TipTapEditor.jsx), with an AI Write panel and a RankMath SEO panel)
- All Posts / Drafts / Published, Content Calendar, Templates, Comments

**Taxonomy**
- Categories (per-site or all-categories overview)

**Media & Tools**
- Media Library, Plugins (via the bridge plugin above), Pages Manager, Broken Links, Redirect Manager, Image Alt-Text auditor, Uptime Monitor, PageSpeed Audit, Export Center

**SEO & Compliance**
- Traffic Analytics, AdSense Checker, Thin Content Scanner, Writing Goals, Content Pipeline (Kanban), Cross-Link Tracker, Duplicate Checker

**Growth Tools**
- Bulk SEO Editor, Content Refresh, Social Snippets, Social Poster Tracker, Topic Clusters, Content Brief, Orphan Posts

**Admin**
- Site Manager, Site Profiles, Error Log, Settings, Help & Shortcuts

Navigation itself is a hand-rolled browser-style history stack in [src/App.jsx](src/App.jsx) (back/forward buttons work regardless of which screen triggered a navigation), rather than a router library.

## Key integrations
- **Gemini API** — AI writing assistance (`geminiApiKey` in settings), used by the AI Write panel, Bulk Generator, Humanizer, Smart Suggestions, Content Brief, etc.
- **Pixabay API** — stock images (`pixabayApiKey`).
- **Google PageSpeed Insights API** — the PageSpeed Audit screen (`pageSpeedApiKey`).
- **RankMath** — read/write RankMath SEO fields per post via `RankMathPanel.jsx`.
- **Google Analytics 4 + Search Console** — [src/screens/Analytics.jsx](src/screens/Analytics.jsx). Per-site GA4 (sessions/pageviews trend + per-page traffic) and Search Console (clicks/impressions/CTR/position, top queries, top pages) data, each joined against the app's own post records so traffic/rankings map back to specific tracked posts. Includes a keyword rank tracker (star a query, see its 90-day position-history chart) and an "All Sites" rollup tab that pulls GA4+GSC for every configured site at once into one cross-network summary table and a top-queries-across-all-sites leaderboard. A single Google Cloud service-account JSON key can be bulk-applied to every site missing one (one service account can be granted access to all 13 sites' GA4/GSC properties), cutting most of the per-site setup friction. Requires the Electron main process (uses signed service-account requests, `window.electronAPI.ga4Fetch`/`gscFetch` — not available in a browser-only preview).
- Related: this app's AI Humanizer is a separate feature from the standalone offline "AI Humanizer" desktop app documented in the user's memory (`project_ai_humanizer_app.md`) — don't conflate the two.

## Content pipeline this app supports
The `Content Plan` folder alongside the app (`Master_SEO_Content_Plan.xlsx`, `All_Series_100_Post_Titles.md`, per-series article files) is the planning source; Chloe Trap's Content Plan / Article Targets / Bulk Generator / Content Calendar / Kanban screens turn that plan into scheduled, drafted, and published posts across the 13 sites, then track social sharing (`shareCount`/`shareStamps`, up to a few passes per post) and SEO health (thin content, duplicates, orphan posts, broken links, cross-links) after publish.

## Notes for future work in this app
- No README/docs existed before this file — this master file is the canonical overview; update it when screens/sites/integrations change.
- `localStorage` is the only datastore; there is no backend server component beyond each WordPress site's REST API + the bridge plugin.
- Sites list merge logic (`mergeSites` in AppContext) preserves saved per-site credentials/connection state across `DEFAULT_SITES` changes — don't reorder/rename site `id`s casually, they're the merge key.
