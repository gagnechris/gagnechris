import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      ADMIN_WEB_CLIENT_ID: 'test-admin-web',
      NOTEBOOK_WEB_CLIENT_ID: 'test-notebook-web',
      IOS_CLIENT_ID: 'test-ios',
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['**/*.test.ts'],
          exclude: ['http/**', 'node_modules/**'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          // Black-box: plain HTTP to the Go API, one server per file.
          name: 'http',
          include: ['http/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['support/global-setup.ts'],
          // Per-file ephemeral tables (gagnechris-it-*) allow parallel files.
          hookTimeout: 120_000,
          testTimeout: 60_000,
        },
      },
    ],
  },
});
