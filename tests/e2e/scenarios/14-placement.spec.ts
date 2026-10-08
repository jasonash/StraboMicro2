/**
 * New Associated Micrograph, Micrograph Location & Scale step: entering the
 * scale (Pixel Conversion Factor, Provide Width/Height of Image, Trace Scale
 * Bar and Drag) must not start an update loop. PlacementCanvas told the
 * dialog about the scale data from an effect that re-ran whenever the
 * dialog passed a new callback, and the dialog made a new one on every
 * render, so once both values were in, the two rendered each other forever
 * (Sentry ELECTRON-2J, 2026-10-08, v2.0.52 on Windows: "Maximum update
 * depth exceeded" after tracing a scale bar). Needs no server work: one
 * copy, not synced.
 */

import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { writeImage } from '../lib/fixtures';
import { openSmz } from '../lib/actions';

type ScaleMethod = 'Pixel Conversion Factor' | 'Provide Width/Height of Image' | 'Trace Scale Bar and Drag';

const LOOP = /Maximum update depth|Minified React error #185/;

/** Overview row + > Add Associated Micrograph, through to the Micrograph Location & Scale step */
async function openPlacementStep(copy: Copy, imagePath: string, method: ScaleMethod,
  location: 'Locate as a scaled rectangle' | 'Locate by an approximate point' = 'Locate as a scaled rectangle') {
  await copy.caption(`adds an associated micrograph, scale by ${method}`);
  await copy.page.getByText('Overview (Reference)', { exact: true }).locator('xpath=../..')
    .locator('button:has([data-testid="AddIcon"])').first().click();
  await copy.page.getByRole('menuitem', { name: 'Add Associated Micrograph' }).click();
  const dialog = copy.page.getByRole('dialog', { name: 'New Associated Micrograph' });
  const next = dialog.getByRole('button', { name: 'Next' });
  const pick = async (combo: string, option: string) => {
    await dialog.getByRole('combobox', { name: new RegExp(`^${combo}`) }).click();
    await copy.page.getByRole('option', { name: option, exact: true }).click();
  };

  await copy.answerDialog({ kind: 'open', filePaths: [imagePath] });
  await dialog.getByRole('button', { name: 'Browse...' }).click();
  await next.click(); // Load Associated Micrograph
  await next.click(); // Image Rotation
  await pick('Instrument Type', 'Optical Microscopy');
  await pick('Image Type', 'Plane Polarized Light');
  await next.click(); // Instrument & Image Information
  await next.click(); // Instrument Data
  await dialog.getByLabel(/^Name/).fill(`Detail (${method})`);
  await next.click(); // Micrograph Metadata
  await dialog.getByText(location, { exact: true }).click();
  await next.click(); // Location Method
  await dialog.getByText(method, { exact: true }).click();
  await next.click(); // Scale Method
  await expect(dialog.locator('.konvajs-content canvas').first()).toBeVisible();
  // The scaled rectangle's overlay shows once both images are in (X field enabled)
  if (location === 'Locate as a scaled rectangle') await expect(dialog.getByLabel('X (px)')).toBeEnabled({ timeout: 30_000 });
  return dialog;
}

/** The dialog is still up, the page did not stop, and React reported no loop */
async function expectNoLoop(copy: Copy, dialog: ReturnType<Copy['page']['getByRole']>, finishEnabled = true) {
  // A loop shows within a frame or two; give it time
  await copy.page.waitForTimeout(1500);
  expect(copy.consoleErrors.filter((l) => LOOP.test(l))).toEqual([]);
  await expect(dialog).toBeVisible();
  if (finishEnabled) await expect(dialog.getByRole('button', { name: 'Finish' })).toBeEnabled();
}

async function start(launch: (l: string, a: typeof ACCOUNTS.ana, o?: { login?: boolean }) => Promise<Copy>,
  project: (name: string) => Promise<{ id: string; smzPath: string; micrographId: string }>, name: string) {
  const p = await project(name);
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  return { p, ana };
}

