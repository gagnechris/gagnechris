import { Navigate, type RouteObject } from 'react-router-dom';
import { lazyRoute } from '../routing/lazyRoute';
import WorkspaceNotFound from '../workspace/WorkspaceNotFound';

export const notebookRoutes: RouteObject[] = [
  lazyRoute({
    path: 'auth/callback',
    load: () => import('../workspace/auth/AuthCallback.tsx'),
  }),
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
      { path: '*', element: <WorkspaceNotFound /> },
    ],
  }),
];
