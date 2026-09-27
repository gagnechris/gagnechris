import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import {
  Link,
  useBlocker,
  useNavigate,
  useParams,
} from 'react-router-dom'
import { slugify } from '@gagnechris/shared'
import { createApiClient } from '../api/client'
import type { components } from '../api/schema'
import MarkdownEditor from '../components/markdown/MarkdownEditor'
import MarkdownPreview from '../components/markdown/MarkdownPreview'
import { useQueuedAutosave } from './useQueuedAutosave'
import '../components/markdown/markdown.css'

type Post = components['schemas']['Post']

type DraftFields = {
  title: string
  slug: string
  excerpt: string
  bodyMarkdown: string
  tagsText: string
  coverImage: string
}

const emptyDraft = (): DraftFields => ({
  title: 'Untitled',
  slug: '',
  excerpt: '',
  bodyMarkdown: '',
  tagsText: '',
  coverImage: '',
})

const fromPost = (post: Post): DraftFields => ({
  title: post.title,
  slug: post.slug,
  excerpt: post.excerpt,
  bodyMarkdown: post.bodyMarkdown,
  tagsText: post.tags.join(', '),
  coverImage: post.coverImage ?? '',
})

const parseTags = (text: string): string[] =>
  text
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

export default function PostEditorPage() {
  const { postId } = useParams<{ postId: string }>()
  const navigate = useNavigate()
  const [post, setPost] = useState<Post | null>(null)
  const [draft, setDraft] = useState<DraftFields>(emptyDraft)
  const [slugManual, setSlugManual] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mobilePane, setMobilePane] = useState<'edit' | 'preview'>('edit')
  const versionRef = useRef(0)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const saveRef = useRef<() => Promise<boolean>>(async () => false)
  const publishRef = useRef<() => Promise<void>>(async () => {})

  const performSave = useCallback(
    async (current: DraftFields, version: number) => {
      if (!postId) {
        return { ok: false as const, status: 0 }
      }
      const client = createApiClient()
      const { data, error, response } = await client.PUT('/api/admin/posts/{id}', {
        params: { path: { id: postId } },
        body: {
          version,
          title: current.title.trim() || 'Untitled',
          slug: current.slug.trim() || 'untitled',
          excerpt: current.excerpt,
          bodyMarkdown: current.bodyMarkdown,
          tags: parseTags(current.tagsText),
          coverImage: current.coverImage.trim() || null,
        },
      })
      if (error || !data) {
        return { ok: false as const, status: response.status }
      }
      return { ok: true as const, entity: data }
    },
    [postId],
  )

  const onSaved = useCallback((entity: Post) => {
    setPost(entity)
  }, [])

  const getVersion = useCallback((entity: Post) => entity.version, [])

  const {
    save,
    saveState,
    saveError,
    setSaveError,
    setSaveState,
    bumpEdit,
    getEditGen,
  } = useQueuedAutosave({
    draft,
    dirty,
    setDirty,
    enabled: Boolean(postId),
    versionRef,
    getVersion,
    performSave,
    onSaved,
    conflictMessage:
      'Conflict — another save updated this post. Reload and try again.',
  })

  // Auto-grow the wrapping title field as the user types.
  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft.title, post])

  const setField = <K extends keyof DraftFields>(key: K, value: DraftFields[K]) => {
    setDraft((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'title' && !slugManual) {
        next.slug = slugify(String(value)) || 'untitled'
      }
      return next
    })
    bumpEdit()
    setDirty(true)
  }

  const uploadImages = useCallback(async (files: File[]): Promise<string[]> => {
    const client = createApiClient()
    const paths: string[] = []
    const allowed = new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ])
    for (const file of files) {
      if (!allowed.has(file.type)) {
        throw new Error(`Unsupported image type: ${file.type || file.name}`)
      }
      const { data, error, response } = await client.POST(
        '/api/admin/media/upload-url',
        {
          body: {
            contentType: file.type as
              | 'image/jpeg'
              | 'image/png'
              | 'image/webp'
              | 'image/gif',
            contentLength: file.size,
            filename: file.name,
          },
        },
      )
      if (error || !data) {
        throw new Error(
          `Image upload rejected (${response.status}): ${file.name || file.type}`,
        )
      }
      const put = await fetch(data.uploadUrl, {
        method: 'PUT',
        headers: data.headers,
        body: file,
      })
      if (!put.ok) {
        throw new Error(`Upload failed (${put.status}) for ${file.name}`)
      }
      paths.push(data.publicPath)
    }
    return paths
  }, [])

  const handleUploadImages = useCallback(
    async (files: File[]) => {
      try {
        setSaveError(null)
        return await uploadImages(files)
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Image upload failed')
        return []
      }
    },
    [setSaveError, uploadImages],
  )

  useEffect(() => {
    if (!postId) {
      return
    }
    let cancelled = false
    void (async () => {
      const client = createApiClient()
      const { data, error, response } = await client.GET('/api/admin/posts/{id}', {
        params: { path: { id: postId } },
      })
      if (cancelled) {
        return
      }
      if (error || !data) {
        setLoadError(`Could not load post (${response.status}).`)
        return
      }
      setPost(data)
      setDraft(fromPost(data))
      versionRef.current = data.version
      setSlugManual(true)
      setDirty(false)
    })()
    return () => {
      cancelled = true
    }
  }, [postId])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) {
        return
      }
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const blocker = useBlocker(dirty)
  useEffect(() => {
    if (blocker.state !== 'blocked') {
      return
    }
    const leave = window.confirm(
      'You have unsaved changes. Leave without saving?',
    )
    if (leave) {
      blocker.proceed()
    } else {
      blocker.reset()
    }
  }, [blocker])

  useEffect(() => {
    saveRef.current = save
  }, [save])

  const runPublish = async () => {
    if (!postId || busy) {
      return
    }
    setBusy(true)
    setSaveError(null)
    try {
      if (dirty) {
        const ok = await save()
        if (!ok) {
          return
        }
      }
      const genAtStart = getEditGen()
      const client = createApiClient()
      const { data, error, response } = await client.POST(
        '/api/admin/posts/{id}/publish',
        { params: { path: { id: postId } } },
      )
      if (error || !data) {
        setSaveError(`Publish failed (${response.status}).`)
        return
      }
      // Never clobber the live draft with the published snapshot — typing during
      // the request must survive (CHR-113 / CHR-99).
      setPost(data)
      versionRef.current = data.version
      if (getEditGen() === genAtStart) {
        setDirty(false)
        setSaveState('saved')
      } else {
        setDirty(true)
        setSaveState('idle')
      }
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    publishRef.current = runPublish
  })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey
      if (meta && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveRef.current()
      }
      if (meta && event.key === 'Enter') {
        event.preventDefault()
        void publishRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const runUnpublish = async () => {
    if (!postId || busy) {
      return
    }
    if (!window.confirm('Unpublish this post? It will leave the public blog.')) {
      return
    }
    setBusy(true)
    try {
      if (dirty) {
        const ok = await save()
        if (!ok) {
          return
        }
      }
      const genAtStart = getEditGen()
      const client = createApiClient()
      const { data, error, response } = await client.POST(
        '/api/admin/posts/{id}/unpublish',
        { params: { path: { id: postId } } },
      )
      if (error || !data) {
        setSaveError(`Unpublish failed (${response.status}).`)
        return
      }
      setPost(data)
      versionRef.current = data.version
      if (getEditGen() === genAtStart) {
        setDirty(false)
        setSaveState('saved')
      } else {
        setDirty(true)
        setSaveState('idle')
      }
    } finally {
      setBusy(false)
    }
  }

  const runDiscard = async () => {
    if (!postId || busy) {
      return
    }
    if (
      !window.confirm(
        'Discard unpublished edits and restore the last published post?',
      )
    ) {
      return
    }
    setBusy(true)
    setSaveError(null)
    try {
      const client = createApiClient()
      const { data, error, response } = await client.POST(
        '/api/admin/posts/{id}/discard',
        { params: { path: { id: postId } } },
      )
      if (error || !data) {
        setSaveError(`Discard failed (${response.status}).`)
        return
      }
      setPost(data)
      setDraft(fromPost(data))
      versionRef.current = data.version
      setDirty(false)
      setSaveState('saved')
    } finally {
      setBusy(false)
    }
  }

  const runDelete = async () => {
    if (!postId || busy) {
      return
    }
    if (!window.confirm('Soft-delete this post? You can recover it later via the API.')) {
      return
    }
    setBusy(true)
    try {
      const client = createApiClient()
      const { error, response } = await client.DELETE('/api/admin/posts/{id}', {
        params: { path: { id: postId } },
      })
      if (error) {
        setSaveError(`Delete failed (${response.status}).`)
        return
      }
      setDirty(false)
      void navigate('/admin')
    } finally {
      setBusy(false)
    }
  }

  if (loadError) {
    return (
      <section className="admin-panel">
        <p className="admin-panel__error" role="alert">
          {loadError}
        </p>
        <Link to="/admin">← Back to posts</Link>
      </section>
    )
  }

  if (!post) {
    return (
      <section className="admin-panel">
        <p>Loading editor…</p>
      </section>
    )
  }

  const saveLabel =
    saveState === 'saving'
      ? 'Saving…'
      : saveState === 'saved' && !dirty
        ? 'Saved'
        : dirty
          ? 'Unsaved changes'
          : 'Saved'

  return (
    <section className="admin-panel admin-panel--editor">
      <div className="admin-action-bar">
        <div className="admin-action-bar__status">
          <Link to="/admin" className="admin-back">
            ← Posts
          </Link>
          <span className={`admin-badge admin-badge--${post.status}`}>
            {post.status}
          </span>
          {post.hasUnpublishedChanges ? (
            <span className="admin-badge admin-badge--unpublished">
              Unpublished changes
            </span>
          ) : null}
          <span className="admin-save-indicator" data-state={saveState}>
            {saveLabel}
          </span>
        </div>
        <div className="admin-actions">
          {post.status === 'published' ? (
            <a
              className="admin-btn"
              href={`/blog/${post.slug}`}
              target="_blank"
              rel="noreferrer"
            >
              View live
            </a>
          ) : null}
          {post.status === 'draft' || post.hasUnpublishedChanges ? (
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              disabled={busy}
              onClick={() => void runPublish()}
            >
              {post.hasUnpublishedChanges ? 'Publish changes' : 'Publish'}
            </button>
          ) : null}
          {post.hasUnpublishedChanges ? (
            <button
              type="button"
              className="admin-btn"
              disabled={busy}
              onClick={() => void runDiscard()}
            >
              Discard changes
            </button>
          ) : null}
          {post.status === 'published' ? (
            <button
              type="button"
              className="admin-btn"
              disabled={busy}
              onClick={() => void runUnpublish()}
            >
              Unpublish
            </button>
          ) : null}
          <button
            type="button"
            className="admin-btn"
            disabled={busy || !dirty}
            onClick={() => void save()}
          >
            Save
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--danger"
            disabled={busy}
            onClick={() => void runDelete()}
          >
            Delete
          </button>
        </div>
      </div>

      <h1 className="admin-editor-title">
        <textarea
          ref={titleRef}
          className="admin-title-input"
          rows={1}
          value={draft.title}
          onChange={(e) => setField('title', e.target.value)}
          aria-label="Title"
        />
      </h1>

      {saveError ? (
        <p className="admin-panel__error" role="alert">
          {saveError}
        </p>
      ) : null}

      <details className="admin-details">
        <summary>Details</summary>
        <form
          className="admin-editor-fields admin-editor-fields--meta"
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            void save()
          }}
        >
          <label className="admin-field">
            <span>Slug</span>
            <input
              className="admin-input"
              value={draft.slug}
              onChange={(e) => {
                setSlugManual(true)
                setField('slug', e.target.value)
              }}
            />
          </label>
          <label className="admin-field">
            <span>Tags (comma-separated)</span>
            <input
              className="admin-input"
              value={draft.tagsText}
              onChange={(e) => setField('tagsText', e.target.value)}
            />
          </label>
          <label className="admin-field admin-field--full">
            <span>Excerpt</span>
            <textarea
              className="admin-input admin-textarea"
              rows={2}
              value={draft.excerpt}
              onChange={(e) => setField('excerpt', e.target.value)}
            />
          </label>
          <label className="admin-field admin-field--full">
            <span>Cover image URL</span>
            <input
              className="admin-input"
              value={draft.coverImage}
              onChange={(e) => setField('coverImage', e.target.value)}
              placeholder="/media/… or https://…"
            />
          </label>
        </form>
      </details>

      <div className="markdown-workspace">
        <div
          className="markdown-tabs"
          role="tablist"
          aria-label="Editor view"
        >
          <button
            type="button"
            role="tab"
            className="markdown-tabs__btn"
            aria-selected={mobilePane === 'edit'}
            onClick={() => setMobilePane('edit')}
          >
            Edit
          </button>
          <button
            type="button"
            role="tab"
            className="markdown-tabs__btn"
            aria-selected={mobilePane === 'preview'}
            onClick={() => setMobilePane('preview')}
          >
            Preview
          </button>
        </div>
        <div className="markdown-split" data-pane={mobilePane}>
          <MarkdownEditor
            value={draft.bodyMarkdown}
            onChange={(value) => setField('bodyMarkdown', value)}
            onUploadImages={handleUploadImages}
          />
          <MarkdownPreview markdown={draft.bodyMarkdown} />
        </div>
      </div>
      <p className="admin-hint">
        ⌘S / Ctrl+S saves · ⌘⏎ / Ctrl+Enter publishes · paste or drop images into
        the editor
      </p>
    </section>
  )
}
