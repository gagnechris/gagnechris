import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { useGetApiClient } from '../AppApiProvider.js';
import {
  completeTask,
  createTask,
  deleteTask,
  fetchTask,
  fetchTasksPage,
  reopenTask,
  updateTask,
  type CreateTaskRequest,
  type ListTasksQuery,
  type Task,
  type TasksPage,
  type UpdateTaskRequest,
} from './api.js';
import { setCachedTask } from './cache.js';
import { createVersionedResource } from './createVersionedResource.js';
import { queryKeys } from './keys.js';
import type { OptimisticContext } from './optimistic.js';

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
});

export const useTasksQuery = (filters: ListTasksQuery = {}) => {
  const getClient = useGetApiClient();
  const { cursor: _cursor, ...keyFilters } = filters;
  return useInfiniteQuery({
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

export const useDeleteTaskMutation = () => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: TaskVersionVars) =>
      deleteTask(getClient(), id, { version }),
    onSuccess: (task) => {
      setCachedTask(queryClient, task);
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
};

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

async function optimisticPatchTask(
  queryClient: QueryClient,
  vars: TaskVersionVars,
  patch: (task: Task) => Task,
): Promise<OptimisticContext<unknown>> {
  await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all });
  const snapshots: { queryKey: readonly unknown[]; previous: unknown }[] = [];

  const detailKey = queryKeys.tasks.detail(vars.id);
  const prevDetail = queryClient.getQueryData<Task>(detailKey);
  snapshots.push({ queryKey: detailKey, previous: prevDetail });
  queryClient.setQueryData<Task>(detailKey, (current) =>
    current && current.id === vars.id ? patch(current) : current,
  );

  for (const [queryKey, data] of queryClient.getQueriesData<TasksListData>({
    queryKey: [...queryKeys.tasks.all, 'list'],
  })) {
    snapshots.push({ queryKey, previous: data });
    queryClient.setQueryData<TasksListData>(queryKey, (current) =>
      patchTaskInListPages(current, vars.id, patch),
    );
  }

  return {
    previous: snapshots[0]?.previous,
    snapshots,
  };
}

function restoreOptimistic(
  queryClient: QueryClient,
  context: OptimisticContext<unknown> | undefined,
) {
  if (!context) return;
  for (const snap of context.snapshots) {
    queryClient.setQueryData(snap.queryKey, snap.previous);
  }
}

export const useCompleteTaskMutation = () => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: TaskVersionVars) =>
      completeTask(getClient(), vars.id, { version: vars.version }),
    onMutate: (vars) => {
      const now = new Date().toISOString();
      return optimisticPatchTask(queryClient, vars, (t) => ({
        ...t,
        status: 'done',
        completedAt: t.completedAt ?? now,
        version: t.version + 1,
      }));
    },
    onError: (_error, _vars, context) => {
      restoreOptimistic(queryClient, context);
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
      optimisticPatchTask(queryClient, vars, (t) => ({
        ...t,
        status: 'todo',
        completedAt: null,
        version: t.version + 1,
      })),
    onError: (_error, _vars, context) => {
      restoreOptimistic(queryClient, context);
    },
    onSuccess: (task) => {
      setCachedTask(queryClient, task);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
};

export const useSetTaskCache = taskResource.useSetCache;
