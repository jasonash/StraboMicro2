/**
 * Quick Spot Presets between Global, Project and a file (2026-10-31): the
 * dialog says only Project presets are shared; Copy from Global on an empty
 * Project tab gives new ids and moves each key to its copy; keys are
 * remembered per project; a second copy asks about the names already there;
 * tags stay behind going to Global or a file; export + import round trip; a
 * file that is not a presets file is refused; copies reach a collaborator.
 */

import fs from 'fs';
import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { openSmz, share, waitSettled } from '../lib/actions';

const presetsDialog = (c: Copy) => c.page.getByRole('dialog', { name: 'Quick Spot Presets' });

async function openPresets(c: Copy, tab: 'Global' | 'Project') {
  await c.menu('Spot', 'Quick Spot Presets...');
  await presetsDialog(c).getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
}

const closePresets = (c: Copy) => presetsDialog(c).locator('.MuiDialogActions-root').getByRole('button', { name: 'Close', exact: true }).click();

async function seedGlobals(c: Copy) {
  await c.state(new Function('e', `
    const st = e.app.getState();
    st.createPreset({ id: 'g-ol', name: 'Olivine', spotNamePattern: 'Ol-{n}', createdAt: 'x', modifiedAt: 'x',
      data: { mineralogy: { minerals: [{ name: 'olivine' }] } } }, 'global');
    st.createPreset({ id: 'g-qz', name: 'Quartz', createdAt: 'x', modifiedAt: 'x', data: { opacity: 50 } }, 'global');
    st.setPresetKeyBinding('1', 'g-ol');`) as never);
}

type Row = { id: string; name: string; tags?: string[] };
const projectPresets = (c: Copy) => c.state(new Function('e', `
  return (e.app.getState().project?.presets ?? []).map((p) => ({ id: p.id, name: p.name, tags: p.data?.tags }));`) as never) as Promise<Row[]>;
const globalPresets = (c: Copy) => c.state(new Function('e', `
  return e.app.getState().globalPresets.map((p) => ({ id: p.id, name: p.name, tags: p.data?.tags }));`) as never) as Promise<Row[]>;
const keys = (c: Copy) => c.state((e) => e.app.getState().presetKeyBindings) as Promise<Record<string, string>>;

test('copy from Global: new ids, keys per project, names already there, the note', async ({ launch, project }) => {
  const a = await project('E2E Presets A');
  const b = await project('E2E Presets B');
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, a.smzPath, a.id);
  await seedGlobals(ana);

  await ana.caption('the note, then Copy from Global on the empty Project tab');
  await openPresets(ana, 'Project');
  await expect(presetsDialog(ana)).toContainText('are shared with collaborators');
  await presetsDialog(ana).getByRole('button', { name: 'Copy from Global (2)' }).click();
  await expect(presetsDialog(ana)).toContainText('2 presets copied to this project.');

  const copied = await projectPresets(ana);
  expect(copied.map((p) => p.name)).toEqual(['Olivine', 'Quartz']);
  expect(copied.some((p) => p.id === 'g-ol' || p.id === 'g-qz')).toBe(false);
  const olCopy = copied[0].id;
  expect((await keys(ana))['1']).toBe(olCopy);

  await ana.caption('Copy All again: asks; Keep Existing changes nothing');
  await presetsDialog(ana).getByRole('tab', { name: /^Global/ }).click();
  await presetsDialog(ana).getByRole('button', { name: 'Copy All to Project' }).click();
  const asks = ana.page.getByRole('dialog', { name: 'Presets Already There' });
  await expect(asks).toContainText('Olivine, Quartz');
  await asks.getByRole('button', { name: 'Keep Existing' }).click();
  await expect(presetsDialog(ana)).toContainText('0 presets copied');
  expect((await projectPresets(ana)).map((p) => p.id)).toEqual(copied.map((p) => p.id));
  await closePresets(ana);

  await ana.caption('another project: key 1 is the global preset again; back: the copy');
  await openSmz(ana, b.smzPath, b.id);
  expect((await keys(ana))['1']).toBe('g-ol');
  await ana.state(new Function('e', `e.app.getState().setPresetKeyBinding('2', 'g-qz');`) as never);
  const bKeys = await keys(ana);
  await ana.state(new Function('e', `
    const st = e.app.getState();
    st.loadProject({ ...st.project, id: ${JSON.stringify(a.id)}, presets: ${JSON.stringify(copied)} }, null);`) as never);
  expect((await keys(ana))['1']).toBe(olCopy);
  expect((await keys(ana))['2']).toBeUndefined();

  await ana.caption('closing keeps only the global keys, and the key bound in B is one of them');
  await ana.state((e) => e.app.getState().closeProject());
  expect(await keys(ana)).toEqual({ 1: 'g-ol', 2: 'g-qz' });
  expect(bKeys['2']).toBe('g-qz');
});

