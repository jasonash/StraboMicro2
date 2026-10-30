/**
 * Manual figures for the 2026-10-29 features (section 5, 6): Micrograph
 * Visibility, Show Parent Spots, Select Spot Here, Place unplaced children
 * like..., the Tags field in Create New Spot, a name not in the mineral list.
 * Claire's Toxaway overview (~/Desktop/AutoPlace_Test, or MANUAL_PLACE_IMAGES);
 * the BSE image and element maps are crops of it, tinted, for illustration.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { test, expect } from '../e2e/lib/test';
import { ACCOUNTS, type Copy } from '../e2e/lib/copy';
import { makeProject } from '../e2e/lib/fixtures';
import { openSmz, viewMicrograph } from '../e2e/lib/actions';
import { setWindowSize, settle, shot, shotRect } from './lib';

const IMAGES = process.env.MANUAL_PLACE_IMAGES || path.join(os.homedir(), 'Desktop', 'AutoPlace_Test');
// To the right of the Micrograph Visibility panel
const REGION = { left: 1450, top: 650, width: 800, height: 600 };
const SCALE = 1100;

const micro = (id: string, name: string, parentID: string, width: number, height: number, placed: boolean) => ({
  id, name, parentID, imageType: 'Backscattered Electron',
  width, height, imageWidth: width, imageHeight: height, opacity: 1,
  ...(placed ? { scalePixelsPerCentimeter: SCALE, offsetInParent: { X: 0, Y: 0 }, rotation: 0 } : {}),
  polish: false, description: '', notes: '', spots: [], orientationInfo: { orientationMethod: 'unoriented' },
  associatedFiles: [], links: [], isMicroVisible: true, isExpanded: false, isSpotExpanded: false, isFlipped: false, tags: [],
});
const square = (id: string, name: string, x: number, y: number, size: number, color: string) => ({
  id, name, geometryType: 'polygon', color, opacity: 35, labelColor: '0xffffffff',
  points: [{ X: x, Y: y }, { X: x + size, Y: y }, { X: x + size, Y: y + size }, { X: x, Y: y + size }],
  date: new Date().toISOString(), modifiedTimestamp: Date.now(),
});

/** Screen position of a pixel of the micrograph in the viewer */
async function screenAt(copy: Copy, x: number, y: number) {
  const local = await copy.page.evaluate(([px, py]) => {
    const k = (window as unknown as { Konva?: { stages: { findOne: (s: string) => { getAbsoluteTransform: () => { point: (p: { x: number; y: number }) => { x: number; y: number } } } | undefined }[] } }).Konva;
    const layer = k?.stages.map((st) => st.findOne('.spots-layer')).find((l) => l);
    return layer ? layer.getAbsoluteTransform().point({ x: px, y: py }) : null;
  }, [x, y]);
  const box = await copy.page.locator('.konvajs-content').first().boundingBox();
  if (!local || !box) throw new Error('no viewer');
  return { x: box.x + local.x, y: box.y + local.y };
}

