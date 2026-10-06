import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, type PluginOption } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { analyticsPlugin, gaMeasurementId } from './scripts/analyticsPlugin.ts';
import { appShellPlugin } from './scripts/appShellPlugin.ts';
import { bundleBoundaryPlugin } from './scripts/bundleBoundaryPlugin.ts';
import {
  ADMIN_EDITOR_BUDGET,
  editorBundlePlugin,
} from './scripts/editorBundlePlugin.ts';
import { sitemapPlugin } from './scripts/sitemapPlugin.ts';
import { staticPagesPlugin } from './scripts/staticPagesPlugin.ts';
import { appOrigin, WEB_APPS, webAppFromEnv } from './scripts/webApps.ts';

const DEFAULT_LOCAL_API = 'http://127.0.0.1:8787';
const appRoot = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  // Empty prefix so we can read VITE_* (and optional VITE_LOCAL_API_ORIGIN).
  const env = loadEnv(mode, process.cwd(), '');
  const appName = webAppFromEnv(process.env.WEB_APP);
  const app = WEB_APPS[appName];

  if (command === 'build' && env.VITE_AUTH_MODE === 'local') {
    throw new Error(
      'VITE_AUTH_MODE=local is not allowed in production Vite builds',
    );
  }
  if (command === 'build') {
    const missing = app.requiredEnv.filter((name) => !env[name]?.trim());
    if (missing.length > 0) {
      throw new Error(
        `WEB_APP=${appName} build needs ${missing.join(', ')} (see apps/web/.env.example)`,
      );
    }
  }

  const publicOrigin = appOrigin(
    'public',
    env.VITE_PUBLIC_SITE_ORIGIN,
    command,
  );
  const adminOrigin = appOrigin('admin', env.VITE_ADMIN_ORIGIN, command);
  const notebookOrigin = appOrigin(
    'notebook',
    env.VITE_NOTEBOOK_ORIGIN,
    command,
  );

  // process.env only: a .env file must not be able to switch GA on.
  const gaId =
    command === 'build' && appName === 'public'
      ? gaMeasurementId(process.env.GA_MEASUREMENT_ID)
      : undefined;

  const useProdApi = env.VITE_API_TARGET === 'prod';
  const proxyTarget = useProdApi
    ? 'https://gagnechris.com'
    : env.VITE_LOCAL_API_ORIGIN?.trim() || DEFAULT_LOCAL_API;
  const localSiteOrigin = env.VITE_LOCAL_SITE_ORIGIN?.trim();

  if (useProdApi) {
    console.warn(
      `[vite:${appName}] VITE_API_TARGET=prod — /api proxies to https://gagnechris.com (live DynamoDB).`,
    );
  } else if (command === 'serve') {
    console.info(
      `[vite:${appName}] /api proxies to ${proxyTarget} (local). Use VITE_API_TARGET=prod only when you intend to hit production.`,
    );
    if (localSiteOrigin && appName === 'public') {
      console.info(
        `[vite:${appName}] /__site proxies to ${localSiteOrigin} (publisher HTML + posts.json).`,
      );
    }
  }

  const proxy: Record<
    string,
    {
      target: string;
      changeOrigin: boolean;
      secure: boolean;
      rewrite?: (path: string) => string;
    }
  > = {
    '/api': {
      target: proxyTarget,
      changeOrigin: true,
      secure: proxyTarget.startsWith('https'),
    },
  };

  if (localSiteOrigin && !useProdApi) {
    if (appName === 'public') {
      // Do NOT proxy /posts or /assets — that would serve the seeded production
      // shell/JS and bypass Vite HMR (old PostPage → NotFound for CMS slugs).
      // PostPage fetches publisher HTML via this prefix instead.
      proxy['/__site'] = {
        target: localSiteOrigin,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/__site/, '') || '/',
      };
      // Publisher-generated PDF (same origin as prod `/resume.pdf`).
      proxy['/resume.pdf'] = {
        target: localSiteOrigin,
        changeOrigin: true,
        secure: false,
      };
    } else if (appName === 'admin') {
      // Prod serves /media from the site bucket on the admin host too.
      proxy['/media'] = {
        target: localSiteOrigin,
        changeOrigin: true,
        secure: false,
      };
    }
  }

  const plugins: PluginOption[] =
    appName === 'public'
      ? [
          react(),
          appShellPlugin(app.html),
          analyticsPlugin(gaId),
          sitemapPlugin(),
          staticPagesPlugin(),
          bundleBoundaryPlugin(),
          editorBundlePlugin(null),
        ]
      : [
          react(),
          appShellPlugin(app.html),
          editorBundlePlugin(appName === 'admin' ? ADMIN_EDITOR_BUDGET : null),
        ];

  return {
    base: '/',
    define: {
      'import.meta.env.VITE_PUBLIC_SITE_ORIGIN': JSON.stringify(publicOrigin),
      'import.meta.env.VITE_ADMIN_ORIGIN': JSON.stringify(adminOrigin),
      'import.meta.env.VITE_NOTEBOOK_ORIGIN': JSON.stringify(notebookOrigin),
      // Vitest stubs it per test instead.
      ...(process.env.VITEST
        ? {}
        : {
            'import.meta.env.VITE_GA_MEASUREMENT_ID': JSON.stringify(
              gaId ?? '',
            ),
          }),
    },
    plugins,
    publicDir: path.join(appRoot, app.publicDir),
    // The three dev servers run side by side; a shared optimizer cache makes
    // each one invalidate the others' pre-bundled deps mid-load.
    cacheDir: path.join(appRoot, 'node_modules', '.vite', appName),
    optimizeDeps: { entries: [app.html] },
    server: {
      port: app.port,
      strictPort: true,
      proxy,
    },
    preview: {
      port: app.port,
      strictPort: true,
    },
    build: {
      outDir: path.join(appRoot, app.outDir),
      emptyOutDir: true,
      // check:web-shells reads it to keep demo chunks off pages without a demo.
      manifest: appName === 'public',
      rollupOptions: {
        input: path.join(appRoot, app.html),
      },
      // Keep admin/editor chunks under the AC budget (CHR-178).
      chunkSizeWarningLimit: 500,
      // No manualChunks: under Vite 8 / Rolldown a manual `markdown-editor`
      // group also captured React, so the entry statically imported (and
      // modulepreloaded) the whole CodeMirror chunk. The two
      // `lazy(() => import('…/MarkdownEditor'))` call sites (Post +
      // Notebook) already share one natural async chunk (CHR-178).
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/setupTests.ts'],
    },
  };
});
