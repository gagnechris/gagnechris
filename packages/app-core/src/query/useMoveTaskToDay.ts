import {
  removeTaskBlock,
  removeTaskEmbedLines,
  taskEmbedIds,
} from '@gagnechris/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useGetApiClient } from '../AppApiProvider.js';
import {
  ApiError,
  fetchNote,
  updateNote,
  type Note,
  type NotebookArea,
  type Task,
} from './api.js';
import { setCachedNote } from './cache.js';
import { dailyNoteResource, fetchDailyNoteEntity } from './notes.js';
import {
  findCachedTask,
  usePatchTaskMutation,
  type TaskPatch,
} from './tasks.js';

/**
 * The note with the block's lines after its text, leaving out tasks it
 * already embeds; null when it already holds the moved task.
 */
function appendMovedLines(
  markdown: string,
  taskId: string,
  lines: string,
): string | null {
  const present = new Set(taskEmbedIds(markdown));
  if (present.has(taskId)) return null;
  const body = markdown.replace(/\s+$/, '');
  const moved = removeTaskEmbedLines(lines, present);
  return `${body}${body ? '\n\n' : ''}${moved}\n\n`;
}

const isStale = (err: unknown) =>
  err instanceof ApiError && (err.status === 409 || err.status === 412);

/**
 * What moving a task's block to `date` changes on a task: the moved task, and
 * the subtasks under it, start that day and live in `noteId`. A subtask keeps
 * a later start, its own home note, and anything once it is done or dropped.
 */
function movedTaskPatch(
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

export type MoveTaskToDayResult = {
  note: Note;
  /** The lines moved, but a task could not be pointed at the new note. */
  patchError: unknown;
};

/**
 * Move to → another day's note: appends the task's lines to that day's note,
 * creating it if needed, points the tasks at it, then takes the lines out of
 * the note they came from. Null when the note no longer has the task.
 */
export function useMoveTaskToDay() {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  const { mutateAsync: patchTask } = usePatchTaskMutation();

  return useCallback(
    async ({
      area,
      date,
      fromNoteId,
      task,
      readLines,
      removeLines,
    }: {
      area: NotebookArea;
      date: string;
      fromNoteId: string;
      task: Task;
      /** The block's lines as the editor holds them now; null once it is gone. */
      readLines: () => string | null;
      /**
       * Takes the block out of the open editor; false when no editor shows
       * the note any more, so the note is saved here instead.
       */
      removeLines: () => boolean;
    }): Promise<MoveTaskToDayResult | null> => {
      const client = getClient();
      let lines = readLines();
      if (lines === null) return null;
      let note: Note | null = null;
      for (let attempt = 0; note === null; attempt += 1) {
        const current = await fetchDailyNoteEntity(client, area, date);
        lines = readLines() ?? lines;
        const bodyMarkdown = appendMovedLines(
          current.bodyMarkdown,
          task.id,
          lines,
        );
        if (bodyMarkdown === null) {
          note = current;
          break;
        }
        try {
          note = await dailyNoteResource.update(
            client,
            { area, date },
            { id: current.id, version: current.version, bodyMarkdown },
          );
        } catch (err) {
          if (attempt > 0 || !isStale(err)) throw err;
        }
      }
      setCachedNote(queryClient, note);

      // Before the old note drops the lines: saving it re-parents the tasks
      // it is still home to.
      const target = { date, noteId: note.id, fromNoteId };
      const moved = taskEmbedIds(lines).flatMap((id) => {
        const t = findCachedTask(queryClient, id) ?? (id === task.id && task);
        return t ? [t] : [];
      });
      const patched = await Promise.allSettled(
        moved.map((t) => {
          const patch = movedTaskPatch(t, target, t.id !== task.id);
          return Object.keys(patch).length === 0
            ? null
            : patchTask({ id: t.id, version: t.version, patch });
        }),
      );
      const failed = patched.find((r) => r.status === 'rejected');

      if (!removeLines()) {
        for (let attempt = 0; ; attempt += 1) {
          const source = await fetchNote(client, fromNoteId);
          const bodyMarkdown = removeTaskBlock(source.bodyMarkdown, task.id);
          if (bodyMarkdown === source.bodyMarkdown) break;
          try {
            setCachedNote(
              queryClient,
              await updateNote(client, fromNoteId, {
                version: source.version,
                bodyMarkdown,
              }),
            );
            break;
          } catch (err) {
            if (attempt > 0 || !isStale(err)) throw err;
          }
        }
      }
      return { note, patchError: failed ? failed.reason : null };
    },
    [getClient, patchTask, queryClient],
  );
}
