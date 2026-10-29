/**
 * Mineral pickers list every common mineral (Peter, 2026-10-29: the lists
 * stopped at Dolomite, the 50th of the 150 shortlist minerals in
 * src/data/mineralDB.csv), and typing finds any mineral. Checked in Fabric
 * Info > Grain Shape > Phases, where Peter also could not type: the picker's
 * value was a new array at every render, so the multiple Autocomplete took it
 * as a new selection and cleared the typed text. Every mineral picker is
 * AutocompleteMineralSearch. Needs no server work: one copy, not synced.
 */

import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { openSmz, viewMicrograph } from '../lib/actions';
import type { Locator } from '@playwright/test';

/** Opens the picker's list with nothing typed: all common minerals, Actinolite to Zoisite */
async function expectFullList(copy: Copy, input: Locator) {
  await input.click();
  const listbox = copy.page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  await expect(listbox.getByRole('option')).toHaveCount(150);
  await expect(listbox.getByRole('option').first()).toContainText('Actinolite');
  await expect(listbox.getByRole('option').nth(50)).toContainText('Enstatite');
  await expect(listbox.getByRole('option').last()).toContainText('Zoisite');
}

/** Types part of a name and picks the mineral */
async function typeAndPick(copy: Copy, input: Locator, typed: string, mineral: string) {
  await input.click();
  await input.pressSequentially(typed);
  await expect(input).toHaveValue(typed);
  await copy.page.getByRole('option', { name: new RegExp(`^${mineral}`) }).click();
}

test('Fabric Info > Grain Shape > Phases lists all common minerals and finds typed ones', async ({ launch, project }) => {
  const p = await project('E2E Mineral List Fabric', []);
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await viewMicrograph(ana, p.micrographId);
  const page = ana.page;

  await ana.caption('Add Data > Fabrics, Grain Shape');
  await page.getByPlaceholder('Select or search data type...').click();
  await page.getByRole('option', { name: 'Fabrics' }).click();
  const dialog = page.getByRole('dialog', { name: 'Micrograph Fabric Info' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Grain Shape').check();
  const phases = dialog.getByRole('combobox', { name: 'Phases' });

  await ana.caption('Phases with nothing typed: all 150 common minerals');
  await expectFullList(ana, phases);
  await page.keyboard.press('Escape');

  await ana.caption('types a common mineral past Dolomite, then one not on the short list');
  await typeAndPick(ana, phases, 'Ensta', 'Enstatite');
  await typeAndPick(ana, phases, 'Abellai', 'Abellaite');
  await expect(dialog.getByRole('button', { name: /^Enstatite/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^Abellaite/ })).toBeVisible();
});
