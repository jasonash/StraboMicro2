/**
 * Image stitcher, phase 4 (docs/image-stitcher-design.md): the mosaic goes into the project.
 *
 * - Tools > Image Stitcher... with a project open: the last step offers a new reference
 *   micrograph (in a sample), an associated micrograph (on a parent) or an image file. The first
 *   two continue in New Micrograph with the mosaic as the image, its default name, and the scale
 *   given in the stitcher filled in as a Pixel Conversion Factor.
 * - "Stitch Images..." in New Micrograph opens the stitcher and takes its mosaic as the image.
 *   Cancelling New Micrograph with a mosaic asks first, and can still save it as an image file.
 *
 * One copy, not logged in.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import type { Locator } from '@playwright/test';
import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { makeProject } from '../lib/fixtures';
import { openSmz } from '../lib/actions';
import { cutTiles, makeScene } from '../../stitchFixtures.mts';
import { writeTiles } from '../lib/stitchTiles';

const TW = 1400;
const TH = 1050;

/** Four overlapping tiles named so that the default mosaic name is "TS-12 mosaic" */
async function tileFiles(dir: string): Promise<string[]> {
  const scene = makeScene(2800, 2100, 11);
  const tiles = cutTiles(scene, { cols: 2, rows: 2, tileWidth: TW, tileHeight: TH, overlap: 0.2, jitter: 0.02, seed: 5 })
    .map((t, k) => ({ ...t, id: `TS-12_00${k + 1}` }));
  return writeTiles(dir, tiles);
}

/** In an open stitcher: add the images, fit, build. Returns the "The mosaic is ready" dialog. */
async function stitch(copy: Copy, files: string[], scale?: string): Promise<Locator> {
  const page = copy.page;
  const choose = page.getByRole('dialog', { name: 'Image Stitcher' });
  await copy.answerDialog({ kind: 'open', filePaths: files });
  await choose.getByRole('button', { name: 'Add Images...' }).click();
  await expect(choose.getByTestId('stitch-row')).toHaveCount(files.length);
  if (scale) await choose.getByLabel('Pixels per unit of the original images').fill(scale);
  await choose.getByRole('button', { name: 'Fit Images Together' }).click();
  const review = page.getByRole('dialog', { name: 'Review the mosaic' });
  await expect(review).toBeVisible({ timeout: 120_000 });
  await expect(review.getByTestId('stitch-placed')).toHaveText(`All ${files.length} images placed automatically`);
  await review.getByRole('button', { name: 'Build' }).click();
  const done = page.getByRole('dialog', { name: 'The mosaic is ready' });
  await expect(done).toBeVisible({ timeout: 60_000 });
  return done;
}

/**
 * Mosaic files handed to New Micrograph that are still in the scratch folder (the app's temp
 * folder is the system one, also for test copies). None may be left once the dialog is done.
 */
function handedMosaics(): string[] {
  const dir = path.join(os.tmpdir(), 'StraboMicro2-scratch', 'mosaics');
  if (!fs.existsSync(dir)) return [];
  return (fs.readdirSync(dir, { recursive: true }) as string[]).filter((f) => f.endsWith('.tif'));
}

function micrographNamed(copy: Copy, name: string) {
  return copy.state(new Function('e', `
    for (const d of e.app.getState().project?.datasets ?? []) for (const s of d.samples ?? [])
      for (const m of s.micrographs ?? []) if (m.name === ${JSON.stringify(name)})
        return { id: m.id, parentID: m.parentID ?? null, imageWidth: m.imageWidth, imageHeight: m.imageHeight, scale: m.scalePixelsPerCentimeter ?? null, sample: s.label };
    return null;`) as never) as unknown as Promise<{ id: string; parentID: string | null; imageWidth: number; imageHeight: number; scale: number | null; sample: string } | null>;
}

