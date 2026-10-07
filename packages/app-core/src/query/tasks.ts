import { useMemo } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useGetApiClient } from '../AppApiProvider.js';
import {
  ApiError,
  completeTask,
  createTask,
  deleteTask,
  fetchTask,
  fetchTasksBatch,
  fetchTasksPage,
  reopenTask,
  updateTask,
  type CreateTaskRequest,
  type ListTasksQuery,
  type Task,
  type TasksPage,
  type UpdateTaskRequest,
} from './api.js';
import { setCachedTask, setDetail } from './cache.js';
import {
  createVersionedResource,
  useDeleteEntityMutation,
} from './createVersionedResource.js';
import { queryKeys } from './keys.js';
import { NOTEBOOK_TOO_LARGE_MESSAGE } from './tooLarge.js';

export type TaskResourceParams = { id: string };

export type TaskVersionVars = { id: string; version: number };

type TasksListData = InfiniteData<TasksPage, string | undefined>;

export const taskResource = createVersionedResource<Task, TaskResourceParams>({
  queryKey: ({ id }) => queryKeys.tasks.detail(id),
  fetch: (client, { id }) => fetchTask(client, id),
  update: (client, { id }, body) =>
    updateTask(client, id, body as UpdateTaskRequest),
  delete: (client, { id }, body) => deleteTask(client, id, body),
  setCache: setCachedTask,
  tooLargeMessage: NOTEBOOK_TOO_LARGE_MESSAGE,
});

export const useTasksQuery = (
  filters: ListTasksQuery = {},
  options: { enabled?: boolean } = {},
) => {
  const getClient = useGetApiClient();
  const { cursor: _cursor, ...keyFilters } = filters;
  return useInfiniteQuery({
    enabled: options.enabled ?? true,
    queryKey: queryKeys.tasks.list(keyFilters),
    queryFn: ({ pageParam }) =>
      fetchTasksPage(getClient(), {
        ...filters,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
  });
};

export type TaskByIdResult = { data: Task | undefined; error: unknown };

const TASK_BATCH_MAX_IDS = 100;

/**
 * Detail-cache reads that never fetch on their own; they rerender on every
 * cache write. The query function is real because other observers of the
 * same detail key (the task page) may refetch through it.
 */
export const useCachedTasks = (ids: readonly string[]) => {
  const getClient = useGetApiClient();
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: queryKeys.tasks.detail(id),
      queryFn: () => fetchTask(getClient(), id),
      enabled: false,
    })),
  });
};

/**
 * One `POST /tasks/batch` for every id (refetched as one on focus or after a
 * write), which seeds the detail caches the results read from. An id the
 * batch leaves out reports a 404, as its GET would.
 */
export const useTasksByIds = (
  ids: readonly string[],
  options: { skip?: ReadonlySet<string> } = {},
): TaskByIdResult[] => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  const { skip } = options;
  const wanted = useMemo(
    () => [...new Set(ids.filter((id) => !skip?.has(id)))].sort(),
    [ids, skip],
  );
  const batch = useQuery({
    queryKey: queryKeys.tasks.batch(wanted),
    queryFn: async (): Promise<string[]> => {
      const found: string[] = [];
      for (let i = 0; i < wanted.length; i += TASK_BATCH_MAX_IDS) {
        const chunk = wanted.slice(i, i + TASK_BATCH_MAX_IDS);
        for (const task of await fetchTasksBatch(getClient(), chunk)) {
          setDetail(queryClient, queryKeys.tasks.detail(task.id), task);
          found.push(task.id);
        }
      }
      return found;
    },
    enabled: wanted.length > 0,
  });
  const cached = useCachedTasks(ids);
  const found = useMemo(() => new Set(batch.data), [batch.data]);
  return ids.map((id, i) => {
    const data = cached[i]?.data;
    if (data) return { data, error: null };
    if (batch.data && !skip?.has(id) && !found.has(id)) {
      return {
        data: undefined,
        error: new ApiError('Task not found.', 404, 'not_found'),
      };
    }
    return { data: undefined, error: batch.error };
  });
};

export const useCreateTaskMutation = () => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTaskRequest) => createTask(getClient(), body),
    onSuccess: (task) => {
      setCachedTask(queryClient, task);
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
};

export const useDeleteTaskMutation = () =>
  useDeleteEntityMutation(deleteTask, setCachedTask, (queryClient) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
  });

const patchTaskInListPages = (
  prev: TasksListData | undefined,
  id: string,
  patch: (task: Task) => Task,
): TasksListData | undefined => {
  if (!prev) return prev;
  return {
    ...prev,
    pages: prev.pages.map((page) => ({
      ...page,
      items: page.items.map((t) => (t.id === id ? patch(t) : t)),
    })),
  };
};

type TaskSnapshot = {
  entries: { queryKey: QueryKey; previous: unknown }[];
  /** Set when the optimistic write may have created the detail entry. */
  removeDetail?: QueryKey;
};

