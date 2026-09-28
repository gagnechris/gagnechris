import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientTestProvider } from '../test-utils'
import AdminLayout from './AdminLayout'
import AdminPostsPage from './AdminPostsPage'

const { isDevProdApiTargetMock } = vi.hoisted(() => ({
  isDevProdApiTargetMock: vi.fn(() => false),
}))

vi.mock('../api/apiTarget', () => ({
  isDevProdApiTarget: () => isDevProdApiTargetMock(),
}))

vi.mock('../auth/session', () => ({
  getAuthUser: vi.fn(async () => ({
    label: 'admin@example.com',
    userId: 'u1',
  })),
  redirectToSignIn: vi.fn(),
  signOutUser: vi.fn(),
  getIdToken: vi.fn(async () => 'fake-id-token'),
}))

vi.mock('../api/client', () => ({
  createApiClient: () => ({
    GET: async () => ({
      data: { items: [] },
      error: undefined,
      response: { status: 200 },
    }),
  }),
}))

describe('AdminLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isDevProdApiTargetMock.mockReturnValue(false)
  })

  test('shows Posts / Home / Resume / Notebook nav and posts hub when authenticated', async () => {
    render(
      <QueryClientTestProvider>
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminPostsPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientTestProvider>,
    )

    expect(await screen.findByRole('navigation', { name: 'Admin' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Posts' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/admin/home',
    )
    expect(screen.getByRole('link', { name: 'Resume' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Notebook' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Posts' })).toBeInTheDocument()
    expect(await screen.findByText(/No posts match/i)).toBeInTheDocument()
    expect(screen.queryByText(/PRODUCTION API/i)).not.toBeInTheDocument()
  })

  test('shows PRODUCTION banner when Vite proxies to prod API', async () => {
    isDevProdApiTargetMock.mockReturnValue(true)

    render(
      <QueryClientTestProvider>
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminPostsPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientTestProvider>,
    )

    expect(
      await screen.findByText(/PRODUCTION API — edits, autosave, and publish hit the live site/i),
    ).toBeInTheDocument()
  })
})
