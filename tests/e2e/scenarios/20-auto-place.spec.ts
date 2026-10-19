/**
 * Place automatically on parent (docs/drop-to-place-design.md), in the New
 * Associated Micrograph wizard: the image is found on its parent and saved
 * with the right placement and scale. The overview is a "rock" drawing
 * (fixtures.ts rockImage); details are the same drawing rendered 3x larger,
 * cut out, turned or sheared, so the true placement is known. Also Place
 * children automatically (PlaceChildrenDialog): from the end of a Batch
 * Import, from the offer on clicking an unplaced child, and from the tree
 * menu. Needs no server work: one copy, not synced.
 */

import fs from 'fs';
import { randomUUID } from 'crypto';
import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { makeProject, rockImage } from '../lib/fixtures';
import { openSmz } from '../lib/actions';

/** Overview scale in the fixture (px/cm) */
const OVERVIEW_SCALE = 40000;
/** The detail region, in the 3x drawing (4800 x 3600) */
const REGION = { left: 1500, top: 900, width: 1200, height: 900 };

async function start(launch: (l: string, a: typeof ACCOUNTS.ana, o?: { login?: boolean }) => Promise<Copy>, runDir: string, name: string) {
  const overview = await (await rockImage()).jpeg({ quality: 90 }).toBuffer();
  const p = await makeProject(`${runDir}/fixtures`, name, [], { overviewImage: overview });
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  return { p, ana };
}

/** Overview row + > Add Associated Micrograph, through to the Micrograph Location & Scale step */
async function placeAutomatically(copy: Copy, imagePath: string, name: string) {
  await copy.caption(`adds ${name} with Place automatically on parent`);
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
  await dialog.getByLabel(/^Name/).fill(name);
  await next.click(); // Micrograph Metadata
  await dialog.getByText('Place automatically on parent', { exact: true }).click();
  await next.click(); // Location Method (the Scale Method step is skipped)
  return dialog;
}

/** Degrees between two angles, either way round */
function angleFrom(a: number, b: number): number {
  const d = ((((a - b) % 360) + 360) % 360);
  return Math.min(d, 360 - d);
}

interface Saved {
  parentID: string | null;
  scale: number | null;
  offset: { X: number; Y: number } | null;
  rotation: number | null;
  placementType: string | null;
  affineMatrix: number[] | null;
  affineTileHash: string | null;
  imageWidth: number;
  imageHeight: number;
}

async function saved(copy: Copy, name: string): Promise<Saved> {
  let found: Saved | null = null;
  await expect.poll(async () => {
    found = await copy.state(new Function('e', `
      for (const d of e.app.getState().project?.datasets ?? []) for (const s of d.samples ?? [])
        for (const m of s.micrographs ?? []) if (m.name === ${JSON.stringify(name)})
          return { parentID: m.parentID ?? null, scale: m.scalePixelsPerCentimeter ?? null, offset: m.offsetInParent ?? null,
            rotation: m.rotation ?? null, placementType: m.placementType ?? null, affineMatrix: m.affineMatrix ?? null,
            affineTileHash: m.affineTileHash ?? null, imageWidth: m.imageWidth, imageHeight: m.imageHeight };
      return null;`) as never);
    return found;
  }, { timeout: 30_000 }).not.toBeNull();
  return found as unknown as Saved;
}

