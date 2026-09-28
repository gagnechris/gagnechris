import { NavLink, Outlet } from 'react-router-dom'
import { isDevProdApiTarget } from '../api/apiTarget'
import RequireAuth from '../auth/RequireAuth'
import { signOutUser, type AuthUser } from '../auth/session'
import { AdminQueryProvider } from './query/AdminQueryProvider'
import './admin.css'

function AdminChrome({ user }: { user: AuthUser }) {
  const prodApi = isDevProdApiTarget()

  return (
    <div className="admin-shell">
      <title>Admin - Chris Gagne</title>
      <meta name="robots" content="noindex, nofollow" />
      {prodApi ? (
        <div
          className="admin-prod-banner"
          role="status"
          aria-live="polite"
        >
          PRODUCTION API — edits, autosave, and publish hit the live site
        </div>
      ) : null}
      <header className="admin-header">
        <div className="admin-brand">
          <span className="admin-brand__title">Admin</span>
          <span className="admin-brand__user">{user.label}</span>
        </div>
        <nav className="admin-nav" aria-label="Admin">
          <NavLink
            to="/admin"
            end
            className={({ isActive }) =>
              isActive ? 'admin-nav__link admin-nav__link--active' : 'admin-nav__link'
            }
          >
            Posts
          </NavLink>
          <NavLink
            to="/admin/home"
            className={({ isActive }) =>
              isActive ? 'admin-nav__link admin-nav__link--active' : 'admin-nav__link'
            }
          >
            Home
          </NavLink>
          <NavLink
            to="/admin/resume"
            className={({ isActive }) =>
              isActive ? 'admin-nav__link admin-nav__link--active' : 'admin-nav__link'
            }
          >
            Resume
          </NavLink>
          <NavLink
            to="/admin/notebook"
            className={({ isActive }) =>
              isActive ? 'admin-nav__link admin-nav__link--active' : 'admin-nav__link'
            }
          >
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
  )
}

/** Lazy-loaded admin layout root (RequireAuth + chrome + Query). */
export default function AdminLayout() {
  return (
    <RequireAuth>
      {(user) => (
        <AdminQueryProvider>
          <AdminChrome user={user} />
        </AdminQueryProvider>
      )}
    </RequireAuth>
  )
}
