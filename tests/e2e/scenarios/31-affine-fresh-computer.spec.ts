/**
 * A micrograph placed with 3-Point Registration, opened on a computer that has
 * never made its warped tiles (a downloaded or imported project). The viewer
 * builds them before the first load (src/components/AssociatedImageRenderer.tsx)
 * and draws the overlay at its real size. Before 2026-11-05 the first load
 * failed ("Affine metadata not found", Sentry ELECTRON-32/35), a retry built
 * the tiles, and the overlay kept the oversample factor read before they
 * existed (1), so it was drawn too large. Needs no server work: one copy.
 */

import { randomUUID } from 'crypto';
import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { makeProject } from '../lib/fixtures';
import { openSmz } from '../lib/actions';

/** The detail is shrunk to half size on the overview and turned 20 degrees, so its tiles are oversampled */
const S = 0.5;
const R = (20 * Math.PI) / 180;
const MATRIX = [S * Math.cos(R), -S * Math.sin(R), 300, S * Math.sin(R), S * Math.cos(R), 200];

/** scaleX of the overlay's Konva group (null until it is drawn) */
async function overlayScale(copy: Copy, id: string): Promise<number | null> {
  return await copy.page.evaluate((name) => {
    const k = (window as unknown as { Konva?: { stages: { findOne: (s: string) => { scaleX: () => number } | undefined }[] } }).Konva;
    for (const stage of k?.stages ?? []) {
      const node = stage.findOne(`.${name}`);
      if (node) return node.scaleX();
    }
    return null;
  }, `micrograph-overlay-${id}`);
}

test('a 3-point registered micrograph on a fresh computer: tiles built on first load, overlay drawn at its real size', async ({ launch, runDir }) => {
  const overviewId = randomUUID();
  const affineId = randomUUID();
  const base = {
    imageType: 'Plane Polarized Light', width: 1600, height: 1200, imageWidth: 1600, imageHeight: 1200, opacity: 1,
    polish: false, description: '', notes: '', orientationInfo: { orientationMethod: 'unoriented' },
    associatedFiles: [], links: [], isMicroVisible: true, isExpanded: false, isSpotExpanded: false, isFlipped: false, tags: [],
  };
  const p = await makeProject(`${runDir}/fixtures`, 'E2E Affine Fresh', [], {
    overviewId,
    micrographs: [{
      ...base, id: affineId, name: 'Registered detail', parentID: overviewId,
      // As the app saves 3-Point Registration: the tile hash is the micrograph id
      placementType: 'affine', affineMatrix: MATRIX, affineTileHash: affineId, scalePixelsPerCentimeter: 80000,
      controlPoints: [], affineBoundsOffset: { x: 0, y: 0 }, affineTransformedWidth: 957, affineTransformedHeight: 838,
      spots: [],
    }],
  });
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);

  // Opening a .smz builds the warped tiles (electron/smzImport.js); a project downloaded or pulled
  // from the server does not. Leave the overview, drop the tiles, then open the overview again.
  await ana.state(new Function('e', `return e.app.getState().selectMicrograph(${JSON.stringify(affineId)})`) as never);
  await ana.state(new Function('e', `return window.api.deleteAffineTiles(${JSON.stringify(affineId)})`) as never);
  expect(await ana.state(new Function('e', `return window.api.loadAffineMetadata(${JSON.stringify(affineId)})`) as never)).toBeNull();
  await ana.caption('opens the overview: the registered detail has no warped tiles on this computer yet');
  await ana.state(new Function('e', `return e.app.getState().selectMicrograph(${JSON.stringify(overviewId)})`) as never);

  // The tiles get built, with an oversample factor above 1 (the detail is shrunk on the overview)
  const oversample = async () => await ana.state(new Function('e', `
    return window.api.loadAffineMetadata(${JSON.stringify(affineId)}).then((m) => m ? m.oversample : null);`) as never) as unknown as number | null;
  await expect.poll(oversample, { timeout: 60_000 }).not.toBeNull();
  const k = (await oversample())!;
  expect(k).toBeGreaterThan(1.2);

  await ana.caption(`overlay drawn at 1/${k.toFixed(3)} (the tiles' oversample), not 1`);
  await expect.poll(() => overlayScale(ana, affineId), { timeout: 30_000 }).toBeCloseTo(1 / k, 4);

  // No failed first load
  expect(ana.consoleErrors.filter((l) => l.includes('Affine metadata not found') || l.includes('Affine thumbnail not found'))).toEqual([]);
});
