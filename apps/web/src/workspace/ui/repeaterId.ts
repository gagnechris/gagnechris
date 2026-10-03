import { createUlid } from '../../lib/ulid';

/** Stable client-only id for repeater rows (not sent to the API). */
export function newRepeaterId(): string {
  return createUlid();
}
