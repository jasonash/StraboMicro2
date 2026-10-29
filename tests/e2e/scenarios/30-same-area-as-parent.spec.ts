/**
 * "Same area as parent" (Peter, 2026-10-29: EDS element maps nested in the
 * BSE image they were collected with): a child covers its parent exactly, at
 * offset 0, rotation 0, with the scale that makes its width the parent's. From
 * the overview's three-dot menu (Place unplaced children on its full area...)
 * for every unplaced child with the parent's proportions, from Edit
 * Micrograph Location for one, and in the New Associated Micrograph wizard. The overview is 1600 x 1200 at 40000 px/cm
 * (fixtures.ts). One copy, not synced.
 */

import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { makeProject } from '../lib/fixtures';
import fs from 'fs';
import { openSmz } from '../lib/actions';

const PARENT = { width: 1600, height: 1200, scale: 40000 };

async function start(launch: (l: string, a: typeof ACCOUNTS.ana, o?: { login?: boolean }) => Promise<Copy>, runDir: string,
  name: string, children: Array<{ name: string; width: number; height: number }>) {
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
    })),
    images,
  });
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  if (children.length > 0) {
    await ana.page.getByText('Overview (Reference)', { exact: true }).locator('xpath=..')
      .locator('[data-testid="ChevronRightIcon"]').first().click();
  }
  return { ana, ids };
}

interface Placed { offset: { X: number; Y: number } | null; rotation: number | null; scale: number | null; point: unknown; affine: unknown }

async function placed(copy: Copy, name: string): Promise<Placed | null> {
  return (await copy.state(new Function('e', `
    for (const d of e.app.getState().project?.datasets ?? []) for (const s of d.samples ?? [])
      for (const m of s.micrographs ?? []) if (m.name === ${JSON.stringify(name)})
        return { offset: m.offsetInParent ?? null, rotation: m.rotation ?? null, scale: m.scalePixelsPerCentimeter ?? null,
          point: m.pointInParent ?? null, affine: m.affineMatrix ?? null };
    return null;`) as never)) as unknown as Placed | null;
}

/** Covers the parent: offset 0, rotation 0, drawn width (px * parentScale / scale) = the parent's width */
function expectCoversParent(m: Placed | null, width: number) {
  expect(m?.offset).toEqual({ X: 0, Y: 0 });
  expect(m?.rotation).toBe(0);
  expect(m?.point).toBeNull();
  expect(m?.affine).toBeNull();
  expect(Math.abs((width * PARENT.scale) / (m?.scale ?? 1) - PARENT.width)).toBeLessThan(0.001);
}

