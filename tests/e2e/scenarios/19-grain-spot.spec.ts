/**
 * Grain Spot (docs/click-a-grain-design.md): with the Grain Spot tool, a
 * click on a grain makes a polygon spot of its outline, named by auto spot
 * mode; a click inside an existing spot selects it; without the model the
 * tool asks to download it first. The fixture image is grains drawn as
 * circles (fixtures.ts), so the expected outline is known: a circle on top
 * of the others, clear of the existing spots.
 *
 * The model (about 61 MB) is downloaded once into ~/.cache/strabomicro-e2e
 * and handed to the app with STRABO_GRAIN_MODEL_DIR.
 */

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { openSmz, viewMicrograph } from '../lib/actions';

/** The same files as electron/grainSpotModel.js */
const REVISION = '814a066640debee5a91e70aa401fb8e17e030503';
const FILES = [
  { name: 'vision_encoder_int8.onnx', sha256: 'd848e08b747ba44ee59b31246988528d5ecc67d1e1c0a2f5c08395c86d92176f' },
  { name: 'vision_encoder_int8.onnx_data', sha256: '4359d45f8aafcbc69f945e714af7fb06b74b24c753b5af86b6a230ecd0e737bc' },
  { name: 'prompt_encoder_mask_decoder_int8.onnx', sha256: 'e53727dc441a3c8716dd4a606d5bbf920e33e7545d1a6ff843c9fb804c7d19b6' },
  { name: 'prompt_encoder_mask_decoder_int8.onnx_data', sha256: 'fdb3179a32388267a944a416c0f992c77a138b69a4bfd94f0bbf7089430d7489' },
];

async function grainModelDir(): Promise<string> {
  const dir = path.join(os.homedir(), '.cache', 'strabomicro-e2e', 'sam2.1-hiera-tiny-int8');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of FILES) {
    const file = path.join(dir, f.name);
    const ok = fs.existsSync(file) && crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') === f.sha256;
    if (ok) continue;
    const res = await fetch(`https://huggingface.co/onnx-community/sam2.1-hiera-tiny-ONNX/resolve/${REVISION}/onnx/${f.name}`);
    if (!res.ok) throw new Error(`Could not download ${f.name}: HTTP ${res.status}`);
    const data = Buffer.from(await res.arrayBuffer());
    if (crypto.createHash('sha256').update(data).digest('hex') !== f.sha256) throw new Error(`${f.name}: wrong checksum`);
    fs.writeFileSync(file, data);
  }
  return dir;
}

/** The fixture's circles in drawing order (same generator as fixtures.ts micrographImage) */
function fixtureCircles(): Array<{ x: number; y: number; r: number }> {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out: Array<{ x: number; y: number; r: number }> = [];
  for (let i = 0; i < 60; i++) {
    const r = Math.round(30 + rand() * 90);
    rand(); // shade
    out.push({ x: Math.round(rand() * 1600), y: Math.round(rand() * 1200), r });
  }
  return out;
}

/** The fixture spots' triangles (fixtures.ts spot()) */
function insideFixtureSpot(x: number, y: number): boolean {
  return [0, 1].some((i) => {
    const sx = 300 + i * 500, sy = 400 + i * 200;
    const tri = [[sx, sy], [sx + 220, sy - 60], [sx + 180, sy + 160]];
    let inside = false;
    for (let a = 0, b = 2; a < 3; b = a++) {
      const [xi, yi] = tri[a], [xj, yj] = tri[b];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  });
}

/** A large circle drawn after (on top of) every circle it touches, fully in the image, away from the fixture spots */
function cleanGrain() {
  const circles = fixtureCircles();
  const ok = circles.filter((c, i) =>
    c.x - c.r > 10 && c.y - c.r > 10 && c.x + c.r < 1590 && c.y + c.r < 1190 &&
    circles.slice(i + 1).every((d) => Math.hypot(c.x - d.x, c.y - d.y) > c.r + d.r + 4) &&
    !insideFixtureSpot(c.x, c.y));
  ok.sort((a, b) => b.r - a.r);
  if (ok.length === 0) throw new Error('no clean grain in the fixture');
  return ok[0];
}

/** Page position of an image point */
async function pageAt(copy: Copy, x: number, y: number) {
  const view = await copy.page.evaluate(() => window.__e2eView);
  const box = await copy.page.locator('.konvajs-content').first().boundingBox();
  if (!view || !box) throw new Error('no viewer');
  return { x: box.x + view.position.x + x * view.zoom, y: box.y + view.position.y + y * view.zoom };
}

async function clickImage(copy: Copy, x: number, y: number) {
  const at = await pageAt(copy, x, y);
  await copy.page.mouse.click(at.x, at.y);
}

/** Move the mouse to an image point in a few steps, as a hand would */
async function hoverImage(copy: Copy, x: number, y: number) {
  const at = await pageAt(copy, x, y);
  await copy.page.mouse.move(at.x, at.y, { steps: 5 });
}

/** The grain outline shown under the mouse */
const grainPreview = (copy: Copy) => copy.state((e) => e.grain.getState().preview) as
  Promise<{ ring: number[][]; offScreen: boolean } | null>;

function spotsOf(copy: Copy, micrographId: string) {
  return copy.state(new Function('e', `
    const s = e.app.getState();
    const id = ${JSON.stringify(micrographId)};
    // From the project itself: micrographIndex is not rebuilt when a spot's outline changes
    const m = (s.project?.datasets ?? []).flatMap((d) => d.samples ?? []).flatMap((x) => x.micrographs ?? []).find((x) => x.id === id);
    return (m?.spots ?? []).map((s) => ({ id: s.id, name: s.name, type: s.geometryType || s.geometry?.type,
      ring: s.geometry?.coordinates?.[0] ?? (s.points ?? []).map((p) => [p.X, p.Y]) }));`) as never) as
    Promise<Array<{ id: string; name: string; type: string; ring: number[][] }>>;
}

function ringArea(ring: number[][]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s / 2);
}

