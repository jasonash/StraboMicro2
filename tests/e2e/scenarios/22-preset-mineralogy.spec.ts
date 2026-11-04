/**
 * Mineralogy/Lithology dialog: Save with a mineral or lithology chosen but
 * not added asks first (Add and Save / Save Without It / Back), which also
 * shows that Add is what puts it in the list (Jason, 2026-10-25: a preset
 * mineral picked without Add was silently dropped). Each opening starts with
 * an empty Mineral field (the preset editor keeps the dialog mounted).
 */

import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { openSmz } from '../lib/actions';

/** Spot > Quick Spot Presets... > New Preset > Add Data Type > Mineralogy/Lithology */
async function newPresetMineralogy(copy: Copy, presetName: string) {
  await copy.menu('Spot', 'Quick Spot Presets...');
  const presets = copy.page.getByRole('dialog', { name: 'Quick Spot Presets' });
  await presets.getByRole('button', { name: 'New Preset' }).click();
  const editor = copy.page.getByRole('dialog', { name: 'Create New Preset' });
  await editor.getByLabel('Preset Name').fill(presetName);
  const mineralogy = await openMineralogy(copy, editor);
  return { presets, editor, mineralogy, mineral: mineralogy.getByRole('combobox', { name: 'Mineral' }) };
}

async function openMineralogy(copy: Copy, editor: ReturnType<Copy['page']['getByRole']>) {
  const addData = editor.getByRole('button', { name: 'Add Data Type' });
  const section = editor.getByRole('button', { name: /Geological Data/ });
  if ((await section.getAttribute('aria-expanded')) !== 'true') await section.click();
  await addData.click();
  await copy.page.getByRole('menuitem', { name: /Mineralogy\/Lithology/ }).click();
  const mineralogy = copy.page.getByRole('dialog', { name: 'Preset Mineralogy/Lithology' });
  await expect(mineralogy).toBeVisible();
  return mineralogy;
}

async function pickMineral(copy: Copy, mineral: ReturnType<Copy['page']['getByRole']>, name: string) {
  await mineral.fill(name);
  await copy.page.getByRole('option', { name }).first().click(); // "Zircon Zrn": name + abbreviation
  await expect(mineral).toHaveValue(name);
}

/** Minerals and lithologies of a preset by name (global or project) */
async function presetData(copy: Copy, name: string) {
  return copy.state(new Function('e', `
    const s = e.app.getState();
    const p = [...(s.globalPresets ?? []), ...(s.project?.presets ?? [])].find((x) => x.name === ${JSON.stringify(name)});
    if (!p) return null;
    return {
      minerals: (p.data?.mineralogy?.minerals ?? []).map((m) => m.name),
      lithologies: (p.data?.lithologyInfo?.lithologies ?? []).map((l) => [l.level1, l.level2].join(' > ')),
    };`) as never) as Promise<{ minerals: string[]; lithologies: string[] } | null>;
}

test('Save with a mineral chosen but not added asks first; each opening starts empty', async ({ launch, project }) => {
  const p = await project('E2E Preset Mineralogy', ['Grain 1']);
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);

  await ana.caption('Zircon chosen, Save without Add: the dialog asks');
  let d = await newPresetMineralogy(ana, 'Zircon grain');
  await pickMineral(ana, d.mineral, 'Zircon');
  await d.mineralogy.getByRole('button', { name: 'Save' }).click();
  let ask = ana.page.getByRole('dialog', { name: 'Add before saving?' });
  await expect(ask.getByText(/You chose the mineral Zircon but did not press Add/)).toBeVisible();

  await ana.caption('Back keeps the dialog and the choice');
  await ask.getByRole('button', { name: 'Back' }).click();
  await expect(ask).toBeHidden();
  await expect(d.mineral).toHaveValue('Zircon');

  await ana.caption('Add and Save puts Zircon in the preset');
  await d.mineralogy.getByRole('button', { name: 'Save' }).click();
  await ask.getByRole('button', { name: 'Add and Save' }).click();
  await expect(d.mineralogy).toBeHidden();
  await d.editor.getByRole('button', { name: 'Create' }).click();
  await expect.poll(() => presetData(ana, 'Zircon grain')).toEqual({ minerals: ['Zircon'], lithologies: [] });
  await d.presets.getByRole('button', { name: 'Close' }).click();

  await ana.caption('the next preset starts with an empty Mineral field');
  d = await newPresetMineralogy(ana, 'Quartz grain');
  await expect(d.mineral).toHaveValue('');

  await ana.caption('Save Without It saves nothing for the chosen mineral');
  await pickMineral(ana, d.mineral, 'Quartz');
  await d.mineralogy.getByRole('button', { name: 'Save' }).click();
  ask = ana.page.getByRole('dialog', { name: 'Add before saving?' });
  await ask.getByRole('button', { name: 'Save Without It' }).click();
  await expect(d.mineralogy).toBeHidden();

  await ana.caption('added minerals save without a question, and the field is empty again');
  const again = await openMineralogy(ana, d.editor);
  const mineral = again.getByRole('combobox', { name: 'Mineral' });
  await expect(mineral).toHaveValue('');
  await pickMineral(ana, mineral, 'Quartz');
  await again.getByRole('button', { name: 'Add', exact: true }).click();
  await again.getByRole('button', { name: 'Save' }).click();
  await expect(again).toBeHidden();
  await expect(ana.page.getByRole('dialog', { name: 'Add before saving?' })).toBeHidden();
  await d.editor.getByRole('button', { name: 'Create' }).click();
  await expect.poll(() => presetData(ana, 'Quartz grain')).toEqual({ minerals: ['Quartz'], lithologies: [] });
});

test('a lithology chosen but not added is asked about too', async ({ launch, project }) => {
  const p = await project('E2E Preset Lithology', ['Grain 1']);
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);

  const d = await newPresetMineralogy(ana, 'Granite');
  await d.mineralogy.getByRole('tab', { name: 'Lithology' }).click();
  const combos = d.mineralogy.getByRole('combobox');
  await combos.nth(0).click();
  const level1 = await ana.page.getByRole('option').first().textContent();
  await ana.page.getByRole('option').first().click();
  await combos.nth(1).click();
  const level2 = await ana.page.getByRole('option').first().textContent();
  await ana.page.getByRole('option').first().click();

  await d.mineralogy.getByRole('button', { name: 'Save' }).click();
  const ask = ana.page.getByRole('dialog', { name: 'Add before saving?' });
  await expect(ask.getByText(`You chose the lithology ${level1} > ${level2}`, { exact: false })).toBeVisible();
  await ask.getByRole('button', { name: 'Add and Save' }).click();
  await d.editor.getByRole('button', { name: 'Create' }).click();
  await expect.poll(() => presetData(ana, 'Granite')).toEqual({ minerals: [], lithologies: [`${level1} > ${level2}`] });
});
