import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/go-build-setup.ts'],
    // Stack tests bundle Lambdas with esbuild and go; under a parallel
    // `npm test` that can pass the 5 s default.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