test('to Global and to a file: tags stay behind; import round trip; a wrong file is refused', async ({ launch, project, runDir }) => {
  const p = await project('E2E Presets File');
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await ana.state(new Function('e', `
    const st = e.app.getState();
    st.createTag({ id: 'tag-1', name: 'Shear', tagType: 'other', fillColor: '#aa3333', lineColor: '#000000', transparency: 50 });
    st.createPreset({ id: 'p-gt', name: 'Garnet', createdAt: 'x', modifiedAt: 'x', data: { color: '0x3366ccff', tags: ['tag-1'] } }, 'project');`) as never);

  await ana.caption('Copy All to Global: the tags stay behind and it says so');
  await openPresets(ana, 'Project');
  await presetsDialog(ana).getByRole('button', { name: 'Copy All to Global' }).click();
  await expect(presetsDialog(ana)).toContainText('Tags were not copied');
  const globals = await globalPresets(ana);
  expect(globals.map((g) => [g.name, g.tags])).toEqual([['Garnet', undefined]]);
  expect((await projectPresets(ana))[0].tags).toEqual(['tag-1']);

  await ana.caption('Export, delete from Global, Import');
  const file = `${runDir}/presets.json`;
  await ana.answerDialog({ kind: 'save', filePath: file });
  await presetsDialog(ana).getByRole('tab', { name: /^Global/ }).click();
  await presetsDialog(ana).getByRole('button', { name: 'Export...' }).click();
  await expect(presetsDialog(ana)).toContainText('1 preset exported.');
  expect(JSON.parse(fs.readFileSync(file, 'utf8')).presets[0].name).toBe('Garnet');

  await ana.state(new Function('e', `
    const st = e.app.getState();
    for (const g of st.globalPresets) st.deletePreset(g.id, 'global');`) as never);
  await ana.answerDialog({ kind: 'open', filePaths: [file] });
  await presetsDialog(ana).getByRole('button', { name: 'Import...' }).click();
  await expect(presetsDialog(ana)).toContainText('1 preset copied to Global.');
  expect((await globalPresets(ana)).map((g) => g.name)).toEqual(['Garnet']);

  await ana.caption('a file that is not a presets file');
  const wrong = `${runDir}/wrong.json`;
  fs.writeFileSync(wrong, '{"a":1}');
  await ana.answerDialog({ kind: 'open', filePaths: [wrong] });
  await presetsDialog(ana).getByRole('button', { name: 'Import...' }).click();
  await expect(presetsDialog(ana)).toContainText('not a StraboMicro Quick Spot Presets file');
});

test('copies reach a collaborator; the global originals do not', async ({ launch, project }) => {
  const p = await project('E2E Presets Shared');
  const ana = await launch('Ana', ACCOUNTS.ana);
  const ben = await launch('Ben', ACCOUNTS.ben);
  await share(ana, ben, p.smzPath, p.id, p.name);
  await seedGlobals(ana);

  await openPresets(ana, 'Project');
  await presetsDialog(ana).getByRole('button', { name: 'Copy from Global (2)' }).click();
  await expect(presetsDialog(ana)).toContainText('2 presets copied');
  await closePresets(ana);
  await waitSettled(ana);

  await expect.poll(async () => (await projectPresets(ben)).map((x) => x.name), { timeout: 60_000 }).toEqual(['Olivine', 'Quartz']);
  expect(await globalPresets(ben)).toEqual([]);
});
