/**
 * Placement screens on a PPL/XPL pair (Caroline Woods, 2026-11-19) and the
 * placement math with the sharper parent copy (src/utils/placementMath.ts).
 *
 * The overview is a 3000 x 2250 PPL (so the screens draw its 2048 px medium
 * copy: original px per display px = 3000 / 2048), linked to a 2700 x 2025
 * XPL (another size on purpose: it is drawn stretched over the PPL's frame).
 * Children are 1280 x 960 "BSE" images. Expected numbers are worked out here
 * from the canvas's own zoom and pan (data-zoom, data-stage-x/y), not read
 * back from the code under test.
 *
 * 1. Scaled rectangle: Pixel Conversion Factor, X/Y/rotation typed in, the
 *    XPL switched on (nothing moves), the overlay dragged by a known number of
 *    screen pixels, Save: offset, rotation, scale and parent as computed.
 *    Edit Micrograph Location again: same numbers shown (and XPL still on),
 *    Save untouched: nothing changes (it used to restart at scale 1 and save
 *    the parent's px/cm as the child's).
 * 2. Approximate point with X on the keyboard, clicked at a known place.
 * 3. 3-Point Registration has the switch too.
 */

import { randomUUID } from 'crypto';
import sharp from 'sharp';
import type { Locator } from '@playwright/test';
import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { makeProject, rockImage } from '../lib/fixtures';
import { openSmz } from '../lib/actions';

const PPL_W = 3000;
const PPL_H = 2250;
const PARENT_SCALE = 40000; // fixtures.ts overview px/cm
const BSE_W = 1280;
const BSE_H = 960;

/** A BSE child; placed ones get a point (more than one unplaced child opens Finish Importing) */
function bse(id: string, name: string, parentID: string, placed: boolean) {
  return {
    ...(placed ? { pointInParent: { X: 300, Y: 300 }, scalePixelsPerCentimeter: 200000 } : {}),
    id, name, parentID, imageType: 'Backscattered Electron', width: BSE_W, height: BSE_H, imageWidth: BSE_W, imageHeight: BSE_H,
    opacity: 1, polish: false, description: '', notes: '', spots: [], orientationInfo: { orientationMethod: 'unoriented' },
    associatedFiles: [], links: [], isMicroVisible: true, isExpanded: false, isSpotExpanded: false, isFlipped: false, tags: [],
  };
}

async function start(launch: Parameters<Parameters<typeof test>[2]>[0]['launch'], runDir: string, name: string, unplaced: string) {
  const overviewId = randomUUID();
  const xplId = randomUUID();
  const ids = { a: randomUUID(), b: randomUUID(), c: randomUUID() };
  const pplImage = await (await rockImage(11, PPL_W / 1600)).jpeg({ quality: 90 }).toBuffer();
  const xplImage = await (await rockImage(11, 2700 / 1600)).negate({ alpha: false }).jpeg({ quality: 90 }).toBuffer();
  const bseImage = await sharp({ create: { width: BSE_W, height: BSE_H, channels: 3, background: { r: 120, g: 120, b: 120 } } }).jpeg().toBuffer();
  const p = await makeProject(`${runDir}/fixtures`, name, [], {
    overviewId,
    overview: { width: PPL_W, height: PPL_H, imageWidth: PPL_W, imageHeight: PPL_H, siblingImageId: xplId, isPrimarySibling: true },
    overviewImage: pplImage,
    micrographs: [
      {
        id: xplId, name: 'Overview XPL', imageType: 'Cross Polarized Light', width: 2700, height: 2025, imageWidth: 2700, imageHeight: 2025,
        scalePixelsPerCentimeter: PARENT_SCALE * 0.9, siblingImageId: overviewId, isPrimarySibling: false,
        opacity: 1, polish: false, description: '', notes: '', spots: [], orientationInfo: { orientationMethod: 'unoriented' },
        associatedFiles: [], links: [], isMicroVisible: true, isExpanded: false, isSpotExpanded: false, isFlipped: false, tags: [],
      },
      bse(ids.a, 'BSE rectangle', overviewId, unplaced !== 'BSE rectangle'),
      bse(ids.b, 'BSE point', overviewId, unplaced !== 'BSE point'),
      bse(ids.c, 'BSE three points', overviewId, unplaced !== 'BSE three points'),
    ],
    images: { [xplId]: xplImage, [ids.a]: bseImage, [ids.b]: bseImage, [ids.c]: bseImage },
  });
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await ana.page.getByText('Overview (Reference)', { exact: true }).locator('xpath=..')
    .locator('[data-testid="ChevronRightIcon"]').first().click();
  return { ana, overviewId, xplId, ids };
}

/** The placement canvas's frame, zoom and pan, and its box on screen */
async function canvasView(canvas: Locator) {
  const box = (await canvas.boundingBox())!;
  const num = async (attr: string) => Number(await canvas.getAttribute(attr));
  return { box, frame: await num('data-frame-width'), zoom: await num('data-zoom'), sx: await num('data-stage-x'), sy: await num('data-stage-y') };
}

