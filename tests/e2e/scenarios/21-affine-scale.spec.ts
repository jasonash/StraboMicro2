/**
 * Real scales for affine-placed micrographs (src/utils/affineScale.ts). A
 * project saved before 2026-10-19 stores a stand-in scale on a micrograph
 * placed with 3-Point Registration (100 px/cm from the New Micrograph
 * wizard); spot measurements read it and were off by a large factor. Opening
 * the project gives it its real scale, keeps a rectangle placed on it the
 * same size, and the spot's length in the Properties panel is right. Needs no
 * server work: one copy, not synced.
 */

import { randomUUID } from 'crypto';
import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { makeProject } from '../lib/fixtures';
import { openSmz } from '../lib/actions';

/** Overview scale in the fixture (px/cm) */
const OVERVIEW_SCALE = 40000;
/** The affine child is half as large per pixel on the overview: x0.5, turned 20 degrees */
const S = 0.5;
const R = (20 * Math.PI) / 180;
const MATRIX = [S * Math.cos(R), -S * Math.sin(R), 300, S * Math.sin(R), S * Math.cos(R), 200];

async function scaleOf(copy: Copy, id: string): Promise<number | null> {
  return await copy.state(new Function('e', `
    return e.app.getState().micrographIndex.get(${JSON.stringify(id)})?.scalePixelsPerCentimeter ?? null;`) as never) as unknown as number | null;
}

test('an affine micrograph saved with a stand-in scale gets its real scale on open; measurements and the rectangle on it follow', async ({ launch, runDir }) => {
  const overviewId = randomUUID();
  const affineId = randomUUID();
  const rectId = randomUUID();
  const spotId = randomUUID();
  const now = new Date().toISOString();
  const base = {
    imageType: 'Plane Polarized Light', width: 1600, height: 1200, imageWidth: 1600, imageHeight: 1200, opacity: 1,
    polish: false, description: '', notes: '', orientationInfo: { orientationMethod: 'unoriented' },
    associatedFiles: [], links: [], isMicroVisible: true, isExpanded: false, isSpotExpanded: false, isFlipped: false, tags: [],
  };
  const p = await makeProject(`${runDir}/fixtures`, 'E2E Affine Scale', [], {
    overviewId,
    micrographs: [
      {
        ...base, id: affineId, name: 'Registered detail', parentID: overviewId,
        // As the New Micrograph wizard saved 3-Point Registration before: a stand-in of 100
        placementType: 'affine', affineMatrix: MATRIX, scalePixelsPerCentimeter: 100,
        controlPoints: [], affineBoundsOffset: { x: 0, y: 0 }, affineTransformedWidth: 900, affineTransformedHeight: 900,
        spots: [{
          id: spotId, name: 'Grain axis', labelColor: '0xffffffff', showLabel: true, color: '0x00ff00ff', opacity: 50,
          date: now, time: now, notes: '', modifiedTimestamp: Date.now(), geometryType: 'line',
          // 1000 px long
          points: [{ X: 100, Y: 300 }, { X: 1100, Y: 300 }],
          associatedFiles: [], links: [], tags: [],
        }],
      },
      {
        // Placed with Stretch and Drag on the registered detail: drawn 2x smaller per pixel, relative to the stand-in
        ...base, id: rectId, name: 'Rectangle on it', parentID: affineId, width: 400, height: 300, imageWidth: 400, imageHeight: 300,
        offsetInParent: { X: 50, Y: 60 }, rotation: 0, scalePixelsPerCentimeter: 50, spots: [],
      },
    ],
  });
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);

  await ana.caption('opened: the registered detail has its real scale (overview / 0.5)');
  await expect.poll(() => scaleOf(ana, affineId), { timeout: 30_000 }).toBeCloseTo(OVERVIEW_SCALE / S, 6);
  // Still drawn 2x smaller per pixel on the detail: same size and place as before
  expect(await scaleOf(ana, rectId)).toBeCloseTo(OVERVIEW_SCALE / S / 2, 6);
  expect(await scaleOf(ana, overviewId)).toBe(OVERVIEW_SCALE);
  // The repair is a change to save
  expect(await ana.state(new Function('e', 'return e.app.getState().isDirty') as never)).toBe(true);

  await ana.caption('selects the line spot: its length uses the real scale (1000 px / 80000 px/cm = 125 um, was 10 cm)');
  await ana.state(new Function('e', `
    const s = e.app.getState();
    return s.selectMicrograph(${JSON.stringify(affineId)}).then(() => s.selectActiveSpot(${JSON.stringify(spotId)}));`) as never);
  // (in the Properties panel's measurements section, which may be collapsed)
  await expect(ana.page.getByText('125.000 μm', { exact: true }).first()).toBeAttached({ timeout: 30_000 });
  await expect(ana.page.getByText('10.000 cm', { exact: true })).toHaveCount(0);
});
