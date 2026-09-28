import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { renderHomePrerenderHtml } from '@gagnechris/shared/home'
import type { components } from '../api/schema'
import { EditorActionBar } from '../ui/EditorActionBar'
import { Field, TextArea, TextInput } from '../ui/Field'
import { ApiError, updateHome } from './query/api'
import {
  useHomeLifecycleMutators,
  useHomeQuery,
  useSetHomeCache,
} from './query/home'
import { useDraftPublishEditor } from './useDraftPublishEditor'
import { useNullableDraftUpdater } from './useDraftUpdater'
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
  const {
    data: home,
    error: queryError,
    isPending,
  } = useHomeQuery()
  const setHomeCache = useSetHomeCache()
  const {
    publish: publishRequest,
    unpublish: unpublishRequest,
    discard: discardRequest,
  } = useHomeLifecycleMutators()

  const [draft, setDraft] = useState<DraftFields | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [dirty, setDirty] = useState(false)
  const versionRef = useRef(0)
  const homeRef = useRef<Home | null>(null)

  if (home && !hydrated) {
    setHydrated(true)
    setDraft(fromHome(home))
    setDirty(false)
  }

  useEffect(() => {
    homeRef.current = home ?? null
    if (home) {
      versionRef.current = home.version
    }
  }, [home])

  const performSave = useCallback(
    async (current: DraftFields, version: number) => {
      try {
        const entity = await updateHome({
          version,
          ...toHomePayload(current, homeRef.current?.seo ?? null),
        })
        return { ok: true as const, entity }
      } catch (err) {
        return {
          ok: false as const,
          status: err instanceof ApiError ? err.status : 0,
        }
      }
    },
    [],
  )

  const onSaved = useCallback(
    (entity: Home) => {
      setHomeCache(entity)
    },
    [setHomeCache],
  )

  const getVersion = useCallback((entity: Home) => entity.version, [])

  const autosave = useQueuedAutosave({
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

  const { save, saveState, saveError, bumpEdit } = autosave

  const publishMutate = useCallback(
    () => publishRequest({ version: versionRef.current }),
    [publishRequest],
  )
  const unpublishMutate = useCallback(
    () => unpublishRequest({ version: versionRef.current }),
    [unpublishRequest],
  )
  const discardMutate = useCallback(
    () => discardRequest({ version: versionRef.current }),
    [discardRequest],
  )

  const onEntityMeta = useCallback(
    (entity: Home) => {
      setHomeCache(entity)
    },
    [setHomeCache],
  )

  const onReplaceDraft = useCallback(
    (entity: Home) => {
      setHomeCache(entity)
      setDraft(fromHome(entity))
    },
    [setHomeCache],
  )

  const { busy, runPublish, runUnpublish, runDiscard } = useDraftPublishEditor({
    autosave,
    dirty,
    setDirty,
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

  const updateDraft = useNullableDraftUpdater(setDraft, bumpEdit, setDirty)
  const setField = (key: keyof DraftFields, value: string) => {
    updateDraft((prev) => ({ ...prev, [key]: value }))
  }

  const loadError =
    queryError instanceof ApiError
      ? queryError.message
      : queryError
        ? 'Could not load home content.'
        : null

  if (loadError) {
    return (
      <section className="admin-panel">
        <p className="admin-panel__error" role="alert">
          {loadError}
        </p>
      </section>
    )
  }

  if (isPending || !home || !draft) {
    return (
      <section className="admin-panel">
        <p>Loading home content…</p>
      </section>
    )
  }

  const previewHtml = renderHomePrerenderHtml(toHome(home, draft))

  return (
    <section className="admin-panel admin-panel--editor">
      <EditorActionBar
        leading={<h1>Home</h1>}
        status={home.status}
        hasUnpublishedChanges={home.hasUnpublishedChanges}
        saveState={saveState}
        dirty={dirty}
        busy={busy}
        viewLiveHref="/"
        onPublish={() => void runPublish()}
        onUnpublish={() => void runUnpublish()}
        onDiscard={() => void runDiscard()}
        onSave={() => void save()}
      />

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
          <Field label="Name">
            <TextInput
              value={draft.name}
              onChange={(e) => setField('name', e.target.value)}
            />
          </Field>
          <Field label="Title">
            <TextInput
              value={draft.title}
              onChange={(e) => setField('title', e.target.value)}
            />
          </Field>
          <Field
            label="About Me"
            hint="Blank lines start a new paragraph. Quick Links and the profile photo are not editable yet."
          >
            <TextArea
              rows={8}
              value={draft.about}
              onChange={(e) => setField('about', e.target.value)}
            />
          </Field>
          <Field label="SEO title (optional)">
            <TextInput
              value={draft.seoTitle}
              onChange={(e) => setField('seoTitle', e.target.value)}
              placeholder={`${draft.name} - ${draft.title}`}
            />
          </Field>
          <Field
            label="SEO description (optional)"
            hint="Defaults to the first 200 characters of About Me."
          >
            <TextArea
              rows={3}
              value={draft.seoDescription}
              onChange={(e) => setField('seoDescription', e.target.value)}
            />
          </Field>
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
