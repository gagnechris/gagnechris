import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { sitemapPlugin } from './scripts/sitemapPlugin.ts'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react(), sitemapPlugin()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
  },
})
