import {
  taskDue,
  taskEmbedIds,
  taskLineDraftKey,
  taskScheduleLabel,
  type TaskDue,
  type TaskLineDraft,
} from '@gagnechris/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGetApiClient } from '../AppApiProvider.js';
import { useLatest } from '../useLatest.js';
import {
  ApiError,
  fetchNotesPage,
  type NotebookArea,
  type Task,
} from './api.js';
import { queryKeys } from './keys.js';
import { taskActionError } from './taskActionError.js';
import { taskRequestFromDraft } from './taskRequest.js';
import {
  useCreateTaskMutation,
  useDeleteTaskMutation,
  usePatchTaskMutation,
  useTasksByIds,
} from './tasks.js';
import { useTaskToggle } from './useTaskToggle.js';

/** `date` is set on a daily note. */
export type EmbedNote = {
  id: string;
  area: NotebookArea;
  date?: string | null;
};

/** A `[ ] …` line the editor just turned into `{{task:id}}`. */
export type TaskEmbedCreate = { id: string; draft: TaskLineDraft };

export type TaskEmbedState =
  | { kind: 'loading' }
  | { kind: 'deleted' }
  | { kind: 'failed'; title: string; onRetry: () => void }
  | {
      kind: 'task';
      task: Pick<Task, 'title' | 'status' | 'priority'>;
      /** The saved task; absent while its create is in flight. */
      saved?: Task;
      /** Short label such as `@Tue`; omitted when unscheduled. */
      schedule?: string;
      due?: TaskDue | null;
      /** Not saved yet, so it cannot be toggled. */
      pending?: boolean;
      onToggle: () => void;
      /** Saves a new title; absent until the task is saved. */
      onRename?: (title: string) => void;
    };

export const EMBED_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000];

/** How long a removed line can come back (undo, paste) before its task is deleted. */
export const EMBED_DELETE_GRACE_MS = 3_000;

/** The note's first save has not landed yet; any other 400 is final. */
const isNoteNotSavedYet = (error: unknown) =>
  error instanceof ApiError &&
  error.status === 400 &&
  error.fields?.noteId === 'not_found';

const isRetryable = (error: unknown) =>
  !(error instanceof ApiError) ||
  error.status === 0 ||
  isNoteNotSavedYet(error) ||
  error.status === 408 ||
  error.status === 429 ||
  error.status >= 500;

/** Already gone: deleted elsewhere, or never existed. */
const isGone = (error: unknown) =>
  error instanceof ApiError &&
  (error.status === 404 ||
    (error.current as { deleted?: boolean } | undefined)?.deleted === true);

/**
 * Whether a note other than `noteId` still shows the task, as a carried-in
 * task's home day does. Unknown (offline) counts as shown when the task's home
 * is another note, so a removed line never deletes what still lives there.
 */
