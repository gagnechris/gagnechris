export type WorkspaceAppName = 'admin' | 'notebook';

/** Cognito group each app's API routes require. */
export const APP_GROUP: Record<WorkspaceAppName, string> = {
  admin: 'site-admin',
  notebook: 'notebook',
};

export const USER_ADMIN_GROUP = 'user-admin';

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
  const site = groups.includes(APP_GROUP.admin);
  const notebook = groups.includes(APP_GROUP.notebook);
  if (site && notebook) return 'Full Admin';
  if (site) return 'Public CMS';
  if (notebook) return 'Notebook only';
  return 'No access';
}
