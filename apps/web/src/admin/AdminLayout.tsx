import { NavLink, Outlet } from 'react-router-dom';
import { isDevProdApiTarget } from '../api/apiTarget';
import RequireAuth from '../auth/RequireAuth';
import { signOutUser, type AuthUser } from '../auth/session';
import { navLinkClass } from '../ui/navLinkClass';
import { AdminQueryProvider } from './query/AdminQueryProvider';
import { useVisualViewportCssVars } from './useVisualViewportCssVars';
import './admin.css';

function AdminChrome({ user }: { user: AuthUser }) {
  const prodApi = isDevProdApiTarget();
  useVisualViewportCssVars();

  return (
    <div className="admin-shell">
      <title>Admin - Chris Gagne</title>
      <meta name="robots" content="noindex, nofollow" />
      {prodApi ? (
        <div className="admin-prod-banner" role="status" aria-live="polite">
          PRODUCTION API — edits, autosave, and publish hit the live site
        </div>
      ) : null}
      <header className="admin-header">
        <div className="admin-brand">
          <span className="admin-brand__title">Admin</span>
          <span className="admin-brand__user">{user.label}</span>
        </div>
        <nav className="admin-nav" aria-label="Admin">
          <NavLink to="/admin" end className={navLinkClass}>
            Posts
          </NavLink>
          <NavLink to="/admin/home" className={navLinkClass}>
            Home
          </NavLink>
          <NavLink to="/admin/resume" className={navLinkClass}>
            Resume
          </NavLink>
          <NavLink to="/admin/notebook" className={navLinkClass}>
            Notebook
          </NavLink>
          <button
            type="button"
            className="admin-nav__link admin-nav__button"
            onClick={() => void signOutUser()}
          >
            Sign out
          </button>
        </nav>
      </header>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}

export default function AdminLayout() {
  return (
    <RequireAuth>
      {(user) => (
        <AdminQueryProvider>
          <AdminChrome user={user} />
        </AdminQueryProvider>
      )}
    </RequireAuth>
  );
}
