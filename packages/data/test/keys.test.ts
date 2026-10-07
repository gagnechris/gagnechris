import { describe, expect, it } from 'vitest';
import {
  API_LAMBDA_TIMEOUT_MS,
  keys,
  noteDateGsi1Sk,
  noteGsi1SkRanges,
  notePageGsi1Sk,
  noteTasksGsi2Pk,
  notebookAreaGsi1Pk,
  taskAreaStatusGsi1Pk,
  taskDueGsi1Sk,
  taskSomedayGsi1Sk,
  taskStartGsi1Sk,
  taskUpdatedGsi1Sk,
  parsePostMetaItem,
  postPk,
  SK_META,
  SK_PUBLISHED,
  slugify,
  taskGsi1SkRanges,
  type SortKeyRange,
  statusGsi1Pk,
  syncCreateClaimPk,
  syncSk,
  SYNC_CREATE_CLAIM_TTL_DAYS,
  SYNC_OVERLAP_MS,
  SYNC_RESYNC_MARGIN_MS,
  SYNC_TOMBSTONE_TTL_DAYS,
  syncResyncHorizonIso,
  ttlDaysFromNow,
} from '../src/index.js';

describe('@gagnechris/data keys', () => {
  it('builds typed post keys without callers hard-coding prefixes', () => {
    expect(postPk('01ABC')).toBe('POST#01ABC');
    expect(keys.post.meta('01ABC')).toEqual({
      pk: 'POST#01ABC',
      sk: SK_META,
    });
    expect(keys.post.published('01ABC')).toEqual({
      pk: 'POST#01ABC',
      sk: SK_PUBLISHED,
    });
    expect(keys.singleton.home.published()).toEqual({
      pk: 'HOME#current',
      sk: SK_PUBLISHED,
    });
    expect(statusGsi1Pk('published')).toBe('STATUS#published');
  });

  it('slugify matches shared NFKD rules with untitled fallback', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
    expect(slugify('  Café  ')).toBe('cafe');
    expect(slugify('  ')).toBe('untitled');
  });

  it('parsePostMetaItem rejects invalid items', () => {
    expect(() => parsePostMetaItem({ entityType: 'post' })).toThrow();
  });

  it('builds sync GSI and create-claim keys', () => {
    expect(syncSk('2026-09-28T12:00:00.000Z', 'note', 'n1')).toBe(
      '2026-09-28T12:00:00.000Z#NOTE#n1',
    );
    expect(syncSk('2026-09-28T12:00:00Z', 'note', 'n1')).toBe(
      syncSk('2026-09-28T12:00:00.000Z', 'note', 'n1'),
    );
    expect(syncSk('2026-09-28T17:00:00.000+05:00', 'note', 'n1')).toBe(
      syncSk('2026-09-28T12:00:00.000Z', 'note', 'n1'),
    );
    expect(syncCreateClaimPk('fakeNote', '01ABC')).toBe(
      'CREATED#FAKENOTE#01ABC',
    );
    expect(keys.sync.createClaim('fakeNote', '01ABC')).toEqual({
      pk: 'CREATED#FAKENOTE#01ABC',
      sk: SK_META,
    });
  });

  it('builds owner-scoped Notebook keys', () => {
    expect(keys.notebook.note.meta('sub-1', '01ABC')).toEqual({
      pk: 'USER#sub-1#NOTE#01ABC',
      sk: SK_META,
    });
    expect(keys.notebook.dailyClaim('sub-1', 'work', '2026-10-02')).toEqual({
      pk: 'USER#sub-1#DAILY#work#2026-10-02',
      sk: 'NOTE',
    });
    expect(notebookAreaGsi1Pk('sub-1', 'personal')).toBe(
      'USER#sub-1#AREA#personal',
    );
    expect(noteDateGsi1Sk('2026-10-02', '01ABC')).toBe(
      'DATE#2026-10-02#NOTE#01ABC',
    );
    expect(taskAreaStatusGsi1Pk('sub-1', 'work', 'todo')).toBe(
      'USER#sub-1#AREA#work#STATUS#todo',
    );
    expect(taskDueGsi1Sk('2026-10-03', '01T')).toBe('DUE#2026-10-03#TASK#01T');
    expect(taskUpdatedGsi1Sk('2026-10-02T12:00:00.000Z', '01T')).toBe(
      'UPDATED#2026-10-02T12:00:00.000Z#TASK#01T',
    );
    expect(noteTasksGsi2Pk('sub-1', '01N')).toBe('USER#sub-1#NOTE#01N#TASKS');
    expect(keys.sync.ownerCreateClaim('sub-1', 'fakeNote', '01ABC')).toEqual({
      pk: 'CREATED#FAKENOTE#USER#sub-1#01ABC',
      sk: SK_META,
    });
  });

  it('sync overlap is at least the API Lambda timeout', () => {
    expect(SYNC_OVERLAP_MS).toBeGreaterThanOrEqual(API_LAMBDA_TIMEOUT_MS);
    expect(SYNC_CREATE_CLAIM_TTL_DAYS).toBeGreaterThan(SYNC_TOMBSTONE_TTL_DAYS);
  });

  it('syncResyncHorizonIso is TTL minus margin and overlap before now', () => {
    const at = new Date('2026-10-02T12:00:00.000Z');
    const horizon = syncResyncHorizonIso(at);
    expect(Date.parse(horizon)).toBe(
      at.getTime() -
        SYNC_TOMBSTONE_TTL_DAYS * 86_400_000 +
        SYNC_RESYNC_MARGIN_MS +
        SYNC_OVERLAP_MS,
    );
    // Every row the client still needs (since − overlap) is younger than a
    // tombstone that could have been purged (now − TTL), with margin to spare.
    expect(Date.parse(horizon) - SYNC_OVERLAP_MS).toBeGreaterThan(
      at.getTime() - SYNC_TOMBSTONE_TTL_DAYS * 86_400_000,
    );
  });

  it('ttlDaysFromNow defaults to SYNC_TOMBSTONE_TTL_DAYS', () => {
    const at = new Date('2026-09-28T12:00:00.000Z');
    const ttl = ttlDaysFromNow(undefined, at);
    expect(ttl).toBe(
      Math.floor(at.getTime() / 1000) + SYNC_TOMBSTONE_TTL_DAYS * 86_400,
    );
  });
});

