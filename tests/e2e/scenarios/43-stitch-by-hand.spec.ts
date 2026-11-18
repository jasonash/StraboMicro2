/**
 * Image stitcher, phase 5 (docs/image-stitcher-design.md, decisions 10, 11, 12, 14): changing the
 * layout by hand on the review screen. A selected image is dragged on the canvas (a small move
 * snaps back to the exact fit, a large one stays "placed by hand"), nudged with the arrow keys,
 * reset; an image the automatic pass did not place is put on the mosaic from the list (button and
 * drag); Undo, Redo, Reset to Automatic; the mosaic is built with an image placed by hand.
 *
 * One copy, not logged in, no project.
 */

import path from 'path';
import sharp from 'sharp';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../lib/test';
import { ACCOUNTS } from '../lib/copy';
import { cutTile, cutTiles, makeScene, randomOf, truthOf } from '../../stitchFixtures.mts';
import { writeTiles } from '../lib/stitchTiles';

const TW = 2000;
const TH = 1500;

async function sizeOf(review: Locator): Promise<[number, number]> {
  const m = /(?:will be|saved at) ([\d,]+) x ([\d,]+) px/.exec(await review.getByTestId('stitch-size').innerText());
  if (!m) throw new Error('no size text');
  return [Number(m[1].replace(/,/g, '')), Number(m[2].replace(/,/g, ''))];
}

/** Drags the selected image on the canvas by a number of screen pixels */
async function dragSelected(page: Page, review: Locator, dx: number, dy: number): Promise<void> {
  const canvas = review.getByTestId('stitch-canvas');
  await expect(canvas).toHaveAttribute('data-selected-at', /\d/);
  const [x, y] = ((await canvas.getAttribute('data-selected-at')) ?? '').split(',').map(Number);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no canvas');
  await page.mouse.move(box.x + x, box.y + y);
  await page.mouse.down();
  await page.mouse.move(box.x + x + dx / 2, box.y + y + dy / 2, { steps: 4 });
  await page.mouse.move(box.x + x + dx, box.y + y + dy, { steps: 4 });
  await page.mouse.up();
}

