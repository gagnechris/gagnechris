import { defineConfig, devices } from '@playwright/test';

const CI = Boolean(process.env.CI);
// Playwright wipes its output dir on start, so concurrent runs in one
// checkout need their own.
const OUT = process.env.E2E_OUTPUT_DIR ?? '.';

export default defineConfig({
  testDir: './tests',
  outputDir: `${OUT}/test-results`,
  globalSetup: './global-setup.ts',
  fullyParallel: true,
  forbidOnly: CI,
  // One retry in CI only, so a flake can't redden a PR or main; the CI job
  // still lists every test that needed it.
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ...(CI
      ? ([['github'], ['json', { outputFile: `${OUT}/results.json` }]] as const)
      : []),
    ['html', { outputFolder: `${OUT}/playwright-report`, open: 'never' }],
  ],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // HTTP only, run alone first: it publishes Home and checks its recent
    // posts, which the browser specs' publishes would race.
    { name: 'api', testMatch: /publish-lifecycle\.spec\.ts$/ },
    {
      name: 'chromium',
      testIgnore: /publish-lifecycle\.spec\.ts$/,
      dependencies: ['api'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      testIgnore: /publish-lifecycle\.spec\.ts$/,
      dependencies: ['api'],
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
