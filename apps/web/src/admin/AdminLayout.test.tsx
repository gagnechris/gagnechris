import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AdminLayout from './AdminLayout'
import AdminPostsPage from './AdminPostsPage'

vi.mock('../auth/session', () => ({
  getAuthUser: vi.fn(async () => ({
    username: 'admin@example.com',
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
  })

  test('shows Posts / Notebook nav and posts hub when authenticated', async () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminPostsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('navigation', { name: 'Admin' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Posts' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Notebook' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Posts' })).toBeInTheDocument()
    expect(await screen.findByText(/No posts yet/i)).toBeInTheDocument()
  })
})
