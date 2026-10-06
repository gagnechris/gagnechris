export type DirectoryUser = {
  /** Cognito `sub`; also the username, since the pool signs in by email. */
  id: string;
  email: string;
  name: string | null;
  enabled: boolean;
  /** Cognito `UserStatus`, e.g. `CONFIRMED` or `FORCE_CHANGE_PASSWORD`. */
  status: string;
  createdAt: string | null;
  groups: string[];
};

/** The user pool operations user management needs. Nothing here deletes a user. */
export interface UserDirectory {
  listUsers(): Promise<DirectoryUser[]>;
  getUser(id: string): Promise<DirectoryUser | null>;
  findByEmail(email: string): Promise<DirectoryUser | null>;
  /** Creates the user and sends the invite email with a temporary password. */
  inviteUser(input: { email: string; name?: string }): Promise<DirectoryUser>;
  resendInvite(email: string): Promise<void>;
  addToGroup(id: string, group: string): Promise<void>;
  removeFromGroup(id: string, group: string): Promise<void>;
  disableUser(id: string): Promise<void>;
  enableUser(id: string): Promise<void>;
  /** Revokes refresh tokens, so the next token carries the current groups. */
  signOutEverywhere(id: string): Promise<void>;
}

export const INVITED_STATUS = 'FORCE_CHANGE_PASSWORD';