test('Image Stitcher: move, snap, nudge, place by hand, undo, reset, build', async ({ launch, runDir }, testInfo) => {
  test.setTimeout(6 * 60_000);
  const scene = makeScene(5800, 3600, 7);
  const tiles = cutTiles(scene, { cols: 3, rows: 2, tileWidth: TW, tileHeight: TH, overlap: 0.15, jitter: 0.03, turn: 2, seed: 9 })
    .map((t, k) => ({ ...t, id: `TS-12_00${k + 1}` }));
  const stranger = cutTiles(makeScene(2600, 2000, 8), { cols: 1, rows: 1, tileWidth: TW, tileHeight: TH, overlap: 0, seed: 3 }).map((t) => ({ ...t, id: 'TS-12_007' }));
  const files = await writeTiles(path.join(runDir, 'tiles'), [...tiles, ...stranger]);
  const out = path.join(runDir, 'by hand.png');

  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  const page = ana.page;
  await ana.menu('Tools', 'Image Stitcher...');
  const choose = page.getByRole('dialog', { name: 'Image Stitcher' });
  await ana.answerDialog({ kind: 'open', filePaths: files });
  await choose.getByRole('button', { name: 'Add Images...' }).click();
  await expect(choose.getByTestId('stitch-row')).toHaveCount(7);
  await choose.getByRole('button', { name: 'Fit Images Together' }).click();
  const review = page.getByRole('dialog', { name: 'Review the mosaic' });
  await expect(review).toBeVisible({ timeout: 120_000 });
  await expect(review.getByTestId('stitch-placed')).toHaveText('6 of 7 images placed automatically');
  const canvas = review.getByTestId('stitch-canvas');
  await expect(canvas).toHaveAttribute('data-tiles-drawn', '6');
  const message = review.getByTestId('stitch-message');
  const row = (name: string) => review.getByTestId('stitch-tile-row').filter({ hasText: name });
  const undoButton = review.getByRole('button', { name: 'Undo', exact: true });
  const redoButton = review.getByRole('button', { name: 'Redo', exact: true });
  const resetAll = review.getByRole('button', { name: 'Reset to Automatic' });
  await expect(undoButton).toBeDisabled();
  await expect(resetAll).toBeDisabled();
  const whole = await sizeOf(review);
  const near = async (size: [number, number], by: number) => {
    const now = await sizeOf(review);
    return Math.abs(now[0] - size[0]) <= by && Math.abs(now[1] - size[1]) <= by;
  };

  await ana.caption('a small drag of an image snaps back to the exact fit');
  await row('TS-12_003.jpg').getByRole('button').first().click();
  await dragSelected(page, review, 22, 14);
  await expect(message).toHaveText('Snapped to fit.', { timeout: 30_000 });
  await expect(row('TS-12_003.jpg')).not.toHaveAttribute('data-status', 'hand');
  // Back where it fits: the mosaic has its size again (the drag alone would have made it larger)
  await expect.poll(() => near(whole, 4)).toBe(true);
  await expect(undoButton).toBeEnabled();
  await expect(row('TS-12_003.jpg').getByRole('button', { name: 'Reset TS-12_003.jpg to automatic' })).toBeVisible();

  await ana.caption('a large drag finds no fit: placed by hand; Undo, Redo, reset the one image');
  await dragSelected(page, review, -260, -150);
  await expect(message).toContainText('No exact fit was found there.', { timeout: 30_000 });
  await expect(row('TS-12_003.jpg')).toHaveAttribute('data-status', 'hand');
  await expect(row('TS-12_003.jpg')).toContainText('Placed by hand');
  const grown = await sizeOf(review);
  expect(grown[0]).toBeGreaterThan(whole[0] + 300);
  await page.screenshot({ path: testInfo.outputPath('by-hand.png') });
  await testInfo.attach('placed by hand', { path: testInfo.outputPath('by-hand.png'), contentType: 'image/png' });
  await undoButton.click();
  await expect(row('TS-12_003.jpg')).not.toHaveAttribute('data-status', 'hand');
  await expect.poll(() => near(whole, 4)).toBe(true);
  await redoButton.click();
  await expect(row('TS-12_003.jpg')).toHaveAttribute('data-status', 'hand');
  await expect(redoButton).toBeDisabled();
  await row('TS-12_003.jpg').getByRole('button', { name: 'Reset TS-12_003.jpg to automatic' }).click();
  await expect(row('TS-12_003.jpg')).not.toHaveAttribute('data-status', 'hand');
  expect(await sizeOf(review)).toEqual(whole);
  await expect(row('TS-12_003.jpg').getByRole('button', { name: 'Reset TS-12_003.jpg to automatic' })).toHaveCount(0);

  await ana.caption('arrow keys nudge the selected image; several nudges are one Undo');
  await canvas.focus();
  for (let k = 0; k < 4; k++) await page.keyboard.press('Shift+ArrowUp');
  await expect(row('TS-12_003.jpg')).toHaveAttribute('data-status', 'hand');
  expect((await sizeOf(review))[1]).toBeGreaterThan(whole[1] + 100);
  await undoButton.click();
  expect(await sizeOf(review)).toEqual(whole);
  await expect(row('TS-12_003.jpg')).not.toHaveAttribute('data-status', 'hand');

  await ana.caption('the handle above the selected image turns it; a turn that large fits nowhere');
  {
    const [x, y] = ((await canvas.getAttribute('data-selected-at')) ?? '').split(',').map(Number);
    const zoom = Number(await canvas.getAttribute('data-zoom'));
    const box = (await canvas.boundingBox())!;
    // The handle: above the middle of the top edge
    const up = (TH * zoom) / 2 + 28;
    await page.mouse.move(box.x + x, box.y + y - up);
    await page.mouse.down();
    await page.mouse.move(box.x + x + up * 0.3, box.y + y - up * 0.9, { steps: 4 });
    await page.mouse.move(box.x + x + up * 0.5, box.y + y - up * 0.87, { steps: 4 });
    await page.mouse.up();
    await expect(message).toContainText('No exact fit was found there.', { timeout: 30_000 });
    await expect(row('TS-12_003.jpg')).toHaveAttribute('data-status', 'hand');
    // Turned by about 30 degrees about its middle: the mosaic is taller, the middle has not moved far
    expect((await sizeOf(review))[1]).toBeGreaterThan(whole[1] + 100);
    await undoButton.click();
    expect(await sizeOf(review)).toEqual(whole);
  }

  await ana.caption('zoomed in, the images in view are drawn from sharper copies');
  {
    await expect(canvas).toHaveAttribute('data-sharp', '0');
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let k = 0; k < 12; k++) await page.mouse.wheel(0, -120);
    await expect(canvas).not.toHaveAttribute('data-sharp', '0', { timeout: 30_000 });
    await review.getByRole('button', { name: 'Fit', exact: true }).click();
  }

  await ana.caption('the image that fits nothing is put on the mosaic from the list: placed by hand');
  await expect(review.getByText('Not placed (1)')).toBeVisible();
  await review.getByRole('button', { name: 'Place TS-12_007.jpg on the mosaic' }).click();
  await expect(message).toContainText('No exact fit was found there.', { timeout: 30_000 });
  await expect(review.getByText('Placed (7)')).toBeVisible();
  await expect(review.getByText('Not placed (0)')).toBeVisible();
  await expect(row('TS-12_007.jpg')).toHaveAttribute('data-status', 'hand');
  await expect(canvas).toHaveAttribute('data-tiles-drawn', '7');
  // It is selected: drag it further
  await dragSelected(page, review, 200, 0);
  await expect(message).toContainText('No exact fit was found there.', { timeout: 30_000 });

  await ana.caption('Reset to Automatic undoes every change; Undo brings them back');
  await resetAll.click();
  await expect(review.getByText('Placed (6)')).toBeVisible();
  await expect(review.getByText('Not placed (1)')).toBeVisible();
  expect(await sizeOf(review)).toEqual(whole);
  await expect(resetAll).toBeDisabled();
  await undoButton.click();
  await expect(review.getByText('Placed (7)')).toBeVisible();
  await resetAll.click();

  await ana.caption('dragged from the list onto the canvas');
  await row('TS-12_007.jpg').dragTo(canvas, { targetPosition: { x: 80, y: 80 } });
  await expect(review.getByText('Placed (7)')).toBeVisible({ timeout: 30_000 });
  await expect(row('TS-12_007.jpg')).toHaveAttribute('data-status', 'hand');
  await page.screenshot({ path: testInfo.outputPath('dropped.png') });
  await testInfo.attach('dropped from the list', { path: testInfo.outputPath('dropped.png'), contentType: 'image/png' });

  await ana.caption('builds the mosaic with the image placed by hand');
  const final = await sizeOf(review);
  await review.getByRole('button', { name: 'Build' }).click();
  const done = page.getByRole('dialog', { name: 'The mosaic is ready' });
  await expect(done).toBeVisible({ timeout: 60_000 });
  await expect(done.getByTestId('stitch-built')).toHaveText(`7 images, ${final[0].toLocaleString('en-US')} x ${final[1].toLocaleString('en-US')} px.`);
  await ana.answerDialog({ kind: 'save', filePath: out });
  await done.getByRole('button', { name: 'Save as an Image File...' }).click();
  await expect(done.getByText(`Saved to ${out}`)).toBeVisible({ timeout: 60_000 });
  const meta = await sharp(out).metadata();
  expect([meta.width, meta.height]).toEqual(final);
  await done.getByRole('button', { name: 'Close' }).click();
  expect(await ana.unansweredDialogs()).toEqual([]);
  expect(ana.consoleErrors.filter((l) => /stitch|worker|opencv|konva/i.test(l))).toEqual([]);
});

