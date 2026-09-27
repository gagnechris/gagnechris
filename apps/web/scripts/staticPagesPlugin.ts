import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import {
  STATIC_PAGE_META,
  applyNotFoundPageMeta,
  applySpaShellMeta,
  applyStaticPageMeta,
  outputRelativePath,
} from './staticPageMeta.ts'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * After Vite emits dist/index.html, write per-route shells with page meta
 * (home, /resume, /contact) so LinkedIn/Slack previews are correct (CHR-37).
 * Also emits /spa.html (admin/auth) and /404.html (CHR-102).
 */
export function staticPagesPlugin(): Plugin {
  return {
    name: 'static-page-meta',
    apply: 'build',
    closeBundle() {
      const shellPath = path.join(appRoot, 'dist/index.html')
      if (!fs.existsSync(shellPath)) {
        throw new Error(`Missing ${shellPath} — Vite build did not emit index.html`)
      }
      const shell = fs.readFileSync(shellPath, 'utf8')

      // Capture the pristine Vite shell before home meta is applied.
      fs.writeFileSync(
        path.join(appRoot, 'dist/spa.html'),
        applySpaShellMeta(shell),
      )
      fs.writeFileSync(
        path.join(appRoot, 'dist/404.html'),
        applyNotFoundPageMeta(shell),
      )

      for (const meta of STATIC_PAGE_META) {
        const html = applyStaticPageMeta(shell, meta)
        const rel = outputRelativePath(meta.routePath)
        const outPath = path.join(appRoot, 'dist', rel)
        fs.mkdirSync(path.dirname(outPath), { recursive: true })
        fs.writeFileSync(outPath, html)
      }
    },
  }
}
