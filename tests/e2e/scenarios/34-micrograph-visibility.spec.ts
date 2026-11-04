/**
 * View > Micrograph Visibility... (Jason + Peter, 2026-10-29; direct children
 * only, 2026-11-01): a panel listing what the viewer draws on the micrograph in
 * view; for a PPL/XPL pair the same list from either half. Each row
 * shows/hides its micrograph, "Show only this one" hides the others, the
 * Up/Down keys then step through the rows, the name filter limits Show All /
 * Hide All, and each row's slider sets the micrograph's opacity. One copy, not
 * synced.
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

test('Micrograph Visibility: only what is drawn is listed, same list from PPL and XPL, hide one, show only one, step with the arrow keys, filter + Hide All, opacity', async ({ launch, runDir }) => {
  const overviewId = randomUUID();
  const ppl = randomUUID();
  const xpl = randomUUID();
  const mapAl = randomUUID();
  const p = await makeProject(`${runDir}/fixtures`, 'E2E Micrograph Visibility', [], {
    overviewId,
    micrographs: [
      { ...child(ppl, 'BSE 1', overviewId), siblingImageId: xpl, isPrimarySibling: true },
      { ...child(xpl, 'BSE 1 XPL', overviewId), siblingImageId: ppl, isPrimarySibling: false },
      child(mapAl, 'Map Al', ppl),
      child(randomUUID(), 'Map Ca', ppl),
      child(randomUUID(), 'Map Fe', xpl),
      child(randomUUID(), 'Nested', mapAl),
      { ...child(randomUUID(), 'No scale', ppl), scalePixelsPerCentimeter: null },
    ],
  });
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await viewMicrograph(ana, overviewId);

  await ana.caption('View > Micrograph Visibility... on the overview: only BSE 1, not what is nested in it');
  await ana.menu('View', 'Micrograph Visibility...');
  const panel = ana.page.getByRole('dialog', { name: 'Micrograph Visibility' });
  const rows = panel.getByTestId('visibility-row');
  await expect(rows).toHaveText(['BSE 1']);

  await ana.caption('on BSE 1: both halves\' children; no Nested, no No scale');
  await viewMicrograph(ana, ppl);
  await expect(rows).toHaveText(['Map Al', 'Map Ca', 'Map Fe']);

  await ana.caption('switches to the XPL: the same three, its own first');
  await ana.state(new Function('e', 'e.app.getState().toggleSiblingView()') as never);
  await expect.poll(() => ana.state(new Function('e', 'return e.app.getState().activeMicrographId') as never)).toBe(xpl);
  await expect(rows).toHaveText(['Map Fe', 'Map Al', 'Map Ca']);
  await ana.state(new Function('e', 'e.app.getState().toggleSiblingView()') as never);
  await expect(rows).toHaveText(['Map Al', 'Map Ca', 'Map Fe']);

  // Never touched by the panel on BSE 1
  const rest = { 'BSE 1': true, 'BSE 1 XPL': true, Nested: true, 'No scale': true };
  const maps = (al: boolean, ca: boolean, fe: boolean) => ({ ...rest, 'Map Al': al, 'Map Ca': ca, 'Map Fe': fe });

  await ana.caption('hides Map Al');
  await panel.getByRole('button', { name: 'Hide Map Al' }).click();
  await expect.poll(() => visibleMap(ana)).toEqual(maps(false, true, true));

  await ana.caption('Show only Map Ca');
  await panel.getByRole('button', { name: 'Show only Map Ca' }).click();
  await expect.poll(() => visibleMap(ana)).toEqual(maps(false, true, false));
  await ana.caption('Up arrow: Map Al alone');
  await ana.page.keyboard.press('ArrowUp');
  await expect.poll(() => visibleMap(ana)).toEqual(maps(true, false, false));
  await ana.caption('Up wraps to the last row: Map Fe alone');
  await ana.page.keyboard.press('ArrowUp');
  await expect.poll(() => visibleMap(ana)).toEqual(maps(false, false, true));
  await ana.caption('Down wraps to the first row: Map Al alone');
  await ana.page.keyboard.press('ArrowDown');
  await expect.poll(() => visibleMap(ana)).toEqual(maps(true, false, false));

  await ana.caption('filter "ca", Hide All, then Show All: only Map Ca changes');
  await panel.getByLabel('Filter by name').fill('ca');
  await expect(rows).toHaveCount(1);
  await panel.getByRole('button', { name: 'Show All' }).click();
  await expect.poll(() => visibleMap(ana)).toEqual(maps(true, true, false));
  await panel.getByRole('button', { name: 'Hide All' }).click();
  await expect.poll(() => visibleMap(ana)).toEqual(maps(true, false, false));
  await panel.getByLabel('Filter by name').fill('');

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
