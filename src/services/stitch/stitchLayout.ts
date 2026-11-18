/**
 * Image stitcher: the layout. Pure math, no OpenCV, no images.
 *
 * Input: the tiles (sizes only) and the overlaps found between pairs of them (matched points).
 * Output: groups of tiles that connect, and for every tile of a group a move-turn-resize into
 * the group's frame (the pixel frame of its best-connected tile), found by one least-squares
 * solve over all matched points of the group at once, so small errors do not pile up.
 *
 * A layout is one plain object (StitchLayout): it can be passed between workers, kept for undo,
 * and later saved and applied to a second set of images (design decision 7).
 *
 * Design: docs/image-stitcher-design.md
 */

import type { AffineMatrix } from '@/utils/affineTransform';
import { apply, fitSimilarity, invert, multiply } from '../autoPlace/placementMatch.ts';

export interface StitchTile {
  /** Stable name of the tile (the file path in the app) */
  id: string;
  /** Full-size pixels */
  width: number;
  height: number;
}

/** Two tiles that show the same piece of rock */
export interface Overlap {
  /** Indexes into the tile list, a < b */
  a: number;
  b: number;
  /** Matched points that agree with one placement */
  inliers: number;
  /** Matched points (at most POINTS_KEPT), full-size pixels: x, y in tile a, and in tile b */
  src: number[];
  dst: number[];
  /** Tile a pixel -> tile b pixel (move, turn, resize) */
  matrix: AffineMatrix;
  /** Root mean square distance of the matched points under matrix, tile b pixels */
  rms: number;
  /** Found by the harder pass or by a snap */
  hard?: boolean;
}

export interface StitchGroup {
  /** Tile indexes, the anchor first */
  tiles: number[];
  /** Tile index -> tile pixel to group frame */
  placements: Record<number, AffineMatrix>;
}

export interface StitchLayout {
  tiles: StitchTile[];
  /** The overlaps the layout rests on (false ones removed) */
  overlaps: Overlap[];
  /** Largest group first; a tile that connects to nothing is a group of one */
  groups: StitchGroup[];
  /** Overlaps that disagreed with the rest of their group and were dropped */
  dropped: Overlap[];
}

/** Matched points kept per overlap (evenly thinned): enough for the layout, small to pass around */
export const POINTS_KEPT = 200;
/** Fewer matched points than this is a weak overlap (the confident level of Place automatically) */
export const WEAK_INLIERS = 30;
/** A tile held by one neighbor only needs this many matched points not to be marked */
export const SINGLE_NEIGHBOR_INLIERS = 60;
/** A tile this many times larger or smaller than the median is at another magnification */
export const OTHER_MAGNIFICATION = 1.5;

const identity = (): AffineMatrix => [1, 0, 0, 0, 1, 0];

/** At most POINTS_KEPT pairs, evenly spread through the list */
export function thinPairs(src: number[], dst: number[]): { src: number[]; dst: number[] } {
  const count = src.length / 2;
  if (count <= POINTS_KEPT) return { src, dst };
  const s: number[] = [];
  const d: number[] = [];
  for (let k = 0; k < POINTS_KEPT; k++) {
    const i = Math.floor((k * count) / POINTS_KEPT);
    s.push(src[2 * i], src[2 * i + 1]);
    d.push(dst[2 * i], dst[2 * i + 1]);
  }
  return { src: s, dst: d };
}

/** Groups of connected tiles, largest first (ties: lowest tile index first) */
export function groupsOf(count: number, overlaps: Overlap[]): number[][] {
  const parent = Array.from({ length: count }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (const o of overlaps) {
    const ra = find(o.a);
    const rb = find(o.b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
  const map = new Map<number, number[]>();
  for (let i = 0; i < count; i++) {
    const r = find(i);
    const g = map.get(r);
    if (g) g.push(i);
    else map.set(r, [i]);
  }
  return [...map.values()].sort((x, y) => y.length - x.length || x[0] - y[0]);
}

/** Solves A x = b in place (A is n x n, row-major). Null when the system has no single answer. */
export function solveLinear(A: Float64Array, b: Float64Array, n: number): Float64Array | null {
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r * n + c]) > Math.abs(A[p * n + c])) p = r;
    if (Math.abs(A[p * n + c]) < 1e-12) return null;
    if (p !== c) {
      for (let k = c; k < n; k++) {
        const t = A[c * n + k];
        A[c * n + k] = A[p * n + k];
        A[p * n + k] = t;
      }
      const t = b[c];
      b[c] = b[p];
      b[p] = t;
    }
    const d = A[c * n + c];
    for (let r = c + 1; r < n; r++) {
      const f = A[r * n + c] / d;
      if (f === 0) continue;
      for (let k = c; k < n; k++) A[r * n + k] -= f * A[c * n + k];
      b[r] -= f * b[c];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r * n + k] * x[k];
    x[r] = s / A[r * n + r];
  }
  return x;
}

