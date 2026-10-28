/**
 * View > Filter Spots... (Angus, 2026-10-28; src/utils/spotDataSections.ts):
 * the panel lists every spot data section with Any / Has / Doesn't have;
 * spots that don't match are dimmed (default, no label) or hidden on the
 * image and in the Spots tab, and the lasso picks only matching spots (filter
 * "no Links", lasso, Edit n Spots > Links is Angus's workflow); the notice
 * counts matches and Clear ends the filter. One copy, not synced.
 */

import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { openSmz, viewMicrograph, editSpot } from '../lib/actions';

/** How the viewer draws a spot: absent, or the highest opacity in its group and whether its label is drawn */
function drawn(copy: Copy, spotId: string): Promise<{ opacity: number; label: boolean } | null> {
  return copy.state(new Function('e', `
    for (const stage of (window.Konva && window.Konva.stages) || []) {
      const group = stage.findOne('.spot-${spotId}');
      if (!group) continue;
      let opacity = 0;
      group.find((node) => { opacity = Math.max(opacity, node.opacity()); return false; });
      return { opacity: Math.round(opacity * 100) / 100, label: !!stage.findOne('.spot-${spotId}-label') };
    }
    return null;`) as never) as Promise<{ opacity: number; label: boolean } | null>;
}

function selectedSpotIds(copy: Copy): Promise<string[]> {
  return copy.state(new Function('e', 'return [...e.app.getState().selectedSpotIds].sort()') as never) as Promise<string[]>;
}

/** Shift+drag a lasso around the whole viewer */
async function lassoAll(copy: Copy) {
  const boxes = await Promise.all((await copy.page.locator('.konvajs-content').all()).map((l) => l.boundingBox()));
  const box = boxes.filter((b) => b).sort((a, b) => b!.width * b!.height - a!.width * a!.height)[0];
  if (!box) throw new Error('no viewer');
  const inset = 40;
  const corners = [
    [box.x + inset, box.y + inset], [box.x + box.width - inset, box.y + inset],
    [box.x + box.width - inset, box.y + box.height - inset], [box.x + inset, box.y + box.height - inset],
    [box.x + inset, box.y + inset + 5],
  ];
  await copy.page.keyboard.down('Shift');
  await copy.page.mouse.move(corners[0][0], corners[0][1]);
  await copy.page.mouse.down();
  for (const [x, y] of corners.slice(1)) await copy.page.mouse.move(x, y, { steps: 8 });
  await copy.page.mouse.up();
  await copy.page.keyboard.up('Shift');
}

