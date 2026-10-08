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
import { ApiError, type NotebookArea, type Task } from './api.js';
import { queryKeys } from './keys.js';
import { taskActionError } from './taskActionError.js';
import { taskRequestFromDraft } from './taskRequest.js';
import {
  useCreateTaskMutation,
  usePatchTaskMutation,
  useTasksByIds,
} from './tasks.js';
import { useTaskToggle } from './useTaskToggle.js';

export type EmbedNote = { id: string; area: NotebookArea };

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
    };

export const EMBED_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000];

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

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

type Pending = { draft: TaskLineDraft; failed: boolean };

/**
 * Creates the task behind each converted line (retrying until the API
 * answers), keeps it in step with later edits of an undone conversion, and
 * reports what each embed should show.
 */
export function useNoteTaskEmbedSync({
  markdown,
  note,
  today,
  ensureNoteSaved,
  retryDelaysMs = EMBED_RETRY_DELAYS_MS,
}: {
  markdown: string;
  /** Null turns embeds off (task descriptions). */
  note: EmbedNote | null;
  today: string;
  /** Called before retrying a create the API rejected for a missing note. */
  ensureNoteSaved?: () => Promise<unknown>;
  retryDelaysMs?: readonly number[];
}) {
  const queryClient = useQueryClient();
  const { mutateAsync: createTask } = useCreateTaskMutation();
  const { mutateAsync: patchTask } = usePatchTaskMutation();
  const { toggle, error: toggleError } = useTaskToggle();
  const [syncError, setSyncError] = useState<string | null>(null);
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

  const ids = useMemo(
    () => (note ? taskEmbedIds(markdown) : []),
    [markdown, note],
  );
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

  return { onCreate, stateOf, error: toggleError ?? syncError };
}
