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
import { LazyFallback } from './components/LazyFallback.tsx'

// HydrateFallback must be a static route property (sibling to `lazy`), not returned
// from lazy(). React Router skips HydrateFallback from lazy() during initial hydration,
// which is what triggers the console warning on /admin.
const router = createBrowserRouter([
  {
    path: '/',
    element: <AppWithTracking />,
    HydrateFallback: LazyFallback,
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
        path: 'dont-feed-the-bears',
        HydrateFallback: LazyFallback,
        lazy: async () => {
          const { default: DontFeedTheBears } = await import(
            './pages/DontFeedTheBears.tsx'
          )
          return { Component: DontFeedTheBears }
        },
      },
      {
        path: 'auth/callback',
        HydrateFallback: LazyFallback,
        lazy: async () => {
          const { default: AuthCallback } = await import('./auth/AuthCallback.tsx')
          return { Component: AuthCallback }
        },
      },
      {
        path: 'admin',
        HydrateFallback: LazyFallback,
        lazy: async () => {
          const { default: AdminLayout } = await import('./admin/AdminLayout.tsx')
          return { Component: AdminLayout }
        },
        children: [
          {
            index: true,
            HydrateFallback: LazyFallback,
            lazy: async () => {
              const { default: AdminPostsPage } = await import(
                './admin/AdminPostsPage.tsx'
              )
              return { Component: AdminPostsPage }
            },
          },
          {
            path: 'posts',
            HydrateFallback: LazyFallback,
            lazy: async () => {
              const { default: AdminPostsPage } = await import(
                './admin/AdminPostsPage.tsx'
              )
              return { Component: AdminPostsPage }
            },
          },
          {
            path: 'posts/:postId',
            HydrateFallback: LazyFallback,
            lazy: async () => {
              const { default: PostEditorPage } = await import(
                './admin/PostEditorPage.tsx'
              )
              return { Component: PostEditorPage }
            },
          },
          {
            path: 'home',
            HydrateFallback: LazyFallback,
            lazy: async () => {
              const { default: AdminHomePage } = await import(
                './admin/AdminHomePage.tsx'
              )
              return { Component: AdminHomePage }
            },
          },
          {
            path: 'resume',
            HydrateFallback: LazyFallback,
            lazy: async () => {
              const { default: AdminResumePage } = await import(
                './admin/AdminResumePage.tsx'
              )
              return { Component: AdminResumePage }
            },
          },
          {
            path: 'notebook',
            HydrateFallback: LazyFallback,
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