const grainPhase = (copy: Copy) => copy.state((e) => e.grain.getState().phase);

test('Grain Spot: a click on a grain makes a polygon spot of its outline, named by auto spot mode; a click inside it selects it', async ({ launch, project }) => {
  const modelDir = await grainModelDir();
  const p = await project('E2E Grain Spot');
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false, env: { STRABO_GRAIN_MODEL_DIR: modelDir } });
  await openSmz(ana, p.smzPath, p.id);
  await viewMicrograph(ana, p.micrographId);

  await ana.caption('turns on auto spot mode and picks Grain Spot');
  await ana.page.getByRole('button', { name: 'Auto spot mode' }).click();
  await ana.page.getByRole('button', { name: 'Grain Spot tool' }).click();
  await expect.poll(() => grainPhase(ana), { timeout: 60_000 }).toBe('ready');
  await expect(ana.page.getByTestId('grain-spot-status')).toContainText('Click a grain to outline it');

  const grain = cleanGrain();
  const disc = Math.PI * grain.r * grain.r;

  // Hover: the grain under the mouse is outlined before any click
  await ana.caption('moves the mouse onto the grain: its outline shows before clicking');
  await hoverImage(ana, grain.x - grain.r * 0.2, grain.y);
  await hoverImage(ana, grain.x, grain.y);
  await expect.poll(async () => {
    const preview = await grainPreview(ana);
    return preview ? Math.round((ringArea(preview.ring) / disc) * 100) / 100 : 0;
  }, { timeout: 30_000 }).toBeGreaterThan(0.75);
  const preview = await grainPreview(ana);
  expect(preview?.offScreen).toBe(false);
  expect(ringArea(preview?.ring ?? []) / disc).toBeLessThan(1.25);
  expect(await ana.state(new Function('e', `
    for (const stage of (window.Konva && window.Konva.stages) || []) if (stage.findOne('.grain-preview')) return true;
    return false;`) as never), 'the preview is drawn on the drawing layer').toBe(true);
  expect((await spotsOf(ana, p.micrographId)).length, 'hovering makes no spot').toBe(2);

  await ana.caption(`clicks the grain at (${grain.x}, ${grain.y}), radius ${grain.r}`);
  await clickImage(ana, grain.x, grain.y);
  await expect.poll(async () => (await spotsOf(ana, p.micrographId)).length, { timeout: 30_000 }).toBe(3);
  const made = (await spotsOf(ana, p.micrographId)).find((s) => s.name === 'Spot 1');
  expect(made, 'auto spot mode names it Spot 1').toBeTruthy();
  if (!made) return;
  expect(made.type).toMatch(/^[Pp]olygon$/);
  expect(made.ring.length).toBeGreaterThanOrEqual(8);
  // The outline is the grain: area within 25 % of the disc, centered on it
  const area = ringArea(made.ring);
  console.log(`[19] grain r=${grain.r}: outline area ${Math.round(area)} vs disc ${Math.round(disc)} (${made.ring.length} points)`);
  expect(area / disc).toBeGreaterThan(0.75);
  expect(area / disc).toBeLessThan(1.25);
  const cx = made.ring.reduce((s, q) => s + q[0], 0) / made.ring.length;
  const cy = made.ring.reduce((s, q) => s + q[1], 0) / made.ring.length;
  expect(Math.hypot(cx - grain.x, cy - grain.y)).toBeLessThan(grain.r * 0.2);
  expect(await ana.state((e) => e.app.getState().activeSpotId)).toBe(made.id);
  expect(await ana.state((e) => e.app.getState().activeTool)).toBe('grain');

  // The new spot is under the mouse: no preview there, and none after the mouse leaves the viewer
  expect(await grainPreview(ana), 'the click puts the preview away').toBeNull();
  await hoverImage(ana, grain.x + grain.r * 0.1, grain.y);
  await ana.page.waitForTimeout(500);
  expect(await grainPreview(ana), 'no preview over a spot').toBeNull();
  await ana.page.mouse.move(2, 2);
  expect(await grainPreview(ana)).toBeNull();

  // A click inside the new spot selects it instead of making another
  await ana.state((e) => e.app.getState().selectActiveSpot(null));
  await ana.caption('clicks inside the spot it just made');
  await clickImage(ana, grain.x + grain.r * 0.3, grain.y);
  await expect.poll(() => ana.state((e) => e.app.getState().activeSpotId)).toBe(made.id);
  expect((await spotsOf(ana, p.micrographId)).length).toBe(3);

  expect(await ana.unansweredDialogs()).toEqual([]);
});

