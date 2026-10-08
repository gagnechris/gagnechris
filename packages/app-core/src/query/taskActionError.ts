import { ApiError } from './api.js';

/** The message for a failed task action; a version conflict says to reload. */
export function taskActionError(
  action: string,
  title: string,
  err: unknown,
): string {
  const conflict =
    err instanceof ApiError && (err.status === 409 || err.status === 412);
  return conflict
    ? `Could not ${action} “${title}”: it changed on another device. Reload and try again.`
    : `Could not ${action} “${title}”. Please try again.`;
}
