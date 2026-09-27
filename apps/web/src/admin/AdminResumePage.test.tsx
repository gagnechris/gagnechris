import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import AdminResumePage from './AdminResumePage'

const get = vi.fn()
const put = vi.fn()
const post = vi.fn()

vi.mock('../api/client', () => ({
  createApiClient: () => ({
    GET: (...args: unknown[]) => get(...args),
    PUT: (...args: unknown[]) => put(...args),
    POST: (...args: unknown[]) => post(...args),
  }),
}))

const baseResume = {
  name: 'Chris Gagne',
  pdfPath: '/resume.pdf',
  content: {
    summary: 'Summary',
    competencies: ['Lead'],
    experience: [
      {
        title: 'Engineer',
        company: 'Acme',
        bullets: ['Did things'],
      },
    ],
    skills: ['TypeScript'],
    education: [],
  },
  status: 'published' as const,
  publishedAt: '2026-09-27T00:00:00.000Z',
  updatedAt: '2026-09-27T00:00:00.000Z',
  seo: { ogImage: '/media/og-resume.png' },
  version: 1,
  hasUnpublishedChanges: false,
}

describe('AdminResumePage autosave', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    get.mockResolvedValue({
      data: structuredClone(baseResume),
      error: undefined,
      response: { status: 200 },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('keeps blank bullet lines while a save is in flight', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    let resolvePut!: (value: unknown) => void
    put.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePut = resolve
        }),
    )

    render(<AdminResumePage />)
    const bullets = await screen.findByDisplayValue('Did things')

    await user.type(bullets, '{Enter}')
    expect(bullets).toHaveValue('Did things\n')

    await vi.advanceTimersByTimeAsync(950)
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))

    await user.type(bullets, 'New bullet')
    expect(bullets).toHaveValue('Did things\nNew bullet')

    // Server response drops the blank line — draft must not be replaced.
    resolvePut({
      data: {
        ...baseResume,
        content: {
          ...baseResume.content,
          experience: [
            {
              title: 'Engineer',
              company: 'Acme',
              bullets: ['Did things'],
            },
          ],
        },
        version: 2,
  hasUnpublishedChanges: false,
      },
      error: undefined,
      response: { status: 200 },
    })

    await waitFor(() => expect(put).toHaveBeenCalledTimes(2))
    expect(bullets).toHaveValue('Did things\nNew bullet')
  })
})
