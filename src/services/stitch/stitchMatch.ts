/**
 * Image stitcher: finding overlaps between tiles (OpenCV.js AKAZE + RANSAC, the feature code of
 * Place automatically on parent, src/services/autoPlace/placementMatch.ts).
 *
 * OpenCV is passed in and images come through ImageSource, so the same code runs in the app's
 * workers and in Node (npm run test:stitch). A tile's features are plain typed arrays: they can
 * be made in one worker and matched in another.
 *
 * Design: docs/image-stitcher-design.md
 */

import type { AffineMatrix } from '@/utils/affineTransform';
import {
  apply, findFeatures, fitAffine, fitSimilarity, freeFeatures, invert, matchFeatures, multiply, residual, toMat,
  type Features, type ImageSource, type OpenCV,
} from '../autoPlace/placementMatch.ts';
import { fitGroupToTarget, sizeAndTurn, thinPairs, type Overlap, type StitchGroup, type StitchLayout } from './stitchLayout.ts';

/** quick: the first pass over every pair. hard: for tiles the quick pass left unconnected, and for snaps */
export type MatchLevel = 'quick' | 'hard';

/** Long side of the shrunken copy the features are found on, and the keypoints kept */
export const LEVELS: Record<MatchLevel, { side: number; keypoints: number }> = {
  quick: { side: 1024, keypoints: 3000 },
  hard: { side: 2048, keypoints: 6000 },
};

/** Matched points that must agree for two tiles to count as overlapping (wrong pairs stayed at or below 12 in the 2026-09-24 experiment) */
export const MIN_INLIERS = 15;
/** The same for a snap, where the place to look is already known */
export const SNAP_MIN_INLIERS = 12;
/** How far (share of the tile's long side) a snap may move a tile from where it was dropped */
export const SNAP_REACH = 0.3;
/** How far (degrees) a snap may turn it */
const SNAP_TURN = 15;
/** RANSAC threshold of fitAffine, working pixels; a move-turn-resize must fit the inliers within twice this */
const FIT_PX = 3;

export interface TileFeatures {
  level: MatchLevel;
  /** Full-size pixels */
  width: number;
  height: number;
  /** Working pixels per full-size pixel */
  fx: number;
  fy: number;
  workWidth: number;
  workHeight: number;
  count: number;
  /** x, y per keypoint, working pixels */
  pts: Float32Array;
  /** 1 where the keypoint sits on burned-in graphics (scale bar, label) */
  graphic: Uint8Array;
  /** count * bytes */
  descriptors: Uint8Array;
  bytes: number;
}

/** Features of one tile, read as a shrunken gray copy */
export async function tileFeatures(cv: OpenCV, source: ImageSource, level: MatchLevel): Promise<TileFeatures> {
  const { side, keypoints } = LEVELS[level];
  const gray = await source.read({ x: 0, y: 0, width: source.width, height: source.height }, side);
  const mat = toMat(cv, gray);
  const f = findFeatures(cv, mat, keypoints);
  mat.delete();
  const bytes = f.count > 0 ? f.descriptors.cols : 0;
  const out: TileFeatures = {
    level,
    width: source.width,
    height: source.height,
    fx: gray.width / source.width,
    fy: gray.height / source.height,
    workWidth: gray.width,
    workHeight: gray.height,
    count: f.count,
    pts: f.pts,
    graphic: f.graphic,
    descriptors: f.count > 0 ? new Uint8Array(f.descriptors.data) : new Uint8Array(0),
    bytes,
  };
  freeFeatures(f);
  return out;
}

/** True when the tiles found burned-in graphics worth telling the user about */
export function hasGraphics(f: TileFeatures): boolean {
  let n = 0;
  for (let i = 0; i < f.count; i++) n += f.graphic[i];
  return n >= 20;
}

function graphicShare(f: TileFeatures): number {
  if (f.count === 0) return 0;
  let n = 0;
  for (let i = 0; i < f.count; i++) n += f.graphic[i];
  return n / f.count;
}

