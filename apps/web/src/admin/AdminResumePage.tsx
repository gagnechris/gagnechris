import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { renderResumePrerenderHtml } from '@gagnechris/shared/resume'
import { createApiClient } from '../api/client'
import type { components } from '../api/schema'
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

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

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

export default function AdminResumePage() {
  const [resume, setResume] = useState<Resume | null>(null)
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

  const setField = <K extends keyof DraftFields>(
    key: K,
    value: DraftFields[K],
  ) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
    setDirty(true)
    setSaveState('idle')
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

  const save = useCallback(async (): Promise<boolean> => {
    const current = draftRef.current
    if (!current) return false
    setSaveState('saving')
    setSaveError(null)
    const client = createApiClient()
    const { data, error, response } = await client.PUT('/api/admin/resume', {
      body: {
        version: versionRef.current,
        name: current.name.trim() || 'Chris Gagne',
        pdfPath: current.pdfPath.trim() || '/resume.pdf',
        content: toContent(current),
      },
    })
    if (error || !data) {
      setSaveState('error')
      setSaveError(
        response.status === 409
          ? 'Conflict — another save updated the resume. Reload and try again.'
          : `Save failed (${response.status}).`,
      )
      return false
    }
    setResume(data)
    versionRef.current = data.version
    setDraft(fromResume(data))
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
        'Unpublish the resume? The live page keeps the last published HTML.',
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
          ? await client.POST('/api/admin/resume/publish')
          : await client.POST('/api/admin/resume/unpublish')
      if (error || !data) {
        setSaveError(
          `${action === 'publish' ? 'Publish' : 'Unpublish'} failed (${response.status}).`,
        )
        return
      }
      setResume(data)
      versionRef.current = data.version
      setDraft(fromResume(data))
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
    pdfPath: draft.pdfPath,
    content: toContent(draft),
  })

  const saveLabel =
    saveState === 'saving' ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved'

  return (
    <section className="admin-panel admin-panel--editor">
      <div className="admin-panel__header">
        <div>
          <h1>Resume</h1>
          <p className="admin-panel__meta-row">
            <span className={`admin-badge admin-badge--${resume.status}`}>
              {resume.status}
            </span>
            <span className="admin-save-indicator" data-state={saveState}>
              {saveLabel}
            </span>
          </p>
        </div>
        <div className="admin-actions">
          <a className="admin-btn" href="/resume" target="_blank" rel="noreferrer">
            View live
          </a>
          {resume.status === 'published' ? (
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
          <span>PDF path</span>
          <input
            className="admin-input"
            value={draft.pdfPath}
            onChange={(e) => setField('pdfPath', e.target.value)}
          />
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

      <h2 className="admin-preview-title">Preview</h2>
      <div
        className="resume-page admin-resume-preview"
        dangerouslySetInnerHTML={{ __html: previewHtml }}
      />
    </section>
  )
}