/** Name of the new micrograph and its scale, once Finish has added it */
async function added(copy: Copy, name: string) {
  let found: { scale: number | null; parentID: string | null } | null = null;
  await expect.poll(async () => {
    found = await copy.state(new Function('e', `
      for (const d of e.app.getState().project?.datasets ?? []) for (const s of d.samples ?? [])
        for (const m of s.micrographs ?? []) if (m.name === ${JSON.stringify(name)})
          return { scale: m.scalePixelsPerCentimeter ?? null, parentID: m.parentID ?? null };
      return null;`) as never);
    return found;
  }, { timeout: 30_000 }).not.toBeNull();
  return found as unknown as { scale: number | null; parentID: string | null };
}

test('Pixel Conversion Factor: typing both values does not loop, Finish adds the micrograph with its scale', async ({ launch, project, runDir }) => {
  const { p, ana } = await start(launch, project, 'E2E Placement Pixel Factor');
  const img = await writeImage(`${runDir}/images/detail.jpg`);
  const dialog = await openPlacementStep(ana, img, 'Pixel Conversion Factor');
  await dialog.getByLabel(/^Number of Pixels/).fill('1000');
  await dialog.getByLabel(/^Physical Length/).fill('100');
  await expectNoLoop(ana, dialog);

  await dialog.getByRole('button', { name: 'Finish' }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
  const m = await added(ana, 'Detail (Pixel Conversion Factor)');
  expect(m.parentID).toBe(p.micrographId);
  // 1000 px per 100 µm = 100000 px/cm
  expect(m.scale).toBeCloseTo(100000, 0);
});

test('Provide Width/Height of Image: typing the width does not loop', async ({ launch, project, runDir }) => {
  const { ana } = await start(launch, project, 'E2E Placement Width');
  const img = await writeImage(`${runDir}/images/detail.jpg`);
  const dialog = await openPlacementStep(ana, img, 'Provide Width/Height of Image');
  await dialog.getByLabel(/^Width/).fill('160');
  await expect(dialog.getByLabel(/^Height/)).toHaveValue('120.00');
  await expectNoLoop(ana, dialog);
});

test('Trace Scale Bar and Drag: tracing a line and typing its length does not loop (Sentry ELECTRON-2J)', async ({ launch, project, runDir }) => {
  const { ana } = await start(launch, project, 'E2E Placement Trace');
  const img = await writeImage(`${runDir}/images/detail.jpg`);
  const dialog = await openPlacementStep(ana, img, 'Trace Scale Bar and Drag');

  // Line tool, then drag across the middle of the canvas (over the overlay)
  await dialog.getByRole('button', { name: 'Line Tool' }).click();
  const box = await dialog.locator('.konvajs-content').first().boundingBox();
  if (!box) throw new Error('no canvas');
  await ana.page.mouse.move(box.x + box.width / 2 - 80, box.y + box.height / 2);
  await ana.page.mouse.down();
  await ana.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
  await ana.page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 5 });
  await ana.page.mouse.up();
  await expect(dialog.getByLabel(/^Pixel Count/)).not.toHaveValue('');

  await dialog.getByLabel(/^Physical Length/).fill('50');
  await expectNoLoop(ana, dialog);
  // The user's next step in the report: a click on the canvas
  await ana.page.mouse.click(box.x + 40, box.y + 40);
  await expectNoLoop(ana, dialog);
});

test('Locate by an approximate point, Pixel Conversion Factor: typing both values does not loop', async ({ launch, project, runDir }) => {
  const { ana } = await start(launch, project, 'E2E Placement Point');
  const img = await writeImage(`${runDir}/images/detail.jpg`);
  const dialog = await openPlacementStep(ana, img, 'Pixel Conversion Factor', 'Locate by an approximate point');
  await dialog.getByLabel(/^Number of Pixels/).fill('1000');
  await dialog.getByLabel(/^Physical Length/).fill('100');
  // Finish also waits for the point, which this test does not place
  await expectNoLoop(ana, dialog, false);
});
