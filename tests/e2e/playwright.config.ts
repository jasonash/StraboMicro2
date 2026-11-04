/**
 * End-to-end tests of the real app (several copies, different accounts)
 * against the local dev server. See tests/e2e/README.md.
 *
 *   npm run e2e          all scenarios
 *   npm run e2e:watch    windows side by side, captions, pauses
 */

import { defineConfig } from '@playwright/test';

const WATCH = process.env.E2E_WATCH === '1';

export default defineConfig({
  testDir: './scenarios',
  globalSetup: './globalSetup.ts',
  // One scenario at a time: the copies share the server and the screen
  workers: 1,
  fullyParallel: false,
  timeout: WATCH ? 15 * 60_000 : 4 * 60_000,
  expect: { timeout: 20_000 },
  outputDir: '../../test-results/e2e',
  reporter: [['list'], ['html', { outputFolder: '../../playwright-report/e2e', open: 'never' }]],
  use: {
    actionTimeout: 20_000,
  },
  webServer: {
    command: 'npm run dev:vite',
    cwd: '../..',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