describe('task start-date GSI1 ranges', () => {
  const id = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
  const day = '2026-10-14';
  const sks = {
    startBefore: taskStartGsi1Sk('2026-10-13', id),
    startOn: taskStartGsi1Sk(day, id),
    startAfter: taskStartGsi1Sk('2026-10-15', id),
    legacyBefore: taskDueGsi1Sk('2026-10-13', id),
    legacyOn: taskDueGsi1Sk(day, id),
    legacyAfter: taskDueGsi1Sk('2026-10-15', id),
    now: taskUpdatedGsi1Sk('2026-10-20T00:00:00.000Z', id),
    someday: taskSomedayGsi1Sk('2026-10-01T00:00:00.000Z', id),
  };
  const hits = (ranges: SortKeyRange[]) =>
    Object.entries(sks)
      .filter(([, sk]) => ranges.some((r) => sk >= r.from && sk <= r.to))
      .map(([name]) => name)
      .sort();

  it('covers each view exactly and never reads rows keyed by dueDate', () => {
    expect(hits(taskGsi1SkRanges.showsOn(day))).toEqual(
      ['now', 'startBefore', 'startOn'].sort(),
    );
    expect(hits(taskGsi1SkRanges.startsAfter(day))).toEqual(['startAfter']);
    expect(hits(taskGsi1SkRanges.startOn(day))).toEqual(['startOn']);
    expect(hits(taskGsi1SkRanges.someday())).toEqual(['someday']);
  });
});

describe('note GSI1 ranges', () => {
  const id = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
  const sks = {
    before: noteDateGsi1Sk('2026-10-13', id),
    first: noteDateGsi1Sk('2026-10-14', id),
    last: noteDateGsi1Sk('2026-10-16', id),
    after: noteDateGsi1Sk('2026-10-17', id),
    page: notePageGsi1Sk('2026-10-15T00:00:00.000Z', id),
  };
  const hits = ({ from, to }: SortKeyRange) =>
    Object.entries(sks)
      .filter(([, sk]) => sk >= from && sk <= to)
      .map(([name]) => name);

  it('date ranges are inclusive at both ends and never hold pages', () => {
    expect(hits(noteGsi1SkRanges.dates('2026-10-14', '2026-10-16'))).toEqual([
      'first',
      'last',
    ]);
    expect(hits(noteGsi1SkRanges.dates(undefined, '2026-10-14'))).toEqual([
      'before',
      'first',
    ]);
    expect(hits(noteGsi1SkRanges.dates('2026-10-16'))).toEqual([
      'last',
      'after',
    ]);
  });

  it('daily and page ranges split the partition', () => {
    expect(hits(noteGsi1SkRanges.daily())).toEqual([
      'before',
      'first',
      'last',
      'after',
    ]);
    expect(hits(noteGsi1SkRanges.pages())).toEqual(['page']);
  });
});

describe('keys surface', () => {
  it('every `keys` entry builds an item key; key strings come from the functions', () => {
    const walk = (node: unknown, path: string): string[] => {
      if (typeof node === 'function') {
        const built = (node as (...args: string[]) => unknown)('a', 'b', 'c');
        const ok =
          built !== null &&
          typeof built === 'object' &&
          Object.keys(built).sort().join(',') === 'pk,sk' &&
          Object.values(built).every((v) => typeof v === 'string');
        return ok ? [] : [path];
      }
      return Object.entries(node as Record<string, unknown>).flatMap(
        ([name, child]) => walk(child, `${path}.${name}`),
      );
    };
    expect(walk(keys, 'keys')).toEqual([]);
  });
});
