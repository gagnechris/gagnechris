import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
