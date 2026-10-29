/**
 * "Copy scale from an existing micrograph" (Peter, 2026-10-29: photomicrographs
 * at the same magnification from different places): a scale method that takes
 * the px/cm of any micrograph in the project; the placement step starts with
 * it filled in as a Pixel Conversion Factor (px per 1 cm), the image is only
 * dragged into place, and the save stores the source's px/cm exactly. In Edit
 * Micrograph Location and the New Associated Micrograph wizard. The overview
 * is 1600 x 1200 at 40000 px/cm (fixtures.ts). One copy, not synced.
 */

import fs from 'fs';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { makeProject } from '../lib/fixtures';
import { openSmz } from '../lib/actions';

const SOURCE_SCALE = 123456;

async function start(launch: (l: string, a: typeof ACCOUNTS.ana, o?: { login?: boolean }) => Promise<Copy>, runDir: string,
  name: string, withUnplaced: boolean) {
  const overviewId = randomUUID();
  const children = [
    { id: randomUUID(), name: 'Ol photo 1', placed: true },
    ...(withUnplaced ? [{ id: randomUUID(), name: 'Ol photo 2', placed: false }] : []),
  ];
  const images: Record<string, Buffer> = {};
  for (const c of children) {
    images[c.id] = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 120, g: 100, b: 80 } } }).jpeg().toBuffer();
  }
  const p = await makeProject(`${runDir}/fixtures`, name, [], {
    overviewId,
    micrographs: children.map((c) => ({
      id: c.id, name: c.name, parentID: overviewId, imageType: 'Plane Polarized Light',
      width: 800, height: 600, imageWidth: 800, imageHeight: 600, opacity: 1,
      polish: false, description: '', notes: '', spots: [], orientationInfo: { orientationMethod: 'unoriented' },
      associatedFiles: [], links: [], isMicroVisible: true, isExpanded: false, isSpotExpanded: false, isFlipped: false, tags: [],
      ...(c.placed ? { offsetInParent: { X: 100, Y: 100 }, rotation: 0, scalePixelsPerCentimeter: SOURCE_SCALE } : {}),
    })),
    images,
  });
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await ana.page.getByText('Overview (Reference)', { exact: true }).locator('xpath=..')
    .locator('[data-testid="ChevronRightIcon"]').first().click();
  return ana;
}

/** Top-left of a micrograph on its parent */
async function offsetOf(copy: Copy, name: string): Promise<{ X: number; Y: number } | null> {
  return (await copy.state(new Function('e', `
    for (const d of e.app.getState().project?.datasets ?? []) for (const s of d.samples ?? [])
      for (const m of s.micrographs ?? []) if (m.name === ${JSON.stringify(name)}) return m.offsetInParent ?? null;
    return null;`) as never)) as unknown as { X: number; Y: number } | null;
}

async function scaleOf(copy: Copy, name: string): Promise<number | null> {
  return (await copy.state(new Function('e', `
    for (const d of e.app.getState().project?.datasets ?? []) for (const s of d.samples ?? [])
      for (const m of s.micrographs ?? []) if (m.name === ${JSON.stringify(name)}) return m.scalePixelsPerCentimeter ?? null;
    return null;`) as never)) as unknown as number | null;
}

/** On the scale step: Copy scale from an existing micrograph, source Ol photo 1 */
async function chooseCopyScale(copy: Copy, dialog: ReturnType<Copy['page']['getByRole']>) {
  await dialog.getByRole('radio', { name: 'Copy scale from an existing micrograph' }).check();
  await dialog.getByRole('combobox', { name: 'Copy scale from' }).click();
  await copy.page.getByRole('option', { name: /^Ol photo 1 \(800 × 600, 12\.35 px\/μm\)/ }).click();
}

