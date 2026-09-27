import { useEffect, useState, type ReactNode } from 'react'
import { getAuthUser, redirectToSignIn, type AuthUser } from './session'

type RequireAuthProps = {
  children: (user: AuthUser) => ReactNode
}

/**
 * Gate for /admin. Unauthenticated visitors are sent to Cognito managed login.
 */
export default function RequireAuth({ children }: RequireAuthProps) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const current = await getAuthUser()
        if (cancelled) {
          return
        }
        if (!current) {
          await redirectToSignIn()
          return
        }
        setUser(current)
        setChecking(false)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Auth check failed')
          setChecking(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <div className="admin-shell admin-shell--centered">
        <h1>Could not verify sign-in</h1>
        <p>{error}</p>
        <button type="button" onClick={() => void redirectToSignIn()}>
          Sign in
        </button>
      </div>
    )
  }

  if (checking || !user) {
    return (
      <div className="admin-shell admin-shell--centered">
        <p>Checking sign-in…</p>
      </div>
    )
  }

  return <>{children(user)}</>
}