test('Place unplaced children on its full area places the maps with the parent\'s proportions and leaves the others', async ({ launch, runDir }) => {
  const { ana } = await start(launch, runDir, 'E2E Parent Area Batch', [
    { name: 'Map Al', width: 800, height: 600 },
    { name: 'Map Ca', width: 1600, height: 1200 },
    { name: 'Square map', width: 500, height: 500 },
  ]);

  await ana.caption('overview three-dot menu > Place unplaced children on its full area...');
  await ana.page.getByText('Overview (Reference)', { exact: true }).locator('xpath=../..')
    .locator('button:has([data-testid="MoreVertIcon"])').first().click();
  await ana.page.getByRole('menuitem', { name: 'Place unplaced children on its full area...' }).click();
  const dialog = ana.page.getByRole('dialog', { name: 'Place on the Full Area of Overview' });
  await expect(dialog.getByTestId('parent-area-row')).toHaveCount(3);
  await expect(dialog.getByRole('checkbox', { name: 'Square map' })).toBeDisabled();
  await expect(dialog.getByText(/Its proportions \(500 × 500\) differ from the parent's \(1600 × 1200\)/)).toBeVisible();

  await ana.caption('unchecks Map Ca, places Map Al only');
  await dialog.getByRole('checkbox', { name: 'Map Ca' }).uncheck();
  await dialog.getByRole('button', { name: 'Place 1 micrograph' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await placed(ana, 'Map Al'))?.offset ?? null).not.toBeNull();
  expectCoversParent(await placed(ana, 'Map Al'), 800);
  expect((await placed(ana, 'Map Al'))?.scale).toBe(20000);
  expect((await placed(ana, 'Map Ca'))?.offset).toBeNull();
  expect((await placed(ana, 'Square map'))?.offset).toBeNull();

  await ana.caption('again for Map Ca: same pixel size, same scale');
  await ana.page.getByText('Overview (Reference)', { exact: true }).locator('xpath=../..')
    .locator('button:has([data-testid="MoreVertIcon"])').first().click();
  await ana.page.getByRole('menuitem', { name: 'Place unplaced children on its full area...' }).click();
  await expect(dialog.getByTestId('parent-area-row')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Place 1 micrograph' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await placed(ana, 'Map Ca'))?.scale ?? null).toBe(40000);
  expectCoversParent(await placed(ana, 'Map Ca'), 1600);
});

test('Edit Micrograph Location > Same area as parent places one map; other proportions cannot', async ({ launch, runDir }) => {
  const { ana } = await start(launch, runDir, 'E2E Parent Area One', [{ name: 'Map Fe', width: 400, height: 300 }]);

  await ana.caption('clicks the unplaced map: Edit Micrograph Location, Same area as parent, Finish');
  await ana.page.getByText('Map Fe', { exact: true }).click();
  const edit = ana.page.getByRole('dialog', { name: 'Edit Micrograph Location' });
  await expect(edit).toBeVisible();
  await edit.getByRole('radio', { name: 'Same area as parent' }).check();
  await edit.getByRole('button', { name: 'Finish' }).click();
  await expect(edit).toBeHidden();
  await expect.poll(async () => (await placed(ana, 'Map Fe'))?.offset ?? null).not.toBeNull();
  expectCoversParent(await placed(ana, 'Map Fe'), 400);
  expect((await placed(ana, 'Map Fe'))?.scale).toBe(10000);
});

test('New Associated Micrograph: Same area as parent finishes the import with the parent\'s area', async ({ launch, runDir }) => {
  const { ana } = await start(launch, runDir, 'E2E Parent Area Wizard', []);
  fs.mkdirSync(`${runDir}/images`, { recursive: true });
  const mapPath = `${runDir}/images/map-mg.jpg`;
  await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 40, g: 90, b: 60 } } }).jpeg().toFile(mapPath);

  await ana.caption('Overview + > Add Associated Micrograph, through to Location Method');
  await ana.page.getByText('Overview (Reference)', { exact: true }).locator('xpath=../..')
    .locator('button:has([data-testid="AddIcon"])').first().click();
  await ana.page.getByRole('menuitem', { name: 'Add Associated Micrograph' }).click();
  const dialog = ana.page.getByRole('dialog', { name: 'New Associated Micrograph' });
  const next = dialog.getByRole('button', { name: 'Next' });
  const pick = async (combo: string, option: string) => {
    await dialog.getByRole('combobox', { name: new RegExp(`^${combo}`) }).click();
    await ana.page.getByRole('option', { name: option, exact: true }).click();
  };
  await ana.answerDialog({ kind: 'open', filePaths: [mapPath] });
  await dialog.getByRole('button', { name: 'Browse...' }).click();
  await next.click(); // Load Associated Micrograph
  await next.click(); // Image Rotation
  await pick('Instrument Type', 'Optical Microscopy');
  await pick('Image Type', 'Plane Polarized Light');
  await next.click(); // Instrument & Image Information
  await next.click(); // Instrument Data
  await dialog.getByLabel(/^Name/).fill('Map Mg');
  await next.click(); // Micrograph Metadata

  await ana.caption('Same area as parent: the wizard finishes here');
  await dialog.getByRole('radio', { name: 'Same area as parent' }).check();
  await dialog.getByRole('button', { name: 'Finish' }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
  await expect.poll(async () => (await placed(ana, 'Map Mg'))?.offset ?? null, { timeout: 30_000 }).not.toBeNull();
  const m = await placed(ana, 'Map Mg');
  const width = (await ana.state(new Function('e', `
    for (const d of e.app.getState().project?.datasets ?? []) for (const s of d.samples ?? [])
      for (const x of s.micrographs ?? []) if (x.name === 'Map Mg') return x.imageWidth;
    return 0;`) as never)) as unknown as number;
  expectCoversParent(m, width);
});