/** The tile of a group with the most matched points: its pixel frame becomes the group's */
function anchorOf(group: number[], overlaps: Overlap[]): number {
  const strength = new Map<number, number>();
  for (const o of overlaps) {
    strength.set(o.a, (strength.get(o.a) ?? 0) + o.inliers);
    strength.set(o.b, (strength.get(o.b) ?? 0) + o.inliers);
  }
  let best = group[0];
  for (const t of group) if ((strength.get(t) ?? 0) > (strength.get(best) ?? 0)) best = t;
  return best;
}

/**
 * Placements of one group. Unknowns per tile: p, q, tx, ty (x' = p x - q y + tx, y' = q x + p y + ty);
 * the anchor is fixed at the identity. Every matched point pair asks that both tiles put it in
 * the same place; all of them are answered at once (normal equations, a few hundred unknowns).
 */
export function placeGroup(group: number[], overlaps: Overlap[]): StitchGroup {
  const anchor = anchorOf(group, overlaps);
  const others = group.filter((t) => t !== anchor);
  const index = new Map<number, number>();
  others.forEach((t, k) => index.set(t, k));
  const placements: Record<number, AffineMatrix> = { [anchor]: identity() };
  const n = others.length * 4;
  if (n === 0) return { tiles: [anchor], placements };

  const A = new Float64Array(n * n);
  const rhs = new Float64Array(n);
  // Points in thousands of pixels, so the turn and move unknowns have similar sizes
  const U = 1000;
  const add = (cols: number[], coefs: number[], value: number) => {
    for (let i = 0; i < cols.length; i++) {
      rhs[cols[i]] += coefs[i] * value;
      for (let j = 0; j < cols.length; j++) A[cols[i] * n + cols[j]] += coefs[i] * coefs[j];
    }
  };
  for (const o of overlaps) {
    const ia = index.get(o.a);
    const ib = index.get(o.b);
    const count = o.src.length / 2;
    for (let k = 0; k < count; k++) {
      const x = o.src[2 * k] / U;
      const y = o.src[2 * k + 1] / U;
      const u = o.dst[2 * k] / U;
      const v = o.dst[2 * k + 1] / U;
      // p_a x - q_a y + tx_a = p_b u - q_b v + tx_b ; q_a x + p_a y + ty_a = q_b u + p_b v + ty_b
      const c1: number[] = [];
      const k1: number[] = [];
      const c2: number[] = [];
      const k2: number[] = [];
      let v1 = 0;
      let v2 = 0;
      if (ia !== undefined) {
        c1.push(ia * 4, ia * 4 + 1, ia * 4 + 2);
        k1.push(x, -y, 1);
        c2.push(ia * 4 + 1, ia * 4, ia * 4 + 3);
        k2.push(x, y, 1);
      } else {
        v1 -= x;
        v2 -= y;
      }
      if (ib !== undefined) {
        c1.push(ib * 4, ib * 4 + 1, ib * 4 + 2);
        k1.push(-u, v, -1);
        c2.push(ib * 4 + 1, ib * 4, ib * 4 + 3);
        k2.push(-u, -v, -1);
      } else {
        v1 += u;
        v2 += v;
      }
      add(c1, k1, v1);
      add(c2, k2, v2);
    }
  }
  const x = solveLinear(A, rhs, n);
  if (x) {
    for (const [t, k] of index) {
      placements[t] = [x[k * 4], -x[k * 4 + 1], x[k * 4 + 2] * U, x[k * 4 + 1], x[k * 4], x[k * 4 + 3] * U];
    }
  } else {
    // Cannot happen for a connected group with real overlaps; chain the pair matrices instead
    const todo = [anchor];
    while (todo.length) {
      const from = todo.pop()!;
      for (const o of overlaps) {
        if (o.a === from && !placements[o.b]) {
          placements[o.b] = multiply(placements[from], invert(o.matrix));
          todo.push(o.b);
        } else if (o.b === from && !placements[o.a]) {
          placements[o.a] = multiply(placements[from], o.matrix);
          todo.push(o.a);
        }
      }
    }
  }
  return { tiles: [anchor, ...others], placements };
}

