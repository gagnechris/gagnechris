import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { renderHomePrerenderHtml } from '@gagnechris/shared/home'
import { createApiClient } from '../api/client'
import type { components } from '../api/schema'
import { useDraftPublishEditor } from './useDraftPublishEditor'
import {
  mergeEditorSeo,
  useQueuedAutosave,
} from './useQueuedAutosave'

type Home = components['schemas']['Home']

type DraftFields = {
  name: string
  title: string
  about: string
  seoTitle: string
  seoDescription: string
}

const fromHome = (home: Home): DraftFields => ({
  name: home.name,
  title: home.title,
  about: home.about,
  seoTitle: home.seo?.title ?? '',
  seoDescription: home.seo?.description ?? '',
})

/** Outbound payload only — live draft keeps untrimmed / in-progress text. */
const toHomePayload = (
  draft: DraftFields,
  existingSeo: Home['seo'],
): Pick<Home, 'name' | 'title' | 'about' | 'seo'> => ({
  name: draft.name.trim() || 'Chris Gagne',
  title: draft.title.trim(),
  about: draft.about,
  seo: mergeEditorSeo(existingSeo, draft),
})

const toHome = (home: Home, draft: DraftFields): Home => ({
  ...home,
  ...toHomePayload(draft, home.seo),
})

const AdminHomePage = () => {
  const [home, setHome] = useState<Home | null>(null)
  const [draft, setDraft] = useState<DraftFields | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const versionRef = useRef(0)
  const homeRef = useRef<Home | null>(null)

  useEffect(() => {
    homeRef.current = home
  }, [home])

  const performSave = useCallback(
    async (current: DraftFields, version: number) => {
      const client = createApiClient()
      const { data, error, response } = await client.PUT('/api/admin/home', {
        body: {
          version,
          ...toHomePayload(current, homeRef.current?.seo ?? null),
        },
      })
      if (error || !data) {
        return { ok: false as const, status: response.status }
      }
      return { ok: true as const, entity: data }
    },
    [],
  )

  const onSaved = useCallback((entity: Home) => {
    setHome(entity)
  }, [])

  const getVersion = useCallback((entity: Home) => entity.version, [])

  const {
    save,
    saveState,
    saveError,
    setSaveError,
    setSaveState,
    bumpEdit,
    getEditGen,
    getLastSavedGen,
    markClean,
    setAutosaveHeld,
  } = useQueuedAutosave({
    draft,
    dirty,
    setDirty,
    versionRef,
    getVersion,
    performSave,
    onSaved,
    conflictMessage:
      'Conflict — another save updated the home page. Reload and try again.',
  })

  const publishMutate = useCallback(async () => {
    const client = createApiClient()
    return client.POST('/api/admin/home/publish')
  }, [])

  const unpublishMutate = useCallback(async () => {
    const client = createApiClient()
    return client.POST('/api/admin/home/unpublish')
  }, [])

  const discardMutate = useCallback(async () => {
    const client = createApiClient()
    return client.POST('/api/admin/home/discard')
  }, [])

  const onEntityMeta = useCallback((entity: Home) => {
    setHome(entity)
  }, [])

  const onReplaceDraft = useCallback((entity: Home) => {
    setHome(entity)
    setDraft(fromHome(entity))
  }, [])

  const { busy, runPublish, runUnpublish, runDiscard } = useDraftPublishEditor({
    dirty,
    setDirty,
    save,
    setSaveState,
    setSaveError,
    getEditGen,
    getLastSavedGen,
    markClean,
    setAutosaveHeld,
    versionRef,
    getVersion,
    onEntityMeta,
    onReplaceDraft,
    publish: publishMutate,
    unpublish: unpublishMutate,
    discard: discardMutate,
    unpublishConfirm:
      'Unpublish the home page? The live page keeps the last published HTML.',
    discardConfirm:
      'Discard unpublished edits and restore the last published home content?',
  })

  const setField = (key: keyof DraftFields, value: string) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
    bumpEdit()
    setDirty(true)
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
      <div className="admin-action-bar">
        <div className="admin-action-bar__status">
          <h1>Home</h1>
          <span className={`admin-badge admin-badge--${home.status}`}>
            {home.status}
          </span>
          {home.hasUnpublishedChanges ? (
            <span className="admin-badge admin-badge--unpublished">
              Unpublished changes
            </span>
          ) : null}
          <span className="admin-save-indicator" data-state={saveState}>
            {saveLabel}
          </span>
        </div>
        <div className="admin-actions">
          <a className="admin-btn" href="/" target="_blank" rel="noreferrer">
            View live
          </a>
          {home.status === 'draft' || home.hasUnpublishedChanges ? (
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              disabled={busy}
              onClick={() => void runPublish()}
            >
              {home.hasUnpublishedChanges ? 'Publish changes' : 'Publish'}
            </button>
          ) : null}
          {home.hasUnpublishedChanges ? (
            <button
              type="button"
              className="admin-btn"
              disabled={busy}
              onClick={() => void runDiscard()}
            >
              Discard changes
            </button>
          ) : null}
          {home.status === 'published' ? (
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
        </div>
      </div>

      {saveError ? (
        <p className="admin-panel__error" role="alert">
          {saveError}
        </p>
      ) : null}

      <div className="admin-editor-split">
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

        <div className="admin-editor-split__preview">
          <h2 className="admin-preview-title">Preview</h2>
          <div
            className="admin-home-preview"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      </div>
      <p className="admin-hint">
        ⌘S / Ctrl+S saves · ⌘⏎ / Ctrl+Enter publishes
      </p>
    </section>
  )
}

export default AdminHomePage
