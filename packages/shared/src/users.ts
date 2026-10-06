import { z } from 'zod';

export const SITE_ADMIN_GROUP = 'site-admin';
export const NOTEBOOK_GROUP = 'notebook';
export const USER_ADMIN_GROUP = 'user-admin';

export const ACCESS_GROUPS = [
  SITE_ADMIN_GROUP,
  NOTEBOOK_GROUP,
  USER_ADMIN_GROUP,
] as const;

export const AccessLevelSchema = z.enum(['full', 'cms', 'notebook']);
export type AccessLevel = z.infer<typeof AccessLevelSchema>;

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
  full: 'Full Admin',
  cms: 'Public CMS',
  notebook: 'Notebook only',
};

export const ACCESS_LEVEL_GROUPS: Record<AccessLevel, readonly string[]> = {
  full: ACCESS_GROUPS,
  cms: [SITE_ADMIN_GROUP],
  notebook: [NOTEBOOK_GROUP],
};

/** Full Admin needs all three groups; anything less falls back to the CMS, then Notebook. */
export function accessLevelFromGroups(
  groups: readonly string[],
): AccessLevel | null {
  if (ACCESS_GROUPS.every((group) => groups.includes(group))) return 'full';
  if (groups.includes(SITE_ADMIN_GROUP)) return 'cms';
  if (groups.includes(NOTEBOOK_GROUP)) return 'notebook';
  return null;
}

export const ManagedUserStatusSchema = z.enum([
  'active',
  'invited',
  'disabled',
  'removed',
]);
export type ManagedUserStatus = z.infer<typeof ManagedUserStatusSchema>;

export const ManagedUserIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9-]+$/);

export const ManagedUserSchema = z.object({
  id: ManagedUserIdSchema,
  email: z.string(),
  name: z.string().nullable(),
  /** For a removed user, the level a restore gives back. */
  level: AccessLevelSchema.nullable(),
  status: ManagedUserStatusSchema,
  createdAt: z.string().nullable(),
});
export type ManagedUser = z.infer<typeof ManagedUserSchema>;

export const UserListResponseSchema = z.object({
  users: z.array(ManagedUserSchema),
});
export type UserListResponse = z.infer<typeof UserListResponseSchema>;

export const UserResponseSchema = z.object({ user: ManagedUserSchema });
export type UserResponse = z.infer<typeof UserResponseSchema>;

export const InviteUserRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().max(100).optional(),
  level: AccessLevelSchema,
});
export type InviteUserRequest = z.infer<typeof InviteUserRequestSchema>;

export const InviteUserResponseSchema = UserResponseSchema.extend({
  /** True when the email belonged to a removed user, who gets their old account and Notebook back. */
  restored: z.boolean(),
});
export type InviteUserResponse = z.infer<typeof InviteUserResponseSchema>;

export const SetUserAccessRequestSchema = z.object({
  level: AccessLevelSchema,
});
export type SetUserAccessRequest = z.infer<typeof SetUserAccessRequestSchema>;

export const UserConflictCodeSchema = z.enum([
  'self_change',
  'last_full_admin',
  'user_exists',
  'user_removed',
  'not_removed',
  'not_invited',
]);
export type UserConflictCode = z.infer<typeof UserConflictCodeSchema>;

export const UserConflictResponseSchema = z.object({
  error: UserConflictCodeSchema,
  message: z.string(),
});
