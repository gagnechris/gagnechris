import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { sitemapPlugin } from './scripts/sitemapPlugin.ts'

const DEFAULT_LOCAL_API = 'http://127.0.0.1:8787'

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  // Empty prefix so we can read VITE_* (and optional VITE_LOCAL_API_ORIGIN).
  const env = loadEnv(mode, process.cwd(), '')

  if (command === 'build' && env.VITE_AUTH_MODE === 'local') {
    throw new Error(
      'VITE_AUTH_MODE=local is not allowed in production Vite builds',
    )
  }

  const useProdApi = env.VITE_API_TARGET === 'prod'
  const proxyTarget = useProdApi
    ? 'https://gagnechris.com'
    : env.VITE_LOCAL_API_ORIGIN?.trim() || DEFAULT_LOCAL_API

  if (useProdApi) {
    console.warn(
      '[vite] VITE_API_TARGET=prod — /api proxies to https://gagnechris.com (live DynamoDB).',
    )
  } else if (command === 'serve') {
    console.info(
      `[vite] /api proxies to ${proxyTarget} (local). Use VITE_API_TARGET=prod only when you intend to hit production.`,
    )
  }

  return {
    base: '/',
    plugins: [react(), sitemapPlugin()],
    server: {
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: proxyTarget.startsWith('https'),
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/setupTests.ts'],
    },
  }
})
