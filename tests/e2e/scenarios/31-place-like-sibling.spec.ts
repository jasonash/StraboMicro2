/**
 * "Place unplaced children like..." (Peter, 2026-10-29: a stack of EDS maps of
 * one area): every checked unplaced child copies the location, scale and
 * rotation of a placed child chosen as the model, with the rules of "Copy
 * location and scale from an existing micrograph" (same proportions; a
 * different pixel size scales by width, with a note); one undo step. The
 * overview is 1600 x 1200 at 40000 px/cm (fixtures.ts). One copy, not synced.
 */

import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { makeProject } from '../lib/fixtures';
import { openSmz } from '../lib/actions';

interface Child { name: string; width: number; height: number; placed?: { X: number; Y: number; rotation: number; scale: number } }

async function start(launch: (l: string, a: typeof ACCOUNTS.ana, o?: { login?: boolean }) => Promise<Copy>, runDir: string,
  name: string, children: Child[]) {
  const overviewId = randomUUID();
  const ids = children.map(() => randomUUID());
  // Each child's image file has its stated size (the app reads sizes from the files)
  const images: Record<string, Buffer> = {};
  for (const [i, c] of children.entries()) {
    images[ids[i]] = await sharp({ create: { width: c.width, height: c.height, channels: 3, background: { r: 90, g: 60, b: 40 } } }).jpeg().toBuffer();
  }
  const p = await makeProject(`${runDir}/fixtures`, name, [], {
    overviewId,
    micrographs: children.map((c, i) => ({
      id: ids[i], name: c.name, parentID: overviewId, imageType: 'Backscattered Electron',
      width: c.width, height: c.height, imageWidth: c.width, imageHeight: c.height, opacity: 1,
      polish: false, description: '', notes: '', spots: [], orientationInfo: { orientationMethod: 'unoriented' },
      associatedFiles: [], links: [], isMicroVisible: true, isExpanded: false, isSpotExpanded: false, isFlipped: false, tags: [],
      ...(c.placed ? { offsetInParent: { X: c.placed.X, Y: c.placed.Y }, rotation: c.placed.rotation, scalePixelsPerCentimeter: c.placed.scale } : {}),
    })),
    images,
  });
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await ana.page.getByText('Overview (Reference)', { exact: true }).locator('xpath=..')
    .locator('[data-testid="ChevronRightIcon"]').first().click();
  return ana;
}

async function placed(copy: Copy, name: string) {
  return (await copy.state(new Function('e', `
    for (const d of e.app.getState().project?.datasets ?? []) for (const s of d.samples ?? [])
      for (const m of s.micrographs ?? []) if (m.name === ${JSON.stringify(name)})
        return { offset: m.offsetInParent ?? null, rotation: m.rotation ?? null, scale: m.scalePixelsPerCentimeter ?? null };
    return null;`) as never)) as unknown as { offset: { X: number; Y: number } | null; rotation: number | null; scale: number | null };
}

async function openPlaceLike(copy: Copy) {
  await copy.page.getByText('Overview (Reference)', { exact: true }).locator('xpath=../..')
    .locator('button:has([data-testid="MoreVertIcon"])').first().click();
  await copy.page.getByRole('menuitem', { name: 'Place unplaced children like...' }).click();
  const dialog = copy.page.getByRole('dialog', { name: 'Place Like a Placed Micrograph' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('Place unplaced children like... copies the placed map onto the others; other proportions stay unplaced', async ({ launch, runDir }) => {
  const ana = await start(launch, runDir, 'E2E Place Like', [
    { name: 'Map Si', width: 800, height: 600, placed: { X: 200, Y: 150, rotation: 15, scale: 80000 } },
    { name: 'Map Al', width: 800, height: 600 },
    { name: 'Map K', width: 400, height: 300 },
    { name: 'Square map', width: 500, height: 500 },
  ]);

  await ana.caption('overview menu > Place unplaced children like...: Map Si is the model');
  const dialog = await openPlaceLike(ana);
  await expect(dialog.getByRole('combobox', { name: 'Place them like' })).toContainText('Map Si');
  await expect(dialog.getByTestId('place-unplaced-row')).toHaveCount(3);
  await expect(dialog.getByRole('checkbox', { name: 'Square map' })).toBeDisabled();
  await expect(dialog.getByText(/Its proportions \(500 × 500\) differ from Map Si's \(800 × 600\)/)).toBeVisible();
  await expect(dialog.getByText(/400 × 300 pixels: the scale is adjusted/)).toBeVisible();

  await ana.caption('Place 2 micrographs');
  await dialog.getByRole('button', { name: 'Place 2 micrographs' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await placed(ana, 'Map Al')).offset).toEqual({ X: 200, Y: 150 });
  expect(await placed(ana, 'Map Al')).toEqual({ offset: { X: 200, Y: 150 }, rotation: 15, scale: 80000 });
  // Same field of view, half the pixels: half the px/cm
  expect(await placed(ana, 'Map K')).toEqual({ offset: { X: 200, Y: 150 }, rotation: 15, scale: 40000 });
  expect((await placed(ana, 'Square map')).offset).toBeNull();

  await ana.caption('one undo step puts both back');
  await ana.menu('Edit', 'Undo');
  await expect.poll(async () => (await placed(ana, 'Map Al')).offset).toBeNull();
  expect((await placed(ana, 'Map K')).offset).toBeNull();
});

test('with nothing placed on the parent, Place unplaced children like... is not available', async ({ launch, runDir }) => {
  const ana = await start(launch, runDir, 'E2E Place Like None', [
    { name: 'Map Al', width: 800, height: 600 },
    { name: 'Map K', width: 800, height: 600 },
  ]);
  await ana.page.getByText('Overview (Reference)', { exact: true }).locator('xpath=../..')
    .locator('button:has([data-testid="MoreVertIcon"])').first().click();
  await expect(ana.page.getByRole('menuitem', { name: 'Place unplaced children like...' })).toBeDisabled();
  await ana.page.keyboard.press('Escape');
});