/** Area two circles share */
function lensArea(r1: number, r2: number, d: number): number {
  if (d >= r1 + r2) return 0;
  if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2;
  const a = r1 * r1 * Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1));
  const b = r2 * r2 * Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2));
  return a + b - 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));
}

/** Two overlapping grains, the later on top, nothing else drawn over either: refine clicks join and split them */
function grainPair() {
  const circles = fixtureCircles();
  for (let a = 0; a < circles.length; a++) {
    for (let b = a + 1; b < circles.length; b++) {
      const A = circles[a], B = circles[b];
      const d = Math.hypot(A.x - B.x, A.y - B.y);
      if (d >= A.r + B.r - 20 || d <= A.r + 10 || d <= B.r + 10) continue;
      const clear = (c: typeof A) => c.x - c.r > 10 && c.y - c.r > 10 && c.x + c.r < 1590 && c.y + c.r < 1190 && !insideFixtureSpot(c.x, c.y);
      if (!clear(A) || !clear(B)) continue;
      const covered = circles.some((c, k) => k !== b &&
        ((k > a && Math.hypot(c.x - A.x, c.y - A.y) < c.r + A.r + 4) || (k > b && Math.hypot(c.x - B.x, c.y - B.y) < c.r + B.r + 4)));
      if (covered) continue;
      const lens = lensArea(A.r, B.r, d);
      return { under: A, over: B, underVisible: Math.PI * A.r * A.r - lens, union: Math.PI * (A.r * A.r + B.r * B.r) - lens };
    }
  }
  throw new Error('no grain pair in the fixture');
}

