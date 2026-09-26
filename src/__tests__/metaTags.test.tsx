import { render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test } from 'vitest'
import App from '../App'
import BlogPost from '../pages/BlogPost'
import Contact from '../pages/Contact'
import NotFound from '../pages/NotFound'
import Resume from '../pages/Resume'

const seedStaticMeta = () => {
  document.head.innerHTML = `
    <title>Chris Gagne - Engineering Leader</title>
    <meta name="description" content="Chris Gagne is an Engineering Leader at Ro with 20+ years of experience in software engineering, building modern web technologies to solve critical business problems." />
    <meta property="og:title" content="Chris Gagne - Engineering Leader" />
    <meta property="og:description" content="Chris Gagne is an Engineering Leader at Ro with 20+ years of experience in software engineering, building modern web technologies to solve critical business problems." />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Chris Gagne - Engineering Leader" />
    <meta name="twitter:description" content="Chris Gagne is an Engineering Leader at Ro with 20+ years of experience in software engineering, building modern web technologies to solve critical business problems." />
  `
}

const expectSingleMetaSet = () => {
  expect(document.querySelectorAll('meta[name="description"]')).toHaveLength(1)
  expect(document.querySelectorAll('meta[property="og:title"]')).toHaveLength(1)
  expect(document.querySelectorAll('meta[property="og:description"]')).toHaveLength(1)
  expect(document.querySelectorAll('meta[name="twitter:card"]')).toHaveLength(1)
  expect(document.querySelectorAll('meta[name="twitter:title"]')).toHaveLength(1)
  expect(document.querySelectorAll('meta[name="twitter:description"]')).toHaveLength(1)
}

describe('meta tags (no duplicates with static defaults)', () => {
  beforeEach(() => {
    seedStaticMeta()
  })

  test('home page keeps a single meta set', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )
    expectSingleMetaSet()
  })

  test('resume page keeps a single meta set', () => {
    render(
      <MemoryRouter>
        <Resume />
      </MemoryRouter>,
    )
    expectSingleMetaSet()
  })

  test('contact page keeps a single meta set', () => {
    render(
      <MemoryRouter>
        <Contact />
      </MemoryRouter>,
    )
    expectSingleMetaSet()
  })

  test('blog post page keeps a single meta set', async () => {
    render(
      <MemoryRouter initialEntries={['/blog/welcome']}>
        <Routes>
          <Route path="/blog/:slug" element={<BlogPost />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(document.title).toBe('Welcome - Chris Gagne')
    })
    expectSingleMetaSet()
  })

  test('404 page keeps a single meta set', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    )
    expectSingleMetaSet()
  })
})
