import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    // app-core lives in the root workspace tree, so a bare `react` /
    // `@tanstack/react-query` import from it would otherwise load the root copy
    // alongside this app's copy and break hooks. Metro does the same via
    // `nodeModulesPaths` (CHR-150 / CHR-173).
    dedupe: ['react', '@tanstack/react-query'],
    conditions: ['react-native', 'import', 'default'],
  },
});
