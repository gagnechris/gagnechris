/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COGNITO_USER_POOL_ID: string
  readonly VITE_COGNITO_WEB_CLIENT_ID: string
  readonly VITE_COGNITO_AUTH_DOMAIN: string
  /** Optional override; default is same-origin (empty string). */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