/** Cancels task fetches and records the detail and every list, for `rollbackTask`. */
async function snapshotTask(
  queryClient: QueryClient,
  id: string,
): Promise<TaskSnapshot> {
  await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all });
  const detailKey = queryKeys.tasks.detail(id);
  return {
    entries: [
      { queryKey: detailKey, previous: queryClient.getQueryData(detailKey) },
      ...queryClient
        .getQueriesData({ queryKey: [...queryKeys.tasks.all, 'list'] })
        .map(([queryKey, previous]) => ({ queryKey, previous })),
    ],
  };
}

function rollbackTask(
  queryClient: QueryClient,
  snapshot: TaskSnapshot | undefined,
) {
  if (!snapshot) return;
  for (const { queryKey, previous } of snapshot.entries) {
    if (previous !== undefined) queryClient.setQueryData(queryKey, previous);
  }
  // A stale copy would outrank the next fetch by version.
  if (snapshot.removeDetail) {
    queryClient.removeQueries({ queryKey: snapshot.removeDetail, exact: true });
  }
}

/** Patches cached copies in place; lists keep the task whether or not it still matches. */
async function patchTaskInPlace(
  queryClient: QueryClient,
  id: string,
  patch: (task: Task) => Task,
): Promise<TaskSnapshot> {
  const snapshot = await snapshotTask(queryClient, id);
  queryClient.setQueryData<Task>(queryKeys.tasks.detail(id), (current) =>
    current && current.id === id ? patch(current) : current,
  );
  for (const { queryKey } of snapshot.entries.slice(1)) {
    queryClient.setQueryData<TasksListData>(queryKey, (current) =>
      patchTaskInListPages(current, id, patch),
    );
  }
  return snapshot;
}

export const useCompleteTaskMutation = () => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: TaskVersionVars) =>
      completeTask(getClient(), vars.id, { version: vars.version }),
    onMutate: (vars) => {
      const now = new Date().toISOString();
      return patchTaskInPlace(queryClient, vars.id, (t) => ({
        ...t,
        status: 'done',
        completedAt: t.completedAt ?? now,
        version: t.version + 1,
      }));
    },
    onError: (_error, _vars, snapshot) => {
      rollbackTask(queryClient, snapshot);
    },
    onSuccess: (task) => {
      setCachedTask(queryClient, task);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
};

export const useReopenTaskMutation = () => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: TaskVersionVars) =>
      reopenTask(getClient(), vars.id, { version: vars.version }),
    onMutate: (vars) =>
      patchTaskInPlace(queryClient, vars.id, (t) => ({
        ...t,
        status: t.status === 'done' ? 'todo' : t.status,
        completedAt: null,
        version: t.version + 1,
      })),
    onError: (_error, _vars, snapshot) => {
      rollbackTask(queryClient, snapshot);
    },
    onSuccess: (task) => {
      setCachedTask(queryClient, task);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
};

/** Fields a patch may change; `someday` wins over `startDate`, as on the server. */
export type TaskPatch = Partial<
  Pick<
    Task,
    'status' | 'startDate' | 'someday' | 'title' | 'priority' | 'dueDate'
  >
>;

export type TaskPatchVars = TaskVersionVars & { patch: TaskPatch };

export const applyTaskPatch = (task: Task, patch: TaskPatch): Task => {
  const someday =
    patch.someday ??
    (patch.startDate !== undefined && patch.startDate !== null
      ? false
      : task.someday);
  const status = patch.status ?? task.status;
  return {
    ...task,
    title: patch.title ?? task.title,
    priority: patch.priority ?? task.priority,
    dueDate: patch.dueDate !== undefined ? patch.dueDate : task.dueDate,
    status,
    someday,
    startDate: someday
      ? null
      : patch.startDate !== undefined
        ? patch.startDate
        : task.startDate,
    completedAt: status === 'done' ? task.completedAt : null,
    version: task.version + 1,
  };
};

const findCachedTask = (
  queryClient: QueryClient,
  id: string,
): Task | undefined => {
  const detail = queryClient.getQueryData<Task>(queryKeys.tasks.detail(id));
  if (detail) return detail;
  for (const [, data] of queryClient.getQueriesData<TasksListData>({
    queryKey: [...queryKeys.tasks.all, 'list'],
  })) {
    for (const page of data?.pages ?? []) {
      const found = page.items.find((t) => t.id === id);
      if (found) return found;
    }
  }
  return undefined;
};

/**
 * Applies the patch to every cached copy before the request: lists the task
 * no longer matches drop it at once, and lists it now matches gain it.
 */
export const usePatchTaskMutation = () => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version, patch }: TaskPatchVars) =>
      updateTask(getClient(), id, { version, ...patch }),
    onMutate: async ({ id, patch }): Promise<TaskSnapshot> => {
      const snapshot = await snapshotTask(queryClient, id);
      const current = findCachedTask(queryClient, id);
      if (current) setCachedTask(queryClient, applyTaskPatch(current, patch));
      return snapshot.entries[0]!.previous === undefined
        ? { ...snapshot, removeDetail: queryKeys.tasks.detail(id) }
        : snapshot;
    },
    onError: (_error, _vars, snapshot) => {
      rollbackTask(queryClient, snapshot);
    },
    onSuccess: (task) => {
      setCachedTask(queryClient, task);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
};
