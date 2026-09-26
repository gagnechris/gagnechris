import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sitemapPlugin } from './scripts/sitemapPlugin'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react(), sitemapPlugin()],
})
