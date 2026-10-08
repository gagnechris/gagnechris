import { describe, expect, test } from 'vitest';
import {
  emptyTaskDraft,
  taskPayloadFromDraft,
} from '../src/query/taskDraft.js';

describe('taskPayloadFromDraft', () => {
  test('sends the show-on date and the deadline independently', () => {
    expect(
      taskPayloadFromDraft({
        ...emptyTaskDraft(),
        title: 'Book flights',
        startDate: '2026-10-09',
      }),
    ).toMatchObject({ startDate: '2026-10-09', someday: false, dueDate: null });
    expect(
      taskPayloadFromDraft({
        ...emptyTaskDraft(),
        title: 'Book flights',
        dueDate: '2026-10-30',
      }),
    ).toMatchObject({ startDate: null, dueDate: '2026-10-30' });
  });

  test('someday clears the show-on date', () => {
    expect(
      taskPayloadFromDraft({
        ...emptyTaskDraft(),
        title: 'Learn piano',
        startDate: '2026-10-09',
        someday: true,
      }),
    ).toMatchObject({ startDate: null, someday: true });
  });
});
