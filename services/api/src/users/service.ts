import {
  ACCESS_GROUPS,
  ACCESS_LEVEL_GROUPS,
  accessLevelFromGroups,
  type AccessLevel,
  type InviteUserRequest,
  type ManagedUser,
  type UserConflictCode,
} from '@gagnechris/shared';
import type { RemovedUserItem } from '@gagnechris/data';
import { BadRequestError, NotFoundError } from '../data/errors.js';
import {
  INVITED_STATUS,
  type DirectoryUser,
  type UserDirectory,
} from './directory.js';
import type { RemovedUsersRepository } from './removed-users.js';

export class UserConflictError extends Error {
  constructor(
    readonly code: UserConflictCode,
    message: string,
  ) {
    super(message);
    this.name = 'UserConflictError';
  }
}

type RemovedStore = Pick<
  RemovedUsersRepository,
  'list' | 'get' | 'put' | 'delete'
>;

function toManagedUser(
  user: DirectoryUser,
  removed: RemovedUserItem | null,
): ManagedUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    level: removed ? removed.previousLevel : accessLevelFromGroups(user.groups),
    status: removed
      ? 'removed'
      : !user.enabled
        ? 'disabled'
        : user.status === INVITED_STATUS
          ? 'invited'
          : 'active',
    createdAt: user.createdAt,
  };
}

const isActiveFullAdmin = (user: ManagedUser) =>
  user.level === 'full' &&
  user.status !== 'disabled' &&
  user.status !== 'removed';

/**
 * Every rule that keeps the pool manageable lives here, not in the UI: nobody
 * changes their own access, and at least one enabled Full Admin always remains.
 */
export class UserAdmin {
  constructor(
    private readonly directory: UserDirectory,
    private readonly removed: RemovedStore,
    private readonly actorId: string,
  ) {}

  async list(): Promise<ManagedUser[]> {
    const [users, removed] = await Promise.all([
      this.directory.listUsers(),
      this.removed.list(),
    ]);
    const removedById = new Map(removed.map((r) => [r.userId, r]));
    return users
      .map((u) => toManagedUser(u, removedById.get(u.id) ?? null))
      .sort((a, b) => a.email.localeCompare(b.email));
  }

  async invite(input: InviteUserRequest): Promise<{
    user: ManagedUser;
    restored: boolean;
  }> {
    const existing = await this.directory.findByEmail(input.email);
    if (existing) {
      if (!(await this.removed.get(existing.id))) {
        throw new UserConflictError(
          'user_exists',
          'Someone with this email already has an account.',
        );
      }
      return {
        user: await this.restore(existing.id, input.level),
        restored: true,
      };
    }
    const created = await this.directory.inviteUser({
      email: input.email,
      name: input.name || undefined,
    });
    for (const group of ACCESS_LEVEL_GROUPS[input.level]) {
      await this.directory.addToGroup(created.id, group);
    }
    return { user: await this.managedUser(created.id), restored: false };
  }

  async setAccess(id: string, level: AccessLevel): Promise<ManagedUser> {
    this.assertNotSelf(id);
    const user = await this.requireActive(id);
    if (level !== 'full') await this.assertFullAdminRemains(user);
    const target = ACCESS_LEVEL_GROUPS[level];
    const current = user.groups.filter((g) =>
      (ACCESS_GROUPS as readonly string[]).includes(g),
    );
    // Add before removing so a failure part-way never leaves less access than either level.
    for (const group of target.filter((g) => !current.includes(g))) {
      await this.directory.addToGroup(id, group);
    }
    const dropped = current.filter((g) => !target.includes(g));
    for (const group of dropped) {
      await this.directory.removeFromGroup(id, group);
    }
    if (dropped.length) await this.directory.signOutEverywhere(id);
    return this.managedUser(id);
  }

  async disable(id: string): Promise<ManagedUser> {
    this.assertNotSelf(id);
    const user = await this.requireActive(id);
    await this.assertFullAdminRemains(user);
    await this.directory.disableUser(id);
    await this.directory.signOutEverywhere(id);
    return this.managedUser(id);
  }

  async enable(id: string): Promise<ManagedUser> {
    await this.requireActive(id);
    await this.directory.enableUser(id);
    return this.managedUser(id);
  }

  /** Drops every group and disables sign-in; never deletes the user or their data. Safe to retry. */
  async remove(id: string): Promise<ManagedUser> {
    this.assertNotSelf(id);
    const user = await this.requireUser(id);
    if (!(await this.removed.get(id))) {
      await this.assertFullAdminRemains(user);
      await this.removed.put({
        userId: id,
        email: user.email,
        previousLevel: accessLevelFromGroups(user.groups),
        removedBy: this.actorId,
      });
    }
    for (const group of user.groups) {
      if ((ACCESS_GROUPS as readonly string[]).includes(group)) {
        await this.directory.removeFromGroup(id, group);
      }
    }
    await this.directory.disableUser(id);
    await this.directory.signOutEverywhere(id);
    return this.managedUser(id);
  }

  async restore(id: string, level?: AccessLevel): Promise<ManagedUser> {
    await this.requireUser(id);
    const record = await this.removed.get(id);
    if (!record) {
      throw new UserConflictError('not_removed', 'This user was not removed.');
    }
    const restoreLevel = level ?? record.previousLevel;
    if (!restoreLevel) {
      throw new BadRequestError('Choose an access level to restore.');
    }
    await this.directory.enableUser(id);
    for (const group of ACCESS_LEVEL_GROUPS[restoreLevel]) {
      await this.directory.addToGroup(id, group);
    }
    await this.removed.delete(id);
    return this.managedUser(id);
  }

  async resendInvite(id: string): Promise<ManagedUser> {
    const user = await this.requireActive(id);
    if (user.status !== INVITED_STATUS) {
      throw new UserConflictError(
        'not_invited',
        'This user has already signed in.',
      );
    }
    await this.directory.resendInvite(user.email);
    return this.managedUser(id);
  }

  private assertNotSelf(id: string): void {
    if (id === this.actorId) {
      throw new UserConflictError(
        'self_change',
        "You can't change, disable or remove your own access.",
      );
    }
  }

  private async requireUser(id: string): Promise<DirectoryUser> {
    const user = await this.directory.getUser(id);
    if (!user) throw new NotFoundError('User not found');
    return user;
  }

  /** A removed user only comes back through restore. */
  private async requireActive(id: string): Promise<DirectoryUser> {
    const user = await this.requireUser(id);
    if (await this.removed.get(id)) {
      throw new UserConflictError(
        'user_removed',
        'This user was removed. Restore them first.',
      );
    }
    return user;
  }

  private async assertFullAdminRemains(target: DirectoryUser): Promise<void> {
    if (!target.enabled || accessLevelFromGroups(target.groups) !== 'full') {
      return;
    }
    const others = (await this.list()).filter(
      (u) => u.id !== target.id && isActiveFullAdmin(u),
    );
    if (others.length === 0) {
      throw new UserConflictError(
        'last_full_admin',
        'There must always be at least one Full Admin.',
      );
    }
  }

  private async managedUser(id: string): Promise<ManagedUser> {
    const user = await this.requireUser(id);
    return toManagedUser(user, await this.removed.get(id));
  }
}
