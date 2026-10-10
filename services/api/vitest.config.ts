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
          include: ['test/**/*.test.ts'],
          exclude: ['test/integration/**', 'test/http/**'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['test/integration/global-setup.ts'],
          // Per-file ephemeral tables (gagnechris-it-*) allow parallel files.
          hookTimeout: 120_000,
          testTimeout: 60_000,
        },
      },
      {
        extends: true,
        test: {
          // Black-box: plain HTTP to the server API_SERVER_COMMAND starts.
          name: 'http',
          include: ['test/http/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['test/integration/global-setup.ts'],
          hookTimeout: 120_000,
          testTimeout: 60_000,
        },
      },
    ],
  },
});
