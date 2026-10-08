import { describe, expect, it } from 'vitest';
import {
  bucketTodayTasks,
  CLOSED_TASK_DATE_MENU,
  comingUpShortLabel,
  groupUpcomingTasks,
  HealthResponseSchema,
  noteOpenTaskCount,
  noteSections,
  parseTaskSyntax,
  stillOpenSource,
  taskDateMenuItems,
  taskDateMenuReducer,
  taskDue,
  taskEmbedToken,
  taskScheduleLabel,
  tokenInsertion,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { apiBaseUrl, localDevToken } from './config';

describe('mobile imports', () => {
  it('resolves @gagnechris/shared domain schemas', () => {
    const parsed = HealthResponseSchema.parse({
      status: 'ok',
      service: 'gagnechris-api',
    });
    expect(parsed.status).toBe('ok');
  });

  it('resolves the task syntax parser the web app uses', () => {
    expect(parseTaskSyntax('Ship it @mon !high', '2026-10-02')).toEqual({
      title: 'Ship it',
      startDate: '2026-10-05',
      someday: false,
      dueDate: null,
      priority: 'high',
    });
  });

  describe('Notebook view logic the web app uses', () => {
    // 2026-10-02 is a Friday.
    const FRI = '2026-10-02';
    const task = (
      id: string,
      startDate: string | null,
      overrides: { someday?: boolean; dueDate?: string | null } = {},
    ) => ({
      id,
      title: id,
      version: 1,
      deleted: false,
      status: 'todo' as const,
      startDate,
      someday: false,
      dueDate: null,
      noteId: null,
      createdAt: '2026-09-30T12:00:00.000Z',
      ...overrides,
    });

    it('buckets Today into Still open and Coming up', () => {
      const buckets = bucketTodayTasks(
        [task('a', null), task('b', '2026-10-05'), task('c', '2026-10-01')],
        { day: FRI, embeddedIds: new Set(['c']) },
      );
      expect(buckets.inNote.map((t) => t.id)).toEqual(['c']);
      expect(buckets.stillOpen.map((t) => t.id)).toEqual(['a']);
      expect(buckets.comingUp).toEqual([
        { date: '2026-10-05', tasks: [expect.objectContaining({ id: 'b' })] },
      ]);
      expect(buckets.carryCount).toBe(2);
      expect(stillOpenSource(task('b', '2026-10-05'), FRI).label).toBe(
        'Scheduled Oct 5',
      );
    });

    it('groups Upcoming and labels days', () => {
      const groups = groupUpcomingTasks(
        [
          task('tomorrow', '2026-10-03'),
          task('later', '2026-10-20'),
          task('parked', null, { someday: true }),
        ],
        FRI,
      );
      expect(groups.map((g) => [g.label, g.sub])).toEqual([
        ['Tomorrow', 'Sat, Oct 3'],
        ['Later', 'Oct 9 and beyond'],
        ['Someday', 'Parked, no date'],
      ]);
      expect(comingUpShortLabel('2026-10-06', FRI)).toBe('Tue');
      expect(taskScheduleLabel('2026-10-12', FRI)).toBe('@Oct 12');
      expect(
        taskDue({ dueDate: '2026-09-28', status: 'todo' }, FRI)?.text,
      ).toBe('Overdue · Mon');
    });

    it('sections the notes list and counts open tasks', () => {
      const id = '01J9Z3A0000000000000000001';
      const note = (key: string, pinned: boolean, date: string) => ({
        id: key,
        type: 'daily' as const,
        date,
        title: '',
        bodyMarkdown: taskEmbedToken(id),
        pinned,
        updatedAt: `${date}T12:00:00.000Z`,
        area: 'work' as const,
      });
      const sections = noteSections(
        [
          note('old', false, '2026-09-01'),
          note('pin', true, '2026-09-02'),
          note('new', false, FRI),
        ],
        FRI,
      );
      expect(sections.map((s) => [s.label, s.notes.map((n) => n.id)])).toEqual([
        ['Pinned', ['pin']],
        ['This week', ['new']],
        ['Earlier', ['old']],
      ]);
      expect(noteOpenTaskCount(taskEmbedToken(id), new Set([id]))).toBe(1);
    });

    it('drives the task date menu', () => {
      expect(taskDateMenuItems(FRI, 'tom').map((i) => i.token)).toEqual([
        '@tomorrow',
      ]);
      const moved = taskDateMenuReducer(CLOSED_TASK_DATE_MENU, {
        type: 'move',
        step: -1,
        count: 3,
      });
      expect(moved.active).toBe(2);
      expect(tokenInsertion({ from: 0, to: 4 }, '@mon', '')).toEqual({
        from: 0,
        to: 4,
        insert: '@mon ',
        caret: 5,
      });
    });
  });

  it('resolves @gagnechris/tokens colors', () => {
    expect(tokens.primary[500]).toBe('#3d9690');
  });

  it('defaults API base URL to local stack', () => {
    expect(apiBaseUrl).toContain('8787');
    expect(localDevToken).toBe('local-dev-token');
  });
});
