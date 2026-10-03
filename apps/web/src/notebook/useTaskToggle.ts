import { useCallback, useState } from 'react';
import {
  ApiError,
  useCompleteTaskMutation,
  useReopenTaskMutation,
  type Task,
} from '@gagnechris/app-core';

/**
 * The mutations already roll back their optimistic patch; this surfaces the
 * error instead of leaving an unhandled rejection.
 */
export function useTaskToggle() {
  const completeMutation = useCompleteTaskMutation();
  const reopenMutation = useReopenTaskMutation();
  const [error, setError] = useState<string | null>(null);
  const { mutateAsync: complete } = completeMutation;
  const { mutateAsync: reopen } = reopenMutation;

  const toggle = useCallback(
    async (task: Pick<Task, 'id' | 'title' | 'status' | 'version'>) => {
      const done = task.status === 'done';
      setError(null);
      try {
        if (done) {
          await reopen({ id: task.id, version: task.version });
        } else {
          await complete({ id: task.id, version: task.version });
        }
      } catch (err) {
        const action = done ? 'reopen' : 'complete';
        const conflict =
          err instanceof ApiError && (err.status === 409 || err.status === 412);
        setError(
          conflict
            ? `Could not ${action} “${task.title}”: it changed on another device. Reload and try again.`
            : `Could not ${action} “${task.title}”. Please try again.`,
        );
      }
    },
    [complete, reopen],
  );

  return {
    toggle,
    error,
    pending: completeMutation.isPending || reopenMutation.isPending,
  };
}