/** Original parent px -> screen px on the placement canvas */
function toScreen(v: Awaited<ReturnType<typeof canvasView>>, x: number, y: number) {
  const ratio = PPL_W / v.frame;
  return { x: v.box.x + 1 + v.sx + (x / ratio) * v.zoom, y: v.box.y + 1 + v.sy + (y / ratio) * v.zoom };
}

async function micro(copy: Copy, id: string) {
  return await copy.state(new Function('e', `
    const m = e.app.getState().micrographIndex.get(${JSON.stringify(id)});
    return m ? { parentID: m.parentID ?? null, offset: m.offsetInParent ?? null, rotation: m.rotation ?? null,
      scale: m.scalePixelsPerCentimeter ?? null, point: m.pointInParent ?? null } : null;`) as never) as unknown as {
    parentID: string | null; offset: { X: number; Y: number } | null; rotation: number | null; scale: number | null; point: { X: number; Y: number } | null;
  } | null;
}

test('scaled rectangle on a PPL/XPL pair: XPL switch, typed and dragged placement, saved and edited again unchanged', async ({ launch, runDir }) => {
  const { ana, overviewId, ids } = await start(launch, runDir, 'E2E Placement Pair Rectangle', 'BSE rectangle');

  await ana.caption('clicks the unplaced BSE: scaled rectangle, Pixel Conversion Factor');
  await ana.page.getByText('BSE rectangle', { exact: true }).click();
  const edit = ana.page.getByRole('dialog', { name: 'Edit Micrograph Location' });
  await edit.getByRole('radio', { name: 'Locate as a scaled rectangle' }).check();
  await edit.getByRole('button', { name: 'Next' }).click();
  await edit.getByRole('radio', { name: 'Pixel Conversion Factor' }).check();
  await edit.getByRole('button', { name: 'Next' }).click();

  const canvas = edit.getByTestId('placement-canvas');
  await expect(canvas).toHaveAttribute('data-frame-width', '2048', { timeout: 30_000 }); // the medium copy, not the 512 px thumbnail
  await expect(canvas).toHaveAttribute('data-showing', 'PPL');
  await expect(edit.getByLabel('X (px)')).toBeEnabled({ timeout: 30_000 });

  await ana.caption('1280 px = 64 μm (200000 px/cm, 0.2x the parent), X 1000, Y 700, rotation 30');
  await edit.getByLabel('Number of Pixels').fill('1280');
  await edit.getByLabel('Physical Length').fill('64');
  await expect(edit.getByText(/Scale: 0\.20x/)).toBeVisible();
  await edit.getByLabel('X (px)').fill('1000');
  await edit.getByLabel('Y (px)').fill('700');
  await edit.getByLabel('Rotation (°)').fill('30');
  await edit.getByLabel('Rotation (°)').press('Enter');

  await ana.caption('switches to XPL: the picture changes, the numbers do not');
  await edit.getByTestId('placement-backdrop-partner').click();
  await expect(canvas).toHaveAttribute('data-showing', 'XPL');
  await expect(edit.getByLabel('X (px)')).toHaveValue('1000.0');
  await expect(edit.getByLabel('Y (px)')).toHaveValue('700.0');
  await expect(edit.getByLabel('Rotation (°)')).toHaveValue('30.0');

  await ana.caption('drags the overlay 60 px right and 30 px down on screen');
  const v = await canvasView(canvas);
  const scaled = 0.2; // parent px per child px
  const center = toScreen(v, 1000 + (BSE_W * scaled) / 2, 700 + (BSE_H * scaled) / 2);
  await ana.page.mouse.move(center.x, center.y);
  await ana.page.mouse.down();
  await ana.page.mouse.move(center.x + 30, center.y + 15, { steps: 5 });
  await ana.page.mouse.move(center.x + 60, center.y + 30, { steps: 5 });
  await ana.page.mouse.up();
  const ratio = PPL_W / v.frame;
  const wantX = 1000 + (60 / v.zoom) * ratio;
  const wantY = 700 + (30 / v.zoom) * ratio;
  await expect.poll(async () => Number(await edit.getByLabel('X (px)').inputValue())).toBeGreaterThan(1000);
  expect(Math.abs(Number(await edit.getByLabel('X (px)').inputValue()) - wantX)).toBeLessThan(1);
  expect(Math.abs(Number(await edit.getByLabel('Y (px)').inputValue()) - wantY)).toBeLessThan(1);

  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();
  const saved = await micro(ana, ids.a);
  expect(saved?.parentID).toBe(overviewId); // on the PPL, whichever half was shown
  expect(Math.abs((saved?.offset?.X ?? 0) - wantX)).toBeLessThan(1);
  expect(Math.abs((saved?.offset?.Y ?? 0) - wantY)).toBeLessThan(1);
  expect(saved?.rotation).toBeCloseTo(30, 6);
  expect(saved?.scale).toBeCloseTo(PARENT_SCALE / scaled, 3);

  await ana.caption('three-dot menu > Edit Micrograph Location: the same numbers, still on XPL; Save untouched');
  await ana.page.getByText('BSE rectangle', { exact: true }).locator('xpath=../..')
    .locator('button:has([data-testid="MoreVertIcon"])').first().click();
  await ana.page.getByRole('menuitem', { name: 'Edit Micrograph Location' }).click();
  await expect(edit).toBeVisible();
  await edit.getByRole('button', { name: 'Next' }).click();
  await edit.getByRole('button', { name: 'Next' }).click();
  await expect(edit.getByLabel('X (px)')).toBeEnabled({ timeout: 30_000 });
  await expect(canvas).toHaveAttribute('data-showing', 'XPL');
  await expect(edit.getByLabel('X (px)')).toHaveValue((saved?.offset?.X ?? 0).toFixed(1));
  await expect(edit.getByLabel('Y (px)')).toHaveValue((saved?.offset?.Y ?? 0).toFixed(1));
  await expect(edit.getByLabel('Rotation (°)')).toHaveValue('30.0');
  await expect(edit.getByText(/Scale: 0\.20x/)).toBeVisible();
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();
  const again = await micro(ana, ids.a);
  expect(again?.offset?.X).toBeCloseTo(saved?.offset?.X ?? NaN, 6);
  expect(again?.offset?.Y).toBeCloseTo(saved?.offset?.Y ?? NaN, 6);
  expect(again?.rotation).toBeCloseTo(30, 6);
  expect(again?.scale).toBeCloseTo(saved?.scale ?? NaN, 3); // was the parent's 40000 before the fix
});

