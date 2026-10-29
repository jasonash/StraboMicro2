/**
 * View > Show Parent Spots (Peter, 2026-10-29): on a micrograph, the spots of
 * every micrograph above it, mapped into its pixels and cut off at its edges,
 * labelled with their micrograph ("Garnet 3 (Overview)"); not selectable
 * there; right-click > Go to Spot on <micrograph> opens it with the spot
 * selected. Overview 1600 x 1200 at 40000 px/cm (fixtures.ts) > BSE 1
 * (800 x 600 at 80000, top-left 100,100) > Map Al (covers BSE 1 exactly).
 * One copy, not synced.
 */

import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { makeProject } from '../lib/fixtures';
import { openSmz, viewMicrograph } from '../lib/actions';

const placed = (id: string, name: string, parentID: string, scale: number, X: number, Y: number) => ({
  id, name, parentID, imageType: 'Backscattered Electron',
  width: 800, height: 600, imageWidth: 800, imageHeight: 600, opacity: 1, scalePixelsPerCentimeter: scale,
  offsetInParent: { X, Y }, rotation: 0,
  polish: false, description: '', notes: '', spots: [], orientationInfo: { orientationMethod: 'unoriented' },
  associatedFiles: [], links: [], isMicroVisible: true, isExpanded: false, isSpotExpanded: false, isFlipped: false, tags: [],
});
const square = (id: string, name: string, x: number, y: number, size: number) => ({
  id, name, geometryType: 'polygon', color: '0xff0000ff', opacity: 50, labelColor: '0xffffffff',
  points: [{ X: x, Y: y }, { X: x + size, Y: y }, { X: x + size, Y: y + size }, { X: x, Y: y + size }],
  date: new Date().toISOString(), modifiedTimestamp: Date.now(),
});

/** Screen position of a pixel of the micrograph in the viewer (the spots layer's transform) */
async function screenAt(copy: Copy, x: number, y: number) {
  const local = await copy.page.evaluate(([px, py]) => {
    const k = (window as unknown as { Konva?: { stages: { findOne: (s: string) => { getAbsoluteTransform: () => { point: (p: { x: number; y: number }) => { x: number; y: number } } } | undefined }[] } }).Konva;
    const layer = k?.stages.map((st) => st.findOne('.spots-layer')).find((l) => l);
    return layer ? layer.getAbsoluteTransform().point({ x: px, y: py }) : null;
  }, [x, y]);
  const box = await copy.page.locator('.konvajs-content').first().boundingBox();
  if (!local || !box) throw new Error('no viewer');
  return { x: box.x + local.x, y: box.y + local.y };
}

/** Label texts drawn for parent spots */
function parentLabels(copy: Copy): Promise<string[]> {
  return copy.page.evaluate(() => {
    const k = (window as unknown as { Konva?: { stages: { find: (s: string) => { find: (t: string) => { text: () => string }[] }[] }[] } }).Konva;
    const groups = k?.stages.flatMap((st) => st.find('.parent-spots')) ?? [];
    return groups.flatMap((g) => g.find('Text').map((t) => t.text())).sort();
  });
}

test('Show Parent Spots: a map shows the BSE and overview spots that fall on it; Go to Spot opens the overview', async ({ launch, runDir }) => {
  const overviewId = randomUUID();
  const bseId = randomUUID();
  const mapId = randomUUID();
  const images: Record<string, Buffer> = {};
  for (const id of [bseId, mapId]) {
    images[id] = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 70, g: 70, b: 70 } } }).jpeg().toBuffer();
  }
  const p = await makeProject(`${runDir}/fixtures`, 'E2E Parent Spots', [], {
    overviewId,
    micrographs: [placed(bseId, 'BSE 1', overviewId, 80000, 100, 100), placed(mapId, 'Map Al', bseId, 80000, 0, 0)],
    images,
  });
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await ana.state(new Function('e', `
    const st = e.app.getState();
    // On the overview: Garnet 3 inside BSE 1's footprint (100..500, 100..400), Far away outside it
    st.addSpot(${JSON.stringify(overviewId)}, ${JSON.stringify(square('spot-garnet', 'Garnet 3', 280, 230, 40))});
    st.addSpot(${JSON.stringify(overviewId)}, ${JSON.stringify(square('spot-far', 'Far away', 1200, 900, 40))});
    st.addSpot(${JSON.stringify(bseId)}, ${JSON.stringify(square('spot-rim', 'Rim', 600, 400, 50))});`) as never);
  await viewMicrograph(ana, mapId);

  await ana.caption('View > Show Parent Spots on Map Al: Rim (BSE 1) and Garnet 3 (Overview); Far away is off the map');
  expect(await parentLabels(ana)).toEqual([]);
  await ana.menu('View', 'Show Parent Spots');
  await expect.poll(() => parentLabels(ana)).toEqual(['Garnet 3 (Overview)', 'Rim (BSE 1)']);

  await ana.caption('right-click Garnet 3 (overview 300,250 = map 400,300): Go to Spot on Overview');
  const at = await screenAt(ana, 400, 300);
  await ana.page.mouse.click(at.x, at.y, { button: 'right' });
  await ana.page.getByRole('menuitem', { name: 'Go to Spot on Overview' }).click();
  await expect.poll(() => ana.state(new Function('e', 'const s = e.app.getState(); return [s.activeMicrographId, s.activeSpotId]') as never))
    .toEqual([overviewId, 'spot-garnet']);
});
