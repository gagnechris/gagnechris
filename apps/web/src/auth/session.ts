import {
  fetchAuthSession,
  getCurrentUser,
  signInWithRedirect,
  signOut,
} from 'aws-amplify/auth'
import { ensureAmplifyConfigured } from './config'

export type AuthUser = {
  username: string
  userId: string
}

export const getAuthUser = async (): Promise<AuthUser | null> => {
  ensureAmplifyConfigured()
  try {
    const user = await getCurrentUser()
    return { username: user.username, userId: user.userId }
  } catch {
    return null
  }
}

/** ID token for API Gateway JWT authorizer (`aud` = web client id). */
export const getIdToken = async (): Promise<string | null> => {
  ensureAmplifyConfigured()
  const session = await fetchAuthSession()
  return session.tokens?.idToken?.toString() ?? null
}

export const redirectToSignIn = async (): Promise<void> => {
  ensureAmplifyConfigured()
  await signInWithRedirect()
}

/** Clears local tokens and Cognito managed-login cookie via /logout. */
export const signOutUser = async (): Promise<void> => {
  ensureAmplifyConfigured()
  await signOut({ global: true })
}
