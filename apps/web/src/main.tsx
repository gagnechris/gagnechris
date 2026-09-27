import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import Resume from './pages/Resume.tsx'
import BlogIndex from './pages/BlogIndex.tsx'
import BlogPost from './pages/BlogPost.tsx'
import Contact from './pages/Contact.tsx'
import NotFound from './pages/NotFound.tsx'
import AppWithTracking from './components/AppWithTracking.tsx'

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppWithTracking />,
    children: [
      {
        index: true,
        element: <App />,
      },
      {
        path: 'resume',
        element: <Resume />,
      },
      {
        path: 'blog',
        element: <BlogIndex />,
      },
      {
        path: 'blog/:slug',
        element: <BlogPost />,
      },
      {
        path: 'contact',
        element: <Contact />,
      },
      {
        path: 'auth/callback',
        lazy: async () => {
          const { default: AuthCallback } = await import('./auth/AuthCallback.tsx')
          return { Component: AuthCallback }
        },
      },
      {
        path: 'admin',
        lazy: async () => {
          const { default: AdminLayout } = await import('./admin/AdminLayout.tsx')
          return { Component: AdminLayout }
        },
        children: [
          {
            index: true,
            lazy: async () => {
              const { default: AdminPostsPage } = await import(
                './admin/AdminPostsPage.tsx'
              )
              return { Component: AdminPostsPage }
            },
          },
          {
            path: 'posts',
            lazy: async () => {
              const { default: AdminPostsPage } = await import(
                './admin/AdminPostsPage.tsx'
              )
              return { Component: AdminPostsPage }
            },
          },
          {
            path: 'notebook',
            lazy: async () => {
              const { default: AdminNotebookPage } = await import(
                './admin/AdminNotebookPage.tsx'
              )
              return { Component: AdminNotebookPage }
            },
          },
        ],
      },
      {
        path: '*',
        element: <NotFound />,
      },
    ],
  },
], {
  basename: import.meta.env.BASE_URL || '/',
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
