/**
 * A synthetic thin section seen three ways, for placing BSE images on a
 * PPL/XPL pair (Caroline Woods, 2026-11-19: "some of the reference points in
 * the BSEs are very hard to see in plane polar").
 *
 * One procedural rock (curved Voronoi grains in two domains) is drawn as:
 * - PPL: quartz and feldspars almost the same pale color, faint relief at
 *   boundaries, cloudy K-feldspar; biotite brown, opaques black. In the
 *   quartzofeldspathic domain there is very little to see.
 * - XPL: every grain its own first-order gray (orientation), twinned
 *   plagioclase, biotite in bright colors, opaques and epoxy-filled pores
 *   black. Drawn at a different pixel size than the PPL (same aspect), as a
 *   pair from a camera at another setting can be.
 * - BSE: brightness by phase (quartz dark, K-feldspar bright with albite
 *   lamellae, zoned plagioclase, opaques white, pores black), finer than the
 *   parent, turned, with SEM noise and sometimes a data bar.
 *
 * World units = PPL pixels. Every crop records its true placement
 * (BSE px -> PPL px). Deterministic: the same seed gives the same images.
 *
 * Measured 2026-11-19: Place automatically (placementMatch.ts) places none of
 * the BSE images on the PPL or the XPL (also not on edge maps): BSE brightness
 * is atomic number, unrelated to optical color. Same-area XPL close-ups place
 * within 0.2 % on the XPL and never on the PPL. Matching BSE to optical
 * images automatically needs another method; this set is for placing by hand
 * with the PPL/XPL switch, and for any later attempt at that.
 *
 *   npm run make:pair-test-set [-- <folder>]   (default ~/Desktop/PPL_XPL_Test)
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

export type Affine = [number, number, number, number, number, number];

export const WORLD_W = 4000;
export const WORLD_H = 3000;
/** The XPL is stored at this fraction of the PPL's size */
export const XPL_FACTOR = 0.9;
/** PPL pixels per centimeter (1 px = 1 um) */
export const PPL_SCALE = 10000;
const CELL = 45;

// ------------------------------------------------------------ noise

function hash(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function noise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * 2 - 1;
}

function fbm(x: number, y: number, seed: number): number {
  return noise(x, y, seed) * 0.65 + noise(x * 2.1, y * 2.1, seed + 7) * 0.35;
}

// ------------------------------------------------------------ the rock

const QZ = 0;
const KFS = 1;
const PL = 2;
const BT = 3;
const OPQ = 4;
export const PHASE_NAMES = ['quartz', 'K-feldspar', 'plagioclase', 'biotite', 'opaque'];

interface Rock {
  seed: number;
  gw: number;
  gh: number;
  sx: Float64Array;
  sy: Float64Array;
  phase: Uint8Array;
  theta: Float64Array;
  tilt: Float64Array;
  cloud: Float64Array;
  twin: Float64Array;
}

/** Mica-bearing bands across the section; the rest is quartzofeldspathic */
function micaBand(x: number, y: number, seed: number): boolean {
  const v = Math.sin(((y * 0.95 + x * 0.3) / WORLD_H) * Math.PI * 2.2 + fbm(x / 600, y / 600, seed + 3) * 1.2);
  return v > 0.35;
}

export function makeRock(seed: number): Rock {
  const gw = Math.ceil(WORLD_W / CELL) + 4;
  const gh = Math.ceil(WORLD_H / CELL) + 4;
  const n = gw * gh;
  const rock: Rock = {
    seed, gw, gh,
    sx: new Float64Array(n), sy: new Float64Array(n), phase: new Uint8Array(n), theta: new Float64Array(n),
    tilt: new Float64Array(n), cloud: new Float64Array(n), twin: new Float64Array(n),
  };
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const k = j * gw + i;
      const cx = (i - 2 + 0.15 + 0.7 * hash(i, j, seed + 11)) * CELL;
      const cy = (j - 2 + 0.15 + 0.7 * hash(i, j, seed + 12)) * CELL;
      rock.sx[k] = cx;
      rock.sy[k] = cy;
      const r = hash(i, j, seed + 13);
      rock.phase[k] = micaBand(cx, cy, seed)
        ? (r < 0.4 ? QZ : r < 0.6 ? KFS : r < 0.8 ? PL : r < 0.95 ? BT : OPQ)
        : (r < 0.55 ? QZ : r < 0.85 ? KFS : PL);
      rock.theta[k] = hash(i, j, seed + 14) * Math.PI;
      rock.tilt[k] = 0.25 + 0.75 * Math.sqrt(hash(i, j, seed + 15));
      rock.cloud[k] = hash(i, j, seed + 16);
      rock.twin[k] = 2.5 + hash(i, j, seed + 17) * 4;
    }
  }
  return rock;
}

