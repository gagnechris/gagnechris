import { useEffect, type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { clearPendingFlushes, hasPendingFlushes } from '@gagnechris/app-core';
import { isDevProdApiTarget } from './api/apiTarget';
import RequireAuth from './auth/RequireAuth';
import { signOutUser, type AuthUser } from './auth/session';
import { WorkspaceQueryProvider } from './query/WorkspaceQueryProvider';
import { useVisualViewportCssVars } from './useVisualViewportCssVars';
import '../kit/kit.css';
import './workspace.css';

type WorkspaceShellProps = {
  title: string;
  /** Links shown before Sign out; the nav landmark is labelled with `title`. */
  nav?: ReactNode;
  /** Defaults to the route outlet. */
  children?: ReactNode;
};

function WorkspaceChrome({
  title,
  nav,
  children,
  user,
}: WorkspaceShellProps & { user: AuthUser }) {
  const prodApi = isDevProdApiTarget();
  useVisualViewportCssVars();

  // Editors that already unmounted can still be retrying a save.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasPendingFlushes()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  return (
    <div className="admin-shell">
      <title>{`${title} - Chris Gagne`}</title>
      <meta name="robots" content="noindex, nofollow" />
      {prodApi ? (
        <div className="admin-prod-banner" role="status" aria-live="polite">
          PRODUCTION API — edits, autosave, and publish hit the live site
        </div>
      ) : null}
      <header className="admin-header">
        <div className="admin-brand">
          <span className="admin-brand__title">{title}</span>
          <span className="admin-brand__user">{user.label}</span>
        </div>
        <nav className="admin-nav" aria-label={title}>
          {nav}
          <button
            type="button"
            className="admin-nav__link admin-nav__button"
            onClick={() => {
              clearPendingFlushes();
              void signOutUser();
            }}
          >
            Sign out
          </button>
        </nav>
      </header>
      <main className="admin-main">{children ?? <Outlet />}</main>
    </div>
  );
}

/** Signed-in chrome shared by the admin and Notebook apps. */
export default function WorkspaceShell(props: WorkspaceShellProps) {
  return (
    <RequireAuth>
      {(user) => (
        <WorkspaceQueryProvider>
          <WorkspaceChrome {...props} user={user} />
        </WorkspaceQueryProvider>
      )}
    </RequireAuth>
  );
}