test('Tools > Image Stitcher: the mosaic becomes a reference micrograph, name and scale carried over', async ({ launch, runDir }) => {
  test.setTimeout(5 * 60_000);
  const files = await tileFiles(`${runDir}/tiles`);
  const p = await makeProject(`${runDir}/fixtures`, 'E2E Stitch Into Project', []);
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  const page = ana.page;

  await ana.menu('Tools', 'Image Stitcher...');
  const done = await stitch(ana, files, '1000');
  const built = /, ([\d,]+) x ([\d,]+) px\./.exec(await done.getByTestId('stitch-built').innerText());
  if (!built) throw new Error('no size text');
  const width = Number(built[1].replace(/,/g, ''));
  const height = Number(built[2].replace(/,/g, ''));
  expect(width).toBeGreaterThan(2000);

  await ana.caption('the last step offers the project: reference (chosen), associated, or a file');
  await expect(done.getByRole('radio', { name: 'Add to the project as a new reference micrograph' })).toBeChecked();
  await expect(done.getByRole('combobox', { name: 'Sample' })).toHaveText('Thin sections / TX-01');
  await done.getByRole('radio', { name: 'Save as an image file' }).check();
  await expect(done.getByRole('button', { name: 'Save as an Image File...' })).toBeVisible();
  await done.getByRole('radio', { name: 'Add to the project as an associated micrograph' }).check();
  await expect(done.getByRole('combobox', { name: 'Parent micrograph' })).toHaveText('TX-01 / Overview');
  await done.getByRole('radio', { name: 'Add to the project as a new reference micrograph' }).check();
  await done.getByRole('button', { name: 'Continue' }).click();

  await ana.caption('New Reference Micrograph opens with the mosaic as its image');
  const dialog = page.getByRole('dialog', { name: 'New Reference Micrograph' });
  await expect(dialog).toBeVisible();
  await expect(done).toBeHidden();
  await expect(dialog.getByLabel(/^Micrograph File/)).toHaveValue('TS-12 mosaic.tif', { timeout: 60_000 });
  await expect(dialog.getByText('This image is a mosaic made in the Image Stitcher.')).toBeVisible();
  const next = dialog.getByRole('button', { name: 'Next' });
  const pick = async (combo: string, option: string) => {
    await dialog.getByRole('combobox', { name: new RegExp(`^${combo}`) }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
  };
  await next.click(); // Load Reference Micrograph
  await next.click(); // Image Rotation
  await pick('Instrument Type', 'Optical Microscopy');
  await pick('Image Type', 'Plane Polarized Light');
  await next.click(); // Instrument & Image Information
  await next.click(); // Instrument Data
  await expect(dialog.getByLabel(/^Name/)).toHaveValue('TS-12 mosaic');
  await next.click(); // Micrograph Metadata
  await next.click(); // Micrograph Orientation

  await ana.caption('the scale given in the stitcher is filled in');
  await expect(dialog.getByRole('radio', { name: 'Pixel Conversion Factor' })).toBeChecked();
  await next.click(); // Set Micrograph Scale
  await expect(dialog.getByText('Filled in from the Image Stitcher')).toBeVisible();
  const pixels = Number(await dialog.getByLabel(/^Number of Pixels/).inputValue());
  expect(Math.abs(pixels - 1000)).toBeLessThan(2);
  await expect(dialog.getByLabel(/^Physical Length/)).toHaveValue('1');
  await expect(dialog.getByRole('combobox', { name: /^Units/ })).toHaveText('mm');
  await dialog.getByRole('button', { name: 'Finish' }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });

  await expect.poll(() => micrographNamed(ana, 'TS-12 mosaic'), { timeout: 30_000 }).not.toBeNull();
  const added = await micrographNamed(ana, 'TS-12 mosaic');
  expect(added).toMatchObject({ parentID: null, imageWidth: width, imageHeight: height, sample: 'TX-01' });
  expect(Math.abs((added?.scale ?? 0) - pixels * 10)).toBeLessThan(0.01);
  await expect.poll(handedMosaics).toEqual([]);
  expect(await ana.unansweredDialogs()).toEqual([]);
  expect(ana.consoleErrors.filter((l) => /stitch|worker|opencv|konva|mosaic/i.test(l))).toEqual([]);
});

test('New Associated Micrograph > Stitch Images...: the mosaic is the image; Cancel asks and can save it', async ({ launch, runDir }) => {
  test.setTimeout(5 * 60_000);
  const files = await tileFiles(`${runDir}/tiles`);
  const out = `${runDir}/kept mosaic.png`;
  const p = await makeProject(`${runDir}/fixtures`, 'E2E Stitch From New Micrograph', []);
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  const page = ana.page;

  await ana.caption('Overview + > Add Associated Micrograph > Stitch Images...');
  await page.getByText('Overview (Reference)', { exact: true }).locator('xpath=../..')
    .locator('button:has([data-testid="AddIcon"])').first().click();
  await page.getByRole('menuitem', { name: 'Add Associated Micrograph' }).click();
  const dialog = page.getByRole('dialog', { name: 'New Associated Micrograph' });
  await dialog.getByRole('button', { name: 'Stitch Images...' }).click();
  const done = await stitch(ana, files);
  // Opened from New Micrograph: no project choices, the mosaic goes back to that dialog
  await expect(done.getByRole('radio')).toHaveCount(0);
  await done.getByRole('button', { name: 'Use This Mosaic' }).click();
  await expect(done).toBeHidden();
  await expect(dialog.getByLabel(/^Micrograph File/)).toHaveValue('TS-12 mosaic.tif', { timeout: 60_000 });
  expect(handedMosaics()).toHaveLength(1);

  await ana.caption('Cancel asks first; the mosaic can still be saved as an image file');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  const discard = page.getByRole('dialog', { name: 'Discard this mosaic?' });
  await discard.getByRole('button', { name: 'Keep Working' }).click();
  await expect(discard).toBeHidden();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await ana.answerDialog({ kind: 'save', filePath: out });
  await discard.getByRole('button', { name: 'Save as an Image File...' }).click();
  // (The dialog beneath has no role while the question is open: wait for both to be gone)
  await expect(discard).toBeHidden({ timeout: 60_000 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(handedMosaics).toEqual([]);
  const meta = await sharp(out).metadata();
  expect(meta.format).toBe('png');
  expect(meta.width ?? 0).toBeGreaterThan(2000);
  expect(await micrographNamed(ana, 'TS-12 mosaic')).toBeNull();
  expect(fs.existsSync(out)).toBe(true);
  expect(await ana.unansweredDialogs()).toEqual([]);
  expect(ana.consoleErrors.filter((l) => /stitch|worker|opencv|konva|mosaic/i.test(l))).toEqual([]);
});
