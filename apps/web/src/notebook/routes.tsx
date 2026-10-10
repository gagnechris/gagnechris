import { Navigate, type RouteObject } from 'react-router-dom';
import { lazyRoute } from '../routing/lazyRoute';
import WorkspaceNotFound from '../workspace/WorkspaceNotFound';

export const notebookRoutes: RouteObject[] = [
  lazyRoute({
    path: 'auth/callback',
    load: () => import('../workspace/auth/AuthCallback.tsx'),
  }),
  ...['ios/auth/callback', 'ios/auth/signed-out'].map((path) =>
    lazyRoute({ path, load: () => import('./IosAuthReturnPage.tsx') }),
  ),
  lazyRoute({
    path: '/',
    load: () => import('./NotebookShell.tsx'),
    children: [
      {
        index: true,
        element: <Navigate to="today" replace />,
      },
      lazyRoute({
        path: 'today',
        load: () => import('./NotebookTodayPage.tsx'),
      }),
      lazyRoute({
        path: 'upcoming',
        load: () => import('./NotebookUpcomingPage.tsx'),
      }),
      lazyRoute({
        path: 'notes',
        load: () => import('./NotebookNotesPage.tsx'),
      }),
      lazyRoute({
        path: 'notes/:id',
        load: () => import('./NotebookNotePage.tsx'),
      }),
      lazyRoute({
        path: 'tasks',
        load: () => import('./NotebookTasksPage.tsx'),
      }),
      lazyRoute({
        path: 'tasks/:id',
        load: () => import('./NotebookTaskPage.tsx'),
      }),
      lazyRoute({
        path: 'settings/templates',
        load: () => import('./NotebookTemplatesPage.tsx'),
      }),
      { path: '*', element: <WorkspaceNotFound /> },
    ],
  }),
];
