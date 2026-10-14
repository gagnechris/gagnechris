import {
  taskActionError,
  useMoveTaskToDay,
  type Note,
  type Task,
  type TaskEmbedState,
} from '@gagnechris/app-core';
import { taskDateMenuItems, tomorrowOf } from '@gagnechris/shared';
import { useEffect, useRef, useState } from 'react';
import { ActionSheetIOS } from 'react-native';
import { PickDateModal } from './PickDateModal';
import {
  indentTaskBlock,
  moveTaskBlockToSection,
  noteHeadings,
  removeTaskBlock,
  taskBlockLines,
} from './taskBlockEdits';

export type MenuNote = Pick<Note, 'id' | 'area' | 'date'>;

type Options = {
  note: MenuNote | null | undefined;
  today: string;
  /** The note's markdown now, not as of the last render. */
  markdown: () => string;
  onChange: (markdown: string) => void;
  stateOf: (id: string) => TaskEmbedState;
  onDelete: (taskId: string) => void;
};

const sheet = (
  title: string,
  items: { label: string; run: () => void; destructive?: boolean }[],
) =>
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title,
      options: [...items.map((i) => i.label), 'Cancel'],
      destructiveButtonIndex: items.findIndex((i) => i.destructive),
      cancelButtonIndex: items.length,
    },
    (index) => items[index]?.run(),
  );

/** Long press on a task row: Move to, Indent, Outdent and Delete. */
export function useTaskRowMenu({
  note,
  today,
  markdown,
  onChange,
  stateOf,
  onDelete,
}: Options) {
  const moveTaskToDay = useMoveTaskToDay();
  const [picking, setPicking] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);

  const savedTask = (id: string) => {
    const state = stateOf(id);
    return state.kind === 'task' ? state.saved : undefined;
  };

  // Null once the note's screen is gone, or while it shows another note.
  const shownNoteId = useRef<string | null>(null);
  useEffect(() => {
    shownNoteId.current = note?.id ?? null;
    return () => {
      shownNoteId.current = null;
    };
  }, [note?.id]);

  const moveToDay = async (task: Task, date: string) => {
    if (!note) return;
    const fromNoteId = note.id;
    const shown = () => shownNoteId.current === fromNoteId;
    setError(null);
    try {
      const moved = await moveTaskToDay({
        area: note.area,
        date,
        fromNoteId,
        task,
        readLines: () => (shown() ? taskBlockLines(markdown(), task.id) : null),
        removeLines: () => {
          if (!shown()) return false;
          onChange(removeTaskBlock(markdown(), task.id));
          return true;
        },
      });
      if (moved?.patchError) {
        setError(
          taskActionError('finish moving', task.title, moved.patchError),
        );
      }
    } catch (err) {
      setError(taskActionError('move', task.title, err));
    }
  };

  const days = (task: Task) =>
    sheet('Move to another day’s note', [
      ...taskDateMenuItems(today, '', 'start', { deadline: false })
        .filter(
          (item) =>
            item.schedule &&
            !item.schedule.someday &&
            item.schedule.startDate !== note?.date,
        )
        .map((item) => ({
          label: item.detail ? `${item.label} · ${item.detail}` : item.label,
          run: () => void moveToDay(task, item.schedule!.startDate!),
        })),
      { label: 'Pick a date…', run: () => setPicking(task) },
    ]);

  const moveTo = (task: Task) => {
    const sections = noteHeadings(markdown().split('\n'));
    const tomorrow = tomorrowOf(today);
    sheet('Move to', [
      ...sections.map((h, index) => ({
        label: h.title,
        run: () => {
          const next = moveTaskBlockToSection(markdown(), task.id, index);
          if (next !== null) onChange(next);
        },
      })),
      ...(note && note.date !== tomorrow
        ? [
            {
              label: 'Tomorrow’s note',
              run: () => void moveToDay(task, tomorrow),
            },
          ]
        : []),
      ...(note
        ? [{ label: 'Another day’s note…', run: () => days(task) }]
        : []),
    ]);
  };

  const open = (taskId: string) => {
    const task = savedTask(taskId);
    const current = markdown();
    const indent = indentTaskBlock(current, taskId, 'in');
    const outdent = indentTaskBlock(current, taskId, 'out');
    sheet(task?.title ?? 'Task', [
      ...(task ? [{ label: 'Move to…', run: () => moveTo(task) }] : []),
      ...(indent !== null
        ? [{ label: 'Indent', run: () => apply(taskId, 'in') }]
        : []),
      ...(outdent !== null
        ? [{ label: 'Outdent', run: () => apply(taskId, 'out') }]
        : []),
      { label: 'Delete', run: () => onDelete(taskId), destructive: true },
    ]);
  };

  const apply = (taskId: string, dir: 'in' | 'out') => {
    const next = indentTaskBlock(markdown(), taskId, dir);
    if (next !== null) onChange(next);
  };

  const datePicker = (
    <PickDateModal
      key={picking ? `move-${picking.id}` : 'move-closed'}
      title={picking ? 'Move to another day’s note' : null}
      today={tomorrowOf(today)}
      onCancel={() => setPicking(null)}
      onDone={(day) => {
        const task = picking;
        setPicking(null);
        if (task && day !== note?.date) void moveToDay(task, day);
      }}
    />
  );

  return { open, datePicker, error };
}
