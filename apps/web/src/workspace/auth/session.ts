import {
  fetchAuthSession,
  getCurrentUser,
  signInWithRedirect,
  signOut,
} from 'aws-amplify/auth';
import { isSitePath } from '@gagnechris/shared';
import { addPasskeyUrl, ensureAmplifyConfigured } from './config';

export type AuthUser = {
  label: string;
  userId: string;
  /** Cognito groups from the ID token; the API enforces them, the UI only hides links. */
  groups: readonly string[];
};

const isLocalAuth = (): boolean => import.meta.env.VITE_AUTH_MODE === 'local';

/** Local fake auth only: browser tests switch users by writing this key. */
export const LOCAL_AUTH_USER_KEY = 'gagnechris.localAuthUser';

const LOCAL_GROUPS = ['site-admin', 'notebook', 'user-admin'] as const;

const DEFAULT_LOCAL_USER: AuthUser = {
  label: 'local@gagnechris.com',
  userId: 'local-dev-user',
  groups: LOCAL_GROUPS,
};

const stringArray = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((v) => typeof v === 'string')
    ? value
    : null;

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
      const groups =
        'groups' in parsed ? stringArray(parsed.groups) : LOCAL_GROUPS;
      return {
        label: parsed.label,
        userId: parsed.userId,
        groups: groups ?? LOCAL_GROUPS,
      };
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
    const payload = session.tokens?.idToken?.payload;
    if (!payload) return null;
    const email = payload?.email;
    const label =
      typeof email === 'string' && email.trim() !== ''
        ? email
        : user.signInDetails?.loginId || user.username;
    return {
      label,
      userId: user.userId,
      groups: stringArray(payload?.['cognito:groups']) ?? [],
    };
  } catch {
    return null;
  }
};

/** ID token for the API Gateway JWT authorizer (`aud` = this app's client ID). */
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

/** sessionStorage survives the top-level round trip through managed login. */
export const RETURN_TO_KEY = 'gagnechris.authReturnTo';

/** Same-app paths only, so a crafted value can't send the callback off-site. */
export const safeReturnTo = (value: string | null | undefined): string => {
  if (
    !value ||
    !isSitePath(value) ||
    value.includes('\\') ||
    /^\/auth(?:[/?#]|$)/.test(value)
  ) {
    return '/';
  }
  return value;
};

export const takeReturnTo = (): string => {
  let stored: string | null = null;
  try {
    stored = window.sessionStorage.getItem(RETURN_TO_KEY);
    window.sessionStorage.removeItem(RETURN_TO_KEY);
  } catch {
    // Storage disabled: land on the app's home.
  }
  return safeReturnTo(stored);
};

const saveReturnTo = (): void => {
  const { pathname, search, hash } = window.location;
  try {
    window.sessionStorage.setItem(
      RETURN_TO_KEY,
      safeReturnTo(`${pathname}${search}${hash}`),
    );
  } catch {
    // Storage disabled: the callback lands on the app's home.
  }
};

/** Local auth has no managed login, so nowhere to add a passkey. */
export const canAddPasskey = (): boolean => !isLocalAuth();

/** Managed login's own session; without one, `/passkeys/add` sends the user straight back. */
const MANAGED_LOGIN_SESSION_SECONDS = 55 * 60;

export const ADD_PASSKEY_AFTER_SIGN_IN_KEY = 'gagnechris.addPasskeyAfterSignIn';

/** How long the passkey page waits for the sign-in that opens it. */
const ADD_PASSKEY_PENDING_MS = 10 * 60 * 1000;

/** The app's tokens outlive managed login's session, so an older sign-in signs in again first. */
export const openAddPasskey = async (): Promise<void> => {
  const authTime = await getAuthTime().catch(() => null);
  if (
    authTime !== null &&
    Date.now() / 1000 - authTime < MANAGED_LOGIN_SESSION_SECONDS
  ) {
    saveReturnTo();
    window.location.assign(addPasskeyUrl());
    return;
  }
  try {
    window.sessionStorage.setItem(
      ADD_PASSKEY_AFTER_SIGN_IN_KEY,
      String(Date.now()),
    );
  } catch {
    // Storage disabled: the sign-in still lands back here.
  }
  await redirectToSignIn({ prompt: 'LOGIN' });
};

/** The passkey page to continue to after the sign-in `openAddPasskey` started. */
export const takeAddPasskeyAfterSignIn = (now = Date.now()): string | null => {
  let stored: string | null;
  try {
    stored = window.sessionStorage.getItem(ADD_PASSKEY_AFTER_SIGN_IN_KEY);
    window.sessionStorage.removeItem(ADD_PASSKEY_AFTER_SIGN_IN_KEY);
  } catch {
    return null;
  }
  const at = Number(stored);
  return stored && now - at >= 0 && now - at < ADD_PASSKEY_PENDING_MS
    ? addPasskeyUrl()
    : null;
};

/** `LOGIN` makes managed login ask again even with a live session. */
export const redirectToSignIn = async (options?: {
  prompt?: 'LOGIN';
}): Promise<void> => {
  if (isLocalAuth()) {
    return;
  }
  ensureAmplifyConfigured();
  saveReturnTo();
  await (options?.prompt
    ? signInWithRedirect({ options: { prompt: options.prompt } })
    : signInWithRedirect());
};

/** When the user last actually signed in (seconds); a token refresh keeps it. */
export const getAuthTime = async (): Promise<number | null> => {
  if (isLocalAuth()) {
    return Math.floor(Date.now() / 1000);
  }
  ensureAmplifyConfigured();
  const session = await fetchAuthSession();
  const authTime = session.tokens?.idToken?.payload?.auth_time;
  return typeof authTime === 'number' ? authTime : null;
};

/**
 * Revokes this app's refresh token and ends the managed-login session via
 * /logout. Global sign-out would need the aws.cognito.signin.user.admin scope,
 * which these clients don't request.
 */
export const signOutUser = async (): Promise<void> => {
  if (isLocalAuth()) {
    window.location.href = '/';
    return;
  }
  ensureAmplifyConfigured();
  await signOut();
};
