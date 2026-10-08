import { useCallback, useState } from 'react';
import {
  taskRequestFromDraft,
  useCreateTaskMutation,
} from '@gagnechris/app-core';
import { taskLineDraft, type TaskLineDraft } from '@gagnechris/shared';
import { createUlid } from '../lib/ulid';
import {
  areaForNewItem,
  type NotebookAreaFilter,
} from './notebookAreaPreference';

type Options = {
  /** A note to show once the task is created, e.g. where it will appear. */
  hintAfterCreate?: (draft: TaskLineDraft) => string | null;
};

export function useQuickAddTask(
  areaFilter: NotebookAreaFilter,
  { hintAfterCreate }: Options = {},
) {
  const { mutateAsync, isPending } = useCreateTaskMutation();
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Resolves true once the task is created, so the caller can clear its input. */
  const submit = useCallback(
    async (text: string, today: string): Promise<boolean> => {
      const draft = taskLineDraft(text, today);
      setError(null);
      if (!draft) {
        setHint('Add a title before the date.');
        return false;
      }
      setHint(null);
      try {
        await mutateAsync(
          taskRequestFromDraft(createUlid(), draft, {
            area: areaForNewItem(areaFilter),
          }),
        );
      } catch {
        setError(`Could not add “${draft.title}”. Please try again.`);
        return false;
      }
      setHint(hintAfterCreate?.(draft) ?? null);
      return true;
    },
    [areaFilter, hintAfterCreate, mutateAsync],
  );

  const clearMessages = useCallback(() => {
    setHint(null);
    setError(null);
  }, []);

  return { submit, hint, error, pending: isPending, clearMessages };
}
