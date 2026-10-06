import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  useNotesByIds,
  usePatchTaskMutation,
  useTasksQuery,
  type NotebookArea,
  type Task,
  type TaskPatch,
} from '@gagnechris/app-core';
import {
  bucketTodayTasks,
  stillOpenSource,
  type SourceNote,
} from '../kit/tasks/todayTaskBuckets';
import type { StillOpenRow } from '../kit/tasks/TodayPanels';
import { taskDue } from '../kit/tasks/taskDue';

/** Every open task showing on `day`, and every one starting after it. */
export function useTodayTasks({
  area,
  day,
  embeddedIds,
}: {
  area: NotebookArea | undefined;
  day: string;
  /** Null until the day's note has loaded, so its tasks never flash as Still open. */
  embeddedIds: ReadonlySet<string> | null;
}) {
  const showing = useTasksQuery({
    area,
    open: true,
    startOnOrBefore: day,
    today: day,
    limit: 100,
  });
  const later = useTasksQuery({
    area,
    open: true,
    startAfter: day,
    today: day,
    limit: 100,
  });
  useLoadAllPages(showing);
  useLoadAllPages(later);

  const buckets = useMemo(
    () =>
      bucketTodayTasks(
        [
          ...(showing.data?.pages.flatMap((p) => p.items) ?? []),
          ...(later.data?.pages.flatMap((p) => p.items) ?? []),
        ],
        { day, embeddedIds: embeddedIds ?? new Set() },
      ),
    [showing.data, later.data, day, embeddedIds],
  );

  const sourceNoteIds = useMemo(
    () => [
      ...new Set(
        buckets.stillOpen
          .filter((t) => t.startDate === null && t.noteId)
          .map((t) => t.noteId!),
      ),
    ],
    [buckets.stillOpen],
  );
  const noteResults = useNotesByIds(sourceNoteIds);
  const notesById = new Map<string, SourceNote>();
  sourceNoteIds.forEach((id, i) => {
    const note = noteResults[i]?.data;
    if (note && !note.deleted) notesById.set(id, note);
  });

  const stillOpenRows: StillOpenRow[] = buckets.stillOpen.map((task) => {
    const source = stillOpenSource(
      task,
      day,
      task.noteId ? notesById.get(task.noteId) : undefined,
    );
    return {
      task,
      source,
      sourceTo: source.noteId ? `/notes/${source.noteId}` : `/tasks/${task.id}`,
      to: `/tasks/${task.id}`,
      due: taskDue(task, day),
    };
  });

  const showingLoading =
    embeddedIds === null || showing.isPending || showing.hasNextPage;
  const laterLoading =
    embeddedIds === null || later.isPending || later.hasNextPage;

  return {
    buckets,
    stillOpenRows,
    loading: { stillOpen: showingLoading, comingUp: laterLoading },
    loadError: showing.isError || later.isError,
  };
}

/** Snooze, Drop and Do today: the row moves at once, and comes back if the write fails. */
export function useTaskPatch() {
  const { mutateAsync } = usePatchTaskMutation();
  const [error, setError] = useState<string | null>(null);
  const patch = useCallback(
    async (
      task: Pick<Task, 'id' | 'title' | 'version'>,
      change: TaskPatch,
      verb?: string,
    ) => {
      setError(null);
      const action = verb ?? (change.status === 'dropped' ? 'drop' : 'snooze');
      try {
        await mutateAsync({
          id: task.id,
          version: task.version,
          patch: change,
        });
      } catch (err) {
        const conflict =
          err instanceof ApiError && (err.status === 409 || err.status === 412);
        setError(
          conflict
            ? `Could not ${action} “${task.title}”: it changed on another device. Reload and try again.`
            : `Could not ${action} “${task.title}”. Please try again.`,
        );
      }
    },
    [mutateAsync],
  );
  return { patch, error };
}

export function useLoadAllPages(query: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isError: boolean;
  fetchNextPage: () => Promise<unknown>;
}) {
  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = query;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage]);
}