interface Hit {
  k: number;
  /** distance to the boundary with the nearest other grain (world px) */
  edge: number;
  /** distance from the grain's seed, 0..1 of a cell */
  core: number;
}

function grainAt(rock: Rock, x: number, y: number): Hit {
  const wx = x + 11 * fbm(x / 38, y / 38, rock.seed + 1);
  const wy = y + 11 * fbm(x / 38, y / 38, rock.seed + 2);
  const ci = Math.floor(wx / CELL) + 2;
  const cj = Math.floor(wy / CELL) + 2;
  let best = -1;
  let d1 = Infinity;
  let d2 = Infinity;
  let bx = 0;
  let by = 0;
  for (let j = cj - 1; j <= cj + 1; j++) {
    if (j < 0 || j >= rock.gh) continue;
    for (let i = ci - 1; i <= ci + 1; i++) {
      if (i < 0 || i >= rock.gw) continue;
      const k = j * rock.gw + i;
      const dx = wx - rock.sx[k];
      const dy = wy - rock.sy[k];
      const d = dx * dx + dy * dy;
      if (d < d1) {
        d2 = d1;
        d1 = d;
        best = k;
        bx = rock.sx[k];
        by = rock.sy[k];
      } else if (d < d2) d2 = d;
    }
  }
  const a = Math.sqrt(d1);
  const b = Math.sqrt(d2);
  // Distance to the bisector between the two nearest seeds (approximately)
  const sep = Math.max(1e-6, Math.hypot(wx - bx, wy - by) + b);
  return { k: best, edge: (b * b - a * a) / (2 * sep), core: Math.min(1, a / (CELL * 0.7)) };
}

/** Epoxy-filled pores (plucked grains): radius at (x, y) or 0 */
function inPore(rock: Rock, x: number, y: number): boolean {
  const P = 34;
  const ci = Math.floor(x / P);
  const cj = Math.floor(y / P);
  for (let j = cj - 1; j <= cj + 1; j++) {
    for (let i = ci - 1; i <= ci + 1; i++) {
      if (hash(i, j, rock.seed + 21) > 0.3) continue;
      const px = (i + hash(i, j, rock.seed + 22)) * P;
      const py = (j + hash(i, j, rock.seed + 23)) * P;
      const r = 1.6 + 4.5 * hash(i, j, rock.seed + 24);
      const ang = Math.atan2(y - py, x - px);
      const rr = r * (1 + 0.35 * noise(Math.cos(ang) * 1.7 + i, Math.sin(ang) * 1.7 + j, rock.seed + 25));
      if ((x - px) ** 2 + (y - py) ** 2 < rr * rr) return true;
    }
  }
  return false;
}

export type View = 'ppl' | 'xpl' | 'bse';

