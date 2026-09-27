import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchAuthSession } from 'aws-amplify/auth'
import { ensureAmplifyConfigured } from './config'

/**
 * Completes the Cognito managed-login PKCE exchange, then sends the admin home.
 */
export default function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        ensureAmplifyConfigured()
        const session = await fetchAuthSession()
        if (cancelled) {
          return
        }
        if (!session.tokens?.idToken) {
          setError('Sign-in did not return tokens. Try again.')
          return
        }
        navigate('/admin', { replace: true })
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Sign-in failed')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [navigate])

  return (
    <div className="admin-shell admin-shell--centered">
      <title>Signing in - Chris Gagne</title>
      <meta name="robots" content="noindex, nofollow" />
      {error ? (
        <>
          <h1>Sign-in failed</h1>
          <p>{error}</p>
          <a href="/admin">Try again</a>
        </>
      ) : (
        <p>Completing sign-in…</p>
      )}
    </div>
  )
}
