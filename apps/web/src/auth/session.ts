import {
  fetchAuthSession,
  getCurrentUser,
  signInWithRedirect,
  signOut,
} from 'aws-amplify/auth'
import { ensureAmplifyConfigured } from './config'

export type AuthUser = {
  /** Preferred display label (email when available). */
  label: string
  userId: string
}

const isLocalAuth = (): boolean => import.meta.env.VITE_AUTH_MODE === 'local'

export const getAuthUser = async (): Promise<AuthUser | null> => {
  if (isLocalAuth()) {
    return { label: 'local@gagnechris.com', userId: 'local-dev-user' }
  }
  ensureAmplifyConfigured()
  try {
    const [user, session] = await Promise.all([
      getCurrentUser(),
      fetchAuthSession(),
    ])
    const email = session.tokens?.idToken?.payload?.email
    const label =
      typeof email === 'string' && email.trim() !== ''
        ? email
        : user.signInDetails?.loginId || user.username
    return { label, userId: user.userId }
  } catch {
    return null
  }
}

/** ID token for API Gateway JWT authorizer (`aud` = web client id). */
export const getIdToken = async (): Promise<string | null> => {
  if (isLocalAuth()) {
    return 'local-dev-token'
  }
  ensureAmplifyConfigured()
  const session = await fetchAuthSession()
  return session.tokens?.idToken?.toString() ?? null
}

export const redirectToSignIn = async (): Promise<void> => {
  if (isLocalAuth()) {
    return
  }
  ensureAmplifyConfigured()
  await signInWithRedirect()
}

/** Clears local tokens and Cognito managed-login cookie via /logout. */
export const signOutUser = async (): Promise<void> => {
  if (isLocalAuth()) {
    window.location.href = '/'
    return
  }
  ensureAmplifyConfigured()
  await signOut({ global: true })
}
