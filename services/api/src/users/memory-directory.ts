import { randomUUID } from 'node:crypto';
import { ACCESS_GROUPS } from '@gagnechris/shared';
import {
  INVITED_STATUS,
  type DirectoryUser,
  type UserDirectory,
} from './directory.js';

/** Stands in for Cognito in the local stack and tests; nothing persists. */
export class MemoryUserDirectory implements UserDirectory {
  private readonly users = new Map<string, DirectoryUser>();
  readonly invitesSent: string[] = [];
  readonly signedOut: string[] = [];

  constructor(seed: DirectoryUser[] = []) {
    for (const user of seed) this.users.set(user.id, structuredClone(user));
  }

  private require(id: string): DirectoryUser {
    const user = this.users.get(id);
    if (!user) throw new Error(`No user ${id}`);
    return user;
  }

  async listUsers(): Promise<DirectoryUser[]> {
    return [...this.users.values()].map((u) => structuredClone(u));
  }

  async getUser(id: string): Promise<DirectoryUser | null> {
    const user = this.users.get(id);
    return user ? structuredClone(user) : null;
  }

  async findByEmail(email: string): Promise<DirectoryUser | null> {
    const user = [...this.users.values()].find((u) => u.email === email);
    return user ? structuredClone(user) : null;
  }

  async inviteUser(input: {
    email: string;
    name?: string;
  }): Promise<DirectoryUser> {
    const user: DirectoryUser = {
      id: randomUUID(),
      email: input.email,
      name: input.name ?? null,
      enabled: true,
      status: INVITED_STATUS,
      createdAt: new Date().toISOString(),
      groups: [],
    };
    this.users.set(user.id, user);
    this.invitesSent.push(input.email);
    return structuredClone(user);
  }

  async resendInvite(email: string): Promise<void> {
    this.invitesSent.push(email);
  }

  async addToGroup(id: string, group: string): Promise<void> {
    const user = this.require(id);
    if (!user.groups.includes(group)) user.groups.push(group);
  }

  async removeFromGroup(id: string, group: string): Promise<void> {
    const user = this.require(id);
    user.groups = user.groups.filter((g) => g !== group);
  }

  async disableUser(id: string): Promise<void> {
    this.require(id).enabled = false;
  }

  async enableUser(id: string): Promise<void> {
    this.require(id).enabled = true;
  }

  async signOutEverywhere(id: string): Promise<void> {
    this.require(id);
    this.signedOut.push(id);
  }
}

/** The local fake-auth user, as a Full Admin, so the local stack can manage users. */
export function localDirectorySeed(): DirectoryUser[] {
  return [
    {
      id: 'local-dev-user',
      email: 'local@gagnechris.com',
      name: 'Local Admin',
      enabled: true,
      status: 'CONFIRMED',
      createdAt: '2026-01-01T00:00:00.000Z',
      groups: [...ACCESS_GROUPS],
    },
  ];
}
