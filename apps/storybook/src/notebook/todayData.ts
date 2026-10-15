import type { ComingUpDay, Task } from '@gagnechris/shared';
import type { StillOpenRow } from '@web/kit/tasks/TodayPanels';

export const DAY = '2026-10-15';

type PanelTask = Pick<Task, 'id' | 'title' | 'status' | 'priority'> & {
  parentId?: string | null;
};

export const PARENTS = new Map([
  ['launch', { title: 'Launch the redesign', status: 'todo' as const }],
]);

export const STILL_OPEN: StillOpenRow[] = [
  {
    task: {
      id: 'a',
      title: 'File expense report',
      status: 'todo',
      priority: 'high',
    },
    source: { label: 'Mon note · 3 days', noteId: 'note-mon' },
    sourceTo: '/notes/note-mon',
    to: '/tasks/a',
    due: {
      text: 'Overdue · Mon',
      title: 'Overdue, was due Mon, Oct 12',
      overdue: true,
    },
  },
  {
    task: {
      id: 'b',
      title: 'Reply to recruiter',
      status: 'todo',
      priority: 'med',
    },
    source: { label: 'Wed note · 1 day', noteId: 'note-wed' },
    sourceTo: '/notes/note-wed',
    to: '/tasks/b',
  },
  {
    task: {
      id: 'c',
      title: 'Pick the brand fonts',
      status: 'in_progress',
      priority: 'med',
      parentId: 'launch',
    },
    source: { label: 'Scheduled today', noteId: null },
    to: '/tasks/c',
    due: { text: 'due Fri', title: 'Due Fri, Oct 16', overdue: false },
  },
  {
    task: {
      id: 'd',
      title:
        'Go through every open pull request on the site repository and close the stale ones',
      status: 'todo',
      priority: 'low',
    },
    source: { label: 'Oct 2 note · 13 days', noteId: 'note-oct2' },
    sourceTo: '/notes/note-oct2',
  },
];

export const COMING_UP: ComingUpDay<PanelTask>[] = [
  {
    date: '2026-10-16',
    tasks: [
      { id: 'e', title: 'Renew passport', status: 'todo', priority: 'high' },
      { id: 'f', title: 'Water the plants', status: 'todo', priority: 'low' },
    ],
  },
  {
    date: '2026-10-19',
    tasks: [
      {
        id: 'g',
        title: 'Brand fonts review',
        status: 'todo',
        priority: 'med',
        parentId: 'launch',
      },
    ],
  },
  {
    date: '2026-10-24',
    tasks: [
      { id: 'h', title: 'Book the dentist', status: 'todo', priority: 'med' },
    ],
  },
];
