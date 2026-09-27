import { screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { renderHomePrerenderHtml } from '@gagnechris/shared/home'
import App from './App'
import { renderWithProviders } from './test-utils'
import * as analytics from './utils/analytics'

vi.mock('./utils/analytics')

const mockTrackEvent = vi.mocked(analytics.trackEvent)

const stubFetch = (impl: () => Promise<unknown>) =>
  vi.stubGlobal('fetch', vi.fn(impl))

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', '')
    stubFetch(async () => ({ ok: false, status: 404 }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  test('renders all main sections', () => {
    renderWithProviders(<App />)

    expect(screen.getByText('Chris Gagne')).toBeInTheDocument()
    expect(screen.getByText('About Me')).toBeInTheDocument()
    expect(screen.getByText('Quick Links')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Resume' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'LinkedIn' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'GitHub' })).toBeInTheDocument()
  })

  test('falls back to DEFAULT_HOME when nothing is published yet', () => {
    renderWithProviders(<App />)

    expect(screen.getByRole('heading', { level: 1, name: 'Chris Gagne' })).toBeInTheDocument()
    expect(screen.getByText('Engineering Leader')).toBeInTheDocument()
    expect(
      screen.getByText(/I'm an Engineering Leader at Ro with more than 20 years/),
    ).toBeInTheDocument()
  })

  test('hydrates header and about copy from the published prerender', async () => {
    stubFetch(async () => ({
      ok: true,
      text: async () =>
        `<!DOCTYPE html><html><body>${renderHomePrerenderHtml({
          name: 'Christopher Gagne',
          title: 'Engineering Director',
          about: 'Published about copy.',
          status: 'published',
          publishedAt: '2026-09-27T00:00:00.000Z',
          updatedAt: '2026-09-27T00:00:00.000Z',
          seo: null,
          version: 2,
        })}</body></html>`,
    }))

    renderWithProviders(<App />)

    expect(await screen.findByText('Published about copy.')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Christopher Gagne' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Engineering Director')).toBeInTheDocument()
    // Quick Links stay client-rendered (CHR-92 v1).
    expect(screen.getByRole('link', { name: 'LinkedIn' })).toBeInTheDocument()
  })

  test('tracks LinkedIn link clicks', () => {
    renderWithProviders(<App />)

    const linkedInLink = screen.getByRole('link', { name: 'LinkedIn' })
    fireEvent.click(linkedInLink)

    expect(mockTrackEvent).toHaveBeenCalledWith('click', 'external_link', 'linkedin')
  })

  test('tracks GitHub link clicks', () => {
    renderWithProviders(<App />)

    const githubLink = screen.getByRole('link', { name: 'GitHub' })
    fireEvent.click(githubLink)

    expect(mockTrackEvent).toHaveBeenCalledWith('click', 'external_link', 'github')
  })

  test('LinkedIn link has correct attributes', () => {
    renderWithProviders(<App />)

    const linkedInLink = screen.getByRole('link', { name: 'LinkedIn' })
    expect(linkedInLink).toHaveAttribute('href', 'https://www.linkedin.com/in/christophergagne/')
    expect(linkedInLink).toHaveAttribute('target', '_blank')
    expect(linkedInLink).toHaveAttribute('rel', 'noopener noreferrer')
  })

  test('GitHub link has correct attributes', () => {
    renderWithProviders(<App />)

    const githubLink = screen.getByRole('link', { name: 'GitHub' })
    expect(githubLink).toHaveAttribute('href', 'https://github.com/gagnechris')
    expect(githubLink).toHaveAttribute('target', '_blank')
    expect(githubLink).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
