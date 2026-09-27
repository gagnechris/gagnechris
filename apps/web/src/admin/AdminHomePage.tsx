import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { renderHomePrerenderHtml } from '@gagnechris/shared/home'
import { createApiClient } from '../api/client'
import type { components } from '../api/schema'

type Home = components['schemas']['Home']

type DraftFields = {
  name: string
  title: string
  about: string
  seoTitle: string
  seoDescription: string
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const fromHome = (home: Home): DraftFields => ({
  name: home.name,
  title: home.title,
  about: home.about,
  seoTitle: home.seo?.title ?? '',
  seoDescription: home.seo?.description ?? '',
})

/** `null` clears the stored overrides so the publisher falls back to defaults. */
const toSeo = (draft: DraftFields): Home['seo'] => {
  const title = draft.seoTitle.trim()
  const description = draft.seoDescription.trim()
  if (!title && !description) return null
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
  }
}

const toHome = (home: Home, draft: DraftFields): Home => ({
  ...home,
  name: draft.name.trim() || 'Chris Gagne',
  title: draft.title.trim(),
  about: draft.about,
  seo: toSeo(draft),
})

export default function AdminHomePage() {
  const [home, setHome] = useState<Home | null>(null)
  const [draft, setDraft] = useState<DraftFields | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const versionRef = useRef(0)
  const draftRef = useRef<DraftFields | null>(null)

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  const setField = (key: keyof DraftFields, value: string) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
    setDirty(true)
    setSaveState('idle')
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const client = createApiClient()
      const { data, error, response } = await client.GET('/api/admin/home')
      if (cancelled) return
      if (error || !data) {
        setLoadError(`Could not load home content (${response.status}).`)
        return
      }
      setHome(data)
      setDraft(fromHome(data))
      versionRef.current = data.version
      setDirty(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const save = useCallback(async (): Promise<boolean> => {
    const current = draftRef.current
    if (!current) return false
    setSaveState('saving')
    setSaveError(null)
    const client = createApiClient()
    const { data, error, response } = await client.PUT('/api/admin/home', {
      body: {
        version: versionRef.current,
        name: current.name.trim() || 'Chris Gagne',
        title: current.title.trim(),
        about: current.about,
        seo: toSeo(current),
      },
    })
    if (error || !data) {
      setSaveState('error')
      setSaveError(
        response.status === 409
          ? 'Conflict — another save updated the home page. Reload and try again.'
          : `Save failed (${response.status}).`,
      )
      return false
    }
    setHome(data)
    versionRef.current = data.version
    setDraft(fromHome(data))
    setDirty(false)
    setSaveState('saved')
    return true
  }, [])

  useEffect(() => {
    if (!dirty) return
    const handle = window.setTimeout(() => {
      void save()
    }, 900)
    return () => window.clearTimeout(handle)
  }, [dirty, draft, save])

  const runStatusChange = async (action: 'publish' | 'unpublish') => {
    if (busy) return
    if (
      action === 'unpublish' &&
      !window.confirm(
        'Unpublish the home page? The live page keeps the last published HTML.',
      )
    ) {
      return
    }
    setBusy(true)
    setSaveError(null)
    try {
      if (dirty && !(await save())) return
      const client = createApiClient()
      const { data, error, response } =
        action === 'publish'
          ? await client.POST('/api/admin/home/publish')
          : await client.POST('/api/admin/home/unpublish')
      if (error || !data) {
        setSaveError(
          `${action === 'publish' ? 'Publish' : 'Unpublish'} failed (${response.status}).`,
        )
        return
      }
      setHome(data)
      versionRef.current = data.version
      setDraft(fromHome(data))
      setDirty(false)
      setSaveState('saved')
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
      </section>
    )
  }

  if (!home || !draft) {
    return (
      <section className="admin-panel">
        <p>Loading home content…</p>
      </section>
    )
  }

  const previewHtml = renderHomePrerenderHtml(toHome(home, draft))

  const saveLabel =
    saveState === 'saving' ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved'

  return (
    <section className="admin-panel admin-panel--editor">
      <div className="admin-panel__header">
        <div>
          <h1>Home</h1>
          <p className="admin-panel__meta-row">
            <span className={`admin-badge admin-badge--${home.status}`}>
              {home.status}
            </span>
            <span className="admin-save-indicator" data-state={saveState}>
              {saveLabel}
            </span>
          </p>
        </div>
        <div className="admin-actions">
          <a className="admin-btn" href="/" target="_blank" rel="noreferrer">
            View live
          </a>
          {home.status === 'published' ? (
            <button
              type="button"
              className="admin-btn"
              disabled={busy}
              onClick={() => void runStatusChange('unpublish')}
            >
              Unpublish
            </button>
          ) : (
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              disabled={busy}
              onClick={() => void runStatusChange('publish')}
            >
              Publish
            </button>
          )}
          <button
            type="button"
            className="admin-btn"
            disabled={busy || !dirty}
            onClick={() => void save()}
          >
            Save
          </button>
        </div>
      </div>

      {saveError ? (
        <p className="admin-panel__error" role="alert">
          {saveError}
        </p>
      ) : null}

      <form
        className="admin-editor-fields"
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          void save()
        }}
      >
        <label className="admin-field">
          <span>Name</span>
          <input
            className="admin-input"
            value={draft.name}
            onChange={(e) => setField('name', e.target.value)}
          />
        </label>
        <label className="admin-field">
          <span>Title</span>
          <input
            className="admin-input"
            value={draft.title}
            onChange={(e) => setField('title', e.target.value)}
          />
        </label>
        <label className="admin-field">
          <span>About Me</span>
          <textarea
            className="admin-input admin-textarea"
            rows={8}
            value={draft.about}
            onChange={(e) => setField('about', e.target.value)}
          />
          <span className="admin-hint">
            Blank lines start a new paragraph. Quick Links and the profile photo
            are not editable yet.
          </span>
        </label>
        <label className="admin-field">
          <span>SEO title (optional)</span>
          <input
            className="admin-input"
            value={draft.seoTitle}
            onChange={(e) => setField('seoTitle', e.target.value)}
            placeholder={`${draft.name} - ${draft.title}`}
          />
        </label>
        <label className="admin-field">
          <span>SEO description (optional)</span>
          <textarea
            className="admin-input admin-textarea"
            rows={3}
            value={draft.seoDescription}
            onChange={(e) => setField('seoDescription', e.target.value)}
          />
          <span className="admin-hint">
            Defaults to the first 200 characters of About Me.
          </span>
        </label>
      </form>

      <h2 className="admin-preview-title">Preview</h2>
      <div
        className="admin-home-preview"
        dangerouslySetInnerHTML={{ __html: previewHtml }}
      />
    </section>
  )
}
