import {
  ACCESS_LEVEL_LABELS,
  REAUTH_REQUIRED,
  USER_ADMIN_REAUTH_SECONDS,
  type AccessLevel,
} from '@gagnechris/shared';
import { ApiError, type UserAction } from '@gagnechris/app-core';

/** A change that needs a recent sign-in: setting a level, or any account action but resending an invite. */
export type UserChange =
  | { id: string; name: string; kind: 'access'; level: AccessLevel }
  | {
      id: string;
      name: string;
      kind: Exclude<UserAction, 'resend-invite'>;
      level?: AccessLevel;
    };

export const PENDING_CHANGE_KEY = 'gagnechris.pendingUserChange';

/** Sign in this long before the server's limit, so the request isn't refused on arrival. */
const MARGIN_SECONDS = 30;

/** How long a change waits for the sign-in that confirms it. */
const PENDING_MS = 10 * 60 * 1000;

export const isRecentSignIn = (authTime: number | null, now = Date.now()) =>
  authTime !== null &&
  now / 1000 - authTime < USER_ADMIN_REAUTH_SECONDS - MARGIN_SECONDS;

export const isReauthRequired = (error: unknown) =>
  error instanceof ApiError &&
  error.status === 403 &&
  error.error === REAUTH_REQUIRED;

type Stored = { change: UserChange; at: number };

export function savePendingChange(change: UserChange, now = Date.now()): void {
  try {
    window.sessionStorage.setItem(
      PENDING_CHANGE_KEY,
      JSON.stringify({ change, at: now } satisfies Stored),
    );
  } catch {
    // Storage disabled: after signing in they make the change again.
  }
}

/**
 * The change waiting on a sign-in, once: only if that sign-in happened after
 * the change was asked for, so backing out of the prompt changes nothing.
 */
export function takePendingChange(
  authTime: number | null,
  now = Date.now(),
): UserChange | null {
  let stored: Stored | null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_CHANGE_KEY);
    window.sessionStorage.removeItem(PENDING_CHANGE_KEY);
    stored = raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
  if (!stored?.change || typeof stored.at !== 'number') return null;
  if (now - stored.at > PENDING_MS) return null;
  if (authTime === null || authTime * 1000 < stored.at) return null;
  return stored.change;
}

export function changeToast(change: UserChange): string {
  const { name } = change;
  switch (change.kind) {
    case 'access':
      return `${name} now has ${ACCESS_LEVEL_LABELS[change.level]} access.`;
    case 'sign-out':
      return `${name} is signed out everywhere.`;
    case 'disable':
      return `${name} can no longer sign in.`;
    case 'enable':
      return `${name} can sign in again.`;
    case 'remove':
      return `${name} no longer has access. Their notes are kept.`;
    case 'restore':
      return `${name} has access again.`;
  }
}
