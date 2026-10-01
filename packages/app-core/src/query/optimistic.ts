import type { QueryClient, QueryKey } from '@tanstack/react-query';

export type OptimisticTarget<TData, TVariables> = {
  queryKey: QueryKey;
  update: (
    current: TData | undefined,
    variables: TVariables,
  ) => TData | undefined;
};

export type OptimisticContext<TData> = {
  /** @deprecated Prefer `snapshots` for multi-key rollbacks. */
  previous: TData | undefined;
  snapshots: { queryKey: QueryKey; previous: unknown }[];
};

type OptimisticHandlersArgs<TData, TVariables> = {
  queryClient: QueryClient;
  /** When false, skip invalidateQueries (useful in unit tests). */
  invalidate?: boolean;
} & (
  | {
      queryKey: QueryKey;
      update: (
        current: TData | undefined,
        variables: TVariables,
      ) => TData | undefined;
      targets?: never;
    }
  | {
      targets: OptimisticTarget<TData, TVariables>[];
      queryKey?: never;
      update?: never;
    }
);

/**
 * Documented optimistic update + rollback pattern for TanStack Query.
 *
 * Single key (legacy):
 *
 * ```ts
 * optimisticMutationHandlers<Task[], { id: string }>({
 *   queryClient,
 *   queryKey: queryKeys.tasks.list(),
 *   update: (tasks, { id }) =>
 *     tasks?.map((t) => (t.id === id ? { ...t, done: true } : t)),
 * })
 * ```
 *
 * Multi-key (Today + Tasks list stay in sync — CHR-158):
 *
 * ```ts
 * optimisticMutationHandlers<Task[], { id: string }>({
 *   queryClient,
 *   targets: [
 *     { queryKey: queryKeys.today.tasks(), update: markDone },
 *     { queryKey: queryKeys.tasks.list(), update: markDone },
 *   ],
 * })
 * ```
 *
 * Flow: cancel in-flight reads → snapshot each target → apply optimistic data →
 * on error restore each snapshot → onSettled invalidate so server truth wins.
 */
export const optimisticMutationHandlers = <TData, TVariables>(
  args: OptimisticHandlersArgs<TData, TVariables>,
) => {
  const { queryClient, invalidate = true } = args;
  const targets: OptimisticTarget<TData, TVariables>[] =
    args.targets ??
    (args.queryKey && args.update
      ? [{ queryKey: args.queryKey, update: args.update }]
      : []);

  return {
    onMutate: async (
      variables: TVariables,
    ): Promise<OptimisticContext<TData>> => {
      const snapshots: { queryKey: QueryKey; previous: unknown }[] = [];
      for (const target of targets) {
        await queryClient.cancelQueries({ queryKey: target.queryKey });
        const previous = queryClient.getQueryData<TData>(target.queryKey);
        snapshots.push({ queryKey: target.queryKey, previous });
        queryClient.setQueryData<TData>(target.queryKey, (current) =>
          target.update(current, variables),
        );
      }
      return {
        previous: snapshots[0]?.previous as TData | undefined,
        snapshots,
      };
    },
    onError: (
      _error: unknown,
      _variables: TVariables,
      context: OptimisticContext<TData> | undefined,
    ) => {
      if (!context) return;
      for (const snap of context.snapshots) {
        queryClient.setQueryData(snap.queryKey, snap.previous);
      }
    },
    onSettled: () => {
      if (!invalidate) return;
      for (const target of targets) {
        void queryClient.invalidateQueries({ queryKey: target.queryKey });
      }
    },
  };
};
