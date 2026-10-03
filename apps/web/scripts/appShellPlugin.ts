import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/** Paths Vite (or the /api proxy) serves itself; everything else is an app route. */
const DEV_PASS_THROUGH = /^\/(?:@|api(?:\/|$)|src\/|node_modules\/|__)/;

/**
 * Serves `<name>.html` as the SPA shell in dev and writes it as `index.html`
 * in the build, so each app host has a plain `index.html` like the public one.
 */
export function appShellPlugin(htmlFile: string): Plugin {
  let outDir = '';
  let isBuild = false;
  return {
    name: 'app-shell',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
      isBuild = config.command === 'build';
    },
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? '/';
        const pathname = url.split(/[?#]/)[0] ?? '/';
        const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
        const isGet = req.method === 'GET' || req.method === 'HEAD';
        const isRoot = pathname === '/' || pathname === '/index.html';
        if (
          isGet &&
          (isRoot ||
            (!DEV_PASS_THROUGH.test(pathname) &&
              !lastSegment.includes('.') &&
              (req.headers.accept ?? '').includes('text/html')))
        ) {
          req.url = `/${htmlFile}`;
        }
        next();
      });
    },
    writeBundle() {
      if (!isBuild) return;
      const from = path.join(outDir, htmlFile);
      if (!fs.existsSync(from)) {
        throw new Error(`Missing ${from}: Vite build did not emit the shell`);
      }
      fs.renameSync(from, path.join(outDir, 'index.html'));
    },
  };
}
