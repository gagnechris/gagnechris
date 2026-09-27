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

    expect(screen.getAllByRole('button', { name: /download resume as pdf/i })).toHaveLength(2)
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

    let interceptNextAnchor = true
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a' && interceptNextAnchor) {
        interceptNextAnchor = false
        return mockAnchor as unknown as HTMLElement
      }
      return originalCreateElement(tag)
    })

    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      if (node === (mockAnchor as unknown as Node)) {
        return node
      }
      return Node.prototype.appendChild.call(document.body, node) as Node
    })
    vi.spyOn(document.body, 'removeChild').mockImplementation((node) => {
      if (node === (mockAnchor as unknown as Node)) {
        return node
      }
      return Node.prototype.removeChild.call(document.body, node) as Node
    })

    fireEvent.click(screen.getAllByRole('button', { name: /download resume as pdf/i })[0])

    await waitFor(() => expect(mockAnchor.click).toHaveBeenCalled())
    expect(mockAnchor.href).toBe('/resume.pdf')
    expect(mockAnchor.download).toBe('Chris-Gagne-Resume.pdf')

    expect(
      screen.getByRole('link', { name: /don't feed the bears/i }),
    ).toHaveAttribute('href', '/dont-feed-the-bears?from=resume')

    fireEvent.click(screen.getByRole('button', { name: /dismiss bear game note/i }))
    expect(
      screen.queryByRole('link', { name: /don't feed the bears/i }),
    ).not.toBeInTheDocument()
  })
})
