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
