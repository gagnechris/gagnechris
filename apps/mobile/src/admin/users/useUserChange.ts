import {
  changeToast,
  isReauthRequired,
  useInviteUserMutation,
  useSetUserAccessMutation,
  useUserActionMutation,
  type UserChange,
} from '@gagnechris/app-core';
import { useSession } from '../../session';

export type ChangeOutcome =
  { status: 'done'; toast: string } | { status: 'cancelled' };

/**
 * Applies a change that needs a recent sign-in. When the server says the
 * sign-in is too old, the user confirms with their passkey and it is sent again.
 */
export function useUserChange() {
  const { reauthenticate } = useSession();
  const invite = useInviteUserMutation();
  const setAccess = useSetUserAccessMutation();
  const action = useUserActionMutation();

  const apply = async (change: UserChange): Promise<string> => {
    if (change.kind === 'invite') {
      const invited = await invite.mutateAsync({
        email: change.email,
        name: change.name,
        level: change.level,
      });
      return changeToast(change, invited);
    }
    if (change.kind === 'access') {
      await setAccess.mutateAsync({ id: change.id, level: change.level });
    } else {
      await action.mutateAsync({
        id: change.id,
        action: change.kind,
        level: change.level,
      });
    }
    return changeToast(change);
  };

  const perform = async (change: UserChange): Promise<ChangeOutcome> => {
    try {
      return { status: 'done', toast: await apply(change) };
    } catch (error) {
      if (!isReauthRequired(error)) throw error;
      if (!(await reauthenticate())) return { status: 'cancelled' };
      return { status: 'done', toast: await apply(change) };
    }
  };

  return {
    perform,
    isPending: invite.isPending || setAccess.isPending || action.isPending,
  };
}
