import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { useNotify } from '../context/NotificationContext'
import './PagesManager.css'

const COMPLIANCE_TEMPLATES = [
  {
    key: 'privacy',
    label: 'Privacy Policy',
    icon: '🔒',
    required: true,
    adsense: true,
    title: 'Privacy Policy',
    content: `<h1>Privacy Policy</h1>
<p>Last updated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

<h2>Information We Collect</h2>
<p>We collect information you provide directly to us, such as when you subscribe to our newsletter, leave a comment, or contact us. This may include your name, email address, and any other information you choose to provide.</p>

<h2>How We Use Your Information</h2>
<p>We use the information we collect to operate and improve our website, respond to your comments and questions, and send you newsletters and other communications if you have opted in.</p>

<h2>Cookies and Tracking Technologies</h2>
<p>We use cookies and similar tracking technologies to track activity on our website and hold certain information. You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent.</p>

<h2>Google AdSense</h2>
<p>We use Google AdSense to display advertisements on our website. Google uses cookies to serve ads based on your prior visits to our website and other sites on the internet. You may opt out of personalized advertising by visiting <a href="https://www.google.com/settings/ads">Google Ads Settings</a>.</p>

<h2>Third-Party Links</h2>
<p>Our website may contain links to third-party websites. We have no control over the content or privacy practices of those sites and encourage you to review their privacy policies.</p>

<h2>Data Security</h2>
<p>We implement appropriate technical and organizational security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.</p>

<h2>Your Rights</h2>
<p>You have the right to access, correct, or delete your personal information. To exercise these rights, please contact us using the information provided in our Contact page.</p>

<h2>Changes to This Policy</h2>
<p>We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page with an updated date.</p>

<h2>Contact Us</h2>
<p>If you have any questions about this Privacy Policy, please contact us through our Contact page.</p>`
  },
  {
    key: 'terms',
    label: 'Terms of Service',
    icon: '📋',
    required: true,
    adsense: true,
    title: 'Terms of Service',
    content: `<h1>Terms of Service</h1>
<p>Last updated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

<h2>Acceptance of Terms</h2>
<p>By accessing and using this website, you accept and agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our website.</p>

<h2>Use of the Website</h2>
<p>You may use this website for lawful purposes only. You agree not to use the site in any way that violates applicable laws or regulations, or that harms other users.</p>

<h2>Intellectual Property</h2>
<p>All content on this website, including text, images, graphics, and other materials, is the property of this website and is protected by applicable copyright and intellectual property laws.</p>

<h2>Disclaimer of Warranties</h2>
<p>This website is provided on an "as is" basis without warranties of any kind. We make no representations about the accuracy or completeness of the content on this site.</p>

<h2>Limitation of Liability</h2>
<p>To the fullest extent permitted by law, we shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of this website.</p>

<h2>Third-Party Links</h2>
<p>We are not responsible for the content, accuracy, or practices of any third-party websites linked from our site.</p>

<h2>Changes to Terms</h2>
<p>We reserve the right to modify these Terms of Service at any time. Continued use of the website after any changes constitutes acceptance of the new terms.</p>

<h2>Governing Law</h2>
<p>These terms are governed by applicable law. Any disputes shall be resolved through appropriate legal channels.</p>

<h2>Contact</h2>
<p>For questions about these Terms of Service, please visit our Contact page.</p>`
  },
  {
    key: 'contact',
    label: 'Contact Us',
    icon: '✉️',
    required: true,
    adsense: true,
    title: 'Contact Us',
    content: `<h1>Contact Us</h1>
<p>We'd love to hear from you! Whether you have a question, suggestion, or just want to say hello, please reach out.</p>

<h2>Get in Touch</h2>
<p>You can contact us through the following methods:</p>

<ul>
<li><strong>Email:</strong> [YOUR EMAIL ADDRESS]</li>
<li><strong>Response Time:</strong> We aim to respond within 24–48 hours on business days.</li>
</ul>

<h2>For Business Enquiries</h2>
<p>For advertising, partnerships, or collaboration opportunities, please include "Business Enquiry" in your subject line.</p>

<h2>Report an Issue</h2>
<p>If you've found a broken link, inaccurate information, or have a content concern, please let us know and we'll address it promptly.</p>`
  },
  {
    key: 'about',
    label: 'About Us',
    icon: '👤',
    required: true,
    adsense: true,
    title: 'About Us',
    content: `<h1>About Us</h1>
<p>Welcome! Thank you for visiting our website.</p>

<h2>Who We Are</h2>
<p>[Describe yourself or your team here. Tell readers who you are, your background, and what drives your passion for this topic.]</p>

<h2>Our Mission</h2>
<p>[Explain what your website is about and what value you provide to your readers. What problem are you solving? What questions are you answering?]</p>

<h2>What We Cover</h2>
<p>On this website, you'll find:</p>
<ul>
<li>[Topic/category 1]</li>
<li>[Topic/category 2]</li>
<li>[Topic/category 3]</li>
</ul>

<h2>Our Commitment</h2>
<p>We are committed to providing accurate, well-researched, and helpful content. We update our articles regularly to ensure the information remains current and relevant.</p>

<h2>Contact Us</h2>
<p>Have a question or suggestion? We'd love to hear from you — please visit our <a href="/contact">Contact page</a>.</p>`
  },
  {
    key: 'disclaimer',
    label: 'Disclaimer',
    icon: '⚠️',
    required: false,
    adsense: true,
    title: 'Disclaimer',
    content: `<h1>Disclaimer</h1>
<p>Last updated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

<h2>General Information Only</h2>
<p>The information provided on this website is for general informational and educational purposes only. It is not intended as professional advice of any kind.</p>

<h2>No Professional Advice</h2>
<p>The content on this website does not constitute professional advice. Always seek guidance from a qualified professional for specific advice tailored to your situation.</p>

<h2>Accuracy of Information</h2>
<p>While we strive to keep the information on this website up to date and accurate, we make no representations or warranties of any kind, express or implied, about the completeness, accuracy, reliability, or suitability of the information.</p>

<h2>Affiliate Disclosure</h2>
<p>This website may contain affiliate links. This means we may receive a small commission if you click on a link and make a purchase, at no additional cost to you. We only recommend products and services we genuinely believe in.</p>

<h2>External Links</h2>
<p>This website may contain links to external websites. We have no control over the content of those sites and accept no responsibility for them or for any loss or damage that may arise from your use of them.</p>

<h2>Limitation of Liability</h2>
<p>In no event will we be liable for any loss or damage including without limitation, indirect or consequential loss or damage, arising from the use of this website.</p>`
  },
  {
    key: 'cookie',
    label: 'Cookie Policy',
    icon: '🍪',
    required: false,
    adsense: true,
    title: 'Cookie Policy',
    content: `<h1>Cookie Policy</h1>
<p>Last updated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

<h2>What Are Cookies?</h2>
<p>Cookies are small text files that are placed on your device when you visit a website. They are widely used to make websites work, improve user experience, and provide information to website owners.</p>

<h2>How We Use Cookies</h2>
<p>We use cookies for the following purposes:</p>
<ul>
<li><strong>Essential cookies:</strong> Required for the website to function properly.</li>
<li><strong>Analytics cookies:</strong> Help us understand how visitors interact with our website.</li>
<li><strong>Advertising cookies:</strong> Used by Google AdSense to serve relevant advertisements.</li>
</ul>

<h2>Google AdSense Cookies</h2>
<p>We use Google AdSense to display advertisements. Google uses cookies to serve ads based on your browsing history. You can opt out at <a href="https://www.google.com/settings/ads">Google's Ad Settings</a> or <a href="https://optout.aboutads.info/">AboutAds.info</a>.</p>

<h2>Managing Cookies</h2>
<p>You can control cookies through your browser settings. Please note that disabling cookies may affect the functionality of this website.</p>

<h2>More Information</h2>
<p>For more information about how we use your data, please see our <a href="/privacy-policy">Privacy Policy</a>.</p>`
  },
]