/** How far apart (root mean square, group frame pixels) two placed tiles put their matched points */
export function overlapDisagreement(o: Overlap, placements: Record<number, AffineMatrix>): number {
  const pa = placements[o.a];
  const pb = placements[o.b];
  const count = o.src.length / 2;
  let sum = 0;
  for (let k = 0; k < count; k++) {
    const [x1, y1] = apply(pa, o.src[2 * k], o.src[2 * k + 1]);
    const [x2, y2] = apply(pb, o.dst[2 * k], o.dst[2 * k + 1]);
    sum += (x1 - x2) ** 2 + (y1 - y2) ** 2;
  }
  return Math.sqrt(sum / Math.max(1, count));
}

export interface LayoutOptions {
  /**
   * An overlap whose matched points end up further apart than this share of the larger tile's
   * long side disagrees with the rest of the layout: a false match. Default 1%.
   */
  disagreementShare?: number;
}

/**
 * The layout of a set of tiles from their overlaps. An overlap that disagrees with the layout
 * of its group is dropped (worst first) and the layout is solved again; that can split a group.
 */
export function solveLayout(tiles: StitchTile[], overlaps: Overlap[], options: LayoutOptions = {}): StitchLayout {
  const share = options.disagreementShare ?? 0.01;
  let kept = [...overlaps];
  const dropped: Overlap[] = [];
  for (;;) {
    const groups = groupsOf(tiles.length, kept).map((g) => {
      const inGroup = new Set(g);
      return placeGroup(g, kept.filter((o) => inGroup.has(o.a)));
    });
    let worst: Overlap | null = null;
    let worstBy = 1;
    for (const g of groups) {
      if (g.tiles.length < 3) continue; // two tiles and one overlap always agree
      const inGroup = new Set(g.tiles);
      for (const o of kept) {
        if (!inGroup.has(o.a)) continue;
        const limit = share * Math.max(tiles[o.a].width, tiles[o.a].height, tiles[o.b].width, tiles[o.b].height);
        const by = overlapDisagreement(o, g.placements) / limit;
        if (by > worstBy) {
          worst = o;
          worstBy = by;
        }
      }
    }
    if (!worst) return { tiles, overlaps: kept, groups, dropped };
    const gone = worst;
    kept = kept.filter((o) => o !== gone);
    dropped.push(gone);
  }
}

// ---------------------------------------------------------------- reading a layout

/** The group a tile is in */
export function groupOfTile(layout: StitchLayout, tile: number): StitchGroup {
  const g = layout.groups.find((x) => x.tiles.includes(tile));
  if (!g) throw new Error(`Tile ${tile} is in no group`);
  return g;
}

/** Size and turn (degrees, clockwise on screen) of a placement */
export function sizeAndTurn(m: AffineMatrix): { scale: number; degrees: number } {
  return { scale: Math.hypot(m[0], m[3]), degrees: (Math.atan2(m[3], m[0]) * 180) / Math.PI };
}

export type SeamStrength = 'good' | 'weak';

export interface SeamRatings {
  /** Per overlap of layout.overlaps */
  overlaps: SeamStrength[];
  /** Per tile: weak when nothing holds it well (a tile alone in its group is not rated: 'good') */
  tiles: SeamStrength[];
}

/**
 * Where a mistake is most likely: overlaps with few matched points, and tiles that no overlap
 * holds well (all its overlaps weak, or a single neighbor with a modest match).
 */
export function rateSeams(layout: StitchLayout): SeamRatings {
  const overlaps: SeamStrength[] = layout.overlaps.map((o) => (o.inliers < WEAK_INLIERS ? 'weak' : 'good'));
  const tiles: SeamStrength[] = layout.tiles.map((_, t) => {
    const mine = layout.overlaps.filter((o) => o.a === t || o.b === t);
    if (mine.length === 0) return 'good';
    const best = Math.max(...mine.map((o) => o.inliers));
    if (best < WEAK_INLIERS) return 'weak';
    if (mine.length === 1 && best < SINGLE_NEIGHBOR_INLIERS) return 'weak';
    return 'good';
  });
  return { overlaps, tiles };
}

