import {
  fetchAuthSession,
  getCurrentUser,
  signInWithRedirect,
  signOut,
} from 'aws-amplify/auth';
import { ensureAmplifyConfigured } from './config';

export type AuthUser = {
  label: string;
  userId: string;
};

const isLocalAuth = (): boolean => import.meta.env.VITE_AUTH_MODE === 'local';

/** Local fake auth only: browser tests switch users by writing this key. */
export const LOCAL_AUTH_USER_KEY = 'gagnechris.localAuthUser';

const DEFAULT_LOCAL_USER: AuthUser = {
  label: 'local@gagnechris.com',
  userId: 'local-dev-user',
};

const localUser = (): AuthUser => {
  try {
    const raw = window.localStorage.getItem(LOCAL_AUTH_USER_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'userId' in parsed &&
      'label' in parsed &&
      typeof parsed.userId === 'string' &&
      typeof parsed.label === 'string'
    ) {
      return { label: parsed.label, userId: parsed.userId };
    }
  } catch {
    // Malformed value: fall back to the default user.
  }
  return DEFAULT_LOCAL_USER;
};

export const getAuthUser = async (): Promise<AuthUser | null> => {
  if (isLocalAuth()) {
    return localUser();
  }
  ensureAmplifyConfigured();
  try {
    const [user, session] = await Promise.all([
      getCurrentUser(),
      fetchAuthSession(),
    ]);
    const email = session.tokens?.idToken?.payload?.email;
    const label =
      typeof email === 'string' && email.trim() !== ''
        ? email
        : user.signInDetails?.loginId || user.username;
    return { label, userId: user.userId };
  } catch {
    return null;
  }
};

/** ID token for API Gateway JWT authorizer (`aud` = web client id). */
export const getIdToken = async (options?: {
  forceRefresh?: boolean;
}): Promise<string | null> => {
  if (isLocalAuth()) {
    return `local:${localUser().userId}`;
  }
  ensureAmplifyConfigured();
  const session = await fetchAuthSession({
    forceRefresh: options?.forceRefresh === true,
  });
  return session.tokens?.idToken?.toString() ?? null;
};

export const redirectToSignIn = async (): Promise<void> => {
  if (isLocalAuth()) {
    return;
  }
  ensureAmplifyConfigured();
  await signInWithRedirect();
};

/** Clears local tokens and Cognito managed-login cookie via /logout. */
export const signOutUser = async (): Promise<void> => {
  if (isLocalAuth()) {
    window.location.href = '/';
    return;
  }
  ensureAmplifyConfigured();
  await signOut({ global: true });
};
