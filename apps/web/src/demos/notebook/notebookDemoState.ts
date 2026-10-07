import {
  addDays,
  localDateString,
  parseTaskSyntax,
  relativeDayLabel,
  type Task,
} from '@gagnechris/shared';
import {
  bucketTodayTasks,
  sourceNoteName,
  stillOpenSource,
  type SourceNote,
  type StillOpenSource,
} from '../../kit/tasks/todayTaskBuckets';

export type DemoTask = Pick<
  Task,
  | 'id'
  | 'version'
  | 'deleted'
  | 'title'
  | 'status'
  | 'priority'
  | 'startDate'
  | 'someday'
  | 'dueDate'
  | 'noteId'
  | 'createdAt'
>;

export type NotebookDemoHint =
  | { kind: 'tokens' }
  | { kind: 'needs-title' }
  | { kind: 'added'; task: DemoTask }
  /** `from` names the earlier daily note, when there is one. */
  | { kind: 'pulled'; from: string | null }
  | { kind: 'toggled'; done: boolean };

export type NotebookDemoState = {
  /** The visitor's local day when the demo was seeded. */
  today: string;
  tasks: DemoTask[];
  /** Today's note, in order: the tasks it embeds. */
  noteTaskIds: string[];
  /** Earlier daily notes the carried tasks were written in. */
  notes: SourceNote[];
  /** What is typed in the task input. */
  draft: string;
  hint: NotebookDemoHint;
  added: number;
};

export type NotebookDemoAction =
  | { type: 'type'; value: string }
  | { type: 'add' }
  | { type: 'toggle'; id: string }
  | { type: 'add-to-note'; id: string };

export const TODAY_NOTE_ID = 'demo-note-today';

export const NOTEBOOK_DEMO_NOTE = {
  wide: 'Sample data, runs in your browser, nothing is saved',
  narrow: 'nothing is saved',
};

export const NOTEBOOK_DEMO_TOKENS =
  'Tokens: @mon … @sun, @tomorrow, @someday, !high';

/** Noon UTC keeps the seeded day the same in every time zone. */
const at = (day: string) => `${day}T12:00:00.000Z`;

const task = (
  fields: Pick<DemoTask, 'id' | 'title'> & Partial<DemoTask>,
): DemoTask => ({
  version: 1,
  deleted: false,
  status: 'todo',
  priority: 'med',
  startDate: null,
  someday: false,
  dueDate: null,
  noteId: TODAY_NOTE_ID,
  createdAt: '',
  ...fields,
});

/** Dates are relative to `now`, the visitor's clock, so the sample reads like their week. */
export function seedNotebookDemo(now: Date = new Date()): NotebookDemoState {
  const today = localDateString(now);
  const yesterday = addDays(today, -1);
  const twoDaysAgo = addDays(today, -2);
  const notes: SourceNote[] = [
    { id: 'demo-note-1', type: 'daily', date: yesterday, title: '' },
    { id: 'demo-note-2', type: 'daily', date: twoDaysAgo, title: '' },
  ];
  return {
    today,
    tasks: [
      task({
        id: 'demo-review',
        title: 'Review publisher retry PR',
        status: 'done',
        createdAt: at(today),
      }),
      task({
        id: 'demo-sidebar',
        title: 'Draft sidebar nav spec',
        priority: 'high',
        createdAt: at(today),
      }),
      task({
        id: 'demo-recruiter',
        title: 'Reply to recruiter email',
        noteId: 'demo-note-1',
        createdAt: at(yesterday),
      }),
      task({
        id: 'demo-invoice',
        title: 'Send invoice follow-up',
        noteId: 'demo-note-2',
        createdAt: at(twoDaysAgo),
      }),
      task({
        id: 'demo-weekly',
        title: 'Write weekly notes',
        startDate: addDays(today, 1),
        noteId: null,
        createdAt: at(twoDaysAgo),
      }),
    ],
    noteTaskIds: ['demo-review', 'demo-sidebar'],
    notes,
    draft: '',
    hint: { kind: 'tokens' },
    added: 0,
  };
}

