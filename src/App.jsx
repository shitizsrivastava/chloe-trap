import React, { useState } from 'react'
import { AppProvider } from './context/AppContext'
import { NotificationProvider } from './context/NotificationContext'
import ToastContainer from './components/ToastContainer'
import ErrorBoundary from './components/ErrorBoundary'
import Sidebar from './components/Sidebar'
import Dashboard from './screens/Dashboard'
import CreatePost from './screens/CreatePost'
import AllPosts from './screens/AllPosts'
import Categories from './screens/Categories'
import MediaLibrary from './screens/MediaLibrary'
import SiteManager from './screens/SiteManager'
import Settings from './screens/Settings'
import ContentCalendar from './screens/ContentCalendar'
import Templates from './screens/Templates'
import BrokenLinks from './screens/BrokenLinks'
import RedirectManager from './screens/RedirectManager'
import ImageAltAuditor from './screens/ImageAltAuditor'
import Analytics from './screens/Analytics'
import UptimeMonitor from './screens/UptimeMonitor'
import PageSpeed from './screens/PageSpeed'
import CommentsManager from './screens/CommentsManager'
import PagesManager from './screens/PagesManager'
import AdSenseChecker from './screens/AdSenseChecker'
import ThinContentScanner from './screens/ThinContentScanner'
import SmartSuggestions from './screens/SmartSuggestions'
import WritingGoals from './screens/WritingGoals'
import ContentKanban from './screens/ContentKanban'
import CrossLinkTracker from './screens/CrossLinkTracker'
import ExportCenter from './screens/ExportCenter'
import SiteProfiles from './screens/SiteProfiles'
import ContentPlan from './screens/ContentPlan'
import ArticleTargets from './screens/ArticleTargets'
import BulkGenerator from './screens/BulkGenerator'
import DuplicateChecker from './screens/DuplicateChecker'
import Humanizer from './screens/Humanizer'
import BulkSEOEditor from './screens/BulkSEOEditor'
import ContentRefresh from './screens/ContentRefresh'
import SocialSnippets from './screens/SocialSnippets'
import TopicCluster from './screens/TopicCluster'
import ContentBrief from './screens/ContentBrief'
import OrphanPosts from './screens/OrphanPosts'
import HelpCenter from './screens/HelpCenter'
import SiteDetail from './screens/SiteDetail'
import ErrorLog from './screens/ErrorLog'
import SocialTracker from './screens/SocialTracker'
import PluginManager from './screens/PluginManager'
import SiteDirectory from './screens/SiteDirectory'

export default function App() {
  // Browser-style navigation history so Back/Forward always work, no matter
  // which screen triggered the navigation.
  const [nav, setNav] = useState({ history: [{ screen: 'dashboard', data: null }], index: 0 })
  const activeScreen = nav.history[nav.index].screen
  const navData = nav.history[nav.index].data
  // 'create' reuses whatever was passed via navigate('create', post) as its
  // edit target — a plain object with no wpPostId means "new post prefill".
  const editPost = activeScreen === 'create' ? navData : null

  const navigate = (screen, data = null) => {
    setNav(prev => {
      const truncated = prev.history.slice(0, prev.index + 1)
      const history = [...truncated, { screen, data }]
      return { history, index: history.length - 1 }
    })
  }

  const goBack = () => setNav(prev => prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev)
  const goForward = () => setNav(prev => prev.index < prev.history.length - 1 ? { ...prev, index: prev.index + 1 } : prev)
  const canGoBack = nav.index > 0
  const canGoForward = nav.index < nav.history.length - 1

  const renderScreen = () => {
    switch (activeScreen) {
      case 'dashboard':  return <Dashboard navigate={navigate} />
      case 'create':     return <CreatePost navigate={navigate} editPost={editPost} />
      case 'all-posts':  return <AllPosts navigate={navigate} initialSiteId={navData} />
      case 'drafts':     return <AllPosts navigate={navigate} statusFilter="draft" />
      case 'published':  return <AllPosts navigate={navigate} statusFilter="publish" />
      case 'categories': return <Categories navigate={navigate} initialSiteId={navData} />
      case 'media':      return <MediaLibrary />
      case 'sites':      return <SiteManager />
      case 'settings':   return <Settings />
      case 'calendar':   return <ContentCalendar navigate={navigate} />
      case 'templates':  return <Templates navigate={navigate} />
      case 'broken-links': return <BrokenLinks />
      case 'redirects':    return <RedirectManager />
      case 'image-alt':    return <ImageAltAuditor />
      case 'analytics':    return <Analytics />
      case 'uptime':     return <UptimeMonitor />
      case 'pagespeed':  return <PageSpeed />
      case 'comments':   return <CommentsManager />
      case 'pages':      return <PagesManager navigate={navigate} />
      case 'adsense':    return <AdSenseChecker navigate={navigate} />
      case 'thin-content': return <ThinContentScanner navigate={navigate} />
      case 'suggestions':  return <SmartSuggestions navigate={navigate} />
      case 'writing-goals':  return <WritingGoals navigate={navigate} />
      case 'kanban':         return <ContentKanban navigate={navigate} />
      case 'crosslinks':     return <CrossLinkTracker navigate={navigate} />
      case 'export-center':  return <ExportCenter />
      case 'site-profiles':  return <SiteProfiles />
      case 'content-plan':   return <ContentPlan navigate={navigate} />
      case 'article-targets': return <ArticleTargets />
      case 'bulk-generator':    return <BulkGenerator navigate={navigate} />
      case 'duplicate-checker': return <DuplicateChecker navigate={navigate} />
      case 'humanizer':         return <Humanizer navigate={navigate} />
      case 'bulk-seo':          return <BulkSEOEditor navigate={navigate} />
      case 'content-refresh':   return <ContentRefresh navigate={navigate} />
      case 'social-snippets':   return <SocialSnippets navigate={navigate} />
      case 'social-tracker':    return <SocialTracker navigate={navigate} />
      case 'topic-cluster':     return <TopicCluster navigate={navigate} />
      case 'content-brief':     return <ContentBrief navigate={navigate} />
      case 'orphan-posts':      return <OrphanPosts navigate={navigate} />
      case 'help':              return <HelpCenter navigate={navigate} />
      case 'site-detail':       return <SiteDetail navigate={navigate} site={navData} />
      case 'error-log':         return <ErrorLog />
      case 'plugins':           return <PluginManager />
      case 'site-directory':    return <SiteDirectory />
      default:           return <Dashboard navigate={navigate} />
    }
  }

  return (
    <AppProvider>
      <NotificationProvider>
        <div className="app">
          <Sidebar activeScreen={activeScreen} setActiveScreen={navigate} />
          <main className="main-content">
            <div className="nav-history-bar">
              <button className="nav-history-btn" onClick={goBack} disabled={!canGoBack} title="Back">←</button>
              <button className="nav-history-btn" onClick={goForward} disabled={!canGoForward} title="Forward">→</button>
            </div>
            <ErrorBoundary key={activeScreen} onReset={() => navigate('dashboard')}>
              {renderScreen()}
            </ErrorBoundary>
          </main>
        </div>
        <ToastContainer navigate={navigate} />
      </NotificationProvider>
    </AppProvider>
  )
}