/**
 * Tiles of a group at another magnification: size relative to the group's median tile.
 * factor > 1: the tile shows the rock that many times more magnified than the rest.
 */
export function otherMagnifications(group: StitchGroup): Array<{ tile: number; factor: number }> {
  const scales = group.tiles.map((t) => sizeAndTurn(group.placements[t]).scale).sort((a, b) => a - b);
  const median = scales[scales.length >> 1];
  const out: Array<{ tile: number; factor: number }> = [];
  for (const t of group.tiles) {
    // A more magnified tile covers less rock per pixel: it is placed smaller
    const factor = median / sizeAndTurn(group.placements[t]).scale;
    if (factor > OTHER_MAGNIFICATION || factor < 1 / OTHER_MAGNIFICATION) out.push({ tile: t, factor });
  }
  return out;
}

export interface MosaicFrame {
  /** Size the mosaic would have at the tiles' own resolution */
  fullWidth: number;
  fullHeight: number;
  /** Saved size (long side at most maxSide) and its share of the full size */
  width: number;
  height: number;
  scale: number;
  /** Tile index -> tile pixel to saved mosaic pixel */
  toMosaic: Record<number, AffineMatrix>;
}

/**
 * The rectangle that holds every pixel of every included tile of a group, and the saved size.
 * The mosaic's pixel size is that of the group's median tile and it is turned so that the tiles
 * are upright on average, so a group whose anchor happens to be an odd-sized or turned tile
 * does not change the result.
 */
export function mosaicFrame(layout: StitchLayout, group: StitchGroup, maxSide: number, leftOut: ReadonlySet<number> = new Set()): MosaicFrame | null {
  const included = group.tiles.filter((t) => !leftOut.has(t));
  if (included.length === 0) return null;
  const scales = included.map((t) => sizeAndTurn(group.placements[t]).scale).sort((a, b) => a - b);
  const unit = 1 / scales[scales.length >> 1];
  // Level: the mosaic is turned so that the tiles are upright on average (the frame is the
  // anchor's, and the anchor may be one of the more turned tiles of a hand-held set)
  let sin = 0;
  let cos = 0;
  for (const t of included) {
    const rad = (sizeAndTurn(group.placements[t]).degrees * Math.PI) / 180;
    sin += Math.sin(rad);
    cos += Math.cos(rad);
  }
  const level = Math.atan2(sin, cos);
  const upright: AffineMatrix = [Math.cos(level), Math.sin(level), 0, -Math.sin(level), Math.cos(level), 0];
  const placed: Record<number, AffineMatrix> = {};
  for (const t of included) placed[t] = multiply(upright, group.placements[t]);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const t of included) {
    const { width, height } = layout.tiles[t];
    for (const [x, y] of [[0, 0], [width, 0], [width, height], [0, height]]) {
      const [px, py] = apply(placed[t], x, y);
      x0 = Math.min(x0, px);
      y0 = Math.min(y0, py);
      x1 = Math.max(x1, px);
      y1 = Math.max(y1, py);
    }
  }
  const fullWidth = (x1 - x0) * unit;
  const fullHeight = (y1 - y0) * unit;
  const scale = Math.min(1, maxSide / Math.max(fullWidth, fullHeight));
  const s = unit * scale;
  const toSaved: AffineMatrix = [s, 0, -x0 * s, 0, s, -y0 * s];
  const toMosaic: Record<number, AffineMatrix> = {};
  for (const t of included) toMosaic[t] = multiply(toSaved, placed[t]);
  return {
    fullWidth: Math.round(fullWidth),
    fullHeight: Math.round(fullHeight),
    width: Math.max(1, Math.round(fullWidth * scale)),
    height: Math.max(1, Math.round(fullHeight * scale)),
    scale,
    toMosaic,
  };
}

/** Pixels per unit of the saved mosaic, from the pixels per unit of the original images */
export function mosaicPixelsPerUnit(originalPixelsPerUnit: number, frame: MosaicFrame): number {
  return originalPixelsPerUnit * frame.scale;
}

// ---------------------------------------------------------------- changing a layout by hand

/**
 * A group moved as one piece onto another group (drag + snap, or drag only): the moved group's
 * tiles join the target group. groupToTarget: moved group frame -> target group frame.
 * newOverlaps: what the snap found (empty when placed by hand without a fit).
 */
