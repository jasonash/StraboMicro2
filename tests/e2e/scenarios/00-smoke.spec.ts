/**
 * The harness itself: a copy starts, logs in through the Sign in dialog,
 * and opens a project with File > Open Local Project (.smz).
 */

import { test, expect } from '../lib/test';
import { ACCOUNTS } from '../lib/copy';
import { openSmz } from '../lib/actions';

test('a copy logs in and opens a project', async ({ launch, project }) => {
  const p = await project('E2E Smoke');
  const ana = await launch('Ana', ACCOUNTS.ana);

  await ana.answerDialog({ kind: 'open', filePaths: [p.smzPath] });
  await ana.menu('File', 'Open Local Project (.smz)');
  const dialog = ana.page.getByRole('dialog', { name: 'Open Project' });
  await expect(dialog).toBeVisible();
  await ana.page.screenshot({ path: 'test-results/e2e/smoke-import.png' });
});

test('an .smz export whose file cannot be written says so instead of hanging', async ({ launch, project, runDir }) => {
  const p = await project('E2E Export Fails');
  const ana = await launch('Ana', ACCOUNTS.ana);
  await openSmz(ana, p.smzPath, p.id);

  // A folder that is not there (removed after it was picked, a drive unplugged)
  await ana.answerDialog({ kind: 'save', filePath: `${runDir}/gone/export.smz` });
  await ana.menu('File', 'Export as .smz...');
  const dialog = ana.page.getByRole('dialog', { name: 'Export Project as .smz' });
  await expect(dialog.getByText('Export Failed')).toBeVisible({ timeout: 30_000 });
  await expect(dialog).toContainText('ENOENT');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
});
