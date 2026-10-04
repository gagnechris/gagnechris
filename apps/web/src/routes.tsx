import { Navigate, type RouteObject } from 'react-router-dom';
import App from './App.tsx';
import Resume from './pages/Resume.tsx';
import PostsIndex from './pages/PostsIndex.tsx';
import PostPage from './pages/PostPage.tsx';
import Contact from './pages/Contact.tsx';
import NotFound from './pages/NotFound.tsx';
import ProjectsPrerendered from './pages/ProjectsPrerendered.tsx';
import LegacyPostRedirect from './pages/LegacyPostRedirect.tsx';
import AppWithTracking from './components/AppWithTracking.tsx';
import { EmptyFallback, LazyFallback } from './components/LazyFallback.tsx';
import { lazyRoute } from './routing/lazyRoute';

// HydrateFallback must be a static route property (sibling to `lazy`): React
// Router skips one returned from lazy() during initial hydration. The bears
// pages' fallback is empty so the first render matches their chrome-only
// prerender.
export const routes: RouteObject[] = [
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
        path: 'posts',
        element: <PostsIndex />,
      },
      {
        path: 'posts/:slug',
        element: <PostPage />,
      },
      // CloudFront 301s /blog in prod; this covers local dev.
      {
        path: 'blog',
        element: <Navigate to="/posts" replace />,
      },
      {
        path: 'blog/:slug',
        element: <LegacyPostRedirect />,
      },
      {
        path: 'contact',
        element: <Contact />,
      },
      {
        path: 'projects',
        element: <ProjectsPrerendered />,
      },
      {
        path: 'projects/:slug',
        element: <ProjectsPrerendered />,
      },
      lazyRoute({
        path: 'dont-feed-the-bears',
        load: () => import('./pages/DontFeedTheBears.tsx'),
        fallback: EmptyFallback,
      }),
      lazyRoute({
        path: 'dont-feed-the-bears/camp',
        load: () => import('./pages/bears/CampRules.tsx'),
        fallback: EmptyFallback,
      }),
      lazyRoute({
        path: 'dont-feed-the-bears/wild',
        load: () => import('./pages/bears/StayWild.tsx'),
        fallback: EmptyFallback,
      }),
      {
        path: '*',
        element: <NotFound />,
      },
    ],
  },
];
