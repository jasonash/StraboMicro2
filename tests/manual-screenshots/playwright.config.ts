/**
 * Screenshots for the user manual (docs/OverleafManual), taken from a real
 * copy of the app driven like the e2e tests (tests/e2e/lib), at 2x. Needs the
 * dev Docker stack (collab.shots.ts logs in as the e2e accounts) and port
 * 5173 free. Writes PNGs to MANUAL_FIGURES (default: the manual's Figures
 * folder). MANUAL_DEMO is a folder with the two demo projects as .smz files
 * named <project id>.smz (lib.ts FELDSPAR, TOXAWAY; zip each project folder
 * of StraboMicro2Data). Demo test names are tidied in the copy only.
 * annotate-overview.js then draws the labeled panels on the overview.
 *
 *   MANUAL_DEMO=<folder> MANUAL_FIGURES=<folder> npm run manual:screenshots [-- core tools micrographs collab]
 *   node tests/manual-screenshots/annotate-overview.js <MANUAL_FIGURES>
 */

import { defineConfig } from '@playwright/test';

// Figures at 2x for print (a background copy would otherwise render at 1x)
process.env.E2E_ELECTRON_ARGS = process.env.E2E_ELECTRON_ARGS || '--force-device-scale-factor=2';

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.shots\.ts$/,
  globalSetup: '../e2e/globalSetup.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 40 * 60_000,
  expect: { timeout: 30_000 },
  outputDir: '../../test-results/manual-screenshots',
  reporter: [['list']],
  use: { actionTimeout: 30_000 },
  webServer: {
    command: 'npm run dev:vite',
    cwd: '../..',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