test('Edit Micrograph Location: Copy scale fills in the Pixel Conversion Factor and saves the source scale', async ({ launch, runDir }) => {
  const ana = await start(launch, runDir, 'E2E Copy Scale Edit', true);

  await ana.caption('clicks the unplaced photo: scaled rectangle, Next, Copy scale from Ol photo 1');
  await ana.page.getByText('Ol photo 2', { exact: true }).click();
  const edit = ana.page.getByRole('dialog', { name: 'Edit Micrograph Location' });
  await expect(edit).toBeVisible();
  await edit.getByRole('radio', { name: 'Locate as a scaled rectangle' }).check();
  await edit.getByRole('button', { name: 'Next' }).click();
  const next = edit.getByRole('button', { name: 'Next' });
  await edit.getByRole('radio', { name: 'Copy scale from an existing micrograph' }).check();
  await expect(next).toBeDisabled(); // no source chosen yet
  await chooseCopyScale(ana, edit);
  await next.click();

  await ana.caption('the placement step starts with the copied scale (px per 1 cm); Save');
  await expect(edit.getByLabel('Number of Pixels')).toHaveValue(String(SOURCE_SCALE));
  await expect(edit.getByLabel('Physical Length')).toHaveValue('1');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();
  await expect.poll(() => scaleOf(ana, 'Ol photo 2')).toBe(SOURCE_SCALE);
  // The canvas drew it at that scale: it starts centered on the 1600 x 1200 overview, and its
  // drawn size is 800 x 600 px * 40000 / SOURCE_SCALE (it was drawn at the wrong size when the
  // filled-in fields were read before the overview image had loaded)
  const drawn = (800 * 40000) / SOURCE_SCALE;
  const offset = await offsetOf(ana, 'Ol photo 2');
  expect(Math.abs((offset?.X ?? 0) - (800 - drawn / 2))).toBeLessThan(1);
  expect(Math.abs((offset?.Y ?? 0) - (600 - (drawn * 0.75) / 2))).toBeLessThan(1);
});

test('New Associated Micrograph: Copy scale saves the source scale', async ({ launch, runDir }) => {
  const ana = await start(launch, runDir, 'E2E Copy Scale Wizard', false);
  fs.mkdirSync(`${runDir}/images`, { recursive: true });
  const photoPath = `${runDir}/images/ol-photo-3.jpg`;
  await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 60, g: 100, b: 140 } } }).jpeg().toFile(photoPath);

  await ana.caption('Overview + > Add Associated Micrograph, through to Scale Method');
  await ana.page.getByText('Overview (Reference)', { exact: true }).locator('xpath=../..')
    .locator('button:has([data-testid="AddIcon"])').first().click();
  await ana.page.getByRole('menuitem', { name: 'Add Associated Micrograph' }).click();
  const dialog = ana.page.getByRole('dialog', { name: 'New Associated Micrograph' });
  const next = dialog.getByRole('button', { name: 'Next' });
  const pick = async (combo: string, option: string) => {
    await dialog.getByRole('combobox', { name: new RegExp(`^${combo}`) }).click();
    await ana.page.getByRole('option', { name: option, exact: true }).click();
  };
  await ana.answerDialog({ kind: 'open', filePaths: [photoPath] });
  await dialog.getByRole('button', { name: 'Browse...' }).click();
  await next.click(); // Load Associated Micrograph
  await next.click(); // Image Rotation
  await pick('Instrument Type', 'Optical Microscopy');
  await pick('Image Type', 'Plane Polarized Light');
  await next.click(); // Instrument & Image Information
  await next.click(); // Instrument Data
  await dialog.getByLabel(/^Name/).fill('Ol photo 3');
  await next.click(); // Micrograph Metadata
  await dialog.getByRole('radio', { name: 'Locate as a scaled rectangle' }).check();
  await next.click(); // Location Method

  await ana.caption('Copy scale from Ol photo 1, then the placement step and Finish');
  await chooseCopyScale(ana, dialog);
  await next.click(); // Scale Method
  await expect(dialog.getByLabel('Number of Pixels')).toHaveValue(String(SOURCE_SCALE));
  await dialog.getByRole('button', { name: 'Finish' }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
  await expect.poll(() => scaleOf(ana, 'Ol photo 3'), { timeout: 30_000 }).toBe(SOURCE_SCALE);
  // (the wizard's canvas does not start centered; the drawn size is checked in the Edit Location test)
});
