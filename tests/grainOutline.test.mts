/**
 * Grain Spot outlines (src/utils/grainOutline.ts): logits sampled per view
 * pixel, the piece under the click, holes filled, a marching-squares ring
 * simplified, edge contact, and which of the three candidates is used.
 *
 *   npm run test:grain-outline
 */

import {
  maskFromLogits, componentAt, fillHoles, maskArea, touchesEdge, traceOutline, ringArea, simplifyRing, outlineFromLogits,
  type MaskGrid, type Point,
} from '../src/utils/grainOutline.ts';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}
function near(label: string, got: number, want: number, tol: number) {
  check(`${label} ~ ${want}`, Math.abs(got - want) <= tol, got);
}

/** A grid from rows of '#' (inside) and '.' */
function grid(rows: string[]): MaskGrid {
  const height = rows.length;
  const width = rows[0].length;
  const data = new Uint8Array(width * height);
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') data[y * width + x] = 1; }));
  return { data, width, height };
}

/** Logits for a disc (positive inside), lw x lh over the square model input */
function discLogits(lw: number, lh: number, cx: number, cy: number, r: number): Float32Array {
  const out = new Float32Array(lw * lh);
  for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) out[y * lw + x] = r - Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
  return out;
}

// --- maskFromLogits: a disc in a 64x64 logit grid, sampled onto a 256x128 view (stretched)
{
  const logits = discLogits(64, 64, 32, 32, 10);
  const m = maskFromLogits(logits, 0, 64, 64, 256, 128);
  check('mask: view size', m.width === 256 && m.height === 128);
  check('mask: center inside', m.data[64 * 256 + 128] === 1);
  check('mask: corner outside', m.data[0] === 0);
  // The disc is 20/64 of the input wide, so 80 view px wide and 40 high: an ellipse of area pi*40*20
  near('mask: area of the stretched disc', maskArea(m), Math.PI * 40 * 20, 120);
  const offset = new Float32Array(64 * 64 * 2);
  offset.set(discLogits(64, 64, 10, 10, 4), 64 * 64);
  const second = maskFromLogits(offset, 64 * 64, 64, 64, 64, 64);
  check('mask: offset picks the second candidate', second.data[10 * 64 + 10] === 1 && second.data[32 * 64 + 32] === 0);
}

// --- componentAt: only the piece under the click, 4-connected
{
  const m = grid([
    '##....###',
    '##....###',
    '..#.....#',
    '...#.....',
  ]);
  const left = componentAt(m, 0, 0);
  check('component: the clicked piece', left !== null && maskArea(left) === 4, left && maskArea(left));
  const right = componentAt(m, 7, 0);
  check('component: the other piece, with its 4-connected tail', right !== null && maskArea(right) === 7, right && maskArea(right));
  const diagonal = componentAt(m, 2, 2);
  check('component: a pixel touching only at a corner is separate', diagonal !== null && maskArea(diagonal) === 1);
  check('component: a click just outside finds the nearest piece', componentAt(m, 4, 0, 2) !== null);
  check('component: nothing near', componentAt(m, 5, 3, 1) === null);
}

// --- fillHoles: a ring becomes a solid square; a bay open to the border stays open
{
  const ring = grid([
    '.....',
    '.###.',
    '.#.#.',
    '.###.',
    '.....',
  ]);
  check('holes: ring filled', maskArea(fillHoles(ring)) === 9);
  const bay = grid([
    '#.#',
    '#.#',
    '###',
  ]);
  check('holes: an open bay is not a hole', maskArea(fillHoles(bay)) === 7);
}

// --- touchesEdge
check('edge: inside pixel on the border', touchesEdge(grid(['#..', '...', '...'])));
check('edge: clear of the border', !touchesEdge(grid(['...', '.#.', '...'])));

