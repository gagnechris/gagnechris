import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Stack tests bundle Lambdas with esbuild (Data-prod too since CHR-198);
    // under a parallel `npm test` that can pass the 5 s default.
    testTimeout: 30_000,
  },
});
