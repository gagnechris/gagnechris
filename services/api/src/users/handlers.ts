import {
  REAUTH_REQUIRED,
  USER_ADMIN_REAUTH_SECONDS,
  InviteUserRequestSchema,
  InviteUserResponseSchema,
  ManagedUserIdSchema,
  SetUserAccessRequestSchema,
  UserListResponseSchema,
  UserResponseSchema,
  type ManagedUser,
} from '@gagnechris/shared';
import * as z from 'zod';
import { ServiceUnavailableError } from '../data/errors.js';
import { json } from '../http.js';
import { defineRoute, type RouteCtx, type RouteDef } from '../router.js';
import type { UserDirectory } from './directory.js';
import { MemoryUserDirectory, localDirectorySeed } from './memory-directory.js';
import { RemovedUsersRepository } from './removed-users.js';
import { UserAdmin, UserConflictError } from './service.js';

export type UserRoutesDeps = {
  directory?: UserDirectory;
  removed?: ConstructorParameters<typeof UserAdmin>[1];
};

let localDirectory: MemoryUserDirectory | undefined;

/** `USER_DIRECTORY=memory` is the local stack's stand-in for the Cognito pool. */
async function defaultDirectory(): Promise<UserDirectory> {
  if (process.env.USER_DIRECTORY === 'memory') {
    localDirectory ??= new MemoryUserDirectory(localDirectorySeed());
    return localDirectory;
  }
  const userPoolId = process.env.USER_POOL_ID?.trim();
  if (!userPoolId) {
    throw new ServiceUnavailableError('User management is not configured');
  }
  // Loaded here so the Cognito SDK stays out of every other route's cold start.
  const { CognitoUserDirectory } = await import('./cognito-directory.js');
  return new CognitoUserDirectory(userPoolId);
}

const IdParamsSchema = z.object({ id: ManagedUserIdSchema });

class ReauthRequiredError extends Error {}

/** Refresh tokens keep the original `auth_time`, so only a new sign-in passes. */
function assertRecentSignIn(ctx: RouteCtx, now = Date.now()): void {
  const authTime = Number(ctx.claims?.auth_time);
  if (
    !Number.isFinite(authTime) ||
    now / 1000 - authTime > USER_ADMIN_REAUTH_SECONDS
  ) {
    throw new ReauthRequiredError();
  }
}

const RestoreRequestSchema = SetUserAccessRequestSchema.partial();

export function createUserRoutes(deps: UserRoutesDeps = {}): RouteDef[] {
  const admin = async (ctx: RouteCtx) =>
    new UserAdmin(
      deps.directory ?? (await defaultDirectory()),
      deps.removed ?? new RemovedUsersRepository(),
      ctx.userId!,
    );

  const run = async (work: () => Promise<unknown>) => {
    try {
      return json(200, await work());
    } catch (error) {
      if (error instanceof ReauthRequiredError) {
        return json(403, {
          error: REAUTH_REQUIRED,
          message: 'Confirm it’s you to change someone’s access.',
        });
      }
      if (error instanceof UserConflictError) {
        return json(409, { error: error.code, message: error.message });
      }
      throw error;
    }
  };

  const userResponse = (user: ManagedUser) =>
    UserResponseSchema.parse({ user });

  const action = (
    name: string,
    metric: string,
    act: (users: UserAdmin, id: string) => Promise<ManagedUser>,
    { sensitive = true } = {},
  ) =>
    defineRoute({
      method: 'POST',
      pattern: `/admin/users/:id/${name}`,
      auth: 'user-admin',
      metric,
      params: IdParamsSchema,
      handler: (ctx, { params }) =>
        run(async () => {
          if (sensitive) assertRecentSignIn(ctx);
          return userResponse(await act(await admin(ctx), params.id));
        }),
    });

  return [
    defineRoute({
      method: 'GET',
      pattern: '/admin/users',
      auth: 'user-admin',
      metric: 'UsersList',
      handler: (ctx) =>
        run(async () =>
          UserListResponseSchema.parse({
            users: await (await admin(ctx)).list(),
          }),
        ),
    }),
    defineRoute({
      method: 'POST',
      pattern: '/admin/users',
      auth: 'user-admin',
      metric: 'UsersInvite',
      body: InviteUserRequestSchema,
      handler: (ctx, { body }) =>
        run(async () =>
          InviteUserResponseSchema.parse(await (await admin(ctx)).invite(body)),
        ),
    }),
    defineRoute({
      method: 'PUT',
      pattern: '/admin/users/:id/access',
      auth: 'user-admin',
      metric: 'UsersSetAccess',
      params: IdParamsSchema,
      body: SetUserAccessRequestSchema,
      handler: (ctx, { params, body }) =>
        run(async () => {
          assertRecentSignIn(ctx);
          return userResponse(
            await (await admin(ctx)).setAccess(params.id, body.level),
          );
        }),
    }),
    action('disable', 'UsersDisable', (users, id) => users.disable(id)),
    action('enable', 'UsersEnable', (users, id) => users.enable(id)),
    action('sign-out', 'UsersSignOut', (users, id) => users.signOut(id)),
    action('remove', 'UsersRemove', (users, id) => users.remove(id)),
    action(
      'resend-invite',
      'UsersResendInvite',
      (users, id) => users.resendInvite(id),
      { sensitive: false },
    ),
    defineRoute({
      method: 'POST',
      pattern: '/admin/users/:id/restore',
      auth: 'user-admin',
      metric: 'UsersRestore',
      params: IdParamsSchema,
      body: RestoreRequestSchema,
      handler: (ctx, { params, body }) =>
        run(async () => {
          assertRecentSignIn(ctx);
          return userResponse(
            await (await admin(ctx)).restore(params.id, body.level),
          );
        }),
    }),
  ];
}
