import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { sitemapPlugin } from './scripts/sitemapPlugin.ts'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react(), sitemapPlugin()],
  server: {
    // Local admin → same-origin /api → prod API Gateway via CloudFront.
    proxy: {
      '/api': {
        target: 'https://gagnechris.com',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
  },
})
