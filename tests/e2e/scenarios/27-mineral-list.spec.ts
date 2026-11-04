/**
 * Mineral pickers list every common mineral (Peter, 2026-10-29: the lists
 * stopped at Dolomite, the 50th of the 150 shortlist minerals in
 * src/data/mineralDB.csv), and typing finds any mineral. Checked in Fabric
 * Info > Grain Shape > Phases, where Peter also could not type: the picker's
 * value was a new array at every render, so the multiple Autocomplete took it
 * as a new selection and cleared the typed text. Every mineral picker is
 * AutocompleteMineralSearch. A name that is not in the mineral list (Peter's
 * "lithic fragments", "glass") is used through 'Use "..."', saved as the plain
 * name, and offered again in the project's other pickers
 * (src/utils/customMinerals.ts). Needs no server work: one copy, not synced.
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

/** The micrograph's saved Mineralogy names and Fabric phases */
async function savedNames(copy: Copy, micrographId: string): Promise<{ minerals: string[]; phases: string[] }> {
  return (await copy.state(new Function('e', `
    for (const d of e.app.getState().project?.datasets ?? []) for (const s of d.samples ?? [])
      for (const m of s.micrographs ?? []) if (m.id === ${JSON.stringify(micrographId)})
        return {
          minerals: (m.mineralogy?.minerals ?? []).map((x) => x.name),
          phases: (m.fabricInfo?.fabrics ?? []).flatMap((f) => f.fabricGrainShapeInfo?.phases ?? []),
        };
    return null;`) as never)) as unknown as { minerals: string[]; phases: string[] };
}

test('a name not in the mineral list is used with Use "...", saved as typed, and offered again', async ({ launch, project }) => {
  const p = await project('E2E Custom Mineral', []);
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await viewMicrograph(ana, p.micrographId);
  const page = ana.page;

  await ana.caption('Mineralogy: types lithic fragments, picks Use "lithic fragments", Add, Save');
  await page.getByPlaceholder('Select or search data type...').click();
  await page.getByRole('option', { name: 'Mineralogy/Lithology' }).click();
  const mineralogy = page.getByRole('dialog', { name: 'Micrograph Mineralogy/Lithology' });
  const mineral = mineralogy.getByRole('combobox', { name: 'Mineral' });
  await mineral.click();
  await mineral.pressSequentially('lithic fragments');
  const use = page.getByRole('option', { name: /^Use "lithic fragments"/ });
  await expect(use).toContainText('not in mineral list');
  await use.click();
  await mineralogy.getByRole('button', { name: 'Add', exact: true }).click();
  await mineralogy.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(mineralogy).toBeHidden();
  await expect.poll(async () => (await savedNames(ana, p.micrographId)).minerals).toEqual(['lithic fragments']);

  await ana.caption('Fabric Phases: Lithic Fragments finds the project name (no second spelling); glass is new');
  await page.getByPlaceholder('Select or search data type...').click();
  await page.getByRole('option', { name: 'Fabrics' }).click();
  const fabric = page.getByRole('dialog', { name: 'Micrograph Fabric Info' });
  await fabric.getByLabel(/^Fabric Label/).fill('F1');
  await fabric.getByLabel('Grain Shape').check();
  const phases = fabric.getByRole('combobox', { name: 'Phases' });
  await phases.click();
  await phases.pressSequentially('Lithic Fragments');
  await expect(page.getByRole('option', { name: /^Use "/ })).toHaveCount(0);
  await page.getByRole('option', { name: /^lithic fragments/ }).click();
  await typeAndPick(ana, phases, 'glass', 'Use "glass"');
  await expect(fabric.getByRole('button', { name: 'lithic fragments (not in mineral list)' })).toBeVisible();
  await expect(fabric.getByRole('button', { name: 'glass (not in mineral list)' })).toBeVisible();
  await fabric.getByRole('button', { name: 'Add', exact: true }).click();
  await fabric.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(fabric).toBeHidden();
  await expect.poll(async () => (await savedNames(ana, p.micrographId)).phases).toEqual(['lithic fragments', 'glass']);

  await ana.caption('Phases again with nothing typed: the project names follow the 150 common minerals');
  await page.getByPlaceholder('Select or search data type...').click();
  await page.getByRole('option', { name: 'Fabrics' }).click();
  await fabric.getByLabel('Grain Shape').check();
  await phases.click();
  const listbox = page.getByRole('listbox');
  await expect(listbox.getByRole('option')).toHaveCount(152);
  await expect(listbox.getByRole('option').nth(150)).toContainText('lithic fragments');
  await expect(listbox.getByRole('option').nth(151)).toContainText('glass');
});
