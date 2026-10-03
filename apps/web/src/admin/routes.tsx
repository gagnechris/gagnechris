import type { RouteObject } from 'react-router-dom';
import { lazyRoute } from '../routing/lazyRoute';
import WorkspaceNotFound from '../workspace/WorkspaceNotFound';

export const adminRoutes: RouteObject[] = [
  lazyRoute({
    path: 'auth/callback',
    load: () => import('../workspace/auth/AuthCallback.tsx'),
  }),
  lazyRoute({
    path: '/',
    load: () => import('./AdminLayout.tsx'),
    children: [
      lazyRoute({
        index: true,
        load: () => import('./AdminPostsPage.tsx'),
      }),
      lazyRoute({
        path: 'posts',
        load: () => import('./AdminPostsPage.tsx'),
      }),
      lazyRoute({
        path: 'posts/:postId',
        load: () => import('./PostEditorPage.tsx'),
      }),
      lazyRoute({
        path: 'home',
        load: () => import('./AdminHomePage.tsx'),
      }),
      lazyRoute({
        path: 'resume',
        load: () => import('./AdminResumePage.tsx'),
      }),
      { path: '*', element: <WorkspaceNotFound /> },
    ],
  }),
];
