import {
  ACCESS_LEVEL_LABELS,
  displayName,
  REAUTH_REQUIRED,
  USER_ADMIN_REAUTH_SECONDS,
  type AccessLevel,
  type InviteUserResponse,
} from '@gagnechris/shared';
import { ApiError } from './query/api.js';
import type { UserAction } from './query/users.js';

/** A change that needs a recent sign-in: an invite, setting a level, or any account action but resending an invite. */
export type UserChange =
  | { id: string; name: string; kind: 'access'; level: AccessLevel }
  | {
      id: string;
      name: string;
      kind: Exclude<UserAction, 'resend-invite'>;
      level?: AccessLevel;
    }
  | { kind: 'invite'; email: string; name?: string; level: AccessLevel };

/** Asked before the account actions that act on the person straight away. */
export const ACCOUNT_ACTION_CONFIRMS: Partial<
  Record<UserAction, { title: string; body: string; action: string }>
> = {
  'sign-out': {
    title: 'Sign out everywhere?',
    body: 'Ends their sessions in Admin and Notebook now.',
    action: 'Sign out',
  },
  disable: {
    title: 'Disable sign-in?',
    body: 'Keeps the account and Notebook, but blocks sign-in.',
    action: 'Disable',
  },
  remove: {
    title: 'Remove access?',
    body: 'Takes away every app. Their Notebook is kept, so if they come back their notes come back too.',
    action: 'Remove',
  },
};

/** Sign in this long before the server's limit, so the request isn't refused on arrival. */
const MARGIN_SECONDS = 30;

export const isRecentSignIn = (authTime: number | null, now = Date.now()) =>
  authTime !== null &&
  now / 1000 - authTime < USER_ADMIN_REAUTH_SECONDS - MARGIN_SECONDS;

export const isReauthRequired = (error: unknown) =>
  error instanceof ApiError &&
  error.status === 403 &&
  error.error === REAUTH_REQUIRED;

export function changeToast(
  change: UserChange,
  invited?: InviteUserResponse,
): string {
  if (change.kind === 'invite') {
    return invited?.restored
      ? `${displayName(invited.user)} has access again. Their notes are back.`
      : `Invite sent to ${invited?.user.email ?? change.email}.`;
  }
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