export default function PagesManager() {
  const { sites } = useApp()
  const { notifySuccess, notifyError, notifyWarning } = useNotify()
  const connected = sites.filter(s => s.connected)

  const [selectedSite, setSelectedSite]   = useState(connected[0]?.id || '')
  const [pages, setPages]                 = useState([])
  const [loading, setLoading]             = useState(false)
  const [creating, setCreating]           = useState(false)
  const [createStatus, setCreateStatus]   = useState({}) // { tplKey: 'ok' | 'creating' | 'exists' | error }
  const [tab, setTab]                     = useState('existing') // existing | templates

  const site = sites.find(s => s.id === selectedSite)

  const fetchPages = async () => {
    if (!site) return
    setLoading(true)
    try {
      const headers = { Authorization: 'Basic ' + btoa(`${site.username}:${site.password}`) }
      let all = [], page = 1, failed = false
      while (true) {
        const r = await fetch(`${site.url}/wp-json/wp/v2/pages?per_page=100&page=${page}&status=any`, { headers })
        if (!r.ok) { failed = true; break }
        const batch = await r.json()
        if (!Array.isArray(batch) || batch.length === 0) break
        all = [...all, ...batch]
        if (batch.length < 100) break
        page++
      }
      setPages(all)
      // A failed/partial fetch used to look identical to "this site genuinely
      // has no pages" — templateExists() below reads off `pages`, so an
      // already-published compliance page could look "missing" and get
      // recreated as a duplicate. Warn explicitly instead of staying silent.
      if (failed) notifyWarning(`Couldn't fully load pages from ${site.name} — the list below may be incomplete, so check before creating a page that might already exist.`)
    } catch (e) {
      setPages([])
      notifyError(`Failed to load pages from ${site.name}: ${e.message}`, { site: site.name, action: 'Load Pages' })
    }
    setLoading(false)
  }

  useEffect(() => { fetchPages() }, [selectedSite])

  const existingPageTitles = pages.map(p => (p.title?.rendered || '').toLowerCase())

  const templateExists = (tpl) =>
    existingPageTitles.some(t => t.includes(tpl.title.toLowerCase()) || t.includes(tpl.key.replace('-', ' ')))

  const createPage = async (tpl) => {
    if (!site) return
    setCreateStatus(prev => ({ ...prev, [tpl.key]: 'creating' }))
    try {
      const headers = {
        Authorization: 'Basic ' + btoa(`${site.username}:${site.password}`),
        'Content-Type': 'application/json',
      }
      const r = await fetch(`${site.url}/wp-json/wp/v2/pages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title: tpl.title, content: tpl.content, status: 'publish' }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.message || `HTTP ${r.status}`)
      }
      setCreateStatus(prev => ({ ...prev, [tpl.key]: 'ok' }))
      notifySuccess(`✓ Published "${tpl.title}" on ${site.name}`)
      fetchPages()
    } catch (e) {
      setCreateStatus(prev => ({ ...prev, [tpl.key]: 'error: ' + e.message }))
      notifyError(`Failed to create "${tpl.title}" on ${site.name}: ${e.message}`, { site: site.name, action: 'Create Page' })
    }
  }

  const deletePage = async (pageId, pageTitle) => {
    if (!site || !window.confirm('Delete this page from WordPress?')) return
    const headers = { Authorization: 'Basic ' + btoa(`${site.username}:${site.password}`) }
    try {
      const r = await fetch(`${site.url}/wp-json/wp/v2/pages/${pageId}?force=true`, { method: 'DELETE', headers })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      notifySuccess(`✓ Deleted "${pageTitle || 'page'}" from ${site.name}`)
      fetchPages()
    } catch (e) {
      notifyError(`Failed to delete page on ${site.name}: ${e.message}`, { site: site.name, action: 'Delete Page' })
    }
  }

  const statusLabel = (status) => {
    const m = { publish: ['Published', '#dcfce7', '#166534'], draft: ['Draft', '#f3f4f6', '#4b5563'], private: ['Private', '#ede9fe', '#6d28d9'] }
    const [label, bg, color] = m[status] || [status, '#f3f4f6', '#4b5563']
    return <span style={{ background: bg, color, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>{label}</span>
  }

  return (
    <div className="pm-screen">
      <div className="page-header-row">
        <div>
          <h1>Pages Manager</h1>
          <p className="page-subtitle">Manage WordPress pages — including required AdSense compliance pages</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={fetchPages} disabled={loading}>↺ Refresh</button>
      </div>

      {/* Site selector */}
      <div className="pm-site-row">
        <label className="pm-site-label">Site:</label>
        <select className="pm-site-select" value={selectedSite} onChange={e => setSelectedSite(e.target.value)}>
          {connected.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {!connected.length && <span className="pm-no-sites">No connected sites</span>}
      </div>

      {/* Tabs */}
      <div className="pm-tabs">
        <button className={`pm-tab${tab === 'existing' ? ' active' : ''}`} onClick={() => setTab('existing')}>
          Existing Pages ({pages.length})
        </button>
        <button className={`pm-tab${tab === 'templates' ? ' active' : ''}`} onClick={() => setTab('templates')}>
          📋 Create Compliance Pages
        </button>
      </div>

      {tab === 'existing' && (
        loading ? (
          <div className="pm-loading">⟳ Loading pages…</div>
        ) : pages.length === 0 ? (
          <div className="pm-empty">No pages found. Use the "Create Compliance Pages" tab to get started.</div>
        ) : (
          <div className="pm-table-wrap">
            <table className="pm-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Page Title</th>
                  <th>Status</th>
                  <th>Last Modified</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((p, i) => (
                  <tr key={p.id}>
                    <td className="pm-td-num">{i + 1}</td>
                    <td>
                      <div className="pm-page-title">{p.title?.rendered || '(no title)'}</div>
                      <div className="pm-page-slug">/{p.slug}</div>
                    </td>
                    <td>{statusLabel(p.status)}</td>
                    <td className="pm-td-date">{new Date(p.modified).toLocaleDateString()}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <a
                          href={p.link}
                          target="_blank"
                          rel="noreferrer"
                          className="pm-btn-view"
                        >View ↗</a>
                        <button className="pm-btn-delete" onClick={() => deletePage(p.id, p.title?.rendered)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'templates' && (
        <div className="pm-templates">
          <div className="pm-tpl-info">
            These are the pages Google AdSense requires before approving your site.
            Click <strong>Create Page</strong> to publish them directly to your selected WordPress site.
          </div>
          <div className="pm-tpl-grid">
            {COMPLIANCE_TEMPLATES.map(tpl => {
              const exists = templateExists(tpl)
              const status = createStatus[tpl.key]
              return (
                <div key={tpl.key} className={`pm-tpl-card${exists ? ' pm-tpl-exists' : ''}`}>
                  <div className="pm-tpl-top">
                    <span className="pm-tpl-icon">{tpl.icon}</span>
                    <div>
                      <div className="pm-tpl-name">{tpl.label}</div>
                      <div className="pm-tpl-badges">
                        {tpl.required && <span className="pm-badge required">Required</span>}
                        {tpl.adsense && <span className="pm-badge adsense">AdSense</span>}
                      </div>
                    </div>
                    {exists && <span className="pm-tpl-check">✓ Exists</span>}
                  </div>

                  {status && status !== 'creating' && (
                    <div className={`pm-tpl-status${status === 'ok' ? ' ok' : ' error'}`}>
                      {status === 'ok' ? '✓ Page created and published!' : status}
                    </div>
                  )}

                  <div className="pm-tpl-preview">
                    <div className="pm-tpl-preview-label">Preview (first 200 chars)</div>
                    <div className="pm-tpl-preview-text">
                      {tpl.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)}…
                    </div>
                  </div>

                  <button
                    className={`pm-tpl-btn${exists ? ' secondary' : ''}`}
                    onClick={() => createPage(tpl)}
                    disabled={status === 'creating' || !site}
                  >
                    {status === 'creating' ? '⟳ Creating…'
                      : exists ? '↺ Recreate Page'
                      : '+ Create & Publish'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