test('approximate point with X on the keyboard, and the switch in 3-Point Registration', async ({ launch, runDir }) => {
  const { ana, overviewId, ids } = await start(launch, runDir, 'E2E Placement Pair Point', 'BSE point');

  await ana.caption('clicks the unplaced BSE: approximate point, Pixel Conversion Factor; X shows the XPL');
  await ana.page.getByText('BSE point', { exact: true }).click();
  const edit = ana.page.getByRole('dialog', { name: 'Edit Micrograph Location' });
  await edit.getByRole('radio', { name: 'Locate by an approximate point' }).check();
  await edit.getByRole('button', { name: 'Next' }).click();
  await edit.getByRole('radio', { name: 'Pixel Conversion Factor' }).check();
  await edit.getByRole('button', { name: 'Next' }).click();
  const canvas = edit.getByTestId('placement-canvas');
  await expect(canvas).toHaveAttribute('data-frame-width', '2048', { timeout: 30_000 });
  await expect(canvas).toHaveAttribute('data-showing', 'PPL');
  await canvas.hover();
  await ana.page.keyboard.press('x');
  await expect(canvas).toHaveAttribute('data-showing', 'XPL');

  await ana.caption('places the point at (1700, 600) of the parent, 1280 px = 64 μm, Save');
  await edit.getByRole('button', { name: 'Point Tool (Click to Place Location)' }).click();
  const v = await canvasView(canvas);
  const at = toScreen(v, 1700, 600);
  await ana.page.mouse.click(at.x, at.y);
  await edit.getByLabel('Number of Pixels').fill('1280');
  await edit.getByLabel('Physical Length').fill('64');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();
  const saved = await micro(ana, ids.b);
  // One screen pixel is 3000 / 2048 / zoom original px
  const tolerance = (PPL_W / v.frame / v.zoom) * 1.5;
  expect(saved?.parentID).toBe(overviewId);
  expect(Math.abs((saved?.point?.X ?? 0) - 1700)).toBeLessThan(tolerance);
  expect(Math.abs((saved?.point?.Y ?? 0) - 600)).toBeLessThan(tolerance);
  expect(saved?.scale).toBeCloseTo(200000, 3);

  await ana.caption('3-Point Registration: the switch is there, still on XPL; back to PPL');
  await ana.page.getByText('BSE three points', { exact: true }).locator('xpath=../..')
    .locator('button:has([data-testid="MoreVertIcon"])').first().click();
  await ana.page.getByRole('menuitem', { name: 'Edit Micrograph Location' }).click();
  await edit.getByRole('radio', { name: '3-Point Registration' }).check();
  await edit.getByRole('button', { name: 'Next' }).click();
  await edit.getByRole('button', { name: 'Start 3-Point Registration' }).click();
  const toggle = ana.page.getByTestId('placement-backdrop-toggle');
  await expect(toggle).toBeVisible({ timeout: 30_000 });
  await expect(toggle).toHaveAttribute('data-showing', 'XPL');
  await ana.page.getByTestId('placement-backdrop-parent').click();
  await expect(toggle).toHaveAttribute('data-showing', 'PPL');
});
