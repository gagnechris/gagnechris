import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import {
  STATIC_PAGE_META,
  applyNotFoundPageMeta,
  applyStaticPageMeta,
  outputRelativePath,
} from './staticPageMeta.ts';

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

/** Per-route shells carry page meta so LinkedIn/Slack previews are correct. */
export function staticPagesPlugin(): Plugin {
  return {
    name: 'static-page-meta',
    apply: 'build',
    writeBundle() {
      const shellPath = path.join(appRoot, 'dist/index.html');
      if (!fs.existsSync(shellPath)) {
        throw new Error(
          `Missing ${shellPath} — Vite build did not emit index.html`,
        );
      }
      const shell = fs.readFileSync(shellPath, 'utf8');

      // Publisher reads this only; keep the raw Vite shell before home meta.
      fs.writeFileSync(path.join(appRoot, 'dist/_shell.html'), shell);

      // No spa.html: the apex keeps serving the last one the deploy left in S3
      // for /admin* and /auth*, and the deploy refuses to overwrite it.
      fs.writeFileSync(
        path.join(appRoot, 'dist/404.html'),
        applyNotFoundPageMeta(shell),
      );

      for (const meta of STATIC_PAGE_META) {
        const html = applyStaticPageMeta(shell, meta);
        const rel = outputRelativePath(meta.routePath);
        const outPath = path.join(appRoot, 'dist', rel);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, html);
      }
    },
  };
}
