/**
 * Tags of a spot and groups of a micrograph in the right pane (Claire's
 * issue #61, 2026-11-17). Add Data lists "Tags" for a spot and "Groups" for
 * a micrograph; each opens a dialog (the spot's tags: choose among the
 * project's tags; the micrograph's groups: the Add to Group(s) dialog). The
 * Tags / Groups section shows only when there is at least one, and its pencil
 * opens the same dialog. One copy, not synced.
 */

import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { openSmz, viewMicrograph, addSpot } from '../lib/actions';

async function start(launch: (l: string, a: typeof ACCOUNTS.ana, o?: { login?: boolean }) => Promise<Copy>,
  project: (name: string) => Promise<{ smzPath: string; id: string; micrographId: string }>, name: string) {
  const p = await project(name);
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await viewMicrograph(ana, p.micrographId);
  return { p, ana };
}

/** Choose an entry of the right pane's Add Data list */
async function addData(copy: Copy, entry: string) {
  await copy.page.getByPlaceholder('Select or search data type...').click();
  await copy.page.getByRole('option', { name: entry, exact: true }).click();
}

/** The right pane section header ("Tags 2 tags", "Groups 1 group") */
function section(copy: Copy, title: 'Tags' | 'Groups') {
  return copy.page.getByRole('button', { name: new RegExp(`^${title}\\s*\\d+ ${title === 'Tags' ? 'tags?' : 'groups?'}$`) });
}

/** The whole section (header and opened content) */
function sectionBody(copy: Copy, title: 'Tags' | 'Groups') {
  return copy.page.locator('.MuiAccordion-root', { has: section(copy, title) });
}

function spotTags(copy: Copy, spotId: string): Promise<string[] | null> {
  return copy.state(new Function('e', `
    const s = e.app.getState().spotIndex.get(${JSON.stringify(spotId)});
    return s ? (s.tags ?? []) : null;`) as never) as Promise<string[] | null>;
}

test('a spot\'s tags: Add Data > Tags adds them, the Tags section shows them, its pencil changes them', async ({ launch, project }) => {
  const { p, ana } = await start(launch, project, 'E2E Right Pane Tags');
  await ana.state(new Function('e', `
    const st = e.app.getState();
    st.createTag({ id: 'tag-garnet', name: 'Garnet porphyroblast', tagType: 'other', fillColor: '#aa3333', lineColor: '#000000', transparency: 100, tagSize: 10, spotIDs: [] });
    st.createTag({ id: 'tag-shear', name: 'Shear band', tagType: 'other', fillColor: '#3333aa', lineColor: '#000000', transparency: 100, tagSize: 10, spotIDs: [] });`) as never);
  const spotId = await addSpot(ana, p.micrographId, 'S1');
  await ana.state(new Function('e', `return e.app.getState().selectActiveSpot(${JSON.stringify(spotId)})`) as never);
  await expect(ana.page.getByText('Spot Details')).toBeVisible();

  await ana.caption('no tags yet: no Tags section; Add Data lists Tags');
  await expect(section(ana, 'Tags')).toHaveCount(0);
  await addData(ana, 'Tags');
  let dialog = ana.page.getByRole('dialog', { name: 'Tags of "S1"' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('To make a new tag, choose + New Tag... at the bottom of the list.')).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Tags' }).click();
  await ana.page.getByRole('option', { name: 'Garnet porphyroblast' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => spotTags(ana, spotId)).toEqual(['tag-garnet']);

  await ana.caption('the Tags section shows the tag');
  await expect(section(ana, 'Tags')).toHaveAccessibleName(/1 tag$/);
  await section(ana, 'Tags').click();
  await expect(sectionBody(ana, 'Tags').getByText('Garnet porphyroblast')).toBeVisible();

  await ana.caption('pencil: swaps Garnet porphyroblast for Shear band');
  await section(ana, 'Tags').locator('[data-testid="EditIcon"]').click();
  dialog = ana.page.getByRole('dialog', { name: 'Tags of "S1"' });
  await dialog.getByRole('button', { name: 'Garnet porphyroblast' }).locator('[data-testid="CancelIcon"]').click();
  await dialog.getByRole('combobox', { name: 'Tags' }).click();
  await ana.page.getByRole('option', { name: 'Shear band' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => spotTags(ana, spotId)).toEqual(['tag-shear']);
  await expect(section(ana, 'Tags')).toHaveAccessibleName(/1 tag$/);

  await ana.caption('Cancel changes nothing');
  await section(ana, 'Tags').locator('[data-testid="EditIcon"]').click();
  dialog = ana.page.getByRole('dialog', { name: 'Tags of "S1"' });
  await dialog.getByRole('button', { name: 'Shear band' }).locator('[data-testid="CancelIcon"]').click();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect.poll(() => spotTags(ana, spotId)).toEqual(['tag-shear']);

  await ana.caption('removes the last tag: the section goes away');
  await section(ana, 'Tags').locator('[data-testid="EditIcon"]').click();
  dialog = ana.page.getByRole('dialog', { name: 'Tags of "S1"' });
  await dialog.getByRole('button', { name: 'Shear band' }).locator('[data-testid="CancelIcon"]').click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => spotTags(ana, spotId)).toEqual([]);
  await expect(section(ana, 'Tags')).toHaveCount(0);
});

test('a micrograph\'s groups: Add Data > Groups adds it, the Groups section shows them, its pencil changes them', async ({ launch, project }) => {
  const { p, ana } = await start(launch, project, 'E2E Right Pane Groups');
  await ana.state(new Function('e', `
    const st = e.app.getState();
    st.createGroup({ id: 'grp-ts', name: 'Thin sections', micrographs: [], spotIDs: [] });
    st.createGroup({ id: 'grp-sem', name: 'SEM maps', micrographs: [], spotIDs: [] });`) as never);
  const groupsOf = () => ana.state(new Function('e', `
    return (e.app.getState().project?.groups ?? []).filter((g) => (g.micrographs ?? []).includes(${JSON.stringify(p.micrographId)})).map((g) => g.id);`) as never) as Promise<string[]>;
  await expect(ana.page.getByText('Micrograph Details')).toBeVisible();

  await ana.caption('in no group: no Groups section; Add Data lists Groups');
  await expect(section(ana, 'Groups')).toHaveCount(0);
  await addData(ana, 'Groups');
  let dialog = ana.page.getByRole('dialog', { name: /to Group\(s\)/ });
  await dialog.getByText('Thin sections').click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect.poll(groupsOf).toEqual(['grp-ts']);
  await expect(section(ana, 'Groups')).toHaveAccessibleName(/1 group$/);

  await ana.caption('pencil: adds SEM maps too');
  await section(ana, 'Groups').locator('[data-testid="EditIcon"]').click();
  dialog = ana.page.getByRole('dialog', { name: /to Group\(s\)/ });
  await dialog.getByText('SEM maps').click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect.poll(groupsOf).toEqual(['grp-ts', 'grp-sem']);
  await expect(section(ana, 'Groups')).toHaveAccessibleName(/2 groups$/);
  await section(ana, 'Groups').click();
  await expect(sectionBody(ana, 'Groups').getByText('SEM maps')).toBeVisible();
  await expect(sectionBody(ana, 'Groups').getByText('Thin sections')).toBeVisible();
});
