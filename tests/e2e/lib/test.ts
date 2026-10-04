/**
 * The scenarios' test(): `launch(label, account)` starts a copy of the app
 * (lib/copy.ts) and logs it in; every copy is closed at the end. A failed
 * test gets each copy's screenshot and main log attached (see the HTML
 * report, or the trace: npx playwright show-trace <zip>).
 */

import { test as base, expect } from '@playwright/test';
import fs from 'fs';
import { Copy, launchCopy, newRunDir, type Account } from './copy';
import { makeProject, type FixtureProject } from './fixtures';

interface Fixtures {
  launch: (label: string, account: Account, opts?: { login?: boolean }) => Promise<Copy>;
  project: (name: string, spotNames?: string[]) => Promise<FixtureProject>;
  runDir: string;
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  runDir: async ({}, use) => {
    await use(newRunDir());
  },
  launch: async ({ runDir }, use, testInfo) => {
    const copies: Copy[] = [];
    await use(async (label, account, opts = {}) => {
      const copy = await launchCopy(label, account, copies.length, runDir);
      copies.push(copy);
      await copy.page.context().tracing.start({ screenshots: true, snapshots: true, title: label }).catch(() => undefined);
      if (opts.login !== false) await copy.login();
      return copy;
    });
    for (const copy of copies) {
      const failed = testInfo.status !== testInfo.expectedStatus;
      if (failed) {
        const shot = await copy.page.screenshot().catch(() => null);
        if (shot) await testInfo.attach(`${copy.label} screen`, { body: shot, contentType: 'image/png' });
        if (fs.existsSync(copy.logFile)) await testInfo.attach(`${copy.label} main.log`, { path: copy.logFile, contentType: 'text/plain' });
        if (copy.alerts.length) await testInfo.attach(`${copy.label} alerts`, { body: copy.alerts.join('\n'), contentType: 'text/plain' });
        if (copy.consoleErrors.length) await testInfo.attach(`${copy.label} console errors`, { body: copy.consoleErrors.join('\n'), contentType: 'text/plain' });
        const unanswered = await copy.unansweredDialogs().catch(() => []);
        if (unanswered.length) await testInfo.attach(`${copy.label} unanswered dialogs`, { body: unanswered.join('\n'), contentType: 'text/plain' });
      }
      const tracePath = testInfo.outputPath(`${copy.label}-trace.zip`);
      await copy.page.context().tracing.stop(failed ? { path: tracePath } : undefined).catch(() => undefined);
      if (failed && fs.existsSync(tracePath)) await testInfo.attach(`${copy.label} trace`, { path: tracePath, contentType: 'application/zip' });
      await copy.close();
    }
  },
  project: async ({ runDir }, use) => {
    await use((name, spotNames) => makeProject(`${runDir}/fixtures`, name, spotNames));
  },
});

export { expect };
