import { StrictMode } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css';
import './public.css';
import { mountApp } from './prerender/mountApp';
import { routes } from './routes.tsx';
import { sweepLegacyAuth } from './utils/legacyAuthSweep';

try {
  sweepLegacyAuth();
} catch {
  // Storage can be blocked (privacy modes); the page must still render.
}

const router = createBrowserRouter(routes, {
  basename: import.meta.env.BASE_URL || '/',
});

mountApp(
  document.getElementById('root')!,
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
  window.location.pathname,
);
