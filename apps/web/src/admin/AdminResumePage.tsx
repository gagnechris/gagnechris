import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { renderResumePrerenderHtml } from '@gagnechris/shared/resume'
import { createApiClient } from '../api/client'
import type { components } from '../api/schema'
import { useDraftPublishEditor } from './useDraftPublishEditor'
import { useQueuedAutosave } from './useQueuedAutosave'
import '../pages/Resume.css'

type Resume = components['schemas']['Resume']
type ResumeContent = components['schemas']['ResumeContent']

type ExperienceDraft = {
  title: string
  company: string
  bulletsText: string
}

type EducationDraft = {
  title: string
  degreeDetail: string
  institution: string
  location: string
  year: string
}

type DraftFields = {
  name: string
  pdfPath: string
  summary: string
  competenciesText: string
  experience: ExperienceDraft[]
  skillsText: string
  education: EducationDraft[]
}

const emptyExperience = (): ExperienceDraft => ({
  title: '',
  company: '',
  bulletsText: '',
})

const emptyEducation = (): EducationDraft => ({
  title: '',
  degreeDetail: '',
  institution: '',
  location: '',
  year: '',
})

/** Normalize list fields for the API / preview — not applied back onto the live draft. */
const parseLines = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

const fromResume = (resume: Resume): DraftFields => ({
  name: resume.name,
  pdfPath: resume.pdfPath,
  summary: resume.content.summary,
  competenciesText: resume.content.competencies.join('\n'),
  experience: resume.content.experience.map((item) => ({
    title: item.title,
    company: item.company,
    bulletsText: item.bullets.join('\n'),
  })),
  skillsText: resume.content.skills.join('\n'),
  education: resume.content.education.map((item) => ({
    title: item.title,
    degreeDetail: item.degreeDetail ?? '',
    institution: item.institution,
    location: item.location,
    year: item.year,
  })),
})

const toContent = (draft: DraftFields): ResumeContent => ({
  summary: draft.summary.trim(),
  competencies: parseLines(draft.competenciesText),
  experience: draft.experience.map((item) => ({
    title: item.title.trim(),
    company: item.company.trim(),
    bullets: parseLines(item.bulletsText),
  })),
  skills: parseLines(draft.skillsText),
  education: draft.education.map((item) => ({
    title: item.title.trim(),
    institution: item.institution.trim(),
    location: item.location.trim(),
    year: item.year.trim(),
    ...(item.degreeDetail.trim()
      ? { degreeDetail: item.degreeDetail.trim() }
      : {}),
  })),
})

