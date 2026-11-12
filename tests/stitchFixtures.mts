/**
 * Test images for the image stitcher (tests/stitch.test.mts): a made-up "thin section" and
 * overlapping tiles cut from it at known positions. Everything is seeded, so every run is the same.
 *
 * The scene is a mosaic of grains (cells around jittered seed points), each with its own gray
 * level, some with stripes like twinning, dark grain boundaries and a fine texture.
 */

import type { GrayImage } from '../src/services/autoPlace/placementMatch.ts';
import type { AffineMatrix } from '../src/utils/affineTransform.ts';

/** Seeded random numbers in [0, 1) */
export function randomOf(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function makeScene(width: number, height: number, seed: number, cell = 64): GrayImage {
  const rand = randomOf(seed);
  const gw = Math.ceil(width / cell) + 2;
  const gh = Math.ceil(height / cell) + 2;
  const n = gw * gh;
  const sx = new Float32Array(n);
  const sy = new Float32Array(n);
  const level = new Float32Array(n);
  const stripeX = new Float32Array(n);
  const stripeY = new Float32Array(n);
  const stripeAmp = new Float32Array(n);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const i = gy * gw + gx;
      sx[i] = (gx - 1 + rand()) * cell;
      sy[i] = (gy - 1 + rand()) * cell;
      level[i] = 45 + rand() * 165;
      const angle = rand() * Math.PI;
      const period = 6 + rand() * 14;
      stripeX[i] = (Math.cos(angle) * 2 * Math.PI) / period;
      stripeY[i] = (Math.sin(angle) * 2 * Math.PI) / period;
      stripeAmp[i] = rand() < 0.4 ? 8 + rand() * 22 : 0;
    }
  }
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const gy = Math.floor(y / cell) + 1;
    for (let x = 0; x < width; x++) {
      const gx = Math.floor(x / cell) + 1;
      let best = -1;
      let d1 = Infinity;
      let d2 = Infinity;
      for (let cy = gy - 1; cy <= gy + 1; cy++) {
        for (let cx = gx - 1; cx <= gx + 1; cx++) {
          const i = cy * gw + cx;
          const d = (sx[i] - x) * (sx[i] - x) + (sy[i] - y) * (sy[i] - y);
          if (d < d1) {
            d2 = d1;
            d1 = d;
            best = i;
          } else if (d < d2) d2 = d;
        }
      }
      let v = level[best];
      if (stripeAmp[best]) v += stripeAmp[best] * Math.sin(x * stripeX[best] + y * stripeY[best]);
      // Grain boundary: where the two nearest seeds are about equally far
      if (Math.sqrt(d2) - Math.sqrt(d1) < 2.5) v *= 0.45;
      // Fine texture, fixed to the rock
      let h = (x * 374761393 + y * 668265263 + seed * 69069) | 0;
      h = (h ^ (h >>> 13)) * 1274126177;
      v += (((h ^ (h >>> 16)) & 255) / 255 - 0.5) * 10;
      data[y * width + x] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  return { data, width, height };
}

export interface CutOptions {
  cols: number;
  rows: number;
  tileWidth: number;
  tileHeight: number;
  /** Share of the tile side neighbors share */
  overlap: number;
  /** Random shift, share of the tile side */
  jitter?: number;
  /** Random turn, degrees (+-) */
  turn?: number;
  /** Random magnification difference, share (+-) */
  zoom?: number;
  /** Corner darkening, share */
  vignette?: number;
  /** Brightness difference between tiles, share (+-) */
  gain?: number;
  /** Sensor noise, gray levels (+-) */
  noise?: number;
  seed: number;
  /** Grid cells left out (index = row * cols + col) */
  drop?: number[];
  /** Burn the same scale bar into every tile (pure black and white), or 'gray': a gray logo in its place */
  bar?: boolean | 'gray';
  /** Name prefix */
  name?: string;
}

export interface CutTile {
  id: string;
  image: GrayImage;
  /** Tile pixel -> scene pixel */
  truth: AffineMatrix;
  cell: number;
}

function sample(scene: GrayImage, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  if (x0 < 0 || y0 < 0 || x0 >= scene.width - 1 || y0 >= scene.height - 1) return 0;
  const fx = x - x0;
  const fy = y - y0;
  const i = y0 * scene.width + x0;
  const d = scene.data;
  return (d[i] * (1 - fx) + d[i + 1] * fx) * (1 - fy) + (d[i + scene.width] * (1 - fx) + d[i + scene.width + 1] * fx) * fy;
}

