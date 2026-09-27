import { screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import App from '../App'
import Resume from '../pages/Resume'
import RouteTracker from '../components/RouteTracker'
import { renderWithProviders } from '../test-utils'
import * as analytics from '../utils/analytics'

vi.mock('../utils/analytics')

const mockTrackPageView = vi.mocked(analytics.trackPageView)
const mockTrackEvent = vi.mocked(analytics.trackEvent)
const mockTrackResumeView = vi.mocked(analytics.trackResumeView)

describe('Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('External Link Tracking', () => {
    test('tracks social media link clicks from home page footer', () => {
      renderWithProviders(<App />)

      const linkedInLink = document.querySelector(
        '.site-footer a[href*="linkedin"]',
      )!
      fireEvent.click(linkedInLink)

      expect(mockTrackEvent).toHaveBeenCalledWith(
        'click',
        'external_link',
        'linkedin_footer',
      )

      const githubLink = document.querySelector(
        '.site-footer a[href*="github.com"]',
      )!
      fireEvent.click(githubLink)

      expect(mockTrackEvent).toHaveBeenCalledWith(
        'click',
        'external_link',
        'github_footer',
      )
      expect(mockTrackEvent).toHaveBeenCalledTimes(2)
    })
  })

  describe('Page Tracking', () => {
    test('tracks page view on home page', () => {
      renderWithProviders(
        <RouteTracker>
          <App />
        </RouteTracker>,
      )

      expect(screen.getByText('Chris Gagne')).toBeInTheDocument()
      expect(mockTrackPageView).toHaveBeenCalledWith('/')
    })

    test('tracks page view and resume view on resume page', () => {
      renderWithProviders(
        <RouteTracker>
          <Resume />
        </RouteTracker>,
      )

      expect(screen.getByText('Professional Experience')).toBeInTheDocument()
      expect(mockTrackPageView).toHaveBeenCalledWith('/')
      expect(mockTrackResumeView).toHaveBeenCalled()
    })
  })

  describe('Component Integration', () => {
    test('home page renders correctly with all interactive elements', () => {
      renderWithProviders(<App />)

      expect(screen.getByText('Chris Gagne')).toBeInTheDocument()
      expect(screen.getByText('About Me')).toBeInTheDocument()
      expect(screen.getByText('Quick Links')).toBeInTheDocument()

      expect(screen.getByRole('link', { name: 'Resume' })).toBeInTheDocument()
      expect(screen.getAllByRole('link', { name: 'LinkedIn' }).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByRole('link', { name: 'GitHub' }).length).toBeGreaterThanOrEqual(1)

      const linkedInLink = document.querySelector('#quick-links a[href*="linkedin"]')!
      expect(linkedInLink).toHaveAttribute('href', 'https://www.linkedin.com/in/christophergagne/')
      expect(linkedInLink).toHaveAttribute('target', '_blank')

      const githubLink = document.querySelector('#quick-links a[href*="github.com"]')!
      expect(githubLink).toHaveAttribute('href', 'https://github.com/gagnechris')
      expect(githubLink).toHaveAttribute('target', '_blank')
    })

    test('resume page renders correctly with download functionality', () => {
      renderWithProviders(<Resume />)

      expect(screen.getByText('Chris Gagne')).toBeInTheDocument()
      expect(screen.getByText('Professional Experience')).toBeInTheDocument()
      expect(screen.getByText('Summary')).toBeInTheDocument()
      expect(screen.getByText('Core Competencies')).toBeInTheDocument()

      expect(screen.getAllByRole('button', { name: /download resume as pdf/i }).length).toBeGreaterThanOrEqual(1)

      expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    })
  })
})