const AdminResumePage = () => {
  const [resume, setResume] = useState<Resume | null>(null)
  const [draft, setDraft] = useState<DraftFields | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const versionRef = useRef(0)

  const performSave = useCallback(
    async (current: DraftFields, version: number) => {
      const client = createApiClient()
      const { data, error, response } = await client.PUT('/api/admin/resume', {
        body: {
          version,
          name: current.name.trim() || 'Chris Gagne',
          pdfPath: '/resume.pdf',
          content: toContent(current),
        },
      })
      if (error || !data) {
        return { ok: false as const, status: response.status }
      }
      return { ok: true as const, entity: data }
    },
    [],
  )

  const onSaved = useCallback((entity: Resume) => {
    setResume(entity)
  }, [])

  const getVersion = useCallback((entity: Resume) => entity.version, [])

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
      'Conflict — another save updated the resume. Reload and try again.',
  })

  const publishMutate = useCallback(async () => {
    const client = createApiClient()
    return client.POST('/api/admin/resume/publish')
  }, [])

  const unpublishMutate = useCallback(async () => {
    const client = createApiClient()
    return client.POST('/api/admin/resume/unpublish')
  }, [])

  const discardMutate = useCallback(async () => {
    const client = createApiClient()
    return client.POST('/api/admin/resume/discard')
  }, [])

  const onEntityMeta = useCallback((entity: Resume) => {
    setResume(entity)
  }, [])

  const onReplaceDraft = useCallback((entity: Resume) => {
    setResume(entity)
    setDraft(fromResume(entity))
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
      'Unpublish the resume? The live page keeps the last published HTML.',
    discardConfirm:
      'Discard unpublished edits and restore the last published resume?',
  })

  const setField = <K extends keyof DraftFields>(
    key: K,
    value: DraftFields[K],
  ) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
    bumpEdit()
    setDirty(true)
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const client = createApiClient()
      const { data, error, response } = await client.GET('/api/admin/resume')
      if (cancelled) return
      if (error || !data) {
        setLoadError(`Could not load resume (${response.status}).`)
        return
      }
      setResume(data)
      setDraft(fromResume(data))
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

  if (!resume || !draft) {
    return (
      <section className="admin-panel">
        <p>Loading resume…</p>
      </section>
    )
  }

  const previewHtml = renderResumePrerenderHtml({
    ...resume,
    name: draft.name,
    pdfPath: '/resume.pdf',
    content: toContent(draft),
  })

  const saveLabel =
    saveState === 'saving' ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved'

  return (
    <section className="admin-panel admin-panel--editor">
      <div className="admin-action-bar">
        <div className="admin-action-bar__status">
          <h1>Resume</h1>
          <span className={`admin-badge admin-badge--${resume.status}`}>
            {resume.status}
          </span>
          {resume.hasUnpublishedChanges ? (
            <span className="admin-badge admin-badge--unpublished">
              Unpublished changes
            </span>
          ) : null}
          <span className="admin-save-indicator" data-state={saveState}>
            {saveLabel}
          </span>
        </div>
        <div className="admin-actions">
          <a className="admin-btn" href="/resume" target="_blank" rel="noreferrer">
            View live
          </a>
          {resume.status === 'draft' || resume.hasUnpublishedChanges ? (
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              disabled={busy}
              onClick={() => void runPublish()}
            >
              {resume.hasUnpublishedChanges ? 'Publish changes' : 'Publish'}
            </button>
          ) : null}
          {resume.hasUnpublishedChanges ? (
            <button
              type="button"
              className="admin-btn"
              disabled={busy}
              onClick={() => void runDiscard()}
            >
              Discard changes
            </button>
          ) : null}
          {resume.status === 'published' ? (
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
          <span>PDF download</span>
          <input
            className="admin-input"
            value="/resume.pdf"
            readOnly
            aria-readonly="true"
          />
          <span className="admin-hint">
            Regenerated from this content on every Publish
          </span>
        </label>
        <label className="admin-field">
          <span>Summary</span>
          <textarea
            className="admin-input admin-textarea"
            rows={6}
            value={draft.summary}
            onChange={(e) => setField('summary', e.target.value)}
          />
        </label>
        <label className="admin-field">
          <span>Core competencies (one per line)</span>
          <textarea
            className="admin-input admin-textarea"
            rows={7}
            value={draft.competenciesText}
            onChange={(e) => setField('competenciesText', e.target.value)}
          />
        </label>

        <fieldset className="admin-repeat">
          <legend>Professional experience</legend>
          {draft.experience.map((item, index) => (
            <div className="admin-repeat__item" key={`experience-${index}`}>
              <label className="admin-field">
                <span>Title</span>
                <input
                  className="admin-input"
                  value={item.title}
                  onChange={(e) =>
                    setField(
                      'experience',
                      draft.experience.map((row, i) =>
                        i === index ? { ...row, title: e.target.value } : row,
                      ),
                    )
                  }
                />
              </label>
              <label className="admin-field">
                <span>Company / dates</span>
                <input
                  className="admin-input"
                  value={item.company}
                  onChange={(e) =>
                    setField(
                      'experience',
                      draft.experience.map((row, i) =>
                        i === index ? { ...row, company: e.target.value } : row,
                      ),
                    )
                  }
                />
              </label>
              <label className="admin-field">
                <span>Bullets (one per line)</span>
                <textarea
                  className="admin-input admin-textarea"
                  rows={4}
                  value={item.bulletsText}
                  onChange={(e) =>
                    setField(
                      'experience',
                      draft.experience.map((row, i) =>
                        i === index
                          ? { ...row, bulletsText: e.target.value }
                          : row,
                      ),
                    )
                  }
                />
              </label>
              <button
                type="button"
                className="admin-btn admin-btn--danger"
                onClick={() =>
                  setField(
                    'experience',
                    draft.experience.filter((_, i) => i !== index),
                  )
                }
              >
                Remove role
              </button>
            </div>
          ))}
          <button
            type="button"
            className="admin-btn"
            onClick={() =>
              setField('experience', [...draft.experience, emptyExperience()])
            }
          >
            Add role
          </button>
        </fieldset>

        <label className="admin-field">
          <span>Technical skills (one per line)</span>
          <textarea
            className="admin-input admin-textarea"
            rows={6}
            value={draft.skillsText}
            onChange={(e) => setField('skillsText', e.target.value)}
          />
        </label>

        <fieldset className="admin-repeat">
          <legend>Education</legend>
          {draft.education.map((item, index) => (
            <div className="admin-repeat__item" key={`education-${index}`}>
              {(
                [
                  ['title', 'Degree'],
                  ['degreeDetail', 'Degree detail (optional)'],
                  ['institution', 'Institution'],
                  ['location', 'Location'],
                  ['year', 'Year'],
                ] as const
              ).map(([field, label]) => (
                <label className="admin-field" key={field}>
                  <span>{label}</span>
                  <input
                    className="admin-input"
                    value={item[field]}
                    onChange={(e) =>
                      setField(
                        'education',
                        draft.education.map((row, i) =>
                          i === index ? { ...row, [field]: e.target.value } : row,
                        ),
                      )
                    }
                  />
                </label>
              ))}
              <button
                type="button"
                className="admin-btn admin-btn--danger"
                onClick={() =>
                  setField(
                    'education',
                    draft.education.filter((_, i) => i !== index),
                  )
                }
              >
                Remove entry
              </button>
            </div>
          ))}
          <button
            type="button"
            className="admin-btn"
            onClick={() =>
              setField('education', [...draft.education, emptyEducation()])
            }
          >
            Add entry
          </button>
        </fieldset>
        </form>

        <div className="admin-editor-split__preview">
          <h2 className="admin-preview-title">Preview</h2>
          <div
            className="resume-page admin-resume-preview"
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

export default AdminResumePage
