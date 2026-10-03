import type { ApiClient } from '@gagnechris/api-client';
import { describe, expect, test, vi } from 'vitest';
import {
  emptyDailyPlaceholder,
  fetchDailyNoteEntity,
} from '../src/query/notes.js';
import { isEmptyDailyNote } from '../src/query/api.js';

describe('daily note placeholders (CHR-42)', () => {
  test('emptyDailyPlaceholder reuses the same ULID per area/date', () => {
    const a = emptyDailyPlaceholder('work', '2026-10-02', 'user-1');
    const b = emptyDailyPlaceholder('work', '2026-10-02', 'user-1');
    expect(a.id).toBe(b.id);
    expect(a.version).toBe(0);
    expect(a.type).toBe('daily');
    expect(a.date).toBe('2026-10-02');
  });

  test('fetchDailyNoteEntity maps empty draft to a placeholder Note', async () => {
    const client = {
      GET: vi.fn(async () => ({
        data: {
          exists: false as const,
          userId: 'user-1',
          area: 'work' as const,
          type: 'daily' as const,
          date: '2026-10-02',
          title: '',
          bodyMarkdown: '',
          tags: [],
          pinned: false as const,
          version: 0 as const,
        },
        error: undefined,
        response: { status: 200 },
      })),
    } as unknown as ApiClient;

    const note = await fetchDailyNoteEntity(client, 'work', '2026-10-02');
    expect(isEmptyDailyNote(note as never)).toBe(false);
    expect(note.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/i);
    expect(note.version).toBe(0);
    expect(note.userId).toBe('user-1');
  });
});
