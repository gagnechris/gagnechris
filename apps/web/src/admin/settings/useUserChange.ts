import { useCallback } from 'react';
import {
  useSetUserAccessMutation,
  useUserActionMutation,
} from '@gagnechris/app-core';
import { getAuthTime, redirectToSignIn } from '../../workspace/auth/session';
import {
  isReauthRequired,
  isRecentSignIn,
  savePendingChange,
  type UserChange,
} from './userChange';

export type ChangeOutcome = 'done' | 'confirming';

/**
 * Applies a change that needs a recent sign-in. Without one, the change is
 * saved and managed login asks the user to sign in again (their passkey);
 * the page applies it when they come back.
 */
export function useUserChange() {
  const setAccess = useSetUserAccessMutation();
  const action = useUserActionMutation();

  const confirm = async (change: UserChange): Promise<ChangeOutcome> => {
    savePendingChange(change);
    await redirectToSignIn({ prompt: 'LOGIN' });
    return 'confirming';
  };

  const apply = useCallback(
    async (change: UserChange) => {
      if (change.kind === 'access') {
        await setAccess.mutateAsync({ id: change.id, level: change.level });
      } else {
        await action.mutateAsync({
          id: change.id,
          action: change.kind,
          level: change.level,
        });
      }
    },
    [setAccess, action],
  );

  const perform = async (
    change: UserChange,
    { confirmed = false } = {},
  ): Promise<ChangeOutcome> => {
    if (!confirmed && !isRecentSignIn(await getAuthTime())) {
      return confirm(change);
    }
    try {
      await apply(change);
      return 'done';
    } catch (error) {
      if (isReauthRequired(error) && !confirmed) return confirm(change);
      throw error;
    }
  };

  return {
    perform,
    isPending: setAccess.isPending || action.isPending,
  };
}