const sourceOf = (state: NotebookDemoState, t: DemoTask): StillOpenSource =>
  stillOpenSource(
    t,
    state.today,
    state.notes.find((n) => n.id === t.noteId),
  );

export function notebookDemoReducer(
  state: NotebookDemoState,
  action: NotebookDemoAction,
): NotebookDemoState {
  if (action.type === 'type') return { ...state, draft: action.value };
  if (action.type === 'add') {
    if (state.draft.trim() === '') return state;
    const parsed = parseTaskSyntax(state.draft, state.today);
    if (!parsed.title) return { ...state, hint: { kind: 'needs-title' } };
    const added = task({
      id: `demo-added-${state.added + 1}`,
      title: parsed.title,
      priority: parsed.priority,
      startDate: parsed.startDate,
      someday: parsed.someday,
      dueDate: parsed.dueDate,
      createdAt: at(state.today),
    });
    return {
      ...state,
      tasks: [...state.tasks, added],
      noteTaskIds: [...state.noteTaskIds, added.id],
      draft: '',
      hint: { kind: 'added', task: added },
      added: state.added + 1,
    };
  }

  const target = state.tasks.find((t) => t.id === action.id);
  if (!target) return state;

  if (action.type === 'toggle') {
    const done = target.status !== 'done';
    return {
      ...state,
      tasks: state.tasks.map((t) =>
        t === target
          ? { ...t, status: done ? 'done' : 'todo', version: t.version + 1 }
          : t,
      ),
      hint: { kind: 'toggled', done },
    };
  }

  if (state.noteTaskIds.includes(target.id)) return state;
  const from = state.notes.find((n) => n.id === target.noteId);
  return {
    ...state,
    noteTaskIds: [...state.noteTaskIds, target.id],
    hint: {
      kind: 'pulled',
      from: from ? sourceNoteName(from, state.today) : null,
    },
  };
}

export function notebookDemoView(state: NotebookDemoState) {
  const tasksById = new Map(state.tasks.map((t) => [t.id, t]));
  const noteTasks = state.noteTaskIds.flatMap((id) => {
    const t = tasksById.get(id);
    return t ? [t] : [];
  });
  const { stillOpen, comingUp } = bucketTodayTasks(state.tasks, {
    day: state.today,
    embeddedIds: new Set(state.noteTaskIds),
  });
  return {
    noteTasks,
    stillOpen: stillOpen.map((t) => ({ task: t, source: sourceOf(state, t) })),
    comingUp,
    comingUpCount: comingUp.reduce((n, d) => n + d.tasks.length, 0),
  };
}

const dayPhrase = (date: string, today: string): string =>
  date === addDays(today, 1)
    ? 'tomorrow'
    : relativeDayLabel(date, today, 'future');

export function notebookDemoHintText(
  hint: NotebookDemoHint,
  today: string,
): string {
  switch (hint.kind) {
    case 'tokens':
      return NOTEBOOK_DEMO_TOKENS;
    case 'needs-title':
      return 'Add a title before the tokens, like Call Sam @mon.';
    case 'toggled':
      return hint.done
        ? 'Done. It’s one task, so it’s checked off in every note it appears in.'
        : 'Reopened. Until it’s done it carries forward to tomorrow.';
    case 'pulled':
      return hint.from
        ? `Pulled into today’s note, so it’s off Still open. It’s the same task as in the ${hint.from}.`
        : 'Pulled into today’s note, so it’s off Still open.';
    case 'added': {
      const { startDate, someday } = hint.task;
      if (someday) {
        return 'Parked for someday. It stays in this note, off Today and Coming up.';
      }
      if (startDate && startDate > today) {
        return `Scheduled for ${dayPhrase(startDate, today)}. It stays in this note, and from that day it shows under Still open on Today.`;
      }
      return 'Added to today’s note. If it isn’t done, it carries forward to tomorrow.';
    }
  }
}
