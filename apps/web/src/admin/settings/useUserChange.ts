import { useCallback } from 'react';
import {
  changeToast,
  isReauthRequired,
  isRecentSignIn,
  useInviteUserMutation,
  useSetUserAccessMutation,
  useUserActionMutation,
  type UserChange,
} from '@gagnechris/app-core';
import { getAuthTime, redirectToSignIn } from '../../workspace/auth/session';
import { savePendingChange } from './userChange';

export type ChangeOutcome =
  { status: 'done'; toast: string } | { status: 'confirming' };

/**
 * Applies a change that needs a recent sign-in. Without one, the change is
 * saved and managed login asks the user to sign in again (their passkey);
 * the page applies it when they come back.
 */
export function useUserChange(requesterId: string) {
  const { mutateAsync: invite, isPending: inviting } = useInviteUserMutation();
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
        return { status: 'confirming' } as const;
      };
      if (!confirmed && !isRecentSignIn(await getAuthTime())) return confirm();
      try {
        if (change.kind === 'invite') {
          const invited = await invite({
            email: change.email,
            name: change.name,
            level: change.level,
          });
          return { status: 'done', toast: changeToast(change, invited) };
        }
        if (change.kind === 'access') {
          await setAccess({ id: change.id, level: change.level });
        } else {
          await runAction({
            id: change.id,
            action: change.kind,
            level: change.level,
          });
        }
        return { status: 'done', toast: changeToast(change) };
      } catch (error) {
        if (isReauthRequired(error) && !confirmed) return confirm();
        throw error;
      }
    },
    [invite, setAccess, runAction, requesterId],
  );

  return { perform, isPending: inviting || settingAccess || runningAction };
}
