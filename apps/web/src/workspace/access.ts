import {
  ACCESS_LEVEL_LABELS,
  accessLevelFromGroups,
  NOTEBOOK_GROUP,
  SITE_ADMIN_GROUP,
} from '@gagnechris/shared';

export type WorkspaceAppName = 'admin' | 'notebook';

/** Cognito group each app's API routes require. */
export const APP_GROUP: Record<WorkspaceAppName, string> = {
  admin: SITE_ADMIN_GROUP,
  notebook: NOTEBOOK_GROUP,
};

export const APP_TITLE: Record<WorkspaceAppName, string> = {
  admin: 'Admin',
  notebook: 'Notebook',
};

export const appOrigin = (app: WorkspaceAppName | 'public'): string => {
  switch (app) {
    case 'admin':
      return import.meta.env.VITE_ADMIN_ORIGIN;
    case 'notebook':
      return import.meta.env.VITE_NOTEBOOK_ORIGIN;
    case 'public':
      return import.meta.env.VITE_PUBLIC_SITE_ORIGIN;
  }
};

export const appHost = (app: WorkspaceAppName): string =>
  new URL(appOrigin(app)).host;

export function accessLevel(groups: readonly string[]): string {
  const level = accessLevelFromGroups(groups);
  return level ? ACCESS_LEVEL_LABELS[level] : 'No access';
}
