function authHeader(site) {
  return 'Basic ' + btoa(`${site.username}:${site.password}`)
}

export async function testConnection(site) {
  try {
    const res = await fetch(`${site.url}/wp-json/wp/v2/users/me`, {
      headers: { Authorization: authHeader(site) },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { success: false, error: err.message || `HTTP ${res.status}` }
    }
    const user = await res.json()
    return { success: true, user }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

export async function fetchPosts(site, params = {}) {
  try {
    const q = new URLSearchParams({ per_page: 20, _embed: 1, ...params }).toString()
    const res = await fetch(`${site.url}/wp-json/wp/v2/posts?${q}`, {
      headers: { Authorization: authHeader(site) },
    })
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
    const posts = await res.json()
    const total = parseInt(res.headers.get('X-WP-Total') || '0')
    const pages = parseInt(res.headers.get('X-WP-TotalPages') || '1')
    return { success: true, posts, total, pages }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// Shared by createPost and updatePost so the two never drift apart again —
// they used to: createPost mapped app-internal field names (seo,
// featuredMedia, date) to WordPress's REST shape, but updatePost sent the
// raw app object verbatim. WordPress silently ignores unrecognized field
// names instead of rejecting them, so editing an existing post's SEO fields
// or featured image "succeeded" while actually saving nothing, and a new
// post's schedule date was dropped entirely (WordPress then publishes a
// 'future'-status post immediately if it has no future date).
function toWpPostBody(data) {
  return {
    ...(data.title !== undefined && { title: data.title }),
    ...(data.content !== undefined && { content: data.content }),
    ...(data.status !== undefined && { status: data.status || 'draft' }),
    ...(data.categories !== undefined && { categories: data.categories || [] }),
    ...(data.tags !== undefined && { tags: data.tags || [] }),
    ...(data.date && { date: data.date }),
    // Rank Math SEO fields
    ...(data.seo && {
      meta: {
        rank_math_focus_keyword: data.seo.focusKeyword || '',
        rank_math_title: data.seo.seoTitle || '',
        rank_math_description: data.seo.metaDesc || '',
        rank_math_robots: [
          data.seo.noindex ? 'noindex' : 'index',
          data.seo.nofollow ? 'nofollow' : 'follow',
        ],
      },
    }),
    ...(data.featuredMedia !== undefined && { featured_media: data.featuredMedia || 0 }),
  }
}

export async function createPost(site, data) {
  try {
    const res = await fetch(`${site.url}/wp-json/wp/v2/posts`, {
      method: 'POST',
      headers: {
        Authorization: authHeader(site),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(toWpPostBody(data)),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { success: false, error: err.message || `HTTP ${res.status}` }
    }
    const post = await res.json()
    return { success: true, post }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

export async function updatePost(site, postId, data) {
  try {
    const res = await fetch(`${site.url}/wp-json/wp/v2/posts/${postId}`, {
      method: 'PUT',
      headers: {
        Authorization: authHeader(site),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(toWpPostBody(data)),
    })
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
    const post = await res.json()
    return { success: true, post }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

export async function deletePost(site, postId) {
  try {
    const res = await fetch(`${site.url}/wp-json/wp/v2/posts/${postId}?force=true`, {
      method: 'DELETE',
      headers: { Authorization: authHeader(site) },
    })
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

export async function fetchCategories(site) {
  try {
    const res = await fetch(`${site.url}/wp-json/wp/v2/categories?per_page=100`, {
      headers: { Authorization: authHeader(site) },
    })
    if (!res.ok) return { success: false, categories: [] }
    const categories = await res.json()
    return { success: true, categories }
  } catch {
    return { success: false, categories: [] }
  }
}

// WP REST expects categories/tags as arrays of term IDs, not name strings.
// This resolves (or creates) terms by name and returns their numeric IDs —
// without it, posting a category/tag name string causes the WHOLE post
// creation request to fail with a 400 rest_invalid_param error.
export async function resolveTaxonomyTerms(site, taxonomy, names) {
  const cleanNames = [...new Set(names.map(n => (n || '').trim()).filter(Boolean))]
  if (cleanNames.length === 0) return []
  const ids = []
  for (const name of cleanNames) {
    try {
      const searchRes = await fetch(`${site.url}/wp-json/wp/v2/${taxonomy}?search=${encodeURIComponent(name)}&per_page=100`, {
        headers: { Authorization: authHeader(site) },
      })
      const existing = searchRes.ok ? await searchRes.json() : []
      const match = Array.isArray(existing) ? existing.find(t => t.name.toLowerCase() === name.toLowerCase()) : null
      if (match) { ids.push(match.id); continue }

      const createRes = await fetch(`${site.url}/wp-json/wp/v2/${taxonomy}`, {
        method: 'POST',
        headers: { Authorization: authHeader(site), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (createRes.ok) {
        const created = await createRes.json()
        if (created.id) ids.push(created.id)
      }
    } catch { /* skip term on network error */ }
  }
  return ids
}

export async function uploadMedia(site, file) {
  try {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${site.url}/wp-json/wp/v2/media`, {
      method: 'POST',
      headers: {
        Authorization: authHeader(site),
        'Content-Disposition': `attachment; filename="${file.name}"`,
      },
      body: form,
    })
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
    const media = await res.json()
    return { success: true, media }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

export async function fetchMedia(site, params = {}) {
  try {
    const q = new URLSearchParams({ per_page: 24, media_type: 'image', ...params }).toString()
    const res = await fetch(`${site.url}/wp-json/wp/v2/media?${q}`, {
      headers: { Authorization: authHeader(site) },
    })
    if (!res.ok) return { success: false, items: [], error: `HTTP ${res.status}` }
    const items = await res.json()
    const total = parseInt(res.headers.get('X-WP-Total') || '0')
    return { success: true, items, total }
  } catch (e) {
    return { success: false, items: [], error: e.message }
  }
}

// status=publish is explicit (not left to WordPress's default) so this can
// never accidentally include scheduled ("future") posts — Site Targets on
// the Dashboard uses this count and should only reflect posts that have
// actually gone live, not ones queued for later.
export async function fetchPostCount(site) {
  try {
    const res = await fetch(`${site.url}/wp-json/wp/v2/posts?per_page=1&status=publish`, {
      headers: { Authorization: authHeader(site) },
    })
    if (!res.ok) return 0
    return parseInt(res.headers.get('X-WP-Total') || '0')
  } catch {
    return 0
  }
}