// --- traceOutline: a 4x4 square of pixel centers gives a ring around them
{
  const sq = grid([
    '......',
    '.####.',
    '.####.',
    '.####.',
    '.####.',
    '......',
  ]);
  const ring = traceOutline(sq);
  check('trace: a ring', ring.length >= 8, ring.length);
  // Corners cut at 45 degrees: area = 4x4 pixels minus 4 half-triangles of 0.5*0.5*0.5... ring through edge midpoints
  // The ring passes through the midpoints between inside and outside pixel centers: a 4x4 box with cut corners
  near('trace: area of the 4x4 square', Math.abs(ringArea(ring)), 16 - 4 * 0.125, 1e-9);
  const xs = ring.map((p) => p[0]);
  near('trace: left edge at the pixel boundary', Math.min(...xs), 1, 1e-9);
  near('trace: right edge at the pixel boundary', Math.max(...xs), 5, 1e-9);
  check('trace: empty mask', traceOutline(grid(['...', '...'])).length === 0);
  // Two pieces: the larger ring wins
  const two = grid([
    '#....',
    '..###',
    '..###',
  ]);
  near('trace: the larger piece', Math.abs(ringArea(traceOutline(two))), 6 - 4 * 0.125, 1e-9);
}

// --- simplifyRing: a dense circle keeps its shape with far fewer points
{
  const circle: Point[] = [];
  for (let i = 0; i < 400; i++) circle.push([100 + 50 * Math.cos((i / 400) * 2 * Math.PI), 100 + 50 * Math.sin((i / 400) * 2 * Math.PI)]);
  const s = simplifyRing(circle, 0.8);
  check('simplify: fewer points', s.length < 60 && s.length >= 8, s.length);
  near('simplify: area kept', Math.abs(ringArea(s)) / Math.abs(ringArea(circle)), 1, 0.02);
  check('simplify: a triangle stays', simplifyRing([[0, 0], [10, 0], [0, 10]], 1).length === 3);
}

// --- outlineFromLogits: three candidates (grain, grain + neighbour, everything)
{
  const lw = 64, lh = 64, n = lw * lh;
  const logits = new Float32Array(3 * n);
  logits.set(discLogits(lw, lh, 32, 32, 6), 0); // the grain
  logits.set(discLogits(lw, lh, 36, 32, 12), n); // grain + neighbour
  logits.fill(1, 2 * n, 3 * n); // the whole view
  const click: Point = [128, 128]; // view 256x256, the grain's center
  const both = outlineFromLogits(logits, 3, lw, lh, [0.9, 0.92, 0.5], 256, 256, click);
  check('outline: found', both !== null);
  check('outline: the smallest of the equally good candidates (the grain)', both?.maskIndex === 0, both?.maskIndex);
  near('outline: grain area (r = 24 view px)', both?.area ?? 0, Math.PI * 24 * 24, 60);
  check('outline: grain clear of the edge', both?.touchesEdge === false);
  // Area from the ring matches the pixel count
  near('outline: ring area close to pixel area', Math.abs(ringArea(both?.points ?? [])), both?.area ?? 0, (both?.area ?? 0) * 0.03);
  // The grain candidate scored much lower: the larger one is used
  const larger = outlineFromLogits(logits, 3, lw, lh, [0.6, 0.92, 0.5], 256, 256, click);
  check('outline: a clearly worse candidate is skipped', larger?.maskIndex === 1, larger?.maskIndex);
  // Only the whole view is left: it touches the edge
  const all = outlineFromLogits(logits, 3, lw, lh, [0.1, 0.1, 0.9], 256, 256, click);
  check('outline: the whole view touches the edge', all?.maskIndex === 2 && all.touchesEdge === true);
  // A click away from every candidate (the whole-view one dropped by its score)
  const away = outlineFromLogits(logits, 3, lw, lh, [0.9, 0.9, 0.1], 256, 256, [10, 10]);
  check('outline: nothing under the click', away === null);
  // A speck smaller than minArea is not a grain
  const speck = new Float32Array(n);
  speck.set(discLogits(lw, lh, 32, 32, 0.6));
  check('outline: a speck is ignored', outlineFromLogits(speck, 1, lw, lh, [0.9], 256, 256, click) === null);
}

console.log(failures === 0 ? `\nALL PASSED (${passes} checks)` : `\n${failures} FAILED, ${passes} passed`);
if (failures > 0) process.exit(1);
