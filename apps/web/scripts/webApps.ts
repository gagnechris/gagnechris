export type WebAppName = 'public' | 'admin' | 'notebook';

export type WebApp = {
  /** HTML entry, relative to apps/web. */
  html: string;
  publicDir: string;
  outDir: string;
  /** Dev and preview port; Cognito dev-local registers callbacks for each. */
  port: number;
  requiredEnv: readonly string[];
};

const WORKSPACE_AUTH_ENV = [
  'VITE_COGNITO_USER_POOL_ID',
  'VITE_COGNITO_AUTH_DOMAIN',
] as const;

export const WEB_APPS: Record<WebAppName, WebApp> = {
  public: {
    html: 'index.html',
    publicDir: 'public',
    outDir: 'dist',
    port: 5173,
    requiredEnv: [],
  },
  admin: {
    html: 'admin.html',
    publicDir: 'public-admin',
    outDir: 'dist-admin',
    port: 5174,
    requiredEnv: [...WORKSPACE_AUTH_ENV, 'VITE_COGNITO_ADMIN_CLIENT_ID'],
  },
  notebook: {
    html: 'notebook.html',
    publicDir: 'public-notebook',
    outDir: 'dist-notebook',
    port: 5175,
    requiredEnv: [...WORKSPACE_AUTH_ENV, 'VITE_COGNITO_NOTEBOOK_CLIENT_ID'],
  },
};

export const webAppFromEnv = (value: string | undefined): WebAppName => {
  const name = value?.trim() || 'public';
  if (name !== 'public' && name !== 'admin' && name !== 'notebook') {
    throw new Error(`WEB_APP must be public, admin or notebook (got ${name})`);
  }
  return name;
};

const PROD_PUBLIC_SITE_ORIGIN = 'https://gagnechris.com';

/** Where the admin app links public pages; builds default to production. */
export const publicSiteOrigin = (
  value: string | undefined,
  command: 'build' | 'serve',
): string => {
  const origin =
    value?.trim() ||
    (command === 'build'
      ? PROD_PUBLIC_SITE_ORIGIN
      : `http://localhost:${WEB_APPS.public.port}`);
  if (!URL.canParse(origin) || new URL(origin).origin !== origin) {
    throw new Error(
      `VITE_PUBLIC_SITE_ORIGIN must be an origin like ${PROD_PUBLIC_SITE_ORIGIN} (got ${origin})`,
    );
  }
  return origin;
};
