/**
 * The harness itself: a copy starts, logs in through the Sign in dialog,
 * and opens a project with File > Open Local Project (.smz).
 */

import { test, expect } from '../lib/test';
import { ACCOUNTS } from '../lib/copy';

test('a copy logs in and opens a project', async ({ launch, project }) => {
  const p = await project('E2E Smoke');
  const ana = await launch('Ana', ACCOUNTS.ana);

  await ana.answerDialog({ kind: 'open', filePaths: [p.smzPath] });
  await ana.menu('File', 'Open Local Project (.smz)');
  const dialog = ana.page.getByRole('dialog', { name: 'Open Project' });
  await expect(dialog).toBeVisible();
  await ana.page.screenshot({ path: 'test-results/e2e/smoke-import.png' });
});
