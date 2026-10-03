import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createBrowserRouter,
  RouterProvider,
  type RouteObject,
} from 'react-router-dom';
import '../index.css';
import { setAuthClientId } from './auth/config';

export function mountWorkspaceApp(
  routes: RouteObject[],
  cognitoClientId: string | undefined,
): void {
  setAuthClientId(cognitoClientId);
  const router = createBrowserRouter(routes);
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}