export function joinGroups(
  layout: StitchLayout,
  moved: StitchGroup,
  target: StitchGroup,
  groupToTarget: AffineMatrix,
  newOverlaps: Overlap[] = [],
): StitchLayout {
  const placements: Record<number, AffineMatrix> = { ...target.placements };
  for (const t of moved.tiles) placements[t] = multiply(groupToTarget, moved.placements[t]);
  const joined: StitchGroup = { tiles: [...target.tiles, ...moved.tiles], placements };
  const groups = layout.groups.filter((g) => g !== moved && g !== target);
  groups.push(joined);
  groups.sort((x, y) => y.tiles.length - x.tiles.length || x.tiles[0] - y.tiles[0]);
  return { ...layout, groups, overlaps: [...layout.overlaps, ...newOverlaps] };
}

/** One tile taken out of its group, to stand alone ("Separate", or before moving it elsewhere) */
export function separateTile(layout: StitchLayout, tile: number): StitchLayout {
  const from = groupOfTile(layout, tile);
  if (from.tiles.length === 1) return layout;
  const rest = from.tiles.filter((t) => t !== tile);
  const overlaps = layout.overlaps.filter((o) => o.a !== tile && o.b !== tile);
  // What is left may fall apart into several pieces; each keeps its placements as they were
  const inRest = new Set(rest);
  const restOverlaps = overlaps.filter((o) => inRest.has(o.a) && inRest.has(o.b));
  const local = new Map<number, number>();
  rest.forEach((t, k) => local.set(t, k));
  const pieces = groupsOf(rest.length, restOverlaps.map((o) => ({ ...o, a: local.get(o.a)!, b: local.get(o.b)! })))
    .map((piece) => piece.map((k) => rest[k]));
  const groups = layout.groups.filter((g) => g !== from);
  for (const piece of pieces) {
    const placements: Record<number, AffineMatrix> = {};
    for (const t of piece) placements[t] = from.placements[t];
    groups.push({ tiles: piece, placements });
  }
  groups.push({ tiles: [tile], placements: { [tile]: identity() } });
  groups.sort((x, y) => y.tiles.length - x.tiles.length || x.tiles[0] - y.tiles[0]);
  return { ...layout, groups, overlaps };
}

/**
 * Tiles of one group moved by hand within it (drag, turn, nudge, or the snap after a drop).
 * delta: a move in the group's frame, applied to every moved tile. The overlaps between a moved
 * tile and one that stayed no longer describe where it is: they go, and newOverlaps (what a
 * snap found; none when placed by hand) take their place. Overlaps among the moved tiles stay.
 */
export function moveTiles(layout: StitchLayout, tiles: number[], delta: AffineMatrix, newOverlaps: Overlap[] = []): StitchLayout {
  if (tiles.length === 0) return layout;
  const group = groupOfTile(layout, tiles[0]);
  const moved = new Set(tiles.filter((t) => group.placements[t] !== undefined));
  const placements: Record<number, AffineMatrix> = { ...group.placements };
  for (const t of moved) placements[t] = multiply(delta, group.placements[t]);
  const overlaps = layout.overlaps.filter((o) => moved.has(o.a) === moved.has(o.b));
  return {
    ...layout,
    groups: layout.groups.map((g) => (g === group ? { tiles: group.tiles, placements } : g)),
    overlaps: [...overlaps, ...newOverlaps],
  };
}

/** Group frame -> saved mosaic pixels, for a group and a frame made from it (null: no tile of the group is in the frame) */
export function groupToMosaic(group: StitchGroup, frame: MosaicFrame): AffineMatrix | null {
  for (const t of group.tiles) {
    const m = frame.toMosaic[t];
    if (m) return multiply(m, invert(group.placements[t]));
  }
  return null;
}

/** Least-squares move-turn-resize of a moved group onto its target from the points a snap matched */
export function fitGroupToTarget(
  found: Overlap[],
  moved: StitchGroup,
  target: StitchGroup,
): AffineMatrix | null {
  const src: number[] = [];
  const dst: number[] = [];
  for (const o of found) {
    const aMoved = moved.placements[o.a] !== undefined;
    const from = aMoved ? o.src : o.dst;
    const to = aMoved ? o.dst : o.src;
    const mTile = aMoved ? o.a : o.b;
    const tTile = aMoved ? o.b : o.a;
    if (!moved.placements[mTile] || !target.placements[tTile]) continue;
    for (let k = 0; k < from.length / 2; k++) {
      src.push(...apply(moved.placements[mTile], from[2 * k], from[2 * k + 1]));
      dst.push(...apply(target.placements[tTile], to[2 * k], to[2 * k + 1]));
    }
  }
  if (src.length < 4) return null;
  return fitSimilarity(src, dst);
}