/**
 * Phase 6, burned-in graphics (decision 17): images with the same scale bar burned in. The review
 * screen says so; in the built mosaic the bar is gone where the neighbor covers the spot (its
 * clean pixels are used, not a blend) and stays where nothing else covers it.
 */
test('Image Stitcher: a burned-in scale bar is kept out of the overlap', async ({ launch, runDir }) => {
  test.setTimeout(5 * 60_000);
  const tiles = cutTiles(makeScene(4200, 1900, 13), { cols: 2, rows: 1, tileWidth: TW, tileHeight: TH, overlap: 0.15, jitter: 0, vignette: 0, gain: 0, seed: 4, bar: true })
    .map((t, k) => ({ ...t, id: `bar_${k + 1}` }));
  const files = await writeTiles(path.join(runDir, 'bars'), tiles);
  const out = path.join(runDir, 'bars.png');
  // Where the right image starts in the left one (the cutter's true positions)
  const dx = Math.round(tiles[1].truth[2] - tiles[0].truth[2]);
  expect(dx).toBe(TW * 0.85);

  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  const page = ana.page;
  await ana.menu('Tools', 'Image Stitcher...');
  const choose = page.getByRole('dialog', { name: 'Image Stitcher' });
  await ana.answerDialog({ kind: 'open', filePaths: files });
  await choose.getByRole('button', { name: 'Add Images...' }).click();
  await expect(choose.getByTestId('stitch-row')).toHaveCount(2);
  await choose.getByRole('button', { name: 'Fit Images Together' }).click();
  const review = page.getByRole('dialog', { name: 'Review the mosaic' });
  await expect(review).toBeVisible({ timeout: 120_000 });
  await expect(review.getByTestId('stitch-placed')).toHaveText('Both images placed automatically');
  await expect(review.getByTestId('stitch-graphics')).toContainText('2 images seem to have a scale bar or label burned in');
  await expect(review.getByTestId('stitch-canvas')).toHaveAttribute('data-graphics', '2');
  await expect(review.getByText('Scale bar or label', { exact: true })).toHaveCount(2);
  await expect(review.getByTestId('stitch-magnification')).toHaveCount(0);

  await review.getByRole('button', { name: 'Build' }).click();
  const done = page.getByRole('dialog', { name: 'The mosaic is ready' });
  await expect(done).toBeVisible({ timeout: 60_000 });
  await ana.answerDialog({ kind: 'save', filePath: out });
  await done.getByRole('button', { name: 'Save as an Image File...' }).click();
  await expect(done.getByText(`Saved to ${out}`)).toBeVisible({ timeout: 60_000 });

  const mean = async (file: string, left: number, top: number, width: number, height: number) => {
    const data = await sharp(file).extract({ left, top, width, height }).greyscale().raw().toBuffer();
    return data.reduce((sum, v) => sum + v, 0) / data.length;
  };
  // The bar's white stripe in the left image: x 1580..1900, y 1425..1440 (tests/stitchFixtures.mts).
  // The left image sits at the mosaic's corner, so its pixels are the mosaic's.
  const meta = await sharp(out).metadata();
  expect(Math.abs((meta.width ?? 0) - (dx + TW))).toBeLessThan(6);
  const covered = await mean(out, dx + 60, 1428, 120, 9);
  const neighbor = await mean(files[1], 60, 1428, 120, 9);
  // Under the neighbor: its rock, not the white stripe (a blend would be far brighter)
  expect(Math.abs(covered - neighbor)).toBeLessThan(20);
  expect(covered).toBeLessThan(215);
  // Left of the overlap nothing else covers the bar: it stays
  expect(await mean(out, 1600, 1428, 80, 9)).toBeGreaterThan(240);
  // The right image's own bar, at the mosaic's edge, stays too
  expect(await mean(out, dx + 1600, 1428, 80, 9)).toBeGreaterThan(240);
  expect(ana.consoleErrors.filter((l) => /stitch|worker|opencv|konva/i.test(l))).toEqual([]);
});

