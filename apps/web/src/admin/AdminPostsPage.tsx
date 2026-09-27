import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createApiClient } from '../api/client'
import type { components } from '../api/schema'

type Post = components['schemas']['Post']
type StatusFilter = 'all' | 'draft' | 'published'
type SortKey = 'updated' | 'published' | 'title'

const formatDate = (iso: string | null): string => {
  if (!iso) {
    return '—'
  }
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function AdminPostsPage() {
  const navigate = useNavigate()
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [sort, setSort] = useState<SortKey>('updated')

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const client = createApiClient()
      const { data, error: apiError, response } = await client.GET(
        '/api/admin/posts',
      )
      if (cancelled) {
        return
      }
      if (apiError || !data) {
        setError(`Could not load posts (${response.status}).`)
        return
      }
      setPosts(data.items.filter((p) => p.status !== 'deleted'))
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const visible = useMemo(() => {
    if (!posts) {
      return []
    }
    const q = query.trim().toLowerCase()
    let list = posts.filter((p) => {
      if (status !== 'all' && p.status !== status) {
        return false
      }
      if (!q) {
        return true
      }
      return (
        p.title.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
      )
    })
    list = [...list].sort((a, b) => {
      if (sort === 'title') {
        return a.title.localeCompare(b.title)
      }
      if (sort === 'published') {
        return (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')
      }
      return b.updatedAt.localeCompare(a.updatedAt)
    })
    return list
  }, [posts, query, status, sort])

  const createDraft = async () => {
    setCreating(true)
    setError(null)
    try {
      const client = createApiClient()
      const { data, error: apiError, response } = await client.POST(
        '/api/admin/posts',
        {
          body: {
            title: 'Untitled',
            excerpt: '',
            bodyMarkdown: '',
            tags: [],
          },
        },
      )
      if (apiError || !data) {
        setError(`Could not create draft (${response.status}).`)
        return
      }
      void navigate(`/admin/posts/${data.id}`)
    } finally {
      setCreating(false)
    }
  }

  return (
    <section className="admin-panel">
      <div className="admin-panel__header">
        <div>
          <h1>Posts</h1>
          <p className="admin-panel__lede">
            Draft and published posts. Click a row to edit.
          </p>
        </div>
        <button
          type="button"
          className="admin-btn admin-btn--primary"
          disabled={creating}
          onClick={() => void createDraft()}
        >
          {creating ? 'Creating…' : 'New post'}
        </button>
      </div>

      <div className="admin-toolbar">
        <input
          type="search"
          className="admin-input"
          placeholder="Search title, slug, tags…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search posts"
        />
        <select
          className="admin-input"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="draft">Drafts</option>
          <option value="published">Published</option>
        </select>
        <select
          className="admin-input"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort posts"
        >
          <option value="updated">Sort by updated</option>
          <option value="published">Sort by published</option>
          <option value="title">Sort by title</option>
        </select>
      </div>

      {error ? (
        <p className="admin-panel__error" role="alert">
          {error}
        </p>
      ) : null}
      {posts === null && !error ? <p>Loading…</p> : null}
      {posts && visible.length === 0 ? (
        <p>No posts match. Create a draft to get started.</p>
      ) : null}
      {visible.length > 0 ? (
        <ul className="admin-post-list">
          {visible.map((post) => (
            <li key={post.id}>
              <Link
                to={`/admin/posts/${post.id}`}
                className="admin-post-list__item admin-post-list__link"
              >
                <span className="admin-post-list__title">{post.title}</span>
                <span className="admin-post-list__meta">
                  <span className={`admin-badge admin-badge--${post.status}`}>
                    {post.status}
                  </span>
                  <code>/{post.slug}</code>
                  <span className="admin-post-list__date">
                    {sort === 'published'
                      ? formatDate(post.publishedAt)
                      : formatDate(post.updatedAt)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
