import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useGetApiClient } from '../AppApiProvider.js';
import { ApiError, type Note, type NotebookArea, type Task } from './api.js';
import { setCachedNote } from './cache.js';
import { dailyNoteResource, fetchDailyNoteEntity } from './notes.js';
import { usePatchTaskMutation, type TaskPatch } from './tasks.js';

/** The lines after the note's text, then an empty line to write under them. */
export function appendNoteLines(markdown: string, lines: string): string {
  const body = markdown.replace(/\s+$/, '');
  return `${body}${body ? '\n\n' : ''}${lines}\n\n`;
}

const isStale = (err: unknown) =>
  err instanceof ApiError && (err.status === 409 || err.status === 412);

/**
 * What moving a task's block to `date` changes on a task: the moved task, and
 * the subtasks under it, start that day and live in `noteId`. A subtask keeps
 * a later start, its own home note, and anything once it is done or dropped.
 */
export function movedTaskPatch(
  task: Task,
  {
    date,
    noteId,
    fromNoteId,
  }: { date: string; noteId: string; fromNoteId: string },
  subtask: boolean,
): TaskPatch {
  const patch: TaskPatch = {};
  if (!subtask || task.noteId === fromNoteId) patch.noteId = noteId;
  const open = task.status === 'todo' || task.status === 'in_progress';
  const later =
    task.someday || (task.startDate !== null && task.startDate > date);
  if (!subtask || (open && !later)) {
    patch.startDate = date;
    patch.someday = false;
  }
  return patch;
}

/**
 * Move to → another day's note: appends the task's lines to that day's note,
 * creating it if needed, then points the tasks at it. The caller takes the
 * lines out of its own note afterwards.
 */
export function useMoveTaskToDay() {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  const { mutateAsync: patchTask } = usePatchTaskMutation();

  return useCallback(
    async ({
      area,
      date,
      lines,
      fromNoteId,
      task,
      subtasks,
    }: {
      area: NotebookArea;
      date: string;
      lines: string;
      fromNoteId: string;
      task: Task;
      subtasks: readonly Task[];
    }): Promise<Note> => {
      const client = getClient();
      let note: Note | null = null;
      for (let attempt = 0; note === null; attempt += 1) {
        const current = await fetchDailyNoteEntity(client, area, date);
        try {
          note = await dailyNoteResource.update(
            client,
            { area, date },
            {
              id: current.id,
              version: current.version,
              bodyMarkdown: appendNoteLines(current.bodyMarkdown, lines),
            },
          );
        } catch (err) {
          if (attempt > 0 || !isStale(err)) throw err;
        }
      }
      setCachedNote(queryClient, note);
      const target = { date, noteId: note.id, fromNoteId };
      await Promise.all(
        [task, ...subtasks].map((t, i) => {
          const patch = movedTaskPatch(t, target, i > 0);
          return Object.keys(patch).length === 0
            ? null
            : patchTask({ id: t.id, version: t.version, patch });
        }),
      );
      return note;
    },
    [getClient, patchTask, queryClient],
  );
}
