import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useGetApiClient } from '../AppApiProvider.js';
import { peekPendingFlush, takePendingFlush } from '../pendingFlushes.js';
import {
  useQueuedAutosave,
  type AutosaveResult,
} from '../useQueuedAutosave.js';
import { ApiError, updateTask, type Task } from './api.js';
import { setCachedTask } from './cache.js';
import { queryKeys } from './keys.js';
import { NOTEBOOK_TOO_LARGE_MESSAGE } from './tooLarge.js';

const isStaleVersion = (status: number, error: string | undefined) =>
  status === 412 ||
  (status === 409 && (error === undefined || error === 'conflict'));

/**
 * Autosaves one task's description on its own, so chips and title edits on
 * the same task can save in between without a conflict.
 */
export function useTaskDescriptionEditor(task: Task) {
  const queryClient = useQueryClient();
  const getClient = useGetApiClient();
  // Edits from details closed before they saved keep sending in the
  // background; reopened, they show at once and save from here once that
  // send settles.
  const queueKey = `task-description:${task.id}`;
  const [adopting, setAdopting] = useState(
    () => peekPendingFlush(queueKey) !== undefined,
  );
  const [draft, setDraft] = useState(() => {
    const pending = peekPendingFlush(queueKey);
    return pending ? String(pending.draft()) : task.description;
  });
  const [dirty, setDirty] = useState(adopting);
  const [shown, setShown] = useState(task.description);
  // A save from elsewhere shows while nothing here is unsaved.
  if (!dirty && task.description !== shown) {
    setShown(task.description);
    setDraft(task.description);
  }
  const baseRef = useRef(shown);
  useEffect(() => {
    baseRef.current = shown;
  }, [shown]);

  const latest = useCallback(
    () =>
      queryClient.getQueryData<Task>(queryKeys.tasks.detail(task.id)) ?? task,
    [queryClient, task],
  );

  const performSave = useCallback(
    async (
      description: string,
      version: number,
    ): Promise<AutosaveResult<Task>> => {
      const send = async (v: number): Promise<AutosaveResult<Task>> => {
        try {
          const entity = await updateTask(getClient(), task.id, {
            version: v,
            description,
          });
          return { ok: true, entity };
        } catch (err) {
          if (!(err instanceof ApiError)) return { ok: false, status: 0 };
          return {
            ok: false,
            status: err.status,
            error: err.error,
            message: err.message,
            current: err.current as Task | undefined,
          };
        }
      };
      const result = await send(version);
      // Only this field is sent, so a newer version is safe to write on when
      // another field made it; a description changed elsewhere is a conflict.
      if (
        !result.ok &&
        isStaleVersion(result.status, result.error) &&
        result.current &&
        !result.current.deleted &&
        result.current.description === baseRef.current
      ) {
        return send(result.current.version);
      }
      return result;
    },
    [getClient, task.id],
  );

  const { saveState, saveError, bumpEdit } = useQueuedAutosave<string, Task>({
    draft,
    dirty,
    setDirty,
    getBaseVersion: () => latest().version,
    performSave,
    onSaved: (saved) => {
      baseRef.current = saved.description;
      setShown(saved.description);
      setCachedTask(queryClient, saved);
    },
    isSavedIn: (description, current) => current.description === description,
    conflictMessage:
      'Conflict — another device updated this task. Reload and try again.',
    conflictMessages: {
      deleted: 'Another device deleted this task.',
    },
    tooLargeMessage: NOTEBOOK_TOO_LARGE_MESSAGE,
    enabled: !adopting,
    queueKey,
  });

  useEffect(() => {
    if (!peekPendingFlush(queueKey)) return;
    let cancelled = false;
    void takePendingFlush(queueKey).then((taken) => {
      if (cancelled) return;
      setAdopting(false);
      if (!taken || taken.outcome === 'clean') {
        setDirty(false);
        return;
      }
      setDraft(String(taken.draft));
      bumpEdit();
    });
    return () => {
      cancelled = true;
    };
  }, [bumpEdit, queueKey]);

  const onChange = useCallback(
    (description: string) => {
      setDraft(description);
      setDirty(true);
      bumpEdit();
    },
    [bumpEdit],
  );

  return { value: draft, onChange, dirty, saveState, saveError };
}
