import type { UserChange } from '@gagnechris/app-core';

export const PENDING_CHANGE_KEY = 'gagnechris.pendingUserChange';

/** How long a change waits for the sign-in that confirms it. */
const PENDING_MS = 10 * 60 * 1000;

type Stored = { change: UserChange; userId: string; at: number };

export function savePendingChange(
  change: UserChange,
  userId: string,
  now = Date.now(),
): void {
  try {
    window.sessionStorage.setItem(
      PENDING_CHANGE_KEY,
      JSON.stringify({ change, userId, at: now } satisfies Stored),
    );
  } catch {
    // Storage disabled: after signing in they make the change again.
  }
}

/**
 * The change waiting on a sign-in, once: only if the same user signed in
 * after the change was asked for, so backing out of the prompt, or someone
 * else signing in on that tab, changes nothing.
 */
export function takePendingChange(
  authTime: number | null,
  userId: string,
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
  if (stored.userId !== userId) return null;
  if (now - stored.at > PENDING_MS) return null;
  if (authTime === null || authTime * 1000 < stored.at) return null;
  return stored.change;
}