/** OpenCV-side features of a tile (all keypoints, or only those listed); free with freeFeatures */
function toCv(cv: OpenCV, f: TileFeatures, keep?: number[]): Features {
  const count = keep ? keep.length : f.count;
  const descriptors = new cv.Mat(count, f.bytes, cv.CV_8U);
  if (!keep) {
    descriptors.data.set(f.descriptors);
    return { pts: f.pts, graphic: f.graphic, descriptors, count, width: f.workWidth, height: f.workHeight };
  }
  const pts = new Float32Array(count * 2);
  const graphic = new Uint8Array(count);
  keep.forEach((k, i) => {
    pts[2 * i] = f.pts[2 * k];
    pts[2 * i + 1] = f.pts[2 * k + 1];
    graphic[i] = f.graphic[k];
    descriptors.data.set(f.descriptors.subarray(k * f.bytes, (k + 1) * f.bytes), i * f.bytes);
  });
  return { pts, graphic, descriptors, count, width: f.workWidth, height: f.workHeight };
}

export interface PairOptions {
  minInliers?: number;
  /** Only these keypoints of each tile take part (a snap looks only where the tiles should overlap) */
  keepA?: number[];
  keepB?: number[];
  hard?: boolean;
}

/**
 * The overlap of tiles i and j, or null. Ratio-tested matches (two pieces of burned-in graphics
 * never match each other), a RANSAC affine fit, then the least-squares move-turn-resize of its
 * inliers in full-size pixels, which must explain them about as well as the affine did.
 */
export function matchPair(cv: OpenCV, i: number, j: number, fi: TileFeatures, fj: TileFeatures, options: PairOptions = {}): Overlap | null {
  if (i > j) {
    return matchPair(cv, j, i, fj, fi, { ...options, keepA: options.keepB, keepB: options.keepA });
  }
  const minInliers = options.minInliers ?? MIN_INLIERS;
  const countA = options.keepA ? options.keepA.length : fi.count;
  const countB = options.keepB ? options.keepB.length : fj.count;
  if (countA < minInliers || countB < minInliers || fi.bytes !== fj.bytes) return null;
  // Line drawings are mostly "graphics": keep them, as Place automatically does
  const drawings = graphicShare(fi) > 0.5 && graphicShare(fj) > 0.5;
  const a = toCv(cv, fi, options.keepA);
  const b = toCv(cv, fj, options.keepB);
  const pairs = matchFeatures(cv, a, b, drawings);
  freeFeatures(a);
  freeFeatures(b);
  if (pairs.src.length / 2 < minInliers) return null;
  const fit = fitAffine(cv, pairs);
  if (!fit || fit.n < minInliers) return null;
  const src: number[] = [];
  const dst: number[] = [];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let k = 0; k < fit.inlier.length; k++) {
    if (!fit.inlier[k]) continue;
    const x = pairs.src[2 * k] / fi.fx;
    const y = pairs.src[2 * k + 1] / fi.fy;
    src.push(x, y);
    dst.push(pairs.dst[2 * k] / fj.fx, pairs.dst[2 * k + 1] / fj.fy);
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const matrix = fitSimilarity(src, dst);
  const { scale, degrees } = sizeAndTurn(matrix);
  if (!(scale > 0.2 && scale < 5)) return null;
  const rms = residual(matrix, src, dst);
  if (rms > (2 * FIT_PX) / Math.min(fj.fx, fj.fy)) return null;
  // A scale bar or label matching its twin: tile i lands exactly on tile j, and all the matched
  // points sit in one small area. (The same image added twice matches all over.)
  const [cx, cy] = apply(matrix, fi.width / 2, fi.height / 2);
  const onTop = Math.hypot(cx - fj.width / 2, cy - fj.height / 2) < 0.02 * Math.hypot(fj.width, fj.height);
  if (onTop && Math.abs(scale - 1) < 0.03 && Math.abs(degrees) < 1 && (x1 - x0) * (y1 - y0) < 0.1 * fi.width * fi.height) return null;
  const kept = thinPairs(src, dst);
  return { a: i, b: j, inliers: fit.n, src: kept.src, dst: kept.dst, matrix, rms, ...(options.hard ? { hard: true } : {}) };
}

