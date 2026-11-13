/**
 * Manual figures for the Image Stitcher (section 7): the first step with images chosen, the
 * review step, and "The mosaic is ready". Uses a folder of real overlapping images
 * (STITCH_TILES, default ~/Desktop/ImageStitcherPrototype/handheld-tiles), copied under names a
 * user would have. Needs no demo project and no login.
 *
 *   MANUAL_FIGURES=<folder> npm run manual:screenshots -- stitcher
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { test, expect } from '../e2e/lib/test';
import { ACCOUNTS } from '../e2e/lib/copy';
import { makeProject } from '../e2e/lib/fixtures';
import { openSmz } from '../e2e/lib/actions';
import { setWindowSize, shot } from './lib';

const TILES = process.env.STITCH_TILES || path.join(os.homedir(), 'Desktop', 'ImageStitcherPrototype', 'handheld-tiles');

test('image stitcher', async ({ launch, runDir }) => {
  const sources = fs.readdirSync(TILES).filter((f) => /\.(jpe?g|png|tiff?)$/i.test(f)).sort();
  if (sources.length < 2) throw new Error(`no images in ${TILES} (set STITCH_TILES)`);
  const dir = `${runDir}/TS-12`;
  fs.mkdirSync(dir, { recursive: true });
  const files = sources.map((f, k) => {
    const to = path.join(dir, `TS-12_${String(k + 1).padStart(2, '0')}${path.extname(f).toLowerCase()}`);
    fs.copyFileSync(path.join(TILES, f), to);
    return to;
  });

  const p = await makeProject(`${runDir}/fixtures`, 'Thin Section Mosaics', []);
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await setWindowSize(ana, 1600, 1100);
  await openSmz(ana, p.smzPath, p.id);
  const page = ana.page;

  // ---- First step, images chosen
  await ana.menu('Tools', 'Image Stitcher...');
  const choose = page.getByRole('dialog', { name: 'Image Stitcher' });
  await ana.answerDialog({ kind: 'open', filePaths: files });
  await choose.getByRole('button', { name: 'Add Images...' }).click();
  await expect(choose.getByTestId('stitch-row')).toHaveCount(files.length);
  await expect(choose.getByTestId('stitch-row').locator('img')).toHaveCount(files.length, { timeout: 120_000 });
  await choose.getByLabel('Pixels per unit of the original images').fill('1250');
  await page.waitForTimeout(500);
  await shot(ana, 'image-stitcher-choose', choose);

  // ---- Review, with one image selected
  await choose.getByRole('button', { name: 'Fit Images Together' }).click();
  const review = page.getByRole('dialog', { name: 'Review the mosaic' });
  await expect(review).toBeVisible({ timeout: 5 * 60_000 });
  await page.waitForTimeout(4000);
  await review.getByTestId('stitch-tile-row').nth(4).getByRole('button').first().click();
  await page.waitForTimeout(1500);
  await shot(ana, 'image-stitcher-review', review);

  // ---- The mosaic is ready, originals kept
  await review.getByRole('button', { name: 'Build' }).click();
  const done = page.getByRole('dialog', { name: 'The mosaic is ready' });
  await expect(done).toBeVisible({ timeout: 5 * 60_000 });
  await done.getByRole('checkbox', { name: /^Also add the/ }).check();
  await page.waitForTimeout(500);
  await shot(ana, 'image-stitcher-ready', done);

  // Leave without adding anything
  await done.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('dialog', { name: 'Discard this mosaic?' }).getByRole('button', { name: 'Discard' }).click();
});
