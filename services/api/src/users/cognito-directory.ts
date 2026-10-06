import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
  AdminUserGlobalSignOutCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
  ListUsersInGroupCommand,
  UserNotFoundException,
  type AttributeType,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider';
import { ACCESS_GROUPS } from '@gagnechris/shared';
import type { DirectoryUser, UserDirectory } from './directory.js';

let client: CognitoIdentityProviderClient | undefined;

function getCognito(): CognitoIdentityProviderClient {
  client ??= new CognitoIdentityProviderClient({});
  return client;
}

export function setCognitoClient(
  next: CognitoIdentityProviderClient | undefined,
): void {
  client = next;
}

const attr = (attributes: AttributeType[] | undefined, name: string) =>
  attributes?.find((a) => a.Name === name)?.Value ?? null;

function toDirectoryUser(
  user: {
    Username?: string;
    Attributes?: AttributeType[];
    UserAttributes?: AttributeType[];
    Enabled?: boolean;
    UserStatus?: string;
    UserCreateDate?: Date;
  },
  groups: string[],
): DirectoryUser {
  const attributes = user.Attributes ?? user.UserAttributes;
  return {
    id: attr(attributes, 'sub') ?? user.Username ?? '',
    email: attr(attributes, 'email') ?? '',
    name: attr(attributes, 'name'),
    enabled: user.Enabled ?? false,
    status: user.UserStatus ?? 'UNKNOWN',
    createdAt: user.UserCreateDate?.toISOString() ?? null,
    groups,
  };
}

export class CognitoUserDirectory implements UserDirectory {
  constructor(
    private readonly userPoolId: string,
    private readonly cognito: Pick<
      CognitoIdentityProviderClient,
      'send'
    > = getCognito(),
  ) {}

  async listUsers(): Promise<DirectoryUser[]> {
    const users: UserType[] = [];
    let token: string | undefined;
    do {
      const page = await this.cognito.send(
        new ListUsersCommand({
          UserPoolId: this.userPoolId,
          PaginationToken: token,
        }),
      );
      users.push(...(page.Users ?? []));
      token = page.PaginationToken;
    } while (token);

    // One call per group instead of one per user.
    const groupsByUser = new Map<string, string[]>();
    for (const group of ACCESS_GROUPS) {
      let next: string | undefined;
      do {
        const page = await this.cognito.send(
          new ListUsersInGroupCommand({
            UserPoolId: this.userPoolId,
            GroupName: group,
            NextToken: next,
          }),
        );
        for (const member of page.Users ?? []) {
          const name = member.Username ?? '';
          groupsByUser.set(name, [...(groupsByUser.get(name) ?? []), group]);
        }
        next = page.NextToken;
      } while (next);
    }
    return users.map((user) =>
      toDirectoryUser(user, groupsByUser.get(user.Username ?? '') ?? []),
    );
  }

  async getUser(id: string): Promise<DirectoryUser | null> {
    try {
      const [user, groups] = await Promise.all([
        this.cognito.send(
          new AdminGetUserCommand({
            UserPoolId: this.userPoolId,
            Username: id,
          }),
        ),
        this.cognito.send(
          new AdminListGroupsForUserCommand({
            UserPoolId: this.userPoolId,
            Username: id,
          }),
        ),
      ]);
      return toDirectoryUser(
        user,
        (groups.Groups ?? []).flatMap((g) =>
          g.GroupName ? [g.GroupName] : [],
        ),
      );
    } catch (error) {
      if (error instanceof UserNotFoundException) return null;
      throw error;
    }
  }

  async findByEmail(email: string): Promise<DirectoryUser | null> {
    const page = await this.cognito.send(
      new ListUsersCommand({
        UserPoolId: this.userPoolId,
        // The request schema only admits addresses without quotes.
        Filter: `email = "${email}"`,
        Limit: 1,
      }),
    );
    const found = page.Users?.[0];
    return found?.Username ? this.getUser(found.Username) : null;
  }

  async inviteUser(input: {
    email: string;
    name?: string;
  }): Promise<DirectoryUser> {
    const created = await this.cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: this.userPoolId,
        Username: input.email,
        DesiredDeliveryMediums: ['EMAIL'],
        UserAttributes: [
          { Name: 'email', Value: input.email },
          // The invite proves the address: it carries the temporary password.
          { Name: 'email_verified', Value: 'true' },
          ...(input.name ? [{ Name: 'name', Value: input.name }] : []),
        ],
      }),
    );
    return toDirectoryUser(created.User ?? {}, []);
  }

  async resendInvite(email: string): Promise<void> {
    await this.cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: this.userPoolId,
        Username: email,
        MessageAction: 'RESEND',
        DesiredDeliveryMediums: ['EMAIL'],
      }),
    );
  }

  async addToGroup(id: string, group: string): Promise<void> {
    await this.cognito.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: this.userPoolId,
        Username: id,
        GroupName: group,
      }),
    );
  }

  async removeFromGroup(id: string, group: string): Promise<void> {
    await this.cognito.send(
      new AdminRemoveUserFromGroupCommand({
        UserPoolId: this.userPoolId,
        Username: id,
        GroupName: group,
      }),
    );
  }

  async disableUser(id: string): Promise<void> {
    await this.cognito.send(
      new AdminDisableUserCommand({
        UserPoolId: this.userPoolId,
        Username: id,
      }),
    );
  }

  async enableUser(id: string): Promise<void> {
    await this.cognito.send(
      new AdminEnableUserCommand({ UserPoolId: this.userPoolId, Username: id }),
    );
  }

  async signOutEverywhere(id: string): Promise<void> {
    await this.cognito.send(
      new AdminUserGlobalSignOutCommand({
        UserPoolId: this.userPoolId,
        Username: id,
      }),
    );
  }
}