test('Grain Spot refine clicks: Shift+click adds a grain to the last outline, Cmd/Ctrl+click cuts it out again; each is one undo step', async ({ launch, project }) => {
  const modelDir = await grainModelDir();
  const p = await project('E2E Grain Refine');
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false, env: { STRABO_GRAIN_MODEL_DIR: modelDir } });
  await openSmz(ana, p.smzPath, p.id);
  await viewMicrograph(ana, p.micrographId);
  await ana.page.getByRole('button', { name: 'Auto spot mode' }).click();
  await ana.page.getByRole('button', { name: 'Grain Spot tool' }).click();
  await expect.poll(() => grainPhase(ana), { timeout: 60_000 }).toBe('ready');
  await expect(ana.page.getByTestId('grain-spot-status')).toContainText('Shift+click adds to the last grain');

  const { under, over, underVisible, union } = grainPair();
  const spotArea = async () => {
    const made = (await spotsOf(ana, p.micrographId)).filter((s) => s.name === 'Spot 1');
    return made.length === 1 ? ringArea(made[0].ring) : 0;
  };
  const ratio = (value: number, expected: number) => Math.round((value / expected) * 100) / 100;

  // Zoom in on the pair, as a user would for grains this size (first off the
  // toolbar, whose tooltip would cover the pair)
  await ana.caption('zooms in on two overlapping grains');
  const corner = await pageAt(ana, 20, 1180);
  await ana.page.mouse.move(corner.x, corner.y, { steps: 3 });
  await expect(ana.page.locator('.MuiTooltip-popper')).toHaveCount(0);
  const middle = await pageAt(ana, (under.x + over.x) / 2, (under.y + over.y) / 2);
  await ana.page.mouse.move(middle.x, middle.y);
  for (let i = 0; i < 40 && (await ana.page.evaluate(() => window.__e2eView?.zoom ?? 1)) < 0.9; i++) {
    await ana.page.mouse.wheel(0, -100);
    await ana.page.waitForTimeout(60);
  }
  await expect.poll(() => grainPhase(ana), { timeout: 30_000 }).toBe('ready');

  await ana.caption(`clicks the lower grain at (${under.x}, ${under.y}): only its visible part`);
  await clickImage(ana, under.x, under.y);
  await expect.poll(spotArea, { timeout: 30_000 }).toBeGreaterThan(0);
  console.log(`[19] lower grain: ${Math.round(await spotArea())} vs ${Math.round(underVisible)} visible, union ${Math.round(union)}`);
  expect(ratio(await spotArea(), underVisible)).toBeGreaterThan(0.75);
  expect(ratio(await spotArea(), underVisible)).toBeLessThan(1.25);
  const spotId = (await spotsOf(ana, p.micrographId)).find((s) => s.name === 'Spot 1')?.id;

  // Holding Shift over the upper grain previews both together
  await ana.caption('holds Shift over the upper grain: the preview takes in both');
  await hoverImage(ana, over.x - 5, over.y);
  await ana.page.keyboard.down('Shift');
  await hoverImage(ana, over.x, over.y);
  await expect.poll(async () => {
    const preview = await grainPreview(ana);
    return preview ? ratio(ringArea(preview.ring), union) : 0;
  }, { timeout: 30_000 }).toBeGreaterThan(0.75);
  expect(ratio(ringArea((await grainPreview(ana))?.ring ?? []), union)).toBeLessThan(1.25);

  await ana.caption('Shift+clicks the upper grain: the same spot now covers both');
  await ana.page.mouse.down();
  await ana.page.mouse.up();
  await ana.page.keyboard.up('Shift');
  await expect.poll(async () => ratio(await spotArea(), union), { timeout: 30_000 }).toBeGreaterThan(0.75);
  console.log(`[19] after Shift+click: ${Math.round(await spotArea())} vs union ${Math.round(union)}`);
  expect(ratio(await spotArea(), union)).toBeLessThan(1.25);
  const spots = await spotsOf(ana, p.micrographId);
  expect(spots.length, 'no new spot').toBe(3);
  expect(spots.find((s) => s.name === 'Spot 1')?.id).toBe(spotId);

  await ana.caption('Cmd/Ctrl+clicks the upper grain: cut back to the lower one');
  await ana.page.keyboard.down('ControlOrMeta');
  await clickImage(ana, over.x, over.y);
  await ana.page.keyboard.up('ControlOrMeta');
  await expect.poll(async () => ratio(await spotArea(), underVisible), { timeout: 30_000 }).toBeLessThan(1.25);
  console.log(`[19] after Cmd/Ctrl+click: ${Math.round(await spotArea())} vs ${Math.round(underVisible)} visible`);
  expect(ratio(await spotArea(), underVisible)).toBeGreaterThan(0.75);
  expect((await spotsOf(ana, p.micrographId)).length).toBe(3);

  // Each change is its own undo step; after an undo the outline can still be refined
  await ana.caption('Edit > Undo: back to both grains, then to the lower one');
  await ana.menu('Edit', 'Undo');
  await expect.poll(async () => ratio(await spotArea(), union)).toBeGreaterThan(0.75);
  await ana.menu('Edit', 'Undo');
  await expect.poll(async () => ratio(await spotArea(), underVisible)).toBeLessThan(1.25);
  await ana.caption('Shift+click after the undo still refines the same spot');
  await ana.page.keyboard.down('Shift');
  await clickImage(ana, over.x, over.y);
  await ana.page.keyboard.up('Shift');
  await expect.poll(async () => ratio(await spotArea(), union), { timeout: 30_000 }).toBeGreaterThan(0.75);
  expect((await spotsOf(ana, p.micrographId)).length).toBe(3);

  expect(await ana.unansweredDialogs()).toEqual([]);
});

test('Grain Spot without the model: it offers the download; Not Now puts the tool down', async ({ launch, project }) => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'grain-model-empty-'));
  const p = await project('E2E Grain Spot No Model');
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false, env: { STRABO_GRAIN_MODEL_DIR: empty } });
  await openSmz(ana, p.smzPath, p.id);
  await viewMicrograph(ana, p.micrographId);
  await ana.page.getByRole('button', { name: 'Grain Spot tool' }).click();
  const dialog = ana.page.getByRole('dialog', { name: 'Download the Grain Model?' });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog).toContainText('one-time download');
  await dialog.getByRole('button', { name: 'Not Now' }).click();
  await expect(dialog).toBeHidden();
  expect(await ana.state((e) => e.app.getState().activeTool)).toBe(null);
  fs.rmSync(empty, { recursive: true, force: true });
});
