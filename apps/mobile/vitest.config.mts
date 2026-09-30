import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    // app-core lives in the root workspace tree, so a bare `react` import from
    // it would otherwise load the root copy alongside this app's copy and break
    // hooks. Metro does the same via `nodeModulesPaths` (CHR-150).
    dedupe: ['react'],
    conditions: ['react-native', 'import', 'default'],
  },
});
