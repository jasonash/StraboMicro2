/**
 * View > Micrograph Visibility... (Jason + Peter, 2026-10-29): a panel listing
 * the micrographs placed under the one in the viewer, indented as in the
 * tree; each row shows/hides its micrograph, "Show only this one" hides the
 * others (keeping its parent), the Up/Down keys then step through the rows,
 * the name filter limits Show All / Hide All, and each row's slider sets the
 * micrograph's opacity. One copy, not synced.
 */

import { randomUUID } from 'crypto';
import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { makeProject } from '../lib/fixtures';
import { openSmz, viewMicrograph } from '../lib/actions';

const child = (id: string, name: string, parentID: string) => ({
  id, name, parentID, imageType: 'Backscattered Electron',
  width: 1600, height: 1200, imageWidth: 1600, imageHeight: 1200, opacity: 1, scalePixelsPerCentimeter: 40000,
  offsetInParent: { X: 0, Y: 0 }, rotation: 0,
  polish: false, description: '', notes: '', spots: [], orientationInfo: { orientationMethod: 'unoriented' },
  associatedFiles: [], links: [], isMicroVisible: true, isExpanded: false, isSpotExpanded: false, isFlipped: false, tags: [],
});

async function visibleMap(copy: Copy): Promise<Record<string, boolean>> {
  return (await copy.state(new Function('e', `
    const out = {};
    for (const d of e.app.getState().project?.datasets ?? []) for (const s of d.samples ?? [])
      for (const m of s.micrographs ?? []) if (m.parentID) out[m.name] = m.isMicroVisible !== false;
    return out;`) as never)) as unknown as Record<string, boolean>;
}

test('Micrograph Visibility: hide one, show only one, step with the arrow keys, filter + Hide All, opacity', async ({ launch, runDir }) => {
  const overviewId = randomUUID();
  const bse = randomUUID();
  const p = await makeProject(`${runDir}/fixtures`, 'E2E Micrograph Visibility', [], {
    overviewId,
    micrographs: [child(bse, 'BSE 1', overviewId), child(randomUUID(), 'Map Al', bse), child(randomUUID(), 'Map Ca', bse)],
  });
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await viewMicrograph(ana, overviewId);

  await ana.caption('View > Micrograph Visibility...: three rows, the maps under BSE 1');
  await ana.menu('View', 'Micrograph Visibility...');
  const panel = ana.page.getByRole('dialog', { name: 'Micrograph Visibility' });
  await expect(panel.getByTestId('visibility-row')).toHaveCount(3);
  await expect(panel.getByTestId('visibility-row')).toHaveText(['BSE 1', 'Map Al', 'Map Ca']);

  await ana.caption('hides Map Al');
  await panel.getByRole('button', { name: 'Hide Map Al' }).click();
  await expect.poll(() => visibleMap(ana)).toEqual({ 'BSE 1': true, 'Map Al': false, 'Map Ca': true });

  await ana.caption('Show only Map Ca: its parent BSE 1 stays');
  await panel.getByRole('button', { name: 'Show only Map Ca' }).click();
  await expect.poll(() => visibleMap(ana)).toEqual({ 'BSE 1': true, 'Map Al': false, 'Map Ca': true });
  await ana.caption('Up arrow: Map Al alone');
  await ana.page.keyboard.press('ArrowUp');
  await expect.poll(() => visibleMap(ana)).toEqual({ 'BSE 1': true, 'Map Al': true, 'Map Ca': false });
  await ana.caption('Up again: BSE 1 alone (its maps hidden)');
  await ana.page.keyboard.press('ArrowUp');
  await expect.poll(() => visibleMap(ana)).toEqual({ 'BSE 1': true, 'Map Al': false, 'Map Ca': false });
  await ana.caption('Up wraps to the last row: Map Ca alone');
  await ana.page.keyboard.press('ArrowUp');
  await expect.poll(() => visibleMap(ana)).toEqual({ 'BSE 1': true, 'Map Al': false, 'Map Ca': true });

  await ana.caption('filter "map", Show All, then Hide All: BSE 1 is not touched');
  await panel.getByLabel('Filter by name').fill('map');
  await expect(panel.getByTestId('visibility-row')).toHaveCount(2);
  await panel.getByRole('button', { name: 'Show All' }).click();
  await expect.poll(() => visibleMap(ana)).toEqual({ 'BSE 1': true, 'Map Al': true, 'Map Ca': true });
  await panel.getByRole('button', { name: 'Hide All' }).click();
  await expect.poll(() => visibleMap(ana)).toEqual({ 'BSE 1': true, 'Map Al': false, 'Map Ca': false });

  await ana.caption('opacity of Map Al down one step with the keyboard');
  await panel.getByRole('slider', { name: 'Opacity of Map Al' }).focus();
  await ana.page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await ana.state(new Function('e', `
    for (const d of e.app.getState().project?.datasets ?? []) for (const s of d.samples ?? [])
      for (const m of s.micrographs ?? []) if (m.name === 'Map Al') return m.opacity;
    return null;`) as never)) as unknown as number).toBeCloseTo(0.95, 5);

  await ana.caption('closes the panel');
  await panel.getByRole('button', { name: 'Close Micrograph Visibility' }).click();
  await expect(panel).toHaveCount(0);
});