/** One tile: tile pixel (u, v) shows the scene at truth(u, v) */
export function cutTile(scene: GrayImage, truth: AffineMatrix, width: number, height: number, look: { vignette: number; gain: number; noise: number; bar: boolean | 'gray' }, rand: () => number): GrayImage {
  const data = new Uint8Array(width * height);
  const [a, b, tx, c, d, ty] = truth;
  const hx = width / 2;
  const hy = height / 2;
  const maxR2 = hx * hx + hy * hy;
  for (let v = 0; v < height; v++) {
    for (let u = 0; u < width; u++) {
      let value = sample(scene, a * u + b * v + tx, c * u + d * v + ty);
      value *= look.gain * (1 - look.vignette * (((u - hx) * (u - hx) + (v - hy) * (v - hy)) / maxR2));
      if (look.noise) value += (rand() - 0.5) * 2 * look.noise;
      data[v * width + u] = value < 0 ? 0 : value > 255 ? 255 : value;
    }
  }
  if (look.bar === 'gray') {
    // A logo in grays (not pure black and white, so nothing marks it as graphics), the same in every tile
    const logo = randomOf(4242);
    const bx = width - 660;
    const by = height - 330;
    for (let v = by; v < by + 280; v++) for (let u = bx; u < bx + 600; u++) data[v * width + u] = 70;
    for (let k = 0; k < 90; k++) {
      const rx = bx + 10 + Math.floor(logo() * 540);
      const ry = by + 10 + Math.floor(logo() * 220);
      const rw = 12 + Math.floor(logo() * 40);
      const rh = 12 + Math.floor(logo() * 40);
      const g = 40 + Math.floor(logo() * 180);
      for (let v = ry; v < ry + rh; v++) for (let u = rx; u < rx + rw; u++) data[v * width + u] = g;
    }
  } else if (look.bar) {
    // A black box with a white bar and three white "digits", bottom right, the same in every tile
    const bx = width - 460;
    const by = height - 130;
    for (let v = by; v < by + 90; v++) for (let u = bx; u < bx + 400; u++) data[v * width + u] = 0;
    for (let v = by + 55; v < by + 70; v++) for (let u = bx + 40; u < bx + 360; u++) data[v * width + u] = 255;
    for (let k = 0; k < 3; k++) {
      for (let v = by + 14; v < by + 44; v++) for (let u = bx + 150 + k * 34; u < bx + 170 + k * 34; u++) {
        const edge = v < by + 19 || v >= by + 39 || u < bx + 155 + k * 34 || u >= bx + 165 + k * 34;
        data[v * width + u] = edge || k === 1 ? 255 : 0;
      }
    }
  }
  return { data, width, height };
}

/** A grid of overlapping tiles, centered in the scene; the list is shuffled so its order says nothing */
export function cutTiles(scene: GrayImage, o: CutOptions): CutTile[] {
  const rand = randomOf(o.seed);
  const pm = () => rand() * 2 - 1;
  const stepX = o.tileWidth * (1 - o.overlap);
  const stepY = o.tileHeight * (1 - o.overlap);
  const x0 = (scene.width - (stepX * (o.cols - 1) + o.tileWidth)) / 2;
  const y0 = (scene.height - (stepY * (o.rows - 1) + o.tileHeight)) / 2;
  const tiles: CutTile[] = [];
  for (let r = 0; r < o.rows; r++) {
    for (let c = 0; c < o.cols; c++) {
      const cx = x0 + c * stepX + o.tileWidth / 2 + pm() * (o.jitter ?? 0) * o.tileWidth;
      const cy = y0 + r * stepY + o.tileHeight / 2 + pm() * (o.jitter ?? 0) * o.tileHeight;
      const rad = (pm() * (o.turn ?? 0) * Math.PI) / 180;
      const mag = 1 + pm() * (o.zoom ?? 0);
      const gain = 1 + pm() * (o.gain ?? 0);
      const id = `${o.name ?? 'tile'}_${Math.floor(rand() * 1e9).toString(36)}`;
      if (o.drop?.includes(r * o.cols + c)) continue;
      const truth = truthOf(cx, cy, rad, mag, o.tileWidth, o.tileHeight);
      const image = cutTile(scene, truth, o.tileWidth, o.tileHeight, { vignette: o.vignette ?? 0.2, gain, noise: o.noise ?? 2, bar: o.bar ?? false }, rand);
      tiles.push({ id, image, truth, cell: r * o.cols + c });
    }
  }
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles;
}

/** Tile pixel -> scene pixel for a tile centered at (cx, cy), turned by rad, magnified mag times */
export function truthOf(cx: number, cy: number, rad: number, mag: number, width: number, height: number): AffineMatrix {
  const a = Math.cos(rad) / mag;
  const q = Math.sin(rad) / mag;
  return [a, -q, cx - (a * width) / 2 + (q * height) / 2, q, a, cy - (q * width) / 2 - (a * height) / 2];
}
