/**
 * Edit > Undo / Redo (Ctrl+Z) while a dialog is open (2026-11-22, Sentry
 * ELECTRON-3A/3B). The project behind a dialog is left alone; in a text field
 * the key undoes the typing; with the dialog closed it undoes the project
 * edit again. Before the fix, Ctrl+Z in New Micrograph's scale step removed
 * the sample behind the dialog and Finish found none. One copy, not synced.
 */

import { test, expect } from '../lib/test';
import { ACCOUNTS } from '../lib/copy';
import { openSmz, viewMicrograph, addSpot, spotIds } from '../lib/actions';

test('Undo with a dialog open leaves the project alone; in a text field it undoes the typing', async ({ launch, project }) => {
  const p = await project('E2E Undo Dialog');
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await viewMicrograph(ana, p.micrographId);

  const spotId = await addSpot(ana, p.micrographId, 'S1');
  /** Is the new spot in the project? (the test project has spots of its own) */
  const spots = async () => ((await spotIds(ana, p.micrographId)) ?? []).filter((id) => id === spotId);
  await expect.poll(spots).toEqual([spotId]);
  await ana.page.waitForTimeout(600); // the spot is its own undo step (bursts end after 300 ms quiet)

  await ana.menu('File', 'Edit Project');
  const dialog = ana.page.getByRole('dialog', { name: 'Edit Project' });
  await expect(dialog).toBeVisible();

  await ana.caption('Undo and Redo with the dialog open, no text field: the spot stays');
  await dialog.getByRole('heading', { name: 'Edit Project' }).click();
  await ana.menu('Edit', 'Undo');
  await ana.page.waitForTimeout(500);
  expect(await spots()).toEqual([spotId]);
  await ana.menu('Edit', 'Redo');
  await ana.page.waitForTimeout(300);
  expect(await spots()).toEqual([spotId]);

  await ana.caption('typing in Project Name, then Undo: the typing goes, the spot stays');
  const name = dialog.getByLabel('Project Name');
  await expect(name).toHaveValue('E2E Undo Dialog');
  await name.click();
  await name.press('End');
  await name.pressSequentially(' two');
  await expect(name).toHaveValue('E2E Undo Dialog two');
  await ana.menu('Edit', 'Undo');
  await expect(name).toHaveValue('E2E Undo Dialog');
  expect(await spots()).toEqual([spotId]);
  await ana.menu('Edit', 'Redo');
  await expect(name).toHaveValue('E2E Undo Dialog two');
  expect(await spots()).toEqual([spotId]);

  await ana.caption('dialog closed: Undo takes the spot away, Redo brings it back');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await ana.menu('Edit', 'Undo');
  await expect.poll(spots).toEqual([]);
  await ana.menu('Edit', 'Redo');
  await expect.poll(spots).toEqual([spotId]);
});
