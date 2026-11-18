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
import { rectanglePoint } from '../../../src/services/autoPlace/placementFields.ts';

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

/**
 * Phase 7, keep the originals (decisions 26 to 31): with "Also add the original images as
 * associated micrographs of the mosaic" checked, Finish adds the mosaic and its originals. The
 * originals are placed where they lie on the mosaic (also after the mosaic was turned and
 * mirrored in the Image Rotation step, and after the import enlarged the narrow originals),
 * hidden for this person, with their scale from the mosaic's; one Undo removes them all.
 */
test('Keep the originals: placed on the turned and mirrored mosaic, hidden, one Undo', async ({ launch, runDir }) => {
  test.setTimeout(6 * 60_000);
  const files = await tileFiles(`${runDir}/tiles`);
  const p = await makeProject(`${runDir}/fixtures`, 'E2E Stitch Keep Originals', []);
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  const page = ana.page;

  await ana.menu('Tools', 'Image Stitcher...');
  const done = await stitch(ana, files, '1000');
  const keep = done.getByLabel('Also add the 4 original images as associated micrographs of the mosaic');
  await expect(keep).not.toBeChecked();
  // Not offered for a file
  await done.getByRole('radio', { name: 'Save as an image file' }).check();
  await expect(keep).toHaveCount(0);
  await done.getByRole('radio', { name: 'Add to the project as a new reference micrograph' }).check();
  await keep.check();
  await done.getByRole('button', { name: 'Continue' }).click();

  const dialog = page.getByRole('dialog', { name: 'New Reference Micrograph' });
  await expect(dialog.getByLabel(/^Micrograph File/)).toHaveValue('TS-12 mosaic.tif', { timeout: 60_000 });
  await expect(dialog.getByText('Its 4 original images will be added as associated micrographs of it, hidden at first.')).toBeVisible();
  const next = dialog.getByRole('button', { name: 'Next' });
  const pick = async (combo: string, option: string) => {
    await dialog.getByRole('combobox', { name: new RegExp(`^${combo}`) }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
  };
  await next.click(); // Load Reference Micrograph
  await ana.caption('turns the mosaic a quarter clockwise and mirrors it');
  await dialog.getByLabel('Rotate 90° clockwise').getByRole('button').click();
  await dialog.getByLabel('Flip (mirror) the image left-right').check();
  await next.click(); // Image Rotation
  await pick('Instrument Type', 'Optical Microscopy');
  await pick('Image Type', 'Plane Polarized Light');
  await next.click(); // Instrument & Image Information
  await next.click(); // Instrument Data
  await next.click(); // Micrograph Metadata
  await next.click(); // Micrograph Orientation
  await next.click(); // Set Micrograph Scale (filled in from the stitcher)
  await dialog.getByRole('button', { name: 'Finish' }).click();
  await expect(dialog).toBeHidden({ timeout: 120_000 });

  type Row = { id: string; name: string; parentID: string | null; imageWidth: number; imageHeight: number; scale: number | null; visible: boolean | null;
    offset: { X: number; Y: number } | null; rotation: number | null; imageType: string | null; instrumentType: string | null };
  const rows = () => ana.state((e) => {
    const out: Row[] = [];
    for (const d of e.app.getState().project?.datasets ?? []) for (const s of d.samples ?? []) for (const m of s.micrographs ?? []) {
      out.push({ id: m.id, name: m.name ?? '', parentID: m.parentID ?? null, imageWidth: m.imageWidth ?? 0, imageHeight: m.imageHeight ?? 0,
        scale: m.scalePixelsPerCentimeter ?? null, visible: m.isMicroVisible ?? null, offset: m.offsetInParent ? { X: m.offsetInParent.X ?? 0, Y: m.offsetInParent.Y ?? 0 } : null, rotation: m.rotation ?? null,
        imageType: m.imageType ?? null, instrumentType: m.instrument?.instrumentType ?? null });
    }
    return out;
  }) as Promise<Row[]>;
  await expect.poll(async () => (await rows()).length, { timeout: 30_000 }).toBe(6);
  const all = await rows();
  const mosaic = all.find((m) => m.name === 'TS-12 mosaic')!;
  const originals = all.filter((m) => m.parentID === mosaic.id);
  expect(originals.map((m) => m.name).sort()).toEqual(['TS-12_001', 'TS-12_002', 'TS-12_003', 'TS-12_004']);
  // Turned a quarter: the mosaic is taller than wide, and so are the originals (2000 wide after the import, then turned)
  expect(mosaic.imageHeight).toBeGreaterThan(mosaic.imageWidth);
  for (const o of originals) {
    expect([o.imageWidth, o.imageHeight]).toEqual([1500, 2000]);
    expect(o.visible).toBe(false);
    expect([o.imageType, o.instrumentType]).toEqual(['Plane Polarized Light', 'Optical Microscopy']);
    // 1400 px originals enlarged to 2000 by the import: 0.7 mosaic pixels per original pixel
    expect(Math.abs((o.scale ?? 0) - (mosaic.scale ?? 0) / 0.7) / (mosaic.scale ?? 1)).toBeLessThan(0.02);
    expect(Math.abs(o.rotation ?? 99)).toBeLessThan(1);
  }
  expect(mosaic.visible).not.toBe(false);

  await ana.caption('each original shows the same rock as the mosaic beneath it');
  const folders = await page.evaluate((id) => window.api!.getProjectFolderPaths(id), p.id);
  const gray = async (id: string) => sharp(`${folders!.images}/${id}`).greyscale().raw().toBuffer({ resolveWithObject: true });
  const parent = await gray(mosaic.id);
  for (const o of originals) {
    const child = await gray(o.id);
    expect([child.info.width, child.info.height]).toEqual([o.imageWidth, o.imageHeight]);
    const placement = { offsetX: o.offset!.X, offsetY: o.offset!.Y, rotation: o.rotation!, scale: (mosaic.scale ?? 1) / (o.scale ?? 1) };
    let sum = 0;
    let count = 0;
    for (let v = 150; v < o.imageHeight - 150; v += 97) {
      for (let u = 150; u < o.imageWidth - 150; u += 89) {
        const [x, y] = rectanglePoint(placement, o.imageWidth, o.imageHeight, u, v);
        const px = Math.round(x);
        const py = Math.round(y);
        if (px < 0 || py < 0 || px >= parent.info.width || py >= parent.info.height) continue;
        sum += Math.abs(child.data[v * child.info.width + u] - parent.data[py * parent.info.width + px]);
        count++;
      }
    }
    // The same rock: a few gray levels apart (resampling, blending). The wrong place, turn or mirror gives 50 or more.
    expect(count).toBeGreaterThan(150);
    expect(sum / count).toBeLessThan(22);
  }

  await ana.caption('one Undo removes the mosaic and its originals');
  await page.waitForTimeout(600);
  await ana.menu('Edit', 'Undo');
  await expect.poll(async () => (await rows()).map((m) => m.name)).toEqual(['Overview']);
  expect(ana.consoleErrors.filter((l) => /stitch|worker|opencv|konva|mosaic|original/i.test(l))).toEqual([]);
});

/**
 * Time and memory of a large set through the whole wizard, with the originals kept: fitting,
 * building, and Finish in New Micrograph (one conversion per original). Not a check; run on request:
 *   E2E_STITCH_BENCH=1 [E2E_STITCH_GRID=12x8] npm run e2e -- 42-
 */
test('stitch bench: a large set into the project with its originals', async ({ launch, runDir }) => {
  test.skip(process.env.E2E_STITCH_BENCH !== '1', 'bench only on request');
  test.setTimeout(60 * 60_000);
  const [cols, rows] = (process.env.E2E_STITCH_GRID ?? '12x8').split('x').map(Number);
  const BW = 2000;
  const BH = 1500;
  const scene = makeScene(Math.ceil(BW * (0.85 * (cols - 1) + 1.1)), Math.ceil(BH * (0.85 * (rows - 1) + 1.1)), 3);
  const tiles = cutTiles(scene, { cols, rows, tileWidth: BW, tileHeight: BH, overlap: 0.15, jitter: 0.03, seed: 5 })
    .map((t, k) => ({ ...t, id: `TS-12_${String(k + 1).padStart(3, '0')}` }));
  const files = await writeTiles(`${runDir}/tiles`, tiles);
  const count = files.length;
  const p = await makeProject(`${runDir}/fixtures`, 'E2E Stitch Bench', []);
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  const page = ana.page;

  const memory = () => ana.app.evaluate(({ app }) => app.getAppMetrics().reduce((sum, m) => sum + m.memory.workingSetSize, 0)).catch(() => 0);
  /** Per kind of process (Browser = main, Tab = the window with its workers, GPU, Utility), in KB */
  const byKind = () => ana.app.evaluate(({ app }) => {
    const out: Record<string, number> = {};
    for (const m of app.getAppMetrics()) out[m.type] = (out[m.type] ?? 0) + m.memory.workingSetSize;
    return out;
  }).catch(() => ({} as Record<string, number>));
  let peak = 0;
  let peakKinds: Record<string, number> = {};
  let sampling = true;
  const sampler = (async () => {
    while (sampling) {
      const kinds = await byKind();
      const total = Object.values(kinds).reduce((sum, kb) => sum + kb, 0);
      if (total > peak) {
        peak = total;
        peakKinds = kinds;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  })();
  const mb = (kb: number) => Math.round(kb / 1024);
  const phase = async <T>(name: string, work: () => Promise<T>): Promise<T> => {
    peak = 0;
    const t0 = Date.now();
    const result = await work();
    console.log(`[e2e bench] ${count} images, ${name}: ${((Date.now() - t0) / 1000).toFixed(1)} s, app memory ${mb(peak)} MB at most (${Object.entries(peakKinds).map(([kind, kb]) => `${kind} ${mb(kb)}`).join(', ')})`);
    return result;
  };
  console.log(`[e2e bench] app memory before: ${mb(await memory())} MB`);

  await ana.menu('Tools', 'Image Stitcher...');
  const choose = page.getByRole('dialog', { name: 'Image Stitcher' });
  await ana.answerDialog({ kind: 'open', filePaths: files });
  await phase('reading (list filled)', async () => {
    await choose.getByRole('button', { name: 'Add Images...' }).click();
    await expect(choose.getByTestId('stitch-row').locator('img')).toHaveCount(count, { timeout: 10 * 60_000 });
  });
  await choose.getByLabel('Pixels per unit of the original images').fill('1000');
  const review = page.getByRole('dialog', { name: 'Review the mosaic' });
  await phase('fitting', async () => {
    await choose.getByRole('button', { name: 'Fit Images Together' }).click();
    await expect(review).toBeVisible({ timeout: 30 * 60_000 });
  });
  console.log(`[e2e bench] ${await review.getByTestId('stitch-placed').innerText()}; ${await review.getByTestId('stitch-size').innerText()}`);
  const done = page.getByRole('dialog', { name: 'The mosaic is ready' });
  await phase('building', async () => {
    await review.getByRole('button', { name: 'Build' }).click();
    await expect(done).toBeVisible({ timeout: 10 * 60_000 });
  });
  await done.getByRole('checkbox', { name: /^Also add the/ }).check();
  const dialog = page.getByRole('dialog', { name: 'New Reference Micrograph' });
  await phase('handing over to New Micrograph', async () => {
    await done.getByRole('button', { name: 'Continue' }).click();
    await expect(dialog.getByLabel(/^Micrograph File/)).toHaveValue('TS-12 mosaic.tif', { timeout: 5 * 60_000 });
  });
  const next = dialog.getByRole('button', { name: 'Next' });
  const pick = async (combo: string, option: string) => {
    await dialog.getByRole('combobox', { name: new RegExp(`^${combo}`) }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
  };
  await next.click();
  await next.click();
  await pick('Instrument Type', 'Optical Microscopy');
  await pick('Image Type', 'Plane Polarized Light');
  for (let k = 0; k < 5; k++) await next.click();
  const micrographs = () => ana.state((e) => {
    let n = 0;
    for (const d of e.app.getState().project?.datasets ?? []) for (const s of d.samples ?? []) n += (s.micrographs ?? []).length;
    return n;
  }) as Promise<number>;
  const before = await micrographs();
  await phase('Finish (mosaic + originals added)', async () => {
    await dialog.getByRole('button', { name: /^Finish/ }).click();
    await expect(dialog).toBeHidden({ timeout: 30 * 60_000 });
    await expect.poll(micrographs, { timeout: 60_000 }).toBe(before + 1 + count);
  });
  await phase('one minute afterwards (tiles, thumbnails)', () => page.waitForTimeout(60_000));
  sampling = false;
  await sampler;
  console.log(`[e2e bench] app memory at the end: ${mb(await memory())} MB`);
});
