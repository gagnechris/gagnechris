import { useMemo } from 'react';
import { useTaskPatch, useTaskToggle, type Task } from '@gagnechris/app-core';
import type { TaskSchedule, TodayTaskBuckets } from '@gagnechris/shared';

/** Row actions by task id for every Today task list, stable while the buckets are. */
export function useTodayActions(
  buckets: Pick<TodayTaskBuckets<Task>, 'stillOpen' | 'comingUp'>,
) {
  const { toggle, error: toggleError } = useTaskToggle();
  const { patch, error: patchError } = useTaskPatch();
  const { stillOpen, comingUp } = buckets;

  const actions = useMemo(() => {
    const byId = new Map<string, Task>(
      [...stillOpen, ...comingUp.flatMap((d) => d.tasks)].map((t) => [t.id, t]),
    );
    const withTask = (id: string, run: (task: Task) => void) => {
      const task = byId.get(id);
      if (task) run(task);
    };
    return {
      onToggle: (id: string) => withTask(id, (task) => void toggle(task)),
      onSnooze: (id: string, schedule: TaskSchedule) =>
        withTask(id, (task) => void patch(task, schedule)),
      onDrop: (id: string) =>
        withTask(id, (task) => void patch(task, { status: 'dropped' })),
    };
  }, [stillOpen, comingUp, toggle, patch]);

  return { ...actions, error: patchError ?? toggleError ?? null };
}