test('a turned detail is found, Finish saves it as a scaled rectangle with the right place and scale', async ({ launch, runDir }) => {
  const { p, ana } = await start(launch, runDir, 'E2E Auto Place Rectangle');
  const detailPath = `${runDir}/images/detail-turned.jpg`;
  fs.mkdirSync(`${runDir}/images`, { recursive: true });
  // 3x finer, turned 90 degrees clockwise: 900 x 1200
  await (await rockImage(11, 3)).extract(REGION).rotate(90).jpeg({ quality: 92 }).toFile(detailPath);

  const dialog = await placeAutomatically(ana, detailPath, 'Detail turned');
  await expect(dialog.getByText(/^Found it/)).toBeVisible({ timeout: 90_000 });
  await expect(dialog.getByLabel('X (px)')).toBeEnabled({ timeout: 30_000 });
  await dialog.getByRole('button', { name: 'Finish' }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });

  const m = await saved(ana, 'Detail turned');
  expect(m.parentID).toBe(p.micrographId);
  expect(m.placementType).toBeNull();
  // The detail's width (the region's height, turned) covers REGION.height / 3 overview px; the
  // wizard may store the image larger than the file (small images become 2000 px wide)
  const expectedScale = OVERVIEW_SCALE * m.imageWidth / (REGION.height / 3);
  expect(m.scale).toBeGreaterThan(expectedScale * 0.99);
  expect(m.scale).toBeLessThan(expectedScale * 1.01);
  // Turned 90 clockwise in the detail = -90 on the parent
  expect(angleFrom(m.rotation ?? 0, -90)).toBeLessThan(0.5);
  // Center on the region's center (offset = top-left before rotation)
  const s = OVERVIEW_SCALE / (m.scale ?? 1);
  const cx = (m.offset?.X ?? 0) + (m.imageWidth * s) / 2;
  const cy = (m.offset?.Y ?? 0) + (m.imageHeight * s) / 2;
  expect(Math.abs(cx - (REGION.left + REGION.width / 2) / 3)).toBeLessThan(3);
  expect(Math.abs(cy - (REGION.top + REGION.height / 2) / 3)).toBeLessThan(3);
});

