// Kept out of the `@gagnechris/data` prod surface.
import { SK_META } from '@gagnechris/data';

export function fixturePk(fixtureId: string): string {
  return `FIXTURE#${fixtureId}`;
}

export function fixtureMetaSk(): string {
  return SK_META;
}

export const fixtureKeys = {
  meta: (id: string) => ({ pk: fixturePk(id), sk: fixtureMetaSk() }),
} as const;
