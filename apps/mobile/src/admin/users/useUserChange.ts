import {
  isReauthRequired,
  useSetUserAccessMutation,
  useUserActionMutation,
  type UserChange,
} from '@gagnechris/app-core';
import { useSession } from '../../session';

export type ChangeOutcome = 'done' | 'cancelled';

/**
 * Applies a change that needs a recent sign-in. When the server says the
 * sign-in is too old, the user confirms with their passkey and it is sent again.
 */
export function useUserChange() {
  const { reauthenticate } = useSession();
  const setAccess = useSetUserAccessMutation();
  const action = useUserActionMutation();

  const apply = async (change: UserChange) => {
    if (change.kind === 'access') {
      await setAccess.mutateAsync({ id: change.id, level: change.level });
    } else {
      await action.mutateAsync({
        id: change.id,
        action: change.kind,
        level: change.level,
      });
    }
  };

  const perform = async (change: UserChange): Promise<ChangeOutcome> => {
    try {
      await apply(change);
    } catch (error) {
      if (!isReauthRequired(error)) throw error;
      if (!(await reauthenticate())) return 'cancelled';
      await apply(change);
    }
    return 'done';
  };

  return { perform, isPending: setAccess.isPending || action.isPending };
}
