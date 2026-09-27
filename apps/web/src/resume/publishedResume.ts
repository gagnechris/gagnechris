/** Client loader for publisher-generated `resume/index.html` (Option B). */
import { DEFAULT_RESUME, renderResumeSectionsHtml } from '@gagnechris/shared/resume'

export type ResumeView = {
  name: string
  pdfPath: string
  bodyHtml: string
}

/** Local Vite uses `/__site` → static origin; prod is same-origin. */
export function publishedResumeUrl(): string {
  const localSite = import.meta.env.VITE_LOCAL_SITE_ORIGIN?.trim()
  return localSite ? '/__site/resume/' : '/resume/'
}

/** Rendered from DEFAULT_RESUME so the page never blanks before first publish. */
export const fallbackResumeView = (): ResumeView => ({
  name: DEFAULT_RESUME.name,
  pdfPath: DEFAULT_RESUME.pdfPath,
  bodyHtml: renderResumeSectionsHtml(DEFAULT_RESUME.content),
})

export async function loadPublishedResume(): Promise<ResumeView | null> {
  const response = await fetch(publishedResumeUrl(), {
    headers: { Accept: 'text/html' },
  })
  if (!response.ok) return null

  const html = await response.text()
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const article = doc.querySelector('article.resume-page-prerender')
  const body = article?.querySelector('main')
  if (!article || !body) return null

  return {
    name: article.getAttribute('data-name') || DEFAULT_RESUME.name,
    pdfPath: article.getAttribute('data-pdf') || DEFAULT_RESUME.pdfPath,
    bodyHtml: body.innerHTML,
  }
}
