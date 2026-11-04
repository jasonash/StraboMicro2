/**
 * Micrographs that are not placed yet can be deleted (Peter, 2026-10-29: the
 * tree hid the three-dot menu until a micrograph was set up, so a wrong
 * Batch Import had to be placed before it could be deleted). An unplaced
 * child's three-dot menu has only Delete Micrograph; the parent's menu has
 * Delete unplaced children..., which deletes them all and leaves placed
 * children alone. Needs no server work: one copy, not synced.
 */

import { randomUUID } from 'crypto';
import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { makeProject } from '../lib/fixtures';
import { openSmz } from '../lib/actions';

async function start(launch: (l: string, a: typeof ACCOUNTS.ana, o?: { login?: boolean }) => Promise<Copy>, runDir: string, name: string) {
  const overviewId = randomUUID();
  const child = (childName: string, placed: boolean) => ({
    id: randomUUID(), name: childName, parentID: overviewId, imageType: 'Plane Polarized Light',
    width: 2000, height: 1500, imageWidth: 2000, imageHeight: 1500, opacity: 1,
    polish: false, description: '', notes: '', spots: [], orientationInfo: { orientationMethod: 'unoriented' },
    associatedFiles: [], links: [], isMicroVisible: true, isExpanded: false, isSpotExpanded: false, isFlipped: false, tags: [],
    ...(placed ? { scalePixelsPerCentimeter: 80000, offsetInParent: { X: 100, Y: 100 }, rotation: 0 } : {}),
  });
  const p = await makeProject(`${runDir}/fixtures`, name, [], {
    overviewId,
    micrographs: [child('Unplaced A', false), child('Unplaced B', false), child('Placed C', true)],
  });
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await ana.page.getByText('Overview (Reference)', { exact: true }).locator('xpath=..')
    .locator('[data-testid="ChevronRightIcon"]').first().click();
  await expect(ana.page.getByText('Unplaced A', { exact: true })).toBeVisible();
  return ana;
}

/** Names of the overview's children in the project */
async function childNames(copy: Copy): Promise<string[]> {
  return (await copy.state(new Function('e', `
    const names = [];
    for (const d of e.app.getState().project?.datasets ?? []) for (const s of d.samples ?? [])
      for (const m of s.micrographs ?? []) if (m.parentID) names.push(m.name);
    return names.sort();`) as never)) as unknown as string[];
}

function moreButton(copy: Copy, rowName: string) {
  return copy.page.getByText(rowName, { exact: true }).locator('xpath=../..')
    .locator('button:has([data-testid="MoreVertIcon"])').first();
}

test("an unplaced child's three-dot menu has only Delete Micrograph, and it deletes", async ({ launch, runDir }) => {
  const ana = await start(launch, runDir, 'E2E Delete Unplaced One');

  await ana.caption('three-dot menu of an unplaced child: only Delete Micrograph');
  await moreButton(ana, 'Unplaced A').click();
  const items = ana.page.getByRole('menuitem');
  await expect(items).toHaveCount(1);
  await expect(items).toHaveText('Delete Micrograph');
  await items.click();
  const confirm = ana.page.getByRole('dialog', { name: 'Delete Micrograph' });
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(confirm).toBeHidden();
  await expect.poll(() => childNames(ana)).toEqual(['Placed C', 'Unplaced B']);
  await expect(ana.page.getByText('Unplaced A', { exact: true })).toHaveCount(0);

  await ana.caption('a placed child still has the full menu');
  await moreButton(ana, 'Placed C').click();
  await expect(ana.page.getByRole('menuitem', { name: 'Edit Micrograph Location' })).toBeVisible();
  await ana.page.keyboard.press('Escape');
});

test('Delete unplaced children... on the parent deletes every unplaced child and keeps the placed one', async ({ launch, runDir }) => {
  const ana = await start(launch, runDir, 'E2E Delete Unplaced All');

  await ana.caption('overview three-dot menu > Delete unplaced children...: Cancel keeps them');
  await moreButton(ana, 'Overview (Reference)').click();
  await ana.page.getByRole('menuitem', { name: 'Delete unplaced children...' }).click();
  const confirm = ana.page.getByRole('dialog', { name: 'Delete Unplaced Children' });
  await expect(confirm.getByText(/Delete the 2 micrographs on "Overview" that have not been placed yet\?/)).toBeVisible();
  await expect(confirm.getByText('Unplaced A')).toBeVisible();
  await expect(confirm.getByText('Unplaced B')).toBeVisible();
  await expect(confirm).not.toContainText('Placed C');
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toBeHidden();
  expect(await childNames(ana)).toEqual(['Placed C', 'Unplaced A', 'Unplaced B']);

  await ana.caption('again, Delete: both unplaced children go, the placed one stays');
  await moreButton(ana, 'Overview (Reference)').click();
  await ana.page.getByRole('menuitem', { name: 'Delete unplaced children...' }).click();
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(confirm).toBeHidden();
  await expect.poll(() => childNames(ana)).toEqual(['Placed C']);

  await ana.caption('nothing unplaced left: the menu item is gone');
  await moreButton(ana, 'Overview (Reference)').click();
  await expect(ana.page.getByRole('menuitem', { name: 'Add to Group(s)' })).toBeVisible();
  await expect(ana.page.getByRole('menuitem', { name: 'Delete unplaced children...' })).toHaveCount(0);
  await ana.page.keyboard.press('Escape');
});
