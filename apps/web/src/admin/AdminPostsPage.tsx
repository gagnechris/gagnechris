import { useEffect, useState } from 'react'
import { createApiClient } from '../api/client'
import type { components } from '../api/schema'

type Post = components['schemas']['Post']

/**
 * Temporary posts hub until CHR-33 (editor). Proves the typed API client works.
 */
export default function AdminPostsPage() {
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const client = createApiClient()
      const { data, error: apiError, response } = await client.GET('/api/admin/posts')
      if (cancelled) {
        return
      }
      if (apiError || !data) {
        setError(
          `Could not load posts (${response.status}). ${typeof apiError === 'object' && apiError && 'message' in apiError ? String(apiError.message) : ''}`.trim(),
        )
        return
      }
      setPosts(data.items)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="admin-panel">
      <h1>Posts</h1>
      <p className="admin-panel__lede">
        Draft and published posts. The markdown editor lands in a follow-up ticket.
      </p>
      {error ? <p className="admin-panel__error" role="alert">{error}</p> : null}
      {posts === null && !error ? <p>Loading…</p> : null}
      {posts && posts.length === 0 ? (
        <p>No posts yet. Create them via the API until the editor is ready.</p>
      ) : null}
      {posts && posts.length > 0 ? (
        <ul className="admin-post-list">
          {posts.map((post) => (
            <li key={post.id} className="admin-post-list__item">
              <span className="admin-post-list__title">{post.title}</span>
              <span className="admin-post-list__meta">
                <span className={`admin-badge admin-badge--${post.status}`}>
                  {post.status}
                </span>
                <code>/{post.slug}</code>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