/** One pixel at world (x, y); `px` = world px per output px (line widths) */
function shade(rock: Rock, view: View, x: number, y: number, px: number): [number, number, number] {
  const h = grainAt(rock, x, y);
  const k = h.k;
  const ph = rock.phase[k];
  const th = rock.theta[k];
  const pore = inPore(rock, x, y);
  const edgeW = Math.max(0.45, px * 0.6);
  const onEdge = h.edge < edgeW ? 1 - h.edge / edgeW : 0;
  // Twin lamellae in plagioclase: bands across the grain, along theta
  const lam = ph === PL ? Math.floor((x * Math.cos(th) + y * Math.sin(th)) / rock.twin[k]) & 1 : 0;

  if (view === 'ppl') {
    let r = 232;
    let g = 230;
    let b = 223;
    if (ph === KFS) {
      const c = 5 + 7 * rock.cloud[k] * (0.6 + 0.4 * fbm(x / 6, y / 6, rock.seed + 31));
      r -= c; g -= c * 1.2; b -= c * 1.6;
    } else if (ph === PL) {
      const c = 2.5 * Math.max(0, fbm(x / 4, y / 4, rock.seed + 32));
      r -= c; g -= c; b -= c;
    } else if (ph === BT) {
      const p = Math.cos(th) ** 2;
      r = 205 - 100 * p; g = 172 - 105 * p; b = 115 - 85 * p;
    } else if (ph === OPQ) {
      r = 24; g = 22; b = 20;
    }
    if (pore) { r = 236; g = 235; b = 230; }
    const relief = ph === BT || ph === OPQ ? 25 : 9;
    return [r - relief * onEdge, g - relief * onEdge, b - relief * onEdge];
  }

  if (view === 'xpl') {
    if (pore || ph === OPQ) return [8, 8, 9];
    if (ph === BT) {
      const ext = Math.sin(2 * th) ** 2;
      const hue = rock.cloud[k] * 6;
      const c = (o: number) => 0.5 + 0.5 * Math.cos(hue + o);
      return [40 + 200 * ext * c(0), 40 + 190 * ext * c(2.1), 40 + 200 * ext * c(4.2)];
    }
    const t = lam ? th + 0.65 : th;
    const max = ph === QZ ? 228 : 200;
    const v = 14 + max * rock.tilt[k] * Math.sin(2 * t) ** 2;
    const undulose = ph === QZ ? 10 * fbm(x / 20, y / 20, rock.seed + 33) : 0;
    const g = v + undulose;
    return [g, g, g > 190 ? g * 0.94 : g];
  }

  // BSE: mean atomic number
  let v: number;
  if (pore) v = 8;
  else if (ph === QZ) v = 62;
  else if (ph === KFS) {
    const along = x * Math.cos(th + 1.2) + y * Math.sin(th + 1.2);
    const perthite = Math.sin(along / 1.3) > 0.55 && fbm(x / 9, y / 9, rock.seed + 34) > -0.1 ? -38 : 0;
    v = 178 + perthite;
  } else if (ph === PL) v = 112 + 22 * (1 - h.core);
  else if (ph === BT) v = 138 + (Math.sin((x * Math.cos(th) + y * Math.sin(th)) / 0.9) > 0.8 ? -30 : 0);
  else v = 246;
  v -= 30 * onEdge;
  return [v, v, v];
}

/** Draws view through m (output px -> world px) into a w x h RGB (or gray) buffer */
export function render(rock: Rock, view: View, m: Affine, w: number, h: number): Buffer {
  const channels = view === 'bse' ? 1 : 3;
  const out = Buffer.alloc(w * h * channels);
  const px = Math.hypot(m[0], m[3]);
  let s = rock.seed * 7919 + w;
  const rand = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  const sigma = view === 'bse' ? 9 : 2.5;
  for (let v = 0; v < h; v++) {
    for (let u = 0; u < w; u++) {
      const x = m[0] * (u + 0.5) + m[1] * (v + 0.5) + m[2];
      const y = m[3] * (u + 0.5) + m[4] * (v + 0.5) + m[5];
      const c = shade(rock, view, x, y, px);
      // Uneven lamp / detector: brighter in the middle
      const dx = u / w - 0.5;
      const dy = v / h - 0.5;
      const lamp = 1 - 0.12 * (dx * dx + dy * dy) * 2;
      const n = (rand() + rand() + rand() - 1.5) * sigma * 2;
      const o = (v * w + u) * channels;
      for (let ch = 0; ch < channels; ch++) out[o + ch] = Math.max(0, Math.min(255, Math.round(c[ch] * lamp + n)));
    }
  }
  return out;
}

/** Share of a footprint's samples on biotite or opaque grains */
export function micaShare(rock: Rock, m: Affine, w: number, h: number): number {
  let hits = 0;
  let total = 0;
  for (let v = 0; v <= h; v += h / 24) {
    for (let u = 0; u <= w; u += w / 24) {
      const x = m[0] * u + m[1] * v + m[2];
      const y = m[3] * u + m[4] * v + m[5];
      const ph = rock.phase[grainAt(rock, x, y).k];
      if (ph === BT || ph === OPQ) hits++;
      total++;
    }
  }
  return hits / total;
}

// ------------------------------------------------------------ the crops