test('Filter Spots dims or hides spots by their data; the lasso picks only matching spots', async ({ launch, project }) => {
  const p = await project('E2E Spot Filter', ['Linked', 'Quartz', 'Bare']);
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await viewMicrograph(ana, p.micrographId);
  const [linked, quartz, bare] = p.spots;
  await editSpot(ana, linked.id, { links: [{ label: 'Paper', url: 'https://doi.org/10.1000/x' }] });
  await editSpot(ana, quartz.id, { mineralogy: { minerals: [{ name: 'Quartz', operator: 'eq', percentage: 100 }] } });

  await ana.caption('with no filter every spot is drawn as usual and the lasso picks all three');
  await expect.poll(() => drawn(ana, linked.id)).toEqual({ opacity: 0.5, label: true });
  await expect(ana.page.getByTestId('spot-filter-notice')).toHaveCount(0);
  await lassoAll(ana);
  await expect.poll(() => selectedSpotIds(ana)).toEqual([linked.id, quartz.id, bare.id].sort());
  await ana.state(new Function('e', 'e.app.getState().clearSpotSelection()') as never); // a selected spot is never dimmed

  await ana.caption('View > Filter Spots..., Links: Doesn\'t have');
  await ana.menu('View', 'Filter Spots...');
  const panel = ana.page.getByRole('dialog', { name: 'Filter Spots' });
  await expect(panel).toBeVisible();
  for (const label of ['Mineralogy/Lithology', 'Veins', 'Notes', 'Associated Files', 'Links', 'Custom User Data']) {
    await expect(panel.getByRole('group', { name: label })).toBeVisible();
  }
  await panel.getByRole('group', { name: 'Links' }).getByRole('button', { name: "Doesn't have" }).click();
  await expect(panel.getByTestId('spot-filter-count')).toHaveText('2 of 3 spots on this micrograph match');
  const notice = ana.page.getByTestId('spot-filter-notice');
  await expect(notice).toContainText('Filtered: 2 of 3 spots match');

  await ana.caption('the linked spot is dimmed, without its label; the others are as usual');
  await expect.poll(() => drawn(ana, linked.id)).toEqual({ opacity: 0.2, label: false });
  expect(await drawn(ana, quartz.id)).toEqual({ opacity: 0.5, label: true });

  await ana.caption('Done; the lasso now picks only the two spots without links');
  await panel.getByRole('button', { name: 'Done' }).click();
  await expect(panel).toBeHidden();
  await expect(notice).toBeVisible(); // the filter stays on
  await ana.state(new Function('e', 'e.app.getState().clearSpotSelection()') as never);
  await lassoAll(ana);
  await expect.poll(() => selectedSpotIds(ana)).toEqual([quartz.id, bare.id].sort());
  await ana.state(new Function('e', 'e.app.getState().clearSpotSelection()') as never);

  await ana.caption('Edit reopens the panel; adding Mineralogy: Has leaves one spot (AND)');
  await notice.getByRole('button', { name: 'Edit' }).click();
  await panel.getByRole('group', { name: 'Mineralogy/Lithology' }).getByRole('button', { name: 'Has' }).click();
  await expect(notice).toContainText('Filtered: 1 of 3 spots match');
  await expect.poll(() => drawn(ana, bare.id)).toEqual({ opacity: 0.2, label: false });

  await ana.caption('Hide: spots that don\'t match leave the image and the Spots tab');
  await panel.getByRole('group', { name: "Spots that don't match" }).getByRole('button', { name: 'Hide' }).click();
  await expect.poll(() => drawn(ana, linked.id)).toBeNull();
  expect(await drawn(ana, bare.id)).toBeNull();
  expect(await drawn(ana, quartz.id)).toEqual({ opacity: 0.5, label: true });
  await ana.page.getByRole('tab', { name: 'Spots' }).click();
  await expect(ana.page.getByRole('button', { name: 'Quartz', exact: true })).toBeVisible();
  await expect(ana.page.getByRole('button', { name: 'Linked', exact: true })).toHaveCount(0);
  await expect(ana.page.getByRole('button', { name: 'Bare', exact: true })).toHaveCount(0);

  await ana.caption('Clear on the notice ends the filter; Hide is kept for next time');
  await panel.getByRole('button', { name: 'Done' }).click();
  await notice.getByRole('button', { name: 'Clear' }).click();
  await expect(notice).toHaveCount(0);
  await expect.poll(() => drawn(ana, linked.id)).toEqual({ opacity: 0.5, label: true });
  await expect(ana.page.getByRole('button', { name: 'Linked', exact: true })).toBeVisible();
  expect(await ana.state(new Function('e', 'return e.app.getState().spotFilter') as never)).toEqual({ sections: {}, others: 'hide' });
});

test('the filter is not saved and is cleared when the project is opened again', async ({ launch, project }) => {
  const p = await project('E2E Spot Filter Reset', ['A', 'B']);
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await viewMicrograph(ana, p.micrographId);

  await ana.menu('View', 'Filter Spots...');
  const panel = ana.page.getByRole('dialog', { name: 'Filter Spots' });
  await panel.getByRole('group', { name: 'Notes' }).getByRole('button', { name: 'Has' }).click();
  await expect(ana.page.getByTestId('spot-filter-notice')).toContainText('Filtered: 0 of 2 spots match');
  expect(await ana.state(new Function('e', 'return JSON.stringify(e.app.getState().project).includes("spotFilter")') as never)).toBe(false);

  await ana.caption('the menu item closes the panel again');
  await ana.menu('View', 'Filter Spots...');
  await expect(panel).toBeHidden();

  await ana.caption('opening the project again starts without a filter');
  await openSmz(ana, p.smzPath, p.id);
  await expect(ana.page.getByTestId('spot-filter-notice')).toHaveCount(0);
  expect(await ana.state(new Function('e', 'return e.app.getState().spotFilter') as never)).toEqual({ sections: {}, others: 'dim' });
});