const shownElsewhere = async (
  client: Parameters<typeof fetchNotesPage>[0],
  task: Task,
  noteId: string,
): Promise<boolean> => {
  try {
    const { items } = await fetchNotesPage(client, {
      taskId: task.id,
      limit: 10,
    });
    return items.some((n) => n.id !== noteId);
  } catch {
    return task.noteId !== null && task.noteId !== noteId;
  }
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

type Pending = { draft: TaskLineDraft; failed: boolean };

/**
 * Creates the task behind each converted line (retrying until the API
 * answers), keeps it in step with later edits of an undone conversion,
 * deletes the task when its line is deleted and no other note shows it, and
 * reports what each embed should show.
 */
export function useNoteTaskEmbedSync({
  markdown,
  note,
  today,
  ensureNoteSaved,
  removeEmbeds,
  retryDelaysMs = EMBED_RETRY_DELAYS_MS,
  deleteGraceMs = EMBED_DELETE_GRACE_MS,
}: {
  markdown: string;
  /** Null turns embeds off (task descriptions). */
  note: EmbedNote | null;
  today: string;
  /** Called before retrying a create the API rejected for a missing note. */
  ensureNoteSaved?: () => Promise<unknown>;
  /** Takes the lines of deleted tasks out of the note. */
  removeEmbeds?: (ids: ReadonlySet<string>) => void;
  retryDelaysMs?: readonly number[];
  deleteGraceMs?: number;
}) {
  const queryClient = useQueryClient();
  const getClient = useGetApiClient();
  const { mutateAsync: createTask } = useCreateTaskMutation();
  const { mutateAsync: patchTask } = usePatchTaskMutation();
  const { mutateAsync: deleteTask } = useDeleteTaskMutation();
  const { toggle, error: toggleError } = useTaskToggle();
  const [syncError, setSyncError] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [pending, setPending] = useState<ReadonlyMap<string, Pending>>(
    () => new Map(),
  );
  // Ids sent this session: a create is fired once per id, then only retried.
  const submitted = useRef(new Set<string>());
  // The line's latest text per id, and the create then edits queued for it.
  const latest = useRef(new Map<string, TaskLineDraft>());
  const chains = useRef(new Map<string, Promise<Task | null>>());
  const noteRef = useRef(note);
  const ensureSavedRef = useRef(ensureNoteSaved);
  useEffect(() => {
    noteRef.current = note;
    ensureSavedRef.current = ensureNoteSaved;
  }, [note, ensureNoteSaved]);

  const setPendingEntry = useCallback(
    (id: string, entry: Pending | null) =>
      setPending((prev) => {
        const next = new Map(prev);
        if (entry) next.set(id, entry);
        else next.delete(id);
        return next;
      }),
    [],
  );

  const runCreate = useCallback(
    async (id: string, draft: TaskLineDraft): Promise<Task | null> => {
      const note = noteRef.current;
      if (!note) return null;
      const body = taskRequestFromDraft(id, draft, {
        area: note.area,
        noteId: note.id,
      });
      setPendingEntry(id, { draft, failed: false });
      for (let attempt = 0; ; attempt += 1) {
        try {
          const task = await createTask(body);
          setPendingEntry(id, null);
          return task;
        } catch (error) {
          if (!isRetryable(error) || attempt >= retryDelaysMs.length) {
            setPendingEntry(id, { draft, failed: true });
            return null;
          }
          if (isNoteNotSavedYet(error)) {
            await ensureSavedRef.current?.();
          }
          await wait(retryDelaysMs[attempt]!);
        }
      }
    },
    [createTask, retryDelaysMs, setPendingEntry],
  );

  /** Brings the task in line with the latest text of its line. */
  const syncDraft = useCallback(
    async (task: Task): Promise<Task> => {
      const draft = latest.current.get(task.id);
      if (!draft || taskLineDraftKey(draft) === taskLineDraftKey(task)) {
        return task;
      }
      const current =
        queryClient.getQueryData<Task>(queryKeys.tasks.detail(task.id)) ?? task;
      setSyncError(null);
      try {
        return await patchTask({
          id: task.id,
          version: current.version,
          patch: {
            title: draft.title,
            startDate: draft.startDate,
            someday: draft.someday,
            dueDate: draft.dueDate,
            priority: draft.priority,
          },
        });
      } catch (err) {
        setSyncError(taskActionError('update', current.title, err));
        return current;
      }
    },
    [patchTask, queryClient],
  );

  const startCreate = useCallback(
    (id: string, draft: TaskLineDraft) => {
      chains.current.set(
        id,
        runCreate(id, draft).then((task) => (task ? syncDraft(task) : null)),
      );
    },
    [runCreate, syncDraft],
  );

  const onCreate = useCallback(
    ({ id, draft }: TaskEmbedCreate) => {
      latest.current.set(id, draft);
      if (!submitted.current.has(id)) {
        submitted.current.add(id);
        startCreate(id, draft);
        return;
      }
      // An undone conversion was edited, then left: the same task follows it.
      setPending((prev) => {
        const entry = prev.get(id);
        return entry ? new Map(prev).set(id, { ...entry, draft }) : prev;
      });
      const prev = chains.current.get(id) ?? Promise.resolve(null);
      chains.current.set(
        id,
        prev.then((task) => (task ? syncDraft(task) : null)),
      );
    },
    [startCreate, syncDraft],
  );

  // One rename at a time per task, each on the version the last one left.
  const renames = useRef(new Map<string, Promise<void>>());
  const rename = useCallback(
    (task: Task, title: string) => {
      // A later re-conversion of this line must not patch the old title back.
      const draft = latest.current.get(task.id);
      if (draft) latest.current.set(task.id, { ...draft, title });
      const prev = renames.current.get(task.id) ?? Promise.resolve();
      const next = prev.then(async () => {
        const current =
          queryClient.getQueryData<Task>(queryKeys.tasks.detail(task.id)) ??
          task;
        if (title === current.title) return;
        setRenameError(null);
        try {
          await patchTask({
            id: task.id,
            version: current.version,
            patch: { title },
          });
        } catch (err) {
          setRenameError(taskActionError('rename', current.title, err));
        }
      });
      renames.current.set(task.id, next);
    },
    [patchTask, queryClient],
  );

  const ids = useMemo(
    () => (note ? taskEmbedIds(markdown) : []),
    [markdown, note],
  );
  const idsRef = useLatest(ids);

  const removeTask = useCallback(
    async (id: string) => {
      const created = await (chains.current.get(id) ?? Promise.resolve(null));
      await renames.current.get(id);
      if (idsRef.current.includes(id)) return;
      const task =
        queryClient.getQueryData<Task>(queryKeys.tasks.detail(id)) ?? created;
      if (!task || task.deleted) return;
      const noteId = noteRef.current?.id;
      if (noteId && (await shownElsewhere(getClient(), task, noteId))) return;
      if (idsRef.current.includes(id)) return;
      setSyncError(null);
      try {
        await deleteTask({ id, version: task.version });
      } catch (err) {
        if (!isGone(err)) {
          setSyncError(taskActionError('delete', task.title, err));
        }
      }
    },
    [deleteTask, getClient, idsRef, queryClient],
  );

  // Deletes wait out the grace period, and run at once if the note closes.
  const deletes = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const onRemoved = useCallback(
    (removed: readonly string[]) => {
      for (const id of removed) {
        clearTimeout(deletes.current.get(id));
        deletes.current.set(
          id,
          setTimeout(() => {
            deletes.current.delete(id);
            void removeTask(id);
          }, deleteGraceMs),
        );
      }
    },
    [deleteGraceMs, removeTask],
  );
  useEffect(() => {
    for (const id of ids) {
      clearTimeout(deletes.current.get(id));
      deletes.current.delete(id);
    }
  }, [ids]);
  useEffect(() => {
    const pendingDeletes = deletes.current;
    return () => {
      for (const [id, timer] of pendingDeletes) {
        clearTimeout(timer);
        void removeTask(id);
      }
      pendingDeletes.clear();
    };
  }, [removeTask]);
  const skip = useMemo(() => new Set(pending.keys()), [pending]);
  const results = useTasksByIds(ids, { skip });
  const byId = new Map(ids.map((id, i) => [id, results[i]!]));

  const stateOf = (id: string): TaskEmbedState => {
    const waiting = pending.get(id);
    if (waiting) {
      return waiting.failed
        ? {
            kind: 'failed',
            title: waiting.draft.title,
            onRetry: () =>
              startCreate(id, latest.current.get(id) ?? waiting.draft),
          }
        : {
            kind: 'task',
            task: {
              title: waiting.draft.title,
              status: 'todo',
              priority: waiting.draft.priority,
            },
            pending: true,
            onToggle: () => {},
          };
    }
    const result = byId.get(id);
    const task: Task | undefined = result?.data;
    if (task && !task.deleted) {
      return {
        kind: 'task',
        task,
        saved: task,
        schedule: taskScheduleLabel(task.startDate, today, task.someday),
        due: taskDue(task, today),
        onToggle: () => void toggle(task),
        onRename: (title) => rename(task, title),
      };
    }
    if (
      task?.deleted ||
      (result?.error instanceof ApiError && result.error.status === 404)
    ) {
      return { kind: 'deleted' };
    }
    return { kind: 'loading' };
  };

  const goneKey = ids
    .filter((id) => {
      if (pending.has(id)) return false;
      const result = byId.get(id);
      return (
        result?.data?.deleted === true ||
        (!result?.data &&
          result?.error instanceof ApiError &&
          result.error.status === 404)
      );
    })
    .join(',');
  const removeEmbedsRef = useLatest(removeEmbeds);
  useEffect(() => {
    if (goneKey) removeEmbedsRef.current?.(new Set(goneKey.split(',')));
  }, [goneKey, removeEmbedsRef]);

  return {
    onCreate,
    onRemoved,
    stateOf,
    error: toggleError ?? renameError ?? syncError,
  };
}
