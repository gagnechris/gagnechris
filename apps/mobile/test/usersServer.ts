import {
  REAUTH_REQUIRED,
  type AccessLevel,
  type ManagedUser,
} from '@gagnechris/shared';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export const makeUser = (
  id: string,
  fields: Partial<ManagedUser> = {},
): ManagedUser => ({
  id,
  email: `${id}@example.com`,
  name: null,
  level: 'notebook',
  status: 'active',
  createdAt: '2026-09-01T09:00:00.000Z',
  ...fields,
});

/**
 * The admin Users API. While `needsSignIn` is set, changes other than a
 * resend are refused as the server does for an old sign-in.
 */
export function usersServer(users: ManagedUser[]) {
  const state = {
    users: new Map(users.map((user) => [user.id, user])),
    needsSignIn: false,
    calls: [] as string[],
  };

  const fetch = async (input: Request | string): Promise<Response> => {
    if (typeof input === 'string') throw new Error(`Unexpected ${input}`);
    const url = new URL(input.url);
    const route = `${input.method} ${url.pathname}`;
    state.calls.push(route);
    if (route === 'GET /api/admin/users') {
      return json(200, { users: [...state.users.values()] });
    }
    if (route === 'POST /api/admin/users') {
      if (state.needsSignIn) {
        return json(403, { error: REAUTH_REQUIRED, message: 'Sign in again' });
      }
      const body = (await input.json()) as {
        email: string;
        name?: string;
        level: AccessLevel;
      };
      const user = makeUser(`new-${state.users.size + 1}`, {
        email: body.email,
        name: body.name ?? null,
        level: body.level,
        status: 'invited',
      });
      state.users.set(user.id, user);
      return json(201, { user, restored: false });
    }
    const match = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/(.+)$/);
    const user = match ? state.users.get(match[1]!) : undefined;
    if (!match || !user) return json(404, { error: 'not_found' });
    const action = match[2]!;
    if (state.needsSignIn && action !== 'resend-invite') {
      return json(403, { error: REAUTH_REQUIRED, message: 'Sign in again' });
    }
    const body =
      input.method === 'GET' ? {} : await input.json().catch(() => ({}));
    const next: ManagedUser = (() => {
      switch (action) {
        case 'access':
          return { ...user, level: (body as { level: AccessLevel }).level };
        case 'disable':
          return { ...user, status: 'disabled' };
        case 'enable':
          return { ...user, status: 'active' };
        case 'remove':
          return { ...user, status: 'removed' };
        case 'restore':
          return {
            ...user,
            status: 'active',
            level: (body as { level?: AccessLevel }).level ?? user.level,
          };
        default:
          return user;
      }
    })();
    state.users.set(user.id, next);
    return json(200, { user: next });
  };

  return { fetch, state };
}
