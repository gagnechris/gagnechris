import { useCallback, useState } from 'react';
import type { Task } from './api.js';
import { taskActionError } from './taskActionError.js';
import { useCompleteTaskMutation, useReopenTaskMutation } from './tasks.js';

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
        setError(
          taskActionError(done ? 'reopen' : 'complete', task.title, err),
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