test('a sheared detail is saved like a 3-Point Registration, with baked tiles', async ({ launch, runDir }) => {
  const { ana } = await start(launch, runDir, 'E2E Auto Place Affine');
  const detailPath = `${runDir}/images/detail-sheared.jpg`;
  fs.mkdirSync(`${runDir}/images`, { recursive: true });
  const region = await (await rockImage(11, 3)).extract(REGION).png().toBuffer();
  await (await import('sharp')).default(region).affine([[1, 0.2], [0, 1.1]], { background: '#000000' }).jpeg({ quality: 92 }).toFile(detailPath);

  const dialog = await placeAutomatically(ana, detailPath, 'Detail sheared');
  await expect(dialog.getByText(/^Found it|^Low confidence/)).toBeVisible({ timeout: 90_000 });
  await expect(dialog.getByText('The image needed a slight skew to fit, so it is saved like a 3-Point Registration.')).toBeVisible({ timeout: 60_000 });
  await expect(dialog.getByRole('button', { name: 'Finish' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Finish' }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });

  const m = await saved(ana, 'Detail sheared');
  expect(m.placementType).toBe('affine');
  expect(m.affineTileHash).toBeTruthy();
  const a = m.affineMatrix ?? [];
  expect(a).toHaveLength(6);
  // Its real scale: the overview's over the matrix's enlargement (src/utils/affineScale.ts)
  expect(m.scale).toBeCloseTo(OVERVIEW_SCALE / Math.sqrt(Math.abs(a[0] * a[4] - a[1] * a[3])), 6);
  // The image's center lands inside the region on the overview
  const [x, y] = [a[0] * m.imageWidth / 2 + a[1] * m.imageHeight / 2 + a[2], a[3] * m.imageWidth / 2 + a[4] * m.imageHeight / 2 + a[5]];
  expect(x).toBeGreaterThan(REGION.left / 3);
  expect(x).toBeLessThan((REGION.left + REGION.width) / 3);
  expect(y).toBeGreaterThan(REGION.top / 3);
  expect(y).toBeLessThan((REGION.top + REGION.height) / 3);
});

test('an unrelated image: No match found, and Place as a scaled rectangle opens the placement canvas', async ({ launch, runDir }) => {
  const { ana } = await start(launch, runDir, 'E2E Auto Place None');
  const detailPath = `${runDir}/images/unrelated.jpg`;
  fs.mkdirSync(`${runDir}/images`, { recursive: true });
  await (await rockImage(999, 2)).extract(REGION).jpeg({ quality: 92 }).toFile(detailPath);

  const dialog = await placeAutomatically(ana, detailPath, 'Unrelated');
  await expect(dialog.getByText(/^No match found/)).toBeVisible({ timeout: 90_000 });
  await expect(dialog.getByRole('button', { name: 'Finish' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Place as a scaled rectangle' }).click();
  await expect(dialog.getByLabel('X (px)')).toBeEnabled({ timeout: 30_000 });
  await expect(dialog.getByRole('button', { name: 'Finish' })).toBeEnabled();
});

test('Edit Micrograph Location: an unplaced micrograph (as after a batch import) is placed automatically', async ({ launch, runDir }) => {
  const overview = await (await rockImage()).jpeg({ quality: 90 }).toBuffer();
  const detail = await (await rockImage(11, 3)).extract(REGION).rotate(90).jpeg({ quality: 92 }).toBuffer();
  const overviewId = randomUUID();
  const childId = randomUUID();
  const p = await makeProject(`${runDir}/fixtures`, 'E2E Auto Place Edit Location', [], {
    overviewId,
    overviewImage: overview,
    micrographs: [{
      id: childId, name: 'Unplaced detail', parentID: overviewId, imageType: 'Plane Polarized Light',
      width: REGION.height, height: REGION.width, imageWidth: REGION.height, imageHeight: REGION.width, opacity: 1,
      polish: false, description: '', notes: '', spots: [], orientationInfo: { orientationMethod: 'unoriented' },
      associatedFiles: [], links: [], isMicroVisible: true, isExpanded: false, isSpotExpanded: false, isFlipped: false, tags: [],
    }],
    images: { [childId]: detail },
  });
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);

  await ana.caption('opens the overview row, clicks the unplaced micrograph: Edit Micrograph Location opens');
  await ana.page.getByText('Overview (Reference)', { exact: true }).locator('xpath=..')
    .locator('[data-testid="ChevronRightIcon"]').first().click();
  await ana.page.getByText('Unplaced detail', { exact: true }).click();
  const dialog = ana.page.getByRole('dialog', { name: 'Edit Micrograph Location' });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByText('Place automatically on parent', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.getByText(/^Found it/)).toBeVisible({ timeout: 90_000 });
  await expect(dialog.getByLabel('X (px)')).toBeEnabled({ timeout: 30_000 });
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });

  const m = await saved(ana, 'Unplaced detail');
  expect(m.placementType).toBeNull();
  const expectedScale = OVERVIEW_SCALE * m.imageWidth / (REGION.height / 3);
  expect(m.scale).toBeGreaterThan(expectedScale * 0.99);
  expect(m.scale).toBeLessThan(expectedScale * 1.01);
  expect(angleFrom(m.rotation ?? 0, -90)).toBeLessThan(0.5);
  const s = OVERVIEW_SCALE / (m.scale ?? 1);
  const cx = (m.offset?.X ?? 0) + (m.imageWidth * s) / 2;
  const cy = (m.offset?.Y ?? 0) + (m.imageHeight * s) / 2;
  expect(Math.abs(cx - (REGION.left + REGION.width / 2) / 3)).toBeLessThan(3);
  expect(Math.abs(cy - (REGION.top + REGION.height / 2) / 3)).toBeLessThan(3);
});

// ---------------------------------------------------------------- Place children automatically

/** A second region of the 3x drawing, away from REGION */
const REGION2 = { left: 3000, top: 2200, width: 1200, height: 900 };

/** Two details that match (REGION turned 90, REGION2 as is) and one unrelated image */
async function childImages() {
  return {
    turned: await (await rockImage(11, 3)).extract(REGION).rotate(90).jpeg({ quality: 92 }).toBuffer(),
    plain: await (await rockImage(11, 3)).extract(REGION2).jpeg({ quality: 92 }).toBuffer(),
    unrelated: await (await rockImage(999, 2)).extract(REGION).jpeg({ quality: 92 }).toBuffer(),
  };
}

/** The saved rectangle puts the detail's center on the region's center, at the region's scale */
function expectPlacedOn(m: Saved, region: typeof REGION, turned: boolean) {
  expect(m.placementType).toBeNull();
  const expectedScale = OVERVIEW_SCALE * m.imageWidth / ((turned ? region.height : region.width) / 3);
  expect(m.scale).toBeGreaterThan(expectedScale * 0.99);
  expect(m.scale).toBeLessThan(expectedScale * 1.01);
  expect(angleFrom(m.rotation ?? 0, turned ? -90 : 0)).toBeLessThan(0.5);
  const s = OVERVIEW_SCALE / (m.scale ?? 1);
  const cx = (m.offset?.X ?? 0) + (m.imageWidth * s) / 2;
  const cy = (m.offset?.Y ?? 0) + (m.imageHeight * s) / 2;
  expect(Math.abs(cx - (region.left + region.width / 2) / 3)).toBeLessThan(3);
  expect(Math.abs(cy - (region.top + region.height / 2) / 3)).toBeLessThan(3);
}

async function placedNames(copy: Copy): Promise<string[]> {
  return await copy.state(new Function('e', `
    const names = [];
    for (const d of e.app.getState().project?.datasets ?? []) for (const s of d.samples ?? [])
      for (const m of s.micrographs ?? []) if (m.parentID && (m.offsetInParent || m.placementType === 'affine')) names.push(m.name);
    return names.sort();`) as never) as unknown as string[];
}

test('Batch Import ends with Place automatically: found ones are placed in one undo step, the unrelated one is left', async ({ launch, runDir }) => {
  const { ana } = await start(launch, runDir, 'E2E Place Children Batch');
  const images = await childImages();
  fs.mkdirSync(`${runDir}/images`, { recursive: true });
  const files = Object.entries(images).map(([name, data]) => {
    const file = `${runDir}/images/${name}.jpg`;
    fs.writeFileSync(file, data);
    return file;
  });

  await ana.caption('batch imports three associated micrographs on the overview');
  await ana.page.getByText('Overview (Reference)', { exact: true }).locator('xpath=../..')
    .locator('button:has([data-testid="AddIcon"])').first().click();
  await ana.page.getByRole('menuitem', { name: 'Batch Import Associated Micrographs' }).click();
  const batch = ana.page.getByRole('dialog', { name: 'Batch Import Associated Micrographs' });
  await ana.answerDialog({ kind: 'open', filePaths: files });
  await batch.getByRole('button', { name: 'Browse' }).click();
  await batch.getByRole('button', { name: 'Next' }).click();
  await batch.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(batch.getByText('3 micrographs imported.')).toBeVisible({ timeout: 120_000 });
  await ana.caption('answers Place automatically on the last screen');
  await batch.getByRole('button', { name: 'Place automatically' }).click();
  await expect(batch).toBeHidden();

  const dialog = ana.page.getByRole('dialog', { name: /^Place children automatically on/ });
  await expect(dialog).toBeVisible();
  const place = dialog.getByRole('button', { name: 'Place 2 micrographs' });
  await expect(place).toBeEnabled({ timeout: 180_000 });
  await expect(dialog.getByText('Found', { exact: true })).toHaveCount(2);
  await expect(dialog.getByText('No match found', { exact: true })).toHaveCount(1);
  await expect(dialog.getByText(/^Of 3: 2 found, 1 not found\./)).toBeVisible();
  // No match: no checkbox to tick
  await expect(dialog.getByRole('checkbox', { name: 'Place unrelated' })).toBeHidden();
  await expect(dialog.getByRole('checkbox', { name: 'Place turned' })).toBeChecked();
  await place.click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });

  expectPlacedOn(await saved(ana, 'turned'), REGION, true);
  expectPlacedOn(await saved(ana, 'plain'), REGION2, false);
  const unrelated = await saved(ana, 'unrelated');
  expect(unrelated.offset).toBeNull();
  expect(unrelated.placementType).toBeNull();

  await ana.caption('Edit > Undo takes both placements back at once');
  await ana.menu('Edit', 'Undo');
  await expect.poll(() => placedNames(ana), { timeout: 15_000 }).toEqual([]);
});

test('clicking an unplaced child offers placing all; Just this one opens Edit Location and stops asking; the menu item and Stop', async ({ launch, runDir }) => {
  const overview = await (await rockImage()).jpeg({ quality: 90 }).toBuffer();
  const images = await childImages();
  const overviewId = randomUUID();
  const ids = { turned: randomUUID(), plain: randomUUID(), unrelated: randomUUID() };
  const child = (id: string, name: string, width: number, height: number) => ({
    id, name, parentID: overviewId, imageType: 'Plane Polarized Light',
    width, height, imageWidth: width, imageHeight: height, opacity: 1,
    polish: false, description: '', notes: '', spots: [], orientationInfo: { orientationMethod: 'unoriented' },
    associatedFiles: [], links: [], isMicroVisible: true, isExpanded: false, isSpotExpanded: false, isFlipped: false, tags: [],
  });
  const p = await makeProject(`${runDir}/fixtures`, 'E2E Place Children Offer', [], {
    overviewId,
    overviewImage: overview,
    micrographs: [
      child(ids.turned, 'Child turned', REGION.height, REGION.width),
      child(ids.plain, 'Child plain', REGION2.width, REGION2.height),
      child(ids.unrelated, 'Child unrelated', REGION.width / 1.5, REGION.height / 1.5),
    ],
    images: { [ids.turned]: images.turned, [ids.plain]: images.plain, [ids.unrelated]: images.unrelated },
  });
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await ana.page.getByText('Overview (Reference)', { exact: true }).locator('xpath=..')
    .locator('[data-testid="ChevronRightIcon"]').first().click();

  await ana.caption('clicks an unplaced child: the offer comes first');
  await ana.page.getByText('Child turned', { exact: true }).click();
  const offer = ana.page.getByRole('dialog', { name: 'Place all children automatically?' });
  await expect(offer).toBeVisible();
  await expect(offer.getByText(/Child turned and 2 other micrographs on/)).toBeVisible();
  await offer.getByRole('button', { name: 'Just this one' }).click();
  const editLocation = ana.page.getByRole('dialog', { name: 'Edit Micrograph Location' });
  await expect(editLocation).toBeVisible();
  await editLocation.getByRole('button', { name: 'Cancel' }).click();
  await expect(editLocation).toBeHidden();

  await ana.caption('another child of the same parent: no offer this time');
  await ana.page.getByText('Child plain', { exact: true }).click();
  await expect(editLocation).toBeVisible();
  await expect(offer).toBeHidden();
  await editLocation.getByRole('button', { name: 'Cancel' }).click();
  await expect(editLocation).toBeHidden();

  await ana.caption('three-dot menu > Place children automatically..., then Stop at once');
  await ana.page.getByText('Overview (Reference)', { exact: true }).locator('xpath=../..')
    .locator('button:has([data-testid="MoreVertIcon"])').first().click();
  await ana.page.getByRole('menuitem', { name: 'Place children automatically...' }).click();
  const dialog = ana.page.getByRole('dialog', { name: /^Place children automatically on/ });
  await expect(dialog.getByTestId('place-children-row')).toHaveCount(3);
  await dialog.getByRole('button', { name: 'Stop' }).click();
  await expect(dialog.getByText('Not tried', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByRole('button', { name: 'Stop' })).toBeHidden();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect(await placedNames(ana)).toEqual([]);

  await ana.caption('the menu item again, all the way: two placed');
  await ana.page.getByText('Overview (Reference)', { exact: true }).locator('xpath=../..')
    .locator('button:has([data-testid="MoreVertIcon"])').first().click();
  await ana.page.getByRole('menuitem', { name: 'Place children automatically...' }).click();
  await dialog.getByRole('button', { name: 'Place 2 micrographs' }).click({ timeout: 180_000 });
  await expect(dialog).toBeHidden({ timeout: 60_000 });
  expectPlacedOn(await saved(ana, 'Child turned'), REGION, true);
  expectPlacedOn(await saved(ana, 'Child plain'), REGION2, false);
  expect(await placedNames(ana)).toEqual(['Child plain', 'Child turned']);
});
