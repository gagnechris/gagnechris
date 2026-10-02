import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Navigate,
  createBrowserRouter,
  RouterProvider,
} from 'react-router-dom';
import './index.css';
import App from './App.tsx';
import Resume from './pages/Resume.tsx';
import BlogIndex from './pages/BlogIndex.tsx';
import BlogPost from './pages/BlogPost.tsx';
import Contact from './pages/Contact.tsx';
import NotFound from './pages/NotFound.tsx';
import AppWithTracking from './components/AppWithTracking.tsx';
import { LazyFallback } from './components/LazyFallback.tsx';
import { lazyRoute } from './routing/lazyRoute';

// HydrateFallback must be a static route property (sibling to `lazy`), not returned
// from lazy(). React Router skips HydrateFallback from lazy() during initial hydration,
// which is what triggers the console warning on /admin.
const router = createBrowserRouter(
  [
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
        lazyRoute({
          path: 'dont-feed-the-bears',
          load: () => import('./pages/DontFeedTheBears.tsx'),
        }),
        lazyRoute({
          path: 'auth/callback',
          load: () => import('./auth/AuthCallback.tsx'),
        }),
        lazyRoute({
          path: 'admin',
          load: () => import('./admin/AdminLayout.tsx'),
          children: [
            lazyRoute({
              index: true,
              load: () => import('./admin/AdminPostsPage.tsx'),
            }),
            lazyRoute({
              path: 'posts',
              load: () => import('./admin/AdminPostsPage.tsx'),
            }),
            lazyRoute({
              path: 'posts/:postId',
              load: () => import('./admin/PostEditorPage.tsx'),
            }),
            lazyRoute({
              path: 'home',
              load: () => import('./admin/AdminHomePage.tsx'),
            }),
            lazyRoute({
              path: 'resume',
              load: () => import('./admin/AdminResumePage.tsx'),
            }),
            lazyRoute({
              path: 'notebook',
              load: () => import('./admin/AdminNotebookLayout.tsx'),
              children: [
                {
                  index: true,
                  element: <Navigate to="today" replace />,
                },
                lazyRoute({
                  path: 'today',
                  load: () =>
                    import('./admin/notebook/AdminNotebookTodayPage.tsx'),
                }),
                lazyRoute({
                  path: 'notes',
                  load: () =>
                    import('./admin/notebook/AdminNotebookNotesPage.tsx'),
                }),
                lazyRoute({
                  path: 'notes/:id',
                  load: () =>
                    import('./admin/notebook/AdminNotebookNotePage.tsx'),
                }),
                lazyRoute({
                  path: 'tasks',
                  load: () =>
                    import('./admin/notebook/AdminNotebookTasksPage.tsx'),
                }),
                lazyRoute({
                  path: 'tasks/:id',
                  load: () =>
                    import('./admin/notebook/AdminNotebookTaskPage.tsx'),
                }),
              ],
            }),
          ],
        }),
        {
          path: '*',
          element: <NotFound />,
        },
      ],
    },
  ],
  {
    basename: import.meta.env.BASE_URL || '/',
  },
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
