/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COGNITO_USER_POOL_ID?: string;
  /** Admin build only: the `admin-web` client (dev: `dev-local`). */
  readonly VITE_COGNITO_ADMIN_CLIENT_ID?: string;
  /** Notebook build only: the `notebook-web` client (dev: `dev-local`). */
  readonly VITE_COGNITO_NOTEBOOK_CLIENT_ID?: string;
  readonly VITE_COGNITO_AUTH_DOMAIN?: string;
  /** Optional override; default is same-origin (empty string). */
  readonly VITE_API_BASE_URL?: string;
  /**
   * Dev only: set to `prod` to proxy `/api` to https://gagnechris.com.
   * Default (unset) proxies to the local API (see vite.config.ts).
   */
  readonly VITE_API_TARGET?: string;
  /** Dev only: local API origin when VITE_API_TARGET is not prod. */
  readonly VITE_LOCAL_API_ORIGIN?: string;
  /**
   * Dev only: proxy `/__site` to the local static origin (publisher HTML + posts.json).
   * Set by `scripts/local/env.sh` / `npm run local:dev`.
   */
  readonly VITE_LOCAL_SITE_ORIGIN?: string;
  /**
   * Dev only: fake signed-in session (no Cognito). Production builds fail if set.
   */
  readonly VITE_AUTH_MODE?: string;
  /** Dev server only: a demo id whose Try it slot loads the test fixture demo. */
  readonly VITE_DEMO_FIXTURE?: string;
  /** Origin the admin links to for public pages; set in vite.config.ts. */
  readonly VITE_PUBLIC_SITE_ORIGIN: string;
  /** The admin and Notebook apps' Your apps links; set in vite.config.ts. */
  readonly VITE_ADMIN_ORIGIN: string;
  readonly VITE_NOTEBOOK_ORIGIN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
