import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  queryKeys,
  useCreateTaskMutation,
  usePatchTaskMutation,
  useTasksByIds,
  type CreateTaskRequest,
  type NotebookArea,
  type Task,
} from '@gagnechris/app-core';
import type { Extension } from '@codemirror/state';
import { taskEmbedIds } from '@gagnechris/shared';
import {
  useTaskEmbedEditor,
  type TaskEmbedCreate,
} from '../kit/markdown/taskEmbeds';
import { TaskEmbedRow, type TaskEmbedView } from '../kit/tasks/TaskEmbedRow';
import { taskLineDraftKey, type TaskLineDraft } from '../kit/tasks/taskLine';
import { taskDue } from '../kit/tasks/taskDue';
import { taskScheduleLabel } from '../kit/tasks/taskScheduleLabel';
import { taskActionError } from './taskActionError';
import { useLocalToday } from './useLocalToday';
import { useTaskToggle } from './useTaskToggle';

export type EmbedNote = { id: string; area: NotebookArea };

export function taskRequestFromLine(
  id: string,
  draft: TaskLineDraft,
  note: EmbedNote,
): CreateTaskRequest {
  return {
    id,
    area: note.area,
    title: draft.title,
    description: '',
    priority: draft.priority,
    status: 'todo',
    startDate: draft.startDate,
    someday: draft.someday,
    dueDate: draft.dueDate,
    noteId: note.id,
    tags: [],
  };
}

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000];

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

const NO_EXTENSIONS: Extension[] = [];

type Pending = { draft: TaskLineDraft; failed: boolean };

export function useNoteTaskEmbeds({
  markdown,
  note,
  ensureNoteSaved,
  retryDelaysMs = RETRY_DELAYS_MS,
}: {
  markdown: string;
  /** Null turns embeds off (task descriptions). */
  note: EmbedNote | null;
  /** Called before retrying a create the API rejected for a missing note. */
  ensureNoteSaved?: () => Promise<unknown>;
  retryDelaysMs?: readonly number[];
}) {
  const today = useLocalToday();
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
      const body = taskRequestFromLine(id, draft, note);
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

  const viewOf = (id: string): TaskEmbedView => {
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
        schedule: taskScheduleLabel(task.startDate, today, task.someday),
        due: taskDue(task, today),
        onToggle: () => void toggle(task),
        to: `/tasks/${task.id}`,
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

  const renderEmbed = (id: string) => <TaskEmbedRow view={viewOf(id)} />;
  const { extensions, portals } = useTaskEmbedEditor({
    onCreate,
    renderEmbed,
  });

  if (!note) {
    return { extensions: NO_EXTENSIONS, portals: null, toggleError: null };
  }
  return {
    extensions,
    portals,
    renderEmbed,
    toggleError: toggleError ?? syncError,
  };
}
