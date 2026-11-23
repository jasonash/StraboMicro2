/**
 * Make a missing preset or tag from the list it is missing from (Claire,
 * 2026-11-23): the Auto spot preset list ends with "New Preset...", which
 * opens the preset editor (Scope Project) and makes the saved preset the auto
 * preset; every tag picker ends with "+ New Tag...", which opens Create New
 * Tag with the typed text as its name and selects the new tag on save. Esc in
 * the editor closes only the editor (auto mode stays on). One copy, not synced.
 */

import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { type FixtureProject } from '../lib/fixtures';
import { openSmz, viewMicrograph } from '../lib/actions';

async function start(launch: (l: string, a: typeof ACCOUNTS.ana, o?: { login?: boolean }) => Promise<Copy>,
  project: (name: string) => Promise<FixtureProject>, name: string) {
  const p = await project(name);
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await viewMicrograph(ana, p.micrographId);
  return { p, ana };
}

function spotByName(copy: Copy, micrographId: string, name: string) {
  return copy.state(new Function('e', `
    const m = e.app.getState().micrographIndex.get(${JSON.stringify(micrographId)});
    const s = (m?.spots ?? []).find((x) => x.name === ${JSON.stringify(name)});
    if (!s) return null;
    const tags = e.app.getState().project?.tags ?? [];
    return { tags: (s.tags ?? []).map((id) => tags.find((t) => t.id === id)?.name ?? id),
      minerals: (s.mineralogy?.minerals ?? []).map((x) => x.name) };`) as never) as
    Promise<{ tags: string[]; minerals: string[] } | null>;
}

function state<T>(copy: Copy, body: string): Promise<T> {
  return copy.state(new Function('e', body) as never) as Promise<T>;
}

async function clickViewer(copy: Copy, dx: number, dy: number) {
  const box = await copy.page.locator('.konvajs-content').first().boundingBox();
  if (!box) throw new Error('no viewer');
  await copy.page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
}

const nextLabel = (copy: Copy) => copy.page.getByTestId('auto-spot-next');

test('Auto spot list: New Preset... with a new tag made inside it; the preset becomes the auto preset', async ({ launch, project }) => {
  const { p, ana } = await start(launch, project, 'E2E Create From Pickers');

  await ana.page.getByRole('button', { name: 'Auto spot mode' }).click();
  await ana.page.getByRole('button', { name: 'Point tool' }).click();

  await ana.caption('Esc in the editor closes only the editor; auto mode stays on');
  await ana.page.getByRole('combobox', { name: 'Auto spot preset' }).click();
  await ana.page.getByTestId('auto-spot-new-preset').click();
  let editor = ana.page.getByRole('dialog', { name: 'Create New Preset' });
  await expect(editor).toBeVisible();
  await ana.page.keyboard.press('Escape');
  await expect(editor).toBeHidden();
  await expect(nextLabel(ana)).toBeVisible();
  expect(await state<string | null>(ana, 'return e.app.getState().activeTool ?? null')).toBe('point');

  await ana.caption('New Preset... again: Scope starts at Project, so Tags are allowed');
  await ana.page.getByRole('combobox', { name: 'Auto spot preset' }).click();
  await ana.page.getByTestId('auto-spot-new-preset').click();
  editor = ana.page.getByRole('dialog', { name: 'Create New Preset' });
  await expect(editor.getByRole('combobox').filter({ hasText: 'Project' })).toBeVisible();
  await editor.getByLabel('Preset Name').fill('Garnet D2');
  await editor.getByLabel('Spot Name (auto spot mode, optional)').fill('Gt-{n}');

  await ana.caption('Tags: types "Phase D2", no such tag, picks + New Tag "Phase D2"...');
  await editor.getByRole('button', { name: /^Tags/ }).click();
  await expect(editor.getByText(/No tags yet: open the list and choose \+ New Tag/)).toBeVisible();
  const tags = editor.getByRole('combobox', { name: 'Tags' });
  await tags.click();
  await tags.fill('Phase D2');
  await ana.page.getByRole('option', { name: 'New Tag "Phase D2"...' }).click();

  const tagDialog = ana.page.getByRole('dialog', { name: 'Create New Tag' });
  await expect(tagDialog.getByLabel('Tag Name')).toHaveValue('Phase D2');
  await tagDialog.getByRole('button', { name: 'Create' }).click();
  await expect(tagDialog).toBeHidden();
  await expect(editor.getByRole('button', { name: 'Phase D2' })).toBeVisible();
  expect(await state<string[]>(ana, 'return (e.app.getState().project?.tags ?? []).map((t) => t.name)')).toEqual(['Phase D2']);

  await ana.caption('Create: the strip now uses Garnet D2');
  await editor.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(ana.page.getByRole('combobox', { name: 'Auto spot preset' })).toHaveText('Garnet D2');
  await expect(nextLabel(ana)).toHaveText('Next: Gt-1');

  await ana.caption('a click: Gt-1 is tagged Phase D2');
  await clickViewer(ana, -80, -40);
  await expect.poll(() => spotByName(ana, p.micrographId, 'Gt-1')).toMatchObject({ tags: ['Phase D2'] });
});

test('Tag picker: + New Tag... with no typed text opens an empty name; a name already used is not offered', async ({ launch, project }) => {
  const { p, ana } = await start(launch, project, 'E2E New Tag From Spot');
  await state(ana, `
    e.app.getState().createTag({ id: 'tag-shear', name: 'Shear band', tagType: 'other', fillColor: '#3333aa', lineColor: '#000000', transparency: 100, tagSize: 10, spotIDs: [] });`);

  await ana.page.getByRole('button', { name: 'Point tool' }).click();
  await clickViewer(ana, 0, 0);
  const dialog = ana.page.getByRole('dialog', { name: /Create New Spot/ });
  await expect(dialog).toBeVisible();
  const tags = dialog.getByRole('combobox', { name: 'Tags' });

  await ana.caption('typing an existing name: the last line is plain + New Tag...');
  await tags.click();
  await tags.fill('shear band');
  await expect(ana.page.getByTestId('tag-picker-new')).toHaveText('New Tag...');
  await tags.fill('');

  await ana.caption('+ New Tag... opens Create New Tag with an empty name; makes "Vein fill"');
  await ana.page.getByTestId('tag-picker-new').click();
  const tagDialog = ana.page.getByRole('dialog', { name: 'Create New Tag' });
  await expect(tagDialog.getByLabel('Tag Name')).toHaveValue('');
  await tagDialog.getByLabel('Tag Name').fill('Vein fill');
  await tagDialog.getByRole('button', { name: 'Create' }).click();
  await expect(tagDialog).toBeHidden();
  await expect(dialog.getByRole('button', { name: 'Vein fill' })).toBeVisible();

  await dialog.getByRole('textbox', { name: 'Name' }).fill('V1');
  await dialog.getByRole('button', { name: 'Create Spot' }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => spotByName(ana, p.micrographId, 'V1')).toMatchObject({ tags: ['Vein fill'] });
});
