import {
  ACCESS_LEVEL_LABELS,
  type AccessLevel,
  type ManagedUser,
  type ManagedUserStatus,
} from '@gagnechris/shared';
import { ApiError } from '@gagnechris/app-core';

export const LEVEL_ORDER: readonly AccessLevel[] = ['full', 'cms', 'notebook'];

type AppName = 'Admin' | 'Notebook' | 'Users';

export const LEVEL_APPS: Record<AccessLevel, readonly AppName[]> = {
  full: ['Admin', 'Notebook', 'Users'],
  cms: ['Admin'],
  notebook: ['Notebook'],
};

export const LEVEL_DESCRIPTIONS: Record<AccessLevel, string> = {
  full: 'Everything: the public site CMS, their own Notebook, and managing users.',
  cms: 'Admin only: posts, home page, resume and projects. No Notebook, no user management.',
  notebook: 'Their own private Notebook for notes and tasks. Can’t open Admin.',
};

export const STATUS_LABELS: Record<ManagedUserStatus, string> = {
  active: 'Active',
  invited: 'Invited',
  disabled: 'Disabled',
  removed: 'Removed · notes kept',
};

export const displayName = (user: Pick<ManagedUser, 'name' | 'email'>) =>
  user.name?.trim() || user.email.split('@')[0] || user.email;

export const firstName = (user: Pick<ManagedUser, 'name' | 'email'>) =>
  displayName(user).split(/\s+/)[0]!;

export function initials(user: Pick<ManagedUser, 'name' | 'email'>): string {
  const parts = displayName(user)
    .split(/[\s._-]+/)
    .filter(Boolean);
  const letters =
    parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : (parts[0] ?? '?');
  return letters.slice(0, 2).toUpperCase();
}

/** Admin and Notebook as the table shows them: nothing opens while disabled or removed. */
export function hasApp(user: ManagedUser, app: 'Admin' | 'Notebook'): boolean {
  if (!user.level || user.status === 'disabled' || user.status === 'removed') {
    return false;
  }
  return LEVEL_APPS[user.level].includes(app);
}

const joinAnd = (items: readonly string[]) => items.join(' and ');

/** What saving a level change does to someone, in the order the panel shows it. */
export function accessChange(
  user: Pick<ManagedUser, 'name' | 'email'>,
  from: AccessLevel | null,
  to: AccessLevel,
): { title: string; body: string } {
  const before = from ? LEVEL_APPS[from] : [];
  const after = LEVEL_APPS[to];
  const gains = after.filter((app) => !before.includes(app));
  const losses = before.filter((app) => !after.includes(app));
  const who = firstName(user);
  const sentences = [
    gains.length ? `${who} gains ${joinAnd(gains)}.` : null,
    losses.length ? `${who} loses ${joinAnd(losses)}.` : null,
    losses.length
      ? 'Saving signs them out everywhere, so they can’t start a new session; a tab they already have open stops working within the hour.'
      : 'It applies the next time they open the app.',
  ];
  return {
    title: `${from ? ACCESS_LEVEL_LABELS[from] : 'No access'} → ${ACCESS_LEVEL_LABELS[to]}`,
    body: sentences.filter(Boolean).join(' '),
  };
}

export function formatAdded(iso: string | null, now = new Date()): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

const CONFLICT_MESSAGES: Record<string, string> = {
  self_change: 'You can’t change, disable or remove your own access.',
  last_full_admin: 'There must always be at least one Full Admin.',
  user_exists: 'Someone with this email already has an account.',
  user_removed: 'This user was removed. Restore them first.',
  not_removed: 'This user was not removed.',
  not_invited: 'This user has already signed in.',
};

export function userErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.error && CONFLICT_MESSAGES[error.error]) {
      return CONFLICT_MESSAGES[error.error]!;
    }
    if (error.status === 403) {
      return 'Only Full Admins can manage users.';
    }
  }
  return fallback;
}
