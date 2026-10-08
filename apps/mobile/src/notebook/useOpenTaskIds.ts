import { useTasksQuery } from '@gagnechris/app-core';
import { useMemo } from 'react';
import { useLoadAllPages } from './useLoadAllPages';

/** Every open task id, any area (a note can embed the other area's task); null until all pages are in. */
export function useOpenTaskIds(): ReadonlySet<string> | null {
  const open = useTasksQuery({ open: true, limit: 100 });
  useLoadAllPages(open);
  return useMemo(
    () =>
      open.data && !open.hasNextPage
        ? new Set(open.data.pages.flatMap((p) => p.items.map((t) => t.id)))
        : null,
    [open.data, open.hasNextPage],
  );
}
