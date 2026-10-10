import { expect } from 'vitest';

export const AREAS = ['work', 'personal'] as const;
export const STATUSES = ['todo', 'in_progress', 'done', 'dropped'] as const;
export const PRIORITIES = ['low', 'med', 'high'] as const;

export function testUlid(prefix: string, n: number): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let s = '';
  let v = n;
  for (let i = 0; i < 6; i += 1) {
    s = alphabet[v % 32]! + s;
    v = Math.floor(v / 32);
  }
  return `01ARZ3NDEKTSV4RRFFQ${prefix}${s}`.slice(0, 26);
}

/** Unique calendar day per index so daily claims never collide. */
export function dayFromIndex(i: number): string {
  return new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
}

export function corpusNote(i: number) {
  return {
    id: testUlid('N', i),
    area: AREAS[i % 2]!,
    type: i % 3 === 0 ? ('daily' as const) : ('page' as const),
  };
}

export const CORPUS_TODAY = '2026-10-14';

export function corpusTask(i: number) {
  const someday = i % 7 === 3;
  return {
    id: testUlid('T', i),
    area: AREAS[i % 2]!,
    priority: PRIORITIES[i % 3]!,
    status: STATUSES[Math.floor(i / 2) % STATUSES.length]!,
    someday,
    startDate:
      someday || i % 5 === 0
        ? null
        : `2026-10-${String(1 + (i % 28)).padStart(2, '0')}`,
  };
}

type CorpusTask = ReturnType<typeof corpusTask>;

/** Spelled out here, not via the shared helpers, so a helper bug fails these. */
export const SCHEDULE_QUERIES: Array<{
  query: Record<string, string>;
  matches: (t: CorpusTask) => boolean;
}> = [
  {
    query: { startOnOrBefore: CORPUS_TODAY },
    matches: (t) =>
      !t.someday && (t.startDate === null || t.startDate <= CORPUS_TODAY),
  },
  {
    query: { startAfter: CORPUS_TODAY },
    matches: (t) =>
      !t.someday && t.startDate !== null && t.startDate > CORPUS_TODAY,
  },
  {
    query: { startOn: CORPUS_TODAY },
    matches: (t) => t.startDate === CORPUS_TODAY,
  },
  { query: { someday: 'true' }, matches: (t) => t.someday },
  { query: { someday: 'false' }, matches: (t) => !t.someday },
];

export function expectExactIds(
  items: Array<Record<string, unknown>>,
  expected: string[],
) {
  const ids = items.map((i) => i.id as string);
  expect(new Set(ids).size).toBe(ids.length); // no duplicates
  expect([...ids].sort()).toEqual([...expected].sort()); // no drops
}