test('2026-10-29 features', async ({ launch, runDir }) => {
  if (!fs.existsSync(IMAGES)) throw new Error(`Toxaway images missing: ${IMAGES} (set MANUAL_PLACE_IMAGES)`);
  const base = await sharp(path.join(IMAGES, '160328-4_ppl_merge.tif')).resize({ width: 2400 }).jpeg({ quality: 90 }).toBuffer();
  const { width: overviewWidth = 0, height: overviewHeight = 0 } = await sharp(base).metadata();
  const crop = (region = REGION) => sharp(base).extract(region);
  const gray = await crop().grayscale().jpeg({ quality: 90 }).toBuffer();
  // From the gray JPEG: sharp applies grayscale after tint on one pipeline
  const map = (r: number, g: number, b: number) => sharp(gray).tint({ r, g, b }).jpeg({ quality: 90 }).toBuffer();

  const overviewId = randomUUID();
  const bseId = randomUUID();
  const placedMaps = [
    { id: randomUUID(), name: 'Map Al', tint: [90, 170, 255] },
    { id: randomUUID(), name: 'Map Ca', tint: [120, 255, 120] },
    { id: randomUUID(), name: 'Map Fe', tint: [255, 110, 90] },
  ];
  const waiting = [
    { id: randomUUID(), name: 'Map K', tint: [255, 210, 80] },
    { id: randomUUID(), name: 'Map Mg', tint: [210, 120, 255] },
    { id: randomUUID(), name: 'Map Si', tint: [90, 240, 230] },
  ];
  const otherSizeId = randomUUID();
  const images: Record<string, Buffer> = { [bseId]: gray };
  for (const m of [...placedMaps, ...waiting]) images[m.id] = await map(m.tint[0], m.tint[1], m.tint[2]);
  images[otherSizeId] = await crop({ ...REGION, height: 400 }).grayscale().jpeg({ quality: 90 }).toBuffer();

  const p = await makeProject(`${runDir}/fixtures`, 'Toxaway 160328-4', [], {
    overviewId,
    overviewImage: base,
    overview: {
      name: '160328-4 PPL', width: overviewWidth, height: overviewHeight,
      imageWidth: overviewWidth, imageHeight: overviewHeight, scalePixelsPerCentimeter: SCALE,
    },
    micrographs: [
      { ...micro(bseId, 'BSE 1', overviewId, REGION.width, REGION.height, true), offsetInParent: { X: REGION.left, Y: REGION.top } },
      ...placedMaps.map((m) => micro(m.id, m.name, bseId, REGION.width, REGION.height, true)),
      ...waiting.map((m) => micro(m.id, m.name, overviewId, REGION.width, REGION.height, false)),
      micro(otherSizeId, 'Map Ti (cropped)', overviewId, REGION.width, 400, false),
    ],
    images,
  });

  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await setWindowSize(ana, 1500, 950);
  await openSmz(ana, p.smzPath, p.id);
  const page = ana.page;

  // Place unplaced children like...
  await viewMicrograph(ana, overviewId);
  await page.getByText('160328-4 PPL (Reference)', { exact: true }).locator('xpath=../..')
    .locator('button:has([data-testid="MoreVertIcon"])').first().click();
  await page.getByRole('menuitem', { name: 'Place unplaced children like...' }).click();
  const like = page.getByRole('dialog', { name: 'Place Like a Placed Micrograph' });
  await expect(like.getByRole('button', { name: 'Place 3 micrographs' })).toBeEnabled();
  await settle(ana, 800);
  await shot(ana, 'place-unplaced-like', like);
  await like.getByRole('button', { name: 'Cancel' }).click();
  await expect(like).toBeHidden();
  // The rest of the figures show only the placed stack
  await ana.state(new Function('e', `e.app.getState().deleteMicrographs(${JSON.stringify([...waiting.map((m) => m.id), otherSizeId])})`) as never);

  // Micrograph Visibility: one map at a time, on BSE 1
  await viewMicrograph(ana, bseId);
  await ana.menu('View', 'Micrograph Visibility...');
  const panel = page.getByRole('dialog', { name: 'Micrograph Visibility' });
  await panel.getByRole('button', { name: 'Show only Map Ca' }).click();
  await panel.getByRole('heading', { name: 'Micrograph Visibility' }).or(panel.getByText('Micrograph Visibility', { exact: true })).first().hover();
  await settle(ana, 2500);
  await shot(ana, 'micrograph-visibility', page.locator('.konvajs-content').first());
  await panel.getByRole('button', { name: 'Show All' }).click();
  await panel.getByRole('button', { name: 'Close Micrograph Visibility' }).click();

  // Spots: on the overview (inside BSE 1's area) and on BSE 1
  await viewMicrograph(ana, overviewId);
  await ana.state(new Function('e', `
    const st = e.app.getState();
    st.addSpot(${JSON.stringify(overviewId)}, ${JSON.stringify(square('s-aggregate', 'Garnet aggregate', REGION.left + 60, REGION.top + 200, 300, '0xff9900ff'))});
    st.addSpot(${JSON.stringify(overviewId)}, ${JSON.stringify(square('s-garnet', 'Garnet 3', REGION.left + 140, REGION.top + 300, 90, '0xff3333ff'))});
    st.addSpot(${JSON.stringify(bseId)}, ${JSON.stringify(square('s-rim', 'Rim analysis', 430, 60, 110, '0x33ccffff'))});`) as never);
  await settle(ana, 800);

  // Select Spot Here, on the overview
  const inGarnet = await screenAt(ana, REGION.left + 215, REGION.top + 375);
  await page.mouse.click(inGarnet.x, inGarnet.y, { button: 'right' });
  await expect(page.getByRole('menu').getByText('Select Spot Here')).toBeVisible();
  await settle(ana, 600);
  await shotRect(ana, 'select-spot-here', {
    x: Math.max(0, inGarnet.x - 300), y: Math.max(0, inGarnet.y - 170), width: 520, height: 480,
  });
  await page.keyboard.press('Escape');
  await page.locator('.MuiPopover-root').waitFor({ state: 'detached' });

  // Show Parent Spots, on Map Al
  await ana.menu('View', 'Show Parent Spots');
  await viewMicrograph(ana, placedMaps[0].id);
  await settle(ana, 2500);
  await shot(ana, 'parent-spots', page.locator('.konvajs-content').first());
  await ana.menu('View', 'Show Parent Spots');

  // Create New Spot with its Tags field
  await viewMicrograph(ana, overviewId);
  await ana.state(new Function('e', `
    const st = e.app.getState();
    st.createTag({ id: 'tag-garnet', name: 'Garnet porphyroblast', tagType: 'other', fillColor: '#aa3333', lineColor: '#000000', transparency: 100, tagSize: 10, spotIDs: [] });
    st.createTag({ id: 'tag-shear', name: 'Shear band', tagType: 'other', fillColor: '#3333aa', lineColor: '#000000', transparency: 100, tagSize: 10, spotIDs: [] });`) as never);
  await page.getByRole('button', { name: 'Point tool' }).click();
  const box = await page.locator('.konvajs-content').first().boundingBox();
  if (!box) throw new Error('no viewer');
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5);
  const spot = page.getByRole('dialog', { name: /Create New Spot/ });
  await spot.getByRole('textbox', { name: 'Name' }).fill('Garnet 1');
  await spot.getByRole('combobox', { name: 'Tags' }).click();
  await page.getByRole('option', { name: 'Garnet porphyroblast' }).click();
  // Close the tag list only (Escape would close the dialog)
  await spot.getByRole('textbox', { name: 'Name' }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await settle(ana, 500);
  await shot(ana, 'add-spot', spot);
  await spot.getByRole('button', { name: /Cancel/ }).click();
  await expect(spot).toBeHidden();
  await page.keyboard.press('Escape');

  // A name not in the mineral list
  await page.getByPlaceholder('Select or search data type...').click();
  await page.getByRole('option', { name: 'Mineralogy/Lithology' }).click();
  const mineralogy = page.getByRole('dialog', { name: 'Micrograph Mineralogy/Lithology' });
  const mineral = mineralogy.getByRole('combobox', { name: 'Mineral' });
  await mineral.click();
  await mineral.pressSequentially('lithic fragments');
  const use = page.getByRole('option', { name: /^Use "lithic fragments"/ });
  await expect(use).toContainText('not in mineral list');
  await settle(ana, 500);
  const field = await mineral.boundingBox();
  const option = await use.boundingBox();
  if (!field || !option) throw new Error('no mineral field');
  await shotRect(ana, 'custom-mineral', {
    x: field.x - 16, y: field.y - 16, width: Math.max(field.width, option.width) + 32,
    height: option.y + option.height - field.y + 32,
  });
});
