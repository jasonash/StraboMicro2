/**
 * Manual figure for Grain Spot (section 5): the Grain Spot demo project
 * (~/Desktop/Grain_Spot_Demo.smz, or MANUAL_GRAIN_DEMO), a few grains
 * outlined in auto spot mode.
 * The model comes from the e2e cache (tests/e2e/scenarios/19-grain-spot.spec.ts
 * downloads it there) or MANUAL_GRAIN_MODEL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { test, expect } from '../e2e/lib/test';
import { ACCOUNTS } from '../e2e/lib/copy';
import { openDemo, setWindowSize, settle, shot, shotRect, view } from './lib';

const DEMO = { id: '563a2289-0d40-44b6-abe2-2525e270aab9', name: 'Grain Spot Demo' };
const SMZ = process.env.MANUAL_GRAIN_DEMO || path.join(os.homedir(), 'Desktop', 'Grain_Spot_Demo.smz');
const MODEL = process.env.MANUAL_GRAIN_MODEL || path.join(os.homedir(), '.cache', 'strabomicro-e2e', 'sam2.1-hiera-tiny-fp32');

test('grain spot', async ({ launch }) => {
  if (!fs.existsSync(SMZ)) throw new Error(`Grain Spot demo project missing: ${SMZ} (set MANUAL_GRAIN_DEMO)`);
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false, env: { STRABO_GRAIN_MODEL_DIR: MODEL } });
  await setWindowSize(ana, 1600, 1000);
  await openDemo(ana, DEMO, SMZ);
  await view(ana, 'Marble XPL');
  await settle(ana, 2000);

  // The toolbar icon (as core.shots.ts takes it, before the tool is active)
  await shot(ana, 'grain-spot', ana.page.getByRole('button', { name: 'Grain Spot tool' }), 3);
  await ana.page.getByRole('button', { name: 'Auto spot mode' }).click();
  await ana.page.getByRole('button', { name: 'Grain Spot tool' }).click();
  await expect.poll(() => ana.state((e) => e.grain.getState().phase), { timeout: 60_000 }).toBe('ready');
  // The visible viewer (the canvas runs on under the side panel)
  const canvas = await ana.page.locator('.tiled-viewer').first().boundingBox();
  if (!canvas) throw new Error('no viewer');
  // Out of the toolbar's tooltip, then a few grains across the view (fractions of the viewer)
  await ana.page.mouse.move(canvas.x + 20, canvas.y + canvas.height - 20, { steps: 3 });
  await expect(ana.page.locator('.MuiTooltip-popper')).toHaveCount(0);
  const spots = () => ana.state((e) => {
    const s = e.app.getState();
    return (s.project?.datasets ?? []).flatMap((d) => d.samples ?? []).flatMap((x) => x.micrographs ?? [])
      .find((m) => m.id === s.activeMicrographId)?.spots?.length ?? 0;
  });
  const clicks: Array<[number, number]> = [[0.3, 0.35], [0.45, 0.6], [0.6, 0.3], [0.25, 0.7], [0.7, 0.65], [0.5, 0.45]];
  for (const [fx, fy] of clicks) {
    const before = await spots();
    await ana.page.mouse.click(canvas.x + canvas.width * fx, canvas.y + canvas.height * fy);
    await expect.poll(spots, { timeout: 10_000 }).toBeGreaterThan(before).catch(() => undefined);
  }
  // Off the image, so the figure shows the saved spots (a hidden test window's
  // capture misses the hover outline's canvas paint)
  await ana.page.mouse.move(canvas.x + 5, canvas.y + 5, { steps: 3 });
  await settle(ana, 800);
  await shotRect(ana, 'grain-spot-outlines', { x: canvas.x, y: canvas.y - 40, width: canvas.width, height: canvas.height + 40 });
});
