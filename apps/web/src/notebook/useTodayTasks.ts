import { useTodayTasks as useTodayTaskBuckets } from '@gagnechris/app-core';
import type { StillOpenRow } from '../kit/tasks/TodayPanels';

/** The shared Today buckets, with each Still open row's routes. */
export function useTodayTasks(
  options: Parameters<typeof useTodayTaskBuckets>[0],
) {
  const today = useTodayTaskBuckets(options);
  const stillOpenRows: StillOpenRow[] = today.stillOpenRows.map((row) => ({
    ...row,
    sourceTo: row.source.noteId
      ? `/notes/${row.source.noteId}`
      : `/tasks/${row.task.id}`,
    to: `/tasks/${row.task.id}`,
  }));
  return { ...today, stillOpenRows };
}
