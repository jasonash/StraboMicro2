/**
 * Trackpad zoom (Peter, 2026-10-29: "When I zoom in on the reference
 * micrograph, I can only zoom back out partially"). A Mac trackpad or Magic
 * Mouse sends wheel events with no vertical movement between the real ones;
 * the viewer counted them as zoom in, so a swipe to zoom out was undone as it
 * went (src/utils/wheelZoom.ts). One copy, not synced.
 */

import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { openSmz, viewMicrograph } from '../lib/actions';

function zoom(copy: Copy): Promise<number> {
  return copy.page.evaluate(() => window.__e2eView?.zoom ?? 0);
}

/** Wheel events one at a time, so each is its own zoom step */
async function wheel(copy: Copy, events: Array<[number, number]>) {
  for (const [dx, dy] of events) {
    await copy.page.mouse.wheel(dx, dy);
    await copy.page.waitForTimeout(40);
  }
}

test('sideways-only wheel events do not zoom; a wobbly swipe to zoom out zooms out', async ({ launch, project }) => {
  const p = await project('E2E Trackpad Zoom', []);
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await viewMicrograph(ana, p.micrographId);

  const box = await ana.page.locator('.konvajs-content').first().boundingBox();
  if (!box) throw new Error('no viewer');
  await ana.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  await ana.caption('zooms in with the wheel');
  await wheel(ana, Array.from({ length: 10 }, (): [number, number] => [0, -100]));
  await expect.poll(() => zoom(ana)).toBeGreaterThan(0);
  const zoomedIn = await zoom(ana);

  await ana.caption('sideways-only events (a trackpad sends them): the zoom stays');
  await wheel(ana, Array.from({ length: 6 }, (): [number, number] => [20, 0]));
  expect(await zoom(ana)).toBeCloseTo(zoomedIn, 6);

  await ana.caption('a swipe to zoom out with sideways wobble between the steps: it zooms out');
  await wheel(ana, Array.from({ length: 10 }, (_, i): [number, number] => (i % 2 === 0 ? [0, 4] : [3, 0])));
  // 5 steps out of 1.1 each
  expect(await zoom(ana)).toBeCloseTo(zoomedIn / Math.pow(1.1, 5), 6);

  await ana.caption('the wheel still zooms in and out');
  const before = await zoom(ana);
  await wheel(ana, [[0, -100]]);
  expect(await zoom(ana)).toBeCloseTo(before * 1.1, 6);
  await wheel(ana, [[0, 100]]);
  expect(await zoom(ana)).toBeCloseTo(before, 6);
});
