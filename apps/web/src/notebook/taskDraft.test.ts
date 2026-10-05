import { describe, expect, test } from 'vitest';
import { emptyTaskDraft, taskPayloadFromDraft } from './taskDraft';

describe('taskPayloadFromDraft', () => {
  test('sends the show-on date and someday, never dueDate', () => {
    const payload = taskPayloadFromDraft({
      ...emptyTaskDraft(),
      title: 'Book flights',
      startDate: '2026-10-09',
    });
    expect(payload).toMatchObject({ startDate: '2026-10-09', someday: false });
    expect(payload).not.toHaveProperty('dueDate');
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
