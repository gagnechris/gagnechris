import { NavLink, Outlet } from 'react-router-dom'
import RequireAuth from '../auth/RequireAuth'
import { signOutUser, type AuthUser } from '../auth/session'
import './admin.css'

function AdminChrome({ user }: { user: AuthUser }) {
  return (
    <div className="admin-shell">
      <title>Admin - Chris Gagne</title>
      <meta name="robots" content="noindex, nofollow" />
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

/** Lazy-loaded admin layout root (RequireAuth + chrome). */
export default function AdminLayout() {
  return (
    <RequireAuth>
      {(user) => <AdminChrome user={user} />}
    </RequireAuth>
  )
}