// ---------------------------------------------------------------- snap

export interface SnapResult {
  /** Moved group frame -> target group frame, exact */
  groupToTarget: AffineMatrix;
  /** The overlaps the fit rests on (to add to the layout) */
  overlaps: Overlap[];
}

/** Indexes of the keypoints of f that land inside the other tile (plus a margin), given tile-to-other-tile pixels */
function keypointsOver(f: TileFeatures, toOther: AffineMatrix, otherWidth: number, otherHeight: number, margin: number): number[] {
  const keep: number[] = [];
  for (let k = 0; k < f.count; k++) {
    const [x, y] = apply(toOther, f.pts[2 * k] / f.fx, f.pts[2 * k + 1] / f.fy);
    if (x >= -margin && y >= -margin && x <= otherWidth + margin && y <= otherHeight + margin) keep.push(k);
  }
  return keep;
}

/**
 * The exact fit of a group (or a single tile, a group of one) dropped roughly in place on another
 * group. Looks only where the dropped tiles should overlap their new neighbors, so it finds fits
 * the all-pairs pass missed; a fit that would move the tiles far from the drop is not taken.
 * Null: nothing found, the tiles stay where they were dropped.
 *
 * rough: moved group frame -> target group frame, as dropped.
 * features: per tile index (any level; the caller passes the hard level when it has it).
 */
export function snapGroup(
  cv: OpenCV,
  layout: StitchLayout,
  moved: StitchGroup,
  target: StitchGroup,
  rough: AffineMatrix,
  features: Array<TileFeatures | undefined>,
): SnapResult | null {
  const found: Overlap[] = [];
  for (const m of moved.tiles) {
    const fm = features[m];
    if (!fm) continue;
    const pm = multiply(rough, moved.placements[m]);
    const tm = layout.tiles[m];
    for (const t of target.tiles) {
      const ft = features[t];
      if (!ft) continue;
      const tt = layout.tiles[t];
      const pt = target.placements[t];
      const mToT = multiply(invert(pt), pm);
      const reachT = SNAP_REACH * Math.max(tt.width, tt.height);
      const reachM = SNAP_REACH * Math.max(tm.width, tm.height);
      const keepM = keypointsOver(fm, mToT, tt.width, tt.height, reachT);
      if (keepM.length < SNAP_MIN_INLIERS) continue;
      const keepT = keypointsOver(ft, invert(mToT), tm.width, tm.height, reachM);
      if (keepT.length < SNAP_MIN_INLIERS) continue;
      const o = matchPair(cv, m, t, fm, ft, { minInliers: SNAP_MIN_INLIERS, keepA: keepM, keepB: keepT, hard: true });
      if (!o) continue;
      // Where this overlap alone would put tile m, against where it was dropped
      const exact = o.a === m ? multiply(pt, o.matrix) : multiply(pt, invert(o.matrix));
      const [ex, ey] = apply(exact, tm.width / 2, tm.height / 2);
      const [rx, ry] = apply(pm, tm.width / 2, tm.height / 2);
      const reach = SNAP_REACH * Math.max(tm.width, tm.height) * sizeAndTurn(pm).scale;
      if (Math.hypot(ex - rx, ey - ry) > reach) continue;
      let turn = Math.abs(sizeAndTurn(exact).degrees - sizeAndTurn(pm).degrees) % 360;
      if (turn > 180) turn = 360 - turn;
      if (turn > SNAP_TURN) continue;
      found.push(o);
    }
  }
  if (found.length === 0) return null;
  const groupToTarget = fitGroupToTarget(found, moved, target);
  return groupToTarget ? { groupToTarget, overlaps: found } : null;
}
