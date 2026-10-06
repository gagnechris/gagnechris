import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AccessLevel,
  InviteUserRequest,
  InviteUserResponse,
  ManagedUser,
} from '@gagnechris/shared';
import { useGetApiClient } from '../AppApiProvider.js';
import { unwrap } from './api.js';
import { queryKeys } from './keys.js';

export type UserAction =
  'sign-out' | 'disable' | 'enable' | 'remove' | 'restore' | 'resend-invite';

export const useUsersQuery = (enabled = true) => {
  const getClient = useGetApiClient();
  return useQuery({
    queryKey: queryKeys.users.list(),
    enabled,
    queryFn: async (): Promise<ManagedUser[]> => {
      const result = await getClient().GET('/api/admin/users');
      return unwrap(result, 'Could not load users').users;
    },
  });
};

function useReplaceUser() {
  const queryClient = useQueryClient();
  return (user: ManagedUser) => {
    queryClient.setQueryData<ManagedUser[]>(queryKeys.users.list(), (list) =>
      list?.some((u) => u.id === user.id)
        ? list.map((u) => (u.id === user.id ? user : u))
        : [...(list ?? []), user],
    );
    void queryClient.invalidateQueries({ queryKey: queryKeys.users.list() });
  };
}

export const useInviteUserMutation = () => {
  const getClient = useGetApiClient();
  const replace = useReplaceUser();
  return useMutation({
    mutationFn: async (body: InviteUserRequest): Promise<InviteUserResponse> =>
      unwrap(
        await getClient().POST('/api/admin/users', { body }),
        'Could not send the invite',
      ),
    onSuccess: ({ user }) => replace(user),
  });
};

export const useSetUserAccessMutation = () => {
  const getClient = useGetApiClient();
  const replace = useReplaceUser();
  return useMutation({
    mutationFn: async ({
      id,
      level,
    }: {
      id: string;
      level: AccessLevel;
    }): Promise<ManagedUser> =>
      unwrap(
        await getClient().PUT('/api/admin/users/{id}/access', {
          params: { path: { id } },
          body: { level },
        }),
        'Could not change access',
      ).user,
    onSuccess: replace,
  });
};

export const useUserActionMutation = () => {
  const getClient = useGetApiClient();
  const replace = useReplaceUser();
  return useMutation({
    mutationFn: async ({
      id,
      action,
      level,
    }: {
      id: string;
      action: UserAction;
      /** Restore only: defaults to the level they had when removed. */
      level?: AccessLevel;
    }): Promise<ManagedUser> => {
      const client = getClient();
      const params = { params: { path: { id } } };
      const result = await (() => {
        switch (action) {
          case 'sign-out':
            return client.POST('/api/admin/users/{id}/sign-out', params);
          case 'disable':
            return client.POST('/api/admin/users/{id}/disable', params);
          case 'enable':
            return client.POST('/api/admin/users/{id}/enable', params);
          case 'remove':
            return client.POST('/api/admin/users/{id}/remove', params);
          case 'restore':
            return client.POST('/api/admin/users/{id}/restore', {
              ...params,
              body: level ? { level } : {},
            });
          case 'resend-invite':
            return client.POST('/api/admin/users/{id}/resend-invite', params);
        }
      })();
      return unwrap(result, 'Could not update the user').user;
    },
    onSuccess: replace,
  });
};
