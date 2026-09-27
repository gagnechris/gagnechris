/** Client loader for the publisher-prerendered home page in `index.html`. */
import { DEFAULT_HOME, renderHomeAboutHtml } from '@gagnechris/shared/home'

export type HomeView = {
  name: string
  title: string
  aboutHtml: string
}

/** Local Vite uses `/__site` → static origin; prod is same-origin. */
export function publishedHomeUrl(): string {
  const localSite = import.meta.env.VITE_LOCAL_SITE_ORIGIN?.trim()
  return localSite ? '/__site/' : '/'
}

/** Rendered from DEFAULT_HOME so the page never blanks before first publish. */
export const fallbackHomeView = (): HomeView => ({
  name: DEFAULT_HOME.name,
  title: DEFAULT_HOME.title,
  aboutHtml: renderHomeAboutHtml(DEFAULT_HOME.about),
})

export function homeViewFromDocument(doc: Document): HomeView | null {
  const article = doc.querySelector('article.home-page-prerender')
  const about = article?.querySelector('#about .about-body')
  if (!article || !about) return null

  return {
    name: article.getAttribute('data-name') || DEFAULT_HOME.name,
    title: article.getAttribute('data-title') || DEFAULT_HOME.title,
    aboutHtml: about.innerHTML,
  }
}

/**
 * Captured at import time — the prerender lives in `#root`, which React clears
 * on mount, and reading it here avoids refetching `index.html` on a cold load.
 */
const initialDocumentView =
  typeof document === 'undefined' ? null : homeViewFromDocument(document)

export const documentHomeView = (): HomeView | null => initialDocumentView

export async function loadPublishedHome(): Promise<HomeView | null> {
  const response = await fetch(publishedHomeUrl(), {
    headers: { Accept: 'text/html' },
  })
  if (!response.ok) return null

  const html = await response.text()
  return homeViewFromDocument(
    new DOMParser().parseFromString(html, 'text/html'),
  )
}
