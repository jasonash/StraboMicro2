/**
 * Overlapping spots (Peter, 2026-10-29: a spot under a larger polygon could
 * not be clicked). Larger polygons are drawn under smaller ones, so a small
 * spot inside a big one saved after it gets the click; the right-click menu's
 * Select Spot Here lists every spot under the cursor, top first, and picks
 * one (src/utils/spotStacking.ts). One copy, not synced.
 */

import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { openSmz, viewMicrograph } from '../lib/actions';

const square = (id: string, name: string, x: number, y: number, size: number) => ({
  id, name, geometryType: 'polygon', color: '0x00ff00ff', opacity: 50, labelColor: '0xffffffff',
  points: [{ X: x, Y: y }, { X: x + size, Y: y }, { X: x + size, Y: y + size }, { X: x, Y: y + size }],
  date: new Date().toISOString(), modifiedTimestamp: Date.now(),
});

function activeSpotId(copy: Copy): Promise<string | null> {
  return copy.state(new Function('e', 'return e.app.getState().activeSpotId ?? null') as never) as Promise<string | null>;
}

/** Screen position of an image pixel (the spots layer's transform) */
async function screenAt(copy: Copy, x: number, y: number): Promise<{ x: number; y: number }> {
  const local = await copy.page.evaluate(([px, py]) => {
    const k = (window as unknown as { Konva?: { stages: { findOne: (s: string) => { getAbsoluteTransform: () => { point: (p: { x: number; y: number }) => { x: number; y: number } } } | undefined }[] } }).Konva;
    const layer = k?.stages.map((st) => st.findOne('.spots-layer')).find((l) => l);
    return layer ? layer.getAbsoluteTransform().point({ x: px, y: py }) : null;
  }, [x, y]);
  if (!local) throw new Error('no spots layer');
  const box = await copy.page.locator('.konvajs-content').first().boundingBox();
  if (!box) throw new Error('no viewer');
  return { x: box.x + local.x, y: box.y + local.y };
}

test('a small spot inside a big one saved after it gets the click; Select Spot Here picks the big one', async ({ launch, project }) => {
  const p = await project('E2E Overlapping Spots', []);
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await viewMicrograph(ana, p.micrographId);

  await ana.caption('a small grain, then a big outline around it, saved after it');
  await ana.state(new Function('e', `
    const st = e.app.getState();
    st.addSpot(${JSON.stringify(p.micrographId)}, ${JSON.stringify(square('spot-small', 'Small grain', 300, 300, 60))});
    st.addSpot(${JSON.stringify(p.micrographId)}, ${JSON.stringify(square('spot-big', 'Big outline', 100, 100, 500))});`) as never);
  await ana.page.waitForTimeout(500);

  await ana.caption('clicks the small grain: it is selected, not the big outline on top of it in the saved order');
  const inSmall = await screenAt(ana, 330, 330);
  await ana.page.mouse.click(inSmall.x, inSmall.y);
  await expect.poll(() => activeSpotId(ana)).toBe('spot-small');

  await ana.caption('right-click there: Select Spot Here lists both, top first; picks Big outline');
  await ana.page.mouse.click(inSmall.x, inSmall.y, { button: 'right' });
  const menu = ana.page.getByRole('menu');
  await expect(menu.getByText('Select Spot Here')).toBeVisible();
  const items = menu.getByRole('menuitem');
  await expect(items.nth(0)).toHaveText('Small grain');
  await expect(items.nth(1)).toHaveText('Big outline');
  await items.nth(1).click();
  await expect.poll(() => activeSpotId(ana)).toBe('spot-big');
  // The menu opens at the cursor and fades out: wait until it is gone, or it catches the next right-click
  await ana.page.locator('.MuiPopover-root').waitFor({ state: 'detached' });

  await ana.caption('right-click where only the big outline is: no Select Spot Here');
  const inBigOnly = await screenAt(ana, 560, 560); // bottom-right, away from the labels
  await ana.page.mouse.click(inBigOnly.x, inBigOnly.y, { button: 'right' });
  await expect(ana.page.getByRole('menu').getByRole('menuitem', { name: 'Edit Spot Metadata' })).toBeVisible();
  await expect(ana.page.getByRole('menu').getByText('Select Spot Here')).toHaveCount(0);
  await ana.page.keyboard.press('Escape');
});