// ---------------------------------------------------------------- the fully covered rectangle

/** True when the point (mosaic pixels) lies on the tile */
function onTile(toMosaic: AffineMatrix, width: number, height: number, x: number, y: number): boolean {
  const [u, v] = apply(invert(toMosaic), x, y);
  return u >= 0 && v >= 0 && u <= width && v <= height;
}

/**
 * The largest upright rectangle of the saved mosaic that tiles cover completely ("Crop to the
 * fully covered rectangle"), in saved mosaic pixels; null when there is none worth having.
 * Found on a coarse grid (at most GRID cells on the long side) and pulled in by one cell, so
 * the rectangle never reaches into an empty area.
 */
export function coveredRectangle(layout: StitchLayout, frame: MosaicFrame): { left: number; top: number; width: number; height: number } | null {
  const GRID = 400;
  const cell = Math.max(1, Math.max(frame.width, frame.height) / GRID);
  const cols = Math.max(1, Math.floor(frame.width / cell));
  const rows = Math.max(1, Math.floor(frame.height / cell));
  const tiles = Object.entries(frame.toMosaic).map(([t, m]) => ({ inverse: invert(m), width: layout.tiles[Number(t)].width, height: layout.tiles[Number(t)].height }));
  // Grid points (cell corners) that lie on some tile
  const on = new Uint8Array((cols + 1) * (rows + 1));
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const x = c * cell;
      const y = r * cell;
      for (const t of tiles) {
        const [u, v] = apply(t.inverse, x, y);
        if (u >= 0 && v >= 0 && u <= t.width && v <= t.height) {
          on[r * (cols + 1) + c] = 1;
          break;
        }
      }
    }
  }
  // A cell counts when its four corners do. Largest rectangle of such cells (histogram method).
  const heights = new Int32Array(cols);
  let best = { area: 0, c0: 0, c1: 0, r0: 0, r1: 0 };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const full = on[r * (cols + 1) + c] && on[r * (cols + 1) + c + 1] && on[(r + 1) * (cols + 1) + c] && on[(r + 1) * (cols + 1) + c + 1];
      heights[c] = full ? heights[c] + 1 : 0;
    }
    const stack: number[] = [];
    for (let c = 0; c <= cols; c++) {
      const h = c < cols ? heights[c] : 0;
      while (stack.length && heights[stack[stack.length - 1]] >= h) {
        const top = stack.pop()!;
        const left = stack.length ? stack[stack.length - 1] + 1 : 0;
        const area = heights[top] * (c - left);
        if (area > best.area) best = { area, c0: left, c1: c, r0: r - heights[top] + 1, r1: r + 1 };
      }
      stack.push(c);
    }
  }
  // One cell in from every side
  const c0 = best.c0 + 1;
  const c1 = best.c1 - 1;
  const r0 = best.r0 + 1;
  const r1 = best.r1 - 1;
  if (c1 - c0 < 2 || r1 - r0 < 2) return null;
  const left = Math.ceil(c0 * cell);
  const top = Math.ceil(r0 * cell);
  return { left, top, width: Math.floor(c1 * cell) - left, height: Math.floor(r1 * cell) - top };
}

/** True when the mosaic has areas no tile covers (so fill color and crop are worth offering) */
export function hasEmptyAreas(layout: StitchLayout, frame: MosaicFrame): boolean {
  const tiles = Object.entries(frame.toMosaic).map(([t, m]) => ({ m, ...layout.tiles[Number(t)] }));
  const STEPS = 60;
  for (let r = 0; r <= STEPS; r++) {
    for (let c = 0; c <= STEPS; c++) {
      // Just inside the edge, so rounding at the border does not count
      const x = 1 + (c / STEPS) * (frame.width - 2);
      const y = 1 + (r / STEPS) * (frame.height - 2);
      if (!tiles.some((t) => onTile(t.m, t.width, t.height, x, y))) return true;
    }
  }
  return false;
}
