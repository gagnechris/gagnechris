import { screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import Resume from './Resume'
import { renderWithProviders } from '../test-utils'

const stubFetch = (impl: () => Promise<unknown>) =>
  vi.stubGlobal('fetch', vi.fn(impl))

describe('Resume Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', '')
    stubFetch(async () => ({ ok: false, status: 404 }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  test('renders default content when nothing is published yet', () => {
    renderWithProviders(<Resume />)

    expect(screen.getByRole('heading', { name: /chris gagne/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /summary/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /core competencies/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /professional experience/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /education/i })).toBeInTheDocument()

    expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument()
  })

  test('renders published HTML from resume/index.html when present', async () => {
    stubFetch(async () => ({
      ok: true,
      text: async () => `<!DOCTYPE html><html><body>
        <article class="resume-page-prerender" data-name="Christopher Gagne" data-pdf="/new-resume.pdf">
          <header><div class="name-section"><h1>Christopher Gagne</h1></div></header>
          <main><section class="resume-summary"><h2>Summary</h2><p>Published summary</p></section></main>
        </article>
      </body></html>`,
    }))

    renderWithProviders(<Resume />)

    expect(await screen.findByText('Published summary')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Christopher Gagne' }),
    ).toBeInTheDocument()
  })

  test('triggers download when the resume button is clicked', async () => {
    renderWithProviders(<Resume />)

    const mockAnchor = {
      href: '',
      download: '',
      click: vi.fn(),
    }

    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') return mockAnchor as unknown as HTMLElement
      return originalCreateElement(tag)
    })

    vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor as unknown as Node)
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockAnchor as unknown as Node)

    fireEvent.click(screen.getByRole('button', { name: /resume/i }))

    await waitFor(() => expect(mockAnchor.click).toHaveBeenCalled())
    expect(mockAnchor.href).toBe('/Christopher M Gagne Resume 2026.pdf')
    expect(mockAnchor.download).toBe('Christopher M Gagne Resume 2026.pdf')
  })
})