/**
 * Phase 6, another magnification (decision 4): one image shows the rock twice as magnified as
 * the others. The review screen names it and offers to leave it out.
 */
test('Image Stitcher: an image at twice the magnification is named and can be left out', async ({ launch, runDir }) => {
  test.setTimeout(5 * 60_000);
  const scene = makeScene(4400, 3400, 17);
  const tiles = cutTiles(scene, { cols: 2, rows: 2, tileWidth: TW, tileHeight: TH, overlap: 0.2, jitter: 0.02, seed: 71 }).map((t, k) => ({ ...t, id: `wide_${k + 1}` }));
  const truth = truthOf(scene.width / 2 + 150, scene.height / 2 - 100, 0, 2, TW, TH);
  const detail = { id: 'detail', image: cutTile(scene, truth, TW, TH, { vignette: 0.2, gain: 1, noise: 2, bar: false }, randomOf(72)) };
  const files = await writeTiles(path.join(runDir, 'magnified'), [...tiles, detail]);

  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  const page = ana.page;
  await ana.menu('Tools', 'Image Stitcher...');
  const choose = page.getByRole('dialog', { name: 'Image Stitcher' });
  await ana.answerDialog({ kind: 'open', filePaths: files });
  await choose.getByRole('button', { name: 'Add Images...' }).click();
  await expect(choose.getByTestId('stitch-row')).toHaveCount(5);
  await choose.getByRole('button', { name: 'Fit Images Together' }).click();
  const review = page.getByRole('dialog', { name: 'Review the mosaic' });
  await expect(review).toBeVisible({ timeout: 120_000 });
  await expect(review.getByTestId('stitch-placed')).toHaveText('All 5 images placed automatically');
  const notice = review.getByTestId('stitch-magnification');
  await expect(notice).toHaveCount(1);
  await expect(notice).toContainText('"detail.jpg" is about 2 times more magnified than the other images.');
  await expect(notice).toContainText('Place automatically on parent');
  await expect(review.getByTestId('stitch-graphics')).toHaveCount(0);

  await notice.getByRole('button', { name: 'Leave Out' }).click();
  await expect(review.getByText('Left out (1)')).toBeVisible();
  await expect(review.getByText('Placed (4)')).toBeVisible();
  await expect(notice).toHaveCount(0);
  // One Undo brings it back, with the notice
  await review.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(notice).toHaveCount(1);
  expect(ana.consoleErrors.filter((l) => /stitch|worker|opencv|konva/i.test(l))).toEqual([]);
});