/** detail px -> world px: turned by deg, `mag` detail px per world px, centered at (cx, cy) */
export function cropMatrix(cx: number, cy: number, deg: number, mag: number, w: number, h: number): Affine {
  const r = (deg * Math.PI) / 180;
  const a = Math.cos(r) / mag;
  const b = -Math.sin(r) / mag;
  const c = Math.sin(r) / mag;
  const d = Math.cos(r) / mag;
  return [a, b, cx - (a * w) / 2 - (b * h) / 2, c, d, cy - (c * w) / 2 - (d * h) / 2];
}

export interface CropSpec {
  file: string;
  /** what the crop shows: 'mica' has biotite/opaques (easy in PPL), 'qf' only quartz + feldspars */
  region: 'mica' | 'qf' | 'unrelated';
  deg: number;
  mag: number;
  dataBar?: boolean;
  note: string;
}

export const CROPS: CropSpec[] = [
  { file: 'BSE_01_mica.tif', region: 'mica', deg: 0, mag: 4, note: 'biotite and opaques: visible in PPL too' },
  { file: 'BSE_02_qf.tif', region: 'qf', deg: 0, mag: 4, note: 'quartz + feldspar only: boundaries show in XPL, hardly in PPL' },
  { file: 'BSE_03_qf_turned.tif', region: 'qf', deg: 35, mag: 4, note: 'quartz + feldspar, turned 35 degrees' },
  { file: 'BSE_04_qf_small.tif', region: 'qf', deg: -12, mag: 6, note: 'quartz + feldspar, small area (6x finer)' },
  { file: 'BSE_05_mica_turned.tif', region: 'mica', deg: -90, mag: 3, note: 'biotite and opaques, turned -90 degrees' },
  { file: 'BSE_06_qf_wide.tif', region: 'qf', deg: 170, mag: 2.5, note: 'quartz + feldspar, wider area, turned 170 degrees' },
  { file: 'BSE_07_qf_databar.tif', region: 'qf', deg: 5, mag: 4, dataBar: true, note: 'quartz + feldspar with an SEM data bar' },
  { file: 'BSE_08_unrelated.tif', region: 'unrelated', deg: 20, mag: 4, note: 'another rock: must not be placed' },
];

export const BSE_W = 1280;
export const BSE_H = 960;

export interface CropTruth extends CropSpec {
  /** BSE px -> PPL px; null for the unrelated image */
  truth: Affine | null;
  micaShare: number;
}

export interface PairTestSet {
  dir: string;
  ppl: string;
  xpl: string;
  pplSize: { width: number; height: number };
  xplSize: { width: number; height: number };
  crops: Array<CropTruth & { path: string }>;
}

/** A spot in the world for each crop: mica crops in mica bands, qf crops well away from any */
function chooseCenters(rock: Rock): Map<string, [number, number]> {
  const centers = new Map<string, [number, number]>();
  const taken: Array<[number, number]> = [];
  for (const crop of CROPS) {
    if (crop.region === 'unrelated') {
      centers.set(crop.file, [WORLD_W / 2, WORLD_H / 2]);
      continue;
    }
    let pick: [number, number] | null = null;
    let bestScore = -Infinity;
    for (let t = 0; t < 400; t++) {
      const cx = 400 + hash(t, crop.file.length, rock.seed + 41) * (WORLD_W - 800);
      const cy = 400 + hash(t, crop.file.charCodeAt(4), rock.seed + 42) * (WORLD_H - 800);
      if (taken.some(([x, y]) => Math.hypot(x - cx, y - cy) < 500)) continue;
      // A wider look than the crop, so a qf crop is not right next to a mica band either
      const m = cropMatrix(cx, cy, crop.deg, crop.mag / 1.8, BSE_W, BSE_H);
      const share = micaShare(rock, m, BSE_W, BSE_H);
      const score = crop.region === 'qf' ? -share : share > 0.08 && share < 0.4 ? 1 - Math.abs(share - 0.2) : -1;
      if (score > bestScore) {
        bestScore = score;
        pick = [cx, cy];
      }
    }
    if (!pick) throw new Error(`no place for ${crop.file}`);
    taken.push(pick);
    centers.set(crop.file, pick);
  }
  return centers;
}

