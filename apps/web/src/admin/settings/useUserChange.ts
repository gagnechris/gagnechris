import { useCallback } from 'react';
import {
  isReauthRequired,
  isRecentSignIn,
  useSetUserAccessMutation,
  useUserActionMutation,
  type UserChange,
} from '@gagnechris/app-core';
import { getAuthTime, redirectToSignIn } from '../../workspace/auth/session';
import { savePendingChange } from './userChange';

export type ChangeOutcome = 'done' | 'confirming';

/**
 * Applies a change that needs a recent sign-in. Without one, the change is
 * saved and managed login asks the user to sign in again (their passkey);
 * the page applies it when they come back.
 */
export function useUserChange(requesterId: string) {
  const { mutateAsync: setAccess, isPending: settingAccess } =
    useSetUserAccessMutation();
  const { mutateAsync: runAction, isPending: runningAction } =
    useUserActionMutation();

  const perform = useCallback(
    async (
      change: UserChange,
      { confirmed = false } = {},
    ): Promise<ChangeOutcome> => {
      const confirm = async () => {
        savePendingChange(change, requesterId);
        await redirectToSignIn({ prompt: 'LOGIN' });
        return 'confirming' as const;
      };
      if (!confirmed && !isRecentSignIn(await getAuthTime())) return confirm();
      try {
        if (change.kind === 'access') {
          await setAccess({ id: change.id, level: change.level });
        } else {
          await runAction({
            id: change.id,
            action: change.kind,
            level: change.level,
          });
        }
        return 'done';
      } catch (error) {
        if (isReauthRequired(error) && !confirmed) return confirm();
        throw error;
      }
    },
    [setAccess, runAction, requesterId],
  );

  return { perform, isPending: settingAccess || runningAction };
}
