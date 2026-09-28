import type { QueryClient, QueryKey } from '@tanstack/react-query';

export type OptimisticContext<TData> = {
  previous: TData | undefined;
};

/**
 * Documented optimistic update + rollback pattern for TanStack Query.
 *
 * Use for Notebook tasks (e.g. complete a task in Today and keep Tasks in sync):
 *
 * ```ts
 * const queryClient = useQueryClient()
 * const handlers = optimisticMutationHandlers<Task[], { id: string }>({
 *   queryClient,
 *   queryKey: queryKeys.tasks.list(),
 *   update: (tasks, { id }) =>
 *     tasks?.map((t) => (t.id === id ? { ...t, done: true } : t)),
 * })
 *
 * useMutation({
 *   mutationFn: ({ id }) => completeTask(id),
 *   ...handlers,
 * })
 * ```
 *
 * Flow: cancel in-flight reads → snapshot → apply optimistic data → on error
 * restore snapshot → onSettled invalidate so server truth wins.
 */
export const optimisticMutationHandlers = <TData, TVariables>({
  queryClient,
  queryKey,
  update,
  invalidate = true,
}: {
  queryClient: QueryClient;
  queryKey: QueryKey;
  update: (
    current: TData | undefined,
    variables: TVariables,
  ) => TData | undefined;
  /** When false, skip invalidateQueries (useful in unit tests). */
  invalidate?: boolean;
}) => ({
  onMutate: async (
    variables: TVariables,
  ): Promise<OptimisticContext<TData>> => {
    await queryClient.cancelQueries({ queryKey });
    const previous = queryClient.getQueryData<TData>(queryKey);
    queryClient.setQueryData<TData>(queryKey, (current) =>
      update(current, variables),
    );
    return { previous };
  },
  onError: (
    _error: unknown,
    _variables: TVariables,
    context: OptimisticContext<TData> | undefined,
  ) => {
    if (context) {
      queryClient.setQueryData(queryKey, context.previous);
    }
  },
  onSettled: () => {
    if (invalidate) {
      void queryClient.invalidateQueries({ queryKey });
    }
  },
});