function dataBarSvg(w: number, h: number): Buffer {
  const y = h - 64;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<rect x="0" y="${y}" width="${w}" height="64" fill="black"/>` +
    `<text x="24" y="${y + 40}" font-family="Helvetica" font-size="26" fill="white">COMPO  15.0kV  WD 11mm  x400  50 um</text>` +
    `<rect x="${w - 300}" y="${y + 26}" width="200" height="10" fill="white"/></svg>`,
  );
}

/** Writes the PPL, XPL, BSE images and truth.json into dir */
export async function writePairTestSet(dir: string, seed = 2026): Promise<PairTestSet> {
  fs.mkdirSync(dir, { recursive: true });
  const rock = makeRock(seed);
  const other = makeRock(seed + 1000);

  const ppl = path.join(dir, 'Section_A_PPL.jpg');
  const xpl = path.join(dir, 'Section_A_XPL.jpg');
  const xw = Math.round(WORLD_W * XPL_FACTOR);
  const xh = Math.round(WORLD_H * XPL_FACTOR);
  // Optics soften both a little (slight blur), saved as camera JPEGs
  await sharp(render(rock, 'ppl', [1, 0, 0, 0, 1, 0], WORLD_W, WORLD_H), { raw: { width: WORLD_W, height: WORLD_H, channels: 3 } })
    .blur(0.7).jpeg({ quality: 92 }).toFile(ppl);
  const xs = 1 / XPL_FACTOR;
  await sharp(render(rock, 'xpl', [xs, 0, 0, 0, xs, 0], xw, xh), { raw: { width: xw, height: xh, channels: 3 } })
    .blur(0.7).jpeg({ quality: 92 }).toFile(xpl);

  const centers = chooseCenters(rock);
  const bseDir = path.join(dir, 'BSE');
  fs.mkdirSync(bseDir, { recursive: true });
  const crops: PairTestSet['crops'] = [];
  for (const crop of CROPS) {
    const [cx, cy] = centers.get(crop.file) ?? [0, 0];
    const m = cropMatrix(cx, cy, crop.deg, crop.mag, BSE_W, BSE_H);
    const source = crop.region === 'unrelated' ? other : rock;
    let img = sharp(render(source, 'bse', m, BSE_W, BSE_H), { raw: { width: BSE_W, height: BSE_H, channels: 1 } }).blur(0.6);
    if (crop.dataBar) {
      const flat = await img.png().toBuffer();
      img = sharp(flat).composite([{ input: dataBarSvg(BSE_W, BSE_H) }]).greyscale();
    }
    const file = path.join(bseDir, crop.file);
    await img.tiff({ compression: 'lzw' }).toFile(file);
    crops.push({
      ...crop, path: file,
      truth: crop.region === 'unrelated' ? null : m,
      micaShare: micaShare(source, m, BSE_W, BSE_H),
    });
  }

  const set: PairTestSet = {
    dir, ppl, xpl, pplSize: { width: WORLD_W, height: WORLD_H }, xplSize: { width: xw, height: xh }, crops,
  };
  fs.writeFileSync(path.join(dir, 'truth.json'), JSON.stringify({
    about: 'Synthetic PPL/XPL pair + BSE images (tests/siblingPairFixtures.mts). truth: BSE pixel -> PPL pixel, [a, b, tx, c, d, ty]: x\' = a x + b y + tx, y\' = c x + d y + ty.',
    seed, pplScalePixelsPerCentimeter: PPL_SCALE,
    ppl: path.basename(ppl), xpl: path.basename(xpl), pplSize: set.pplSize, xplSize: set.xplSize,
    crops: crops.map(({ path: p, ...c }) => ({ ...c, file: `BSE/${path.basename(p)}` })),
  }, null, 2));
  return set;
}

// CLI
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const dir = process.argv[2] || path.join(process.env.HOME ?? '.', 'Desktop', 'PPL_XPL_Test');
  const t0 = Date.now();
  const set = await writePairTestSet(dir);
  console.log(`Wrote ${set.ppl}, ${set.xpl} and ${set.crops.length} BSE images in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  for (const c of set.crops) console.log(`  ${c.file.padEnd(24)} ${c.region.padEnd(9)} mica/opaque share ${(c.micaShare * 100).toFixed(1)} %`);
}
