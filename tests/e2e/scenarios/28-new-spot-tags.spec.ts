/**
 * Create New Spot can put the spot in tags (Peter, 2026-10-29). The Tags
 * field lists the project's tags; the spot is saved with their ids in
 * spot.tags; the next New Spot in the project starts with the tags chosen
 * last (this session), and clearing them is remembered too. With no tags in
 * the project the field says where to create them. A Project-scope Quick Spot
 * Preset can carry tags (Global ones cannot: tags belong to a project);
 * choosing it in New Spot adds its tags to the field. One copy, not synced.
 */

import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { openSmz, viewMicrograph } from '../lib/actions';

async function start(launch: (l: string, a: typeof ACCOUNTS.ana, o?: { login?: boolean }) => Promise<Copy>,
  project: (name: string) => Promise<{ smzPath: string; id: string; micrographId: string }>, name: string) {
  const p = await project(name);
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await viewMicrograph(ana, p.micrographId);
  return { p, ana };
}

/** The tag ids of the spot with this name */
function spotTags(copy: Copy, micrographId: string, name: string): Promise<string[] | null> {
  return copy.state(new Function('e', `
    const m = e.app.getState().micrographIndex.get(${JSON.stringify(micrographId)});
    const s = (m?.spots ?? []).find((x) => x.name === ${JSON.stringify(name)});
    return s ? (s.tags ?? []) : null;`) as never) as Promise<string[] | null>;
}

/** Point tool, a click on the viewer: Create New Spot opens */
async function newPointSpot(copy: Copy, dx: number) {
  await copy.page.getByRole('button', { name: 'Point tool' }).click();
  const box = await copy.page.locator('.konvajs-content').first().boundingBox();
  if (!box) throw new Error('no viewer');
  await copy.page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2);
  const dialog = copy.page.getByRole('dialog', { name: /Create New Spot/ });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('tags chosen in Create New Spot are saved on the spot and start the next New Spot', async ({ launch, project }) => {
  const { p, ana } = await start(launch, project, 'E2E New Spot Tags');
  await ana.state(new Function('e', `
    const st = e.app.getState();
    st.createTag({ id: 'tag-garnet', name: 'Garnet porphyroblast', tagType: 'other', fillColor: '#aa3333', lineColor: '#000000', transparency: 100, tagSize: 10, spotIDs: [] });
    st.createTag({ id: 'tag-shear', name: 'Shear band', tagType: 'other', fillColor: '#3333aa', lineColor: '#000000', transparency: 100, tagSize: 10, spotIDs: [] });`) as never);

  await ana.caption('first spot: picks Garnet porphyroblast in Tags');
  let dialog = await newPointSpot(ana, -60);
  const tags = dialog.getByRole('combobox', { name: 'Tags' });
  await tags.click();
  await ana.page.getByRole('option', { name: 'Garnet porphyroblast' }).click();
  await dialog.getByRole('textbox', { name: 'Name' }).fill('G1');
  await dialog.getByRole('button', { name: 'Create Spot' }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => spotTags(ana, p.micrographId, 'G1')).toEqual(['tag-garnet']);

  await ana.caption('next spot starts with Garnet porphyroblast; adds Shear band');
  dialog = await newPointSpot(ana, -20);
  await expect(dialog.getByRole('button', { name: 'Garnet porphyroblast' })).toBeVisible();
  await tags.click();
  await ana.page.getByRole('option', { name: 'Shear band' }).click();
  await dialog.getByRole('textbox', { name: 'Name' }).fill('G2');
  await dialog.getByRole('button', { name: 'Create Spot' }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => spotTags(ana, p.micrographId, 'G2')).toEqual(['tag-garnet', 'tag-shear']);

  await ana.caption('clears both chips: the spot has no tags, and the next New Spot starts empty');
  dialog = await newPointSpot(ana, 20);
  for (const name of ['Garnet porphyroblast', 'Shear band']) {
    await dialog.getByRole('button', { name }).locator('[data-testid="CancelIcon"]').click();
  }
  await dialog.getByRole('textbox', { name: 'Name' }).fill('G3');
  await dialog.getByRole('button', { name: 'Create Spot' }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => spotTags(ana, p.micrographId, 'G3')).toEqual([]);
  dialog = await newPointSpot(ana, 60);
  await expect(dialog.getByRole('button', { name: 'Garnet porphyroblast' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});

test('with no tags in the project, the Tags field says where to create them', async ({ launch, project }) => {
  const { ana } = await start(launch, project, 'E2E New Spot No Tags');
  const dialog = await newPointSpot(ana, 0);
  await expect(dialog.getByText('No tags yet: create them in the Tags tab')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});

/** The tag ids of a preset by name (global or project) */
function presetTags(copy: Copy, name: string): Promise<string[] | null> {
  return copy.state(new Function('e', `
    const s = e.app.getState();
    const p = [...(s.globalPresets ?? []), ...(s.project?.presets ?? [])].find((x) => x.name === ${JSON.stringify(name)});
    return p ? (p.data?.tags ?? []) : null;`) as never) as Promise<string[] | null>;
}

test('a Project preset carries tags (Global cannot); choosing it in New Spot adds them', async ({ launch, project }) => {
  const { p, ana } = await start(launch, project, 'E2E Preset Tags');
  await ana.state(new Function('e', `
    e.app.getState().createTag({ id: 'tag-garnet', name: 'Garnet porphyroblast', tagType: 'other', fillColor: '#aa3333', lineColor: '#000000', transparency: 100, tagSize: 10, spotIDs: [] });`) as never);

  await ana.caption('New Preset, Scope Global: the Tags section says only Project presets can add tags');
  await ana.menu('Spot', 'Quick Spot Presets...');
  const presets = ana.page.getByRole('dialog', { name: 'Quick Spot Presets' });
  await presets.getByRole('button', { name: 'New Preset' }).click();
  const editor = ana.page.getByRole('dialog', { name: 'Create New Preset' });
  await editor.getByLabel('Preset Name').fill('Garnet');
  await editor.getByRole('button', { name: /^Tags/ }).click();
  await expect(editor.getByText(/only Project presets can add them/)).toBeVisible();

  await ana.caption('Scope Project: picks Garnet porphyroblast, Create');
  // The Scope select has no accessible name (its InputLabel is not linked); found by its value
  await editor.getByRole('combobox').filter({ hasText: 'Global' }).click();
  await ana.page.getByRole('option', { name: 'Project' }).click();
  await editor.getByRole('combobox', { name: 'Tags' }).click();
  await ana.page.getByRole('option', { name: 'Garnet porphyroblast' }).click();
  await expect(editor.getByText(/Preset will apply: Tag/)).toBeVisible();
  await editor.getByRole('button', { name: 'Create' }).click();
  await expect(editor).toBeHidden();
  await expect.poll(() => presetTags(ana, 'Garnet')).toEqual(['tag-garnet']);
  await ana.page.keyboard.press('Escape');
  await expect(presets).toBeHidden();

  await ana.caption('New Spot: choosing the preset adds its tag to the Tags field');
  const dialog = await newPointSpot(ana, 0);
  await expect(dialog.getByRole('button', { name: 'Garnet porphyroblast' })).toHaveCount(0);
  await dialog.getByRole('combobox', { name: 'Apply Presets' }).click();
  await ana.page.getByRole('option', { name: /Garnet/ }).first().click();
  await expect(dialog.getByRole('button', { name: 'Garnet porphyroblast' })).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Name' }).fill('P1');
  await dialog.getByRole('button', { name: 'Create Spot' }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => spotTags(ana, p.micrographId, 'P1')).toEqual(['tag-garnet']);
});
