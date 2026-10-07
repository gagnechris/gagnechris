import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Lets a test force garbage collection to prove per-request state is released.
    execArgv: ['--expose-gc'],
  },
});
