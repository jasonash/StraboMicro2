/**
 * Place automatically on parent: finds where a detail micrograph sits on its
 * parent by matching image features (OpenCV.js AKAZE + RANSAC affine fit).
 *
 * OpenCV is passed in and images come through ImageSource, so the same code
 * runs in the app's worker and in Node (npm run test:auto-place). Only type
 * imports, so Node can load this file directly.
 *
 * Steps: features on the parent (shrunk to WORKING_SIDE) and on the detail at
 * several sizes; ratio-tested matches, minus matches between two pieces of
 * burned-in graphics (scale bars, labels); an affine fit per try; sanity checks
 * (no mirror, sane size and aspect, footprint on the parent, not a label-only
 * match); if nothing fits, sheared versions of the detail; a second location
 * nearly as good makes the result ambiguous; a large parent is refined on a
 * full-resolution crop around the footprint.
 *
 * Design: docs/drop-to-place-design.md
 */

import type { AffineMatrix } from '@/utils/affineTransform';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OpenCV = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Mat = any;

export interface GrayImage {
  data: Uint8Array;
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A full-resolution image read in pieces (the parent can be far too big to load whole) */
export interface ImageSource {
  width: number;
  height: number;
  /** The region, shrunk (never enlarged) so its long side is at most maxSide */
  read(rect: Rect, maxSide: number): Promise<GrayImage>;
}

/**
 * placed: confident; low: plausible but weak (show with a warning);
 * ambiguous: another location fits about as well (repeating pattern); none: no match.
 */
export type MatchStatus = 'placed' | 'low' | 'ambiguous' | 'none';

/** rectangle: move, turn and resize only (legacy-readable); affine: real shear or unequal stretch */
export type PlacementKind = 'rectangle' | 'affine';

export interface PlacementResult {
  status: MatchStatus;
  /** Detail pixel (full resolution) -> parent pixel (full resolution); null when status is none */
  matrix: AffineMatrix | null;
  kind: PlacementKind | null;
  inliers: number;
  /** Inliers of the best fit at a clearly different location (0 if none) */
  runnerUp: number;
  /** Short English reason, for the console and for tests */
  reason: string;
  ms: number;
}

export interface MatchOptions {
  onProgress?: (step: string, percent: number) => void;
}

/** Long side of the parent and detail images the features are found on */
export const WORKING_SIDE = 2048;
/** Smallest detail size tried */
const MIN_DETAIL_SIDE = 160;
/** Lowe ratio test */
const RATIO = 0.8;
/** RANSAC reprojection threshold, working pixels */
const RANSAC_PX = 3;
/** Inliers for a confident match; for a plausible one. Wrong pairs stayed at or below 12 in the 2026-09-24 experiment. */
export const GOOD_INLIERS = 30;
export const LOW_INLIERS = 15;
/** A second location with at least this share of the best inliers makes it ambiguous */
const AMBIGUOUS_SHARE = 0.5;
/** Parent shrunk below this share of full size: refine on a full-resolution crop */
const REFINE_BELOW = 0.75;
/** Corner difference (share of the footprint diagonal) up to which an affine counts as a rectangle */
const RECTANGLE_TOLERANCE = 0.005;
/** Keypoints kept (strongest per grid cell, so weak areas keep some): matching time grows with parent x detail */
const PARENT_KEYPOINTS = 30000;
const DETAIL_KEYPOINTS = 2000;
/** Sheared versions of the detail tried when the plain match fails (ASIFT-style tilts) */
const TILTS = [1.6, 2.5];
const TILT_ANGLES = [0, 45, 90, 135];

// ---------------------------------------------------------------- matrix math

export function multiply(a: AffineMatrix, b: AffineMatrix): AffineMatrix {
  // a after b
  return [
    a[0] * b[0] + a[1] * b[3],
    a[0] * b[1] + a[1] * b[4],
    a[0] * b[2] + a[1] * b[5] + a[2],
    a[3] * b[0] + a[4] * b[3],
    a[3] * b[1] + a[4] * b[4],
    a[3] * b[2] + a[4] * b[5] + a[5],
  ];
}

export function apply(m: AffineMatrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]];
}

function scaling(sx: number, sy: number = sx): AffineMatrix {
  return [sx, 0, 0, 0, sy, 0];
}

function translation(tx: number, ty: number): AffineMatrix {
  return [1, 0, tx, 0, 1, ty];
}

/** The four corners of a w x h image after m */
export function footprint(m: AffineMatrix, w: number, h: number): Array<[number, number]> {
  return [apply(m, 0, 0), apply(m, w, 0), apply(m, w, h), apply(m, 0, h)];
}

/** Scale, rotation (degrees, clockwise on screen) and center of the closest move-turn-resize */
export function nearestSimilarity(m: AffineMatrix, w: number, h: number): {
  scale: number;
  rotation: number;
  center: [number, number];
  matrix: AffineMatrix;
} {
  const [a, b, , c, d] = m;
  const p = (a + d) / 2;
  const q = (c - b) / 2;
  const scale = Math.hypot(p, q);
  const rotation = (Math.atan2(q, p) * 180) / Math.PI;
  const center = apply(m, w / 2, h / 2);
  const cos = p / (scale || 1);
  const sin = q / (scale || 1);
  const sa = scale * cos;
  const sc = scale * sin;
  const matrix: AffineMatrix = [
    sa,
    -sc,
    center[0] - (sa * w) / 2 + (sc * h) / 2,
    sc,
    sa,
    center[1] - (sc * w) / 2 - (sa * h) / 2,
  ];
  return { scale, rotation, center, matrix };
}

/** rectangle when no corner moves more than RECTANGLE_TOLERANCE of the footprint diagonal */
export function classify(m: AffineMatrix, w: number, h: number): PlacementKind {
  const sim = nearestSimilarity(m, w, h).matrix;
  const real = footprint(m, w, h);
  const near = footprint(sim, w, h);
  const diagonal = Math.hypot(real[2][0] - real[0][0], real[2][1] - real[0][1]);
  const worst = Math.max(...real.map((p, i) => Math.hypot(p[0] - near[i][0], p[1] - near[i][1])));
  return worst <= Math.max(1, diagonal * RECTANGLE_TOLERANCE) ? 'rectangle' : 'affine';
}

/** Largest corner distance between two placements of a w x h image, parent pixels */
export function cornerDistance(m1: AffineMatrix, m2: AffineMatrix, w: number, h: number): number {
  const a = footprint(m1, w, h);
  const b = footprint(m2, w, h);
  return Math.max(...a.map((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1])));
}

// ---------------------------------------------------------------- images

/** An ImageSource over an image already in memory */
export function memorySource(cv: OpenCV, image: GrayImage): ImageSource {
  return {
    width: image.width,
    height: image.height,
    async read(rect, maxSide) {
      const x = Math.max(0, Math.floor(rect.x));
      const y = Math.max(0, Math.floor(rect.y));
      const w = Math.min(image.width - x, Math.ceil(rect.width));
      const h = Math.min(image.height - y, Math.ceil(rect.height));
      const whole = toMat(cv, image);
      const roi = whole.roi(new cv.Rect(x, y, w, h));
      const f = Math.min(1, maxSide / Math.max(w, h));
      const out = new cv.Mat();
      if (f < 1) cv.resize(roi, out, new cv.Size(Math.max(1, Math.round(w * f)), Math.max(1, Math.round(h * f))), 0, 0, cv.INTER_AREA);
      else roi.copyTo(out);
      const result = fromMat(out);
      [whole, roi, out].forEach((m) => m.delete());
      return result;
    },
  };
}

export function toMat(cv: OpenCV, image: GrayImage): Mat {
  const mat = new cv.Mat(image.height, image.width, cv.CV_8UC1);
  mat.data.set(image.data);
  return mat;
}

export function fromMat(mat: Mat): GrayImage {
  return { data: new Uint8Array(mat.data), width: mat.cols, height: mat.rows };
}

// ---------------------------------------------------------------- features

interface Features {
  /** x, y per keypoint */
  pts: Float32Array;
  /** 1 where the keypoint sits on burned-in graphics (pure black and white, like a scale bar) */
  graphic: Uint8Array;
  descriptors: Mat;
  count: number;
  width: number;
  height: number;
}

function freeFeatures(f: Features) {
  f.descriptors.delete();
}

/** Share of keypoints on graphics above which the image itself is a drawing, and graphics are kept */
const DRAWING_SHARE = 0.5;

/**
 * Burned-in graphics (scale bars, labels, their boxes): flat areas of pure black or pure white,
 * widened by a margin so the edges and glyphs around them count too. Rock is almost never flat
 * and saturated (an overexposed hole is, and losing its edge matches is acceptable).
 */
function graphicsMask(cv: OpenCV, raw: Mat): Mat {
  const dark = new cv.Mat();
  const bright = new cv.Mat();
  cv.threshold(raw, dark, 24, 255, cv.THRESH_BINARY_INV);
  cv.threshold(raw, bright, 231, 255, cv.THRESH_BINARY);
  const saturated = new cv.Mat();
  cv.bitwise_or(dark, bright, saturated);
  const k5 = cv.Mat.ones(5, 5, cv.CV_8U);
  const hi = new cv.Mat();
  const lo = new cv.Mat();
  cv.dilate(raw, hi, k5);
  cv.erode(raw, lo, k5);
  const range = new cv.Mat();
  cv.subtract(hi, lo, range);
  const flat = new cv.Mat();
  cv.threshold(range, flat, 2, 255, cv.THRESH_BINARY_INV);
  const flatSaturated = new cv.Mat();
  cv.bitwise_and(saturated, flat, flatSaturated);
  // Specks (a single clipped pixel cluster in rock) are not graphics: open before widening
  const k3 = cv.Mat.ones(3, 3, cv.CV_8U);
  cv.morphologyEx(flatSaturated, flatSaturated, cv.MORPH_OPEN, k3);
  const k15 = cv.Mat.ones(15, 15, cv.CV_8U);
  const mask = new cv.Mat();
  cv.dilate(flatSaturated, mask, k15);
  [dark, bright, saturated, k5, hi, lo, range, flat, flatSaturated, k3, k15].forEach((m) => m.delete());
  return mask;
}

/** Indexes of at most cap keypoints, the strongest of each cell of a 16 x 16 grid, spread evenly */
function spreadStrongest(xs: Float32Array, responses: Float32Array, width: number, height: number, cap: number): number[] {
  const count = responses.length;
  if (count <= cap) return Array.from({ length: count }, (_, i) => i);
  const cells = new Map<number, number[]>();
  for (let i = 0; i < count; i++) {
    const cell = Math.min(15, Math.floor((xs[2 * i] / width) * 16)) * 16 + Math.min(15, Math.floor((xs[2 * i + 1] / height) * 16));
    const list = cells.get(cell);
    if (list) list.push(i);
    else cells.set(cell, [i]);
  }
  for (const list of cells.values()) list.sort((a, b) => responses[b] - responses[a]);
  // Round robin over the cells, strongest first in each
  const keep: number[] = [];
  const lists = [...cells.values()];
  for (let rank = 0; keep.length < cap; rank++) {
    let added = false;
    for (const list of lists) {
      if (rank < list.length && keep.length < cap) {
        keep.push(list[rank]);
        added = true;
      }
    }
    if (!added) break;
  }
  return keep;
}

function findFeatures(cv: OpenCV, raw: Mat, cap: number): Features {
  const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
  const eq = new cv.Mat();
  clahe.apply(raw, eq);
  clahe.delete();
  const akaze = new cv.AKAZE();
  akaze.setThreshold(0.0005);
  const keypoints = new cv.KeyPointVector();
  const descriptors = new cv.Mat();
  const noMask = new cv.Mat();
  akaze.detectAndCompute(eq, noMask, keypoints, descriptors);
  akaze.delete();
  noMask.delete();
  eq.delete();
  const found = keypoints.size();
  const allPts = new Float32Array(found * 2);
  const responses = new Float32Array(found);
  for (let i = 0; i < found; i++) {
    const k = keypoints.get(i);
    allPts[2 * i] = k.pt.x;
    allPts[2 * i + 1] = k.pt.y;
    responses[i] = k.response;
  }
  keypoints.delete();
  const keep = spreadStrongest(allPts, responses, raw.cols, raw.rows, cap);
  const mask = graphicsMask(cv, raw);
  const count = keep.length;
  const pts = new Float32Array(count * 2);
  const graphic = new Uint8Array(count);
  const bytes = descriptors.cols;
  const kept = new Uint8Array(count * bytes);
  keep.forEach((k, i) => {
    pts[2 * i] = allPts[2 * k];
    pts[2 * i + 1] = allPts[2 * k + 1];
    const gx = Math.min(raw.cols - 1, Math.max(0, Math.round(pts[2 * i])));
    const gy = Math.min(raw.rows - 1, Math.max(0, Math.round(pts[2 * i + 1])));
    graphic[i] = mask.data[gy * raw.cols + gx] ? 1 : 0;
    kept.set(descriptors.data.subarray(k * bytes, (k + 1) * bytes), i * bytes);
  });
  descriptors.delete();
  mask.delete();
  const limited = cv.matFromArray(count, bytes, cv.CV_8U, Array.from(kept));
  return { pts, graphic, descriptors: limited, count, width: raw.cols, height: raw.rows };
}

function graphicShare(f: Features): number {
  if (f.count === 0) return 0;
  let n = 0;
  for (let i = 0; i < f.count; i++) n += f.graphic[i];
  return n / f.count;
}

export interface Pairs {
  /** detail x, y */
  src: number[];
  /** parent x, y */
  dst: number[];
  /** 1 where the detail keypoint sits on graphics */
  graphic: number[];
}

function matchFeatures(cv: OpenCV, d: Features, p: Features, keepGraphics: boolean): Pairs {
  const pairs: Pairs = { src: [], dst: [], graphic: [] };
  if (d.count < 3 || p.count < 3) return pairs;
  const matcher = new cv.BFMatcher(cv.NORM_HAMMING);
  const knn = new cv.DMatchVectorVector();
  matcher.knnMatch(d.descriptors, p.descriptors, knn, 2);
  for (let i = 0; i < knn.size(); i++) {
    const two = knn.get(i);
    if (two.size() < 2) continue;
    const best = two.get(0);
    if (best.distance >= RATIO * two.get(1).distance) continue;
    const qi = best.queryIdx;
    const ti = best.trainIdx;
    if (!keepGraphics && d.graphic[qi] && p.graphic[ti]) continue;
    pairs.src.push(d.pts[2 * qi], d.pts[2 * qi + 1]);
    pairs.dst.push(p.pts[2 * ti], p.pts[2 * ti + 1]);
    pairs.graphic.push(d.graphic[qi]);
  }
  knn.delete();
  matcher.delete();
  return pairs;
}

export interface Fit {
  /** working detail px -> working parent px */
  m: AffineMatrix;
  inlier: Uint8Array;
  n: number;
}

function fitAffine(cv: OpenCV, pairs: Pairs): Fit | null {
  const count = pairs.src.length / 2;
  if (count < 6) return null;
  const a = cv.matFromArray(count, 1, cv.CV_32FC2, pairs.src);
  const b = cv.matFromArray(count, 1, cv.CV_32FC2, pairs.dst);
  const mask = new cv.Mat();
  const M = cv.estimateAffine2D(a, b, mask, cv.RANSAC, RANSAC_PX, 5000, 0.995, 10);
  let fit: Fit | null = null;
  if (!M.empty()) {
    const v = M.data64F;
    const inlier = new Uint8Array(count);
    let n = 0;
    for (let i = 0; i < count; i++) {
      inlier[i] = mask.data[i] ? 1 : 0;
      n += inlier[i];
    }
    fit = { m: [v[0], v[1], v[2], v[3], v[4], v[5]], inlier, n };
  }
  [a, b, mask, M].forEach((x) => x.delete());
  return fit;
}

function without(pairs: Pairs, drop: Uint8Array): Pairs {
  const out: Pairs = { src: [], dst: [], graphic: [] };
  for (let i = 0; i < drop.length; i++) {
    if (drop[i]) continue;
    out.src.push(pairs.src[2 * i], pairs.src[2 * i + 1]);
    out.dst.push(pairs.dst[2 * i], pairs.dst[2 * i + 1]);
    out.graphic.push(pairs.graphic[i]);
  }
  return out;
}

/** Why a fit (in working pixels) cannot be a real placement, or null if it can */
export function implausible(
  fit: Fit,
  full: AffineMatrix,
  pairs: Pairs,
  dw: number,
  dh: number,
  pw: number,
  ph: number,
): string | null {
  const [a, b, , c, d] = fit.m;
  if (a * d - b * c <= 0) return 'mirrored or flat';
  const sx = Math.hypot(a, c);
  const sy = Math.hypot(b, d);
  if (sx < 0.01 || sy < 0.01 || sx > 100 || sy > 100) return 'size out of range';
  if (sx / sy > 3 || sy / sx > 3) return 'stretched out of range';
  const [cx, cy] = apply(fit.m, dw / 2, dh / 2);
  const corners = footprint(fit.m, dw, dh);
  const diag = Math.hypot(corners[2][0] - corners[0][0], corners[2][1] - corners[0][1]);
  if (cx < -0.1 * diag || cy < -0.1 * diag || cx > pw + 0.1 * diag || cy > ph + 0.1 * diag) return 'off the parent';
  // A scale bar or label matching its twin: same pixel size in both originals, no turn,
  // all in one small area of the detail
  const sim = nearestSimilarity(full, dw, dh);
  if (Math.abs(sim.scale - 1) < 0.03 && Math.abs(sim.rotation) < 1) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < fit.inlier.length; i++) {
      if (!fit.inlier[i]) continue;
      x0 = Math.min(x0, pairs.src[2 * i]);
      x1 = Math.max(x1, pairs.src[2 * i]);
      y0 = Math.min(y0, pairs.src[2 * i + 1]);
      y1 = Math.max(y1, pairs.src[2 * i + 1]);
    }
    if ((x1 - x0) * (y1 - y0) < 0.1 * dw * dh) return 'label-only match';
  }
  return null;
}

// ---------------------------------------------------------------- search

export interface Candidate {
  /** full-resolution detail px -> full-resolution parent px */
  matrix: AffineMatrix;
  n: number;
  /** inlier pairs, full-resolution detail x, y and parent x, y */
  src: number[];
  dst: number[];
}

/** The inlier pairs of a fit, mapped to full resolution */
function inlierPairs(fit: Fit, pairs: Pairs, toDetail: AffineMatrix, fromParent: AffineMatrix): { src: number[]; dst: number[] } {
  const src: number[] = [];
  const dst: number[] = [];
  for (let i = 0; i < fit.inlier.length; i++) {
    if (!fit.inlier[i]) continue;
    src.push(...apply(toDetail, pairs.src[2 * i], pairs.src[2 * i + 1]));
    dst.push(...apply(fromParent, pairs.dst[2 * i], pairs.dst[2 * i + 1]));
  }
  return { src, dst };
}

/** Least-squares move-turn-resize from point pairs */
export function fitSimilarity(src: number[], dst: number[]): AffineMatrix {
  const n = src.length / 2;
  let msx = 0, msy = 0, mdx = 0, mdy = 0;
  for (let i = 0; i < n; i++) {
    msx += src[2 * i]; msy += src[2 * i + 1]; mdx += dst[2 * i]; mdy += dst[2 * i + 1];
  }
  msx /= n; msy /= n; mdx /= n; mdy /= n;
  let a = 0, b = 0, ss = 0;
  for (let i = 0; i < n; i++) {
    const sx = src[2 * i] - msx, sy = src[2 * i + 1] - msy, dx = dst[2 * i] - mdx, dy = dst[2 * i + 1] - mdy;
    a += sx * dx + sy * dy;
    b += sx * dy - sy * dx;
    ss += sx * sx + sy * sy;
  }
  const p = a / ss;
  const q = b / ss;
  return [p, -q, mdx - p * msx + q * msy, q, p, mdy - q * msx - p * msy];
}

/** Root mean square distance between m(src) and dst */
export function residual(m: AffineMatrix, src: number[], dst: number[]): number {
  const n = src.length / 2;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const [x, y] = apply(m, src[2 * i], src[2 * i + 1]);
    sum += (x - dst[2 * i]) ** 2 + (y - dst[2 * i + 1]) ** 2;
  }
  return Math.sqrt(sum / Math.max(1, n));
}

/**
 * Final shape: a rectangle (with the least-squares move-turn-resize as its matrix) unless the
 * affine fits the matched points clearly better or its corners differ visibly.
 */
export function settle(c: Candidate, w: number, h: number): { matrix: AffineMatrix; kind: PlacementKind } {
  if (classify(c.matrix, w, h) === 'rectangle' || c.src.length < 6) {
    return { matrix: c.src.length >= 4 ? fitSimilarity(c.src, c.dst) : nearestSimilarity(c.matrix, w, h).matrix, kind: 'rectangle' };
  }
  const sim = fitSimilarity(c.src, c.dst);
  const affineError = residual(c.matrix, c.src, c.dst);
  const similarityError = residual(sim, c.src, c.dst);
  // Inliers sit within RANSAC_PX working px, so a few px of extra error is noise, not shear
  const px = Math.sqrt(Math.abs(c.matrix[0] * c.matrix[4] - c.matrix[1] * c.matrix[3]));
  if (similarityError <= affineError * 1.5 + 0.5 * px) return { matrix: sim, kind: 'rectangle' };
  return { matrix: c.matrix, kind: 'affine' };
}

interface Attempt {
  best: Candidate | null;
  /** best fit at another location from the leftover matches */
  second: Candidate | null;
  rejected: string | null;
}

/**
 * Match one version of the detail (already warped/shrunk; toDetail maps its pixels back to full
 * resolution detail pixels) against the parent features (fromParent maps working parent pixels to
 * full resolution parent pixels).
 */
function attempt(
  cv: OpenCV,
  detail: Mat,
  toDetail: AffineMatrix,
  parent: Features,
  fromParent: AffineMatrix,
  keepGraphics: boolean,
): Attempt {
  const feats = findFeatures(cv, detail, DETAIL_KEYPOINTS);
  const pairs = matchFeatures(cv, feats, parent, keepGraphics);
  freeFeatures(feats);
  const result: Attempt = { best: null, second: null, rejected: null };
  const fit = fitAffine(cv, pairs);
  if (!fit || fit.n < 6) return result;
  // full detail px -> working version px is the inverse of toDetail
  const back = invert(toDetail);
  const full = (f: Fit) => multiply(fromParent, multiply(f.m, back));
  const why = implausible(fit, full(fit), pairs, detail.cols, detail.rows, parent.width, parent.height);
  if (why) {
    result.rejected = why;
    return result;
  }
  result.best = { matrix: full(fit), n: fit.n, ...inlierPairs(fit, pairs, toDetail, fromParent) };
  const rest = without(pairs, fit.inlier);
  const other = fitAffine(cv, rest);
  if (other && other.n >= 6 && !implausible(other, full(other), rest, detail.cols, detail.rows, parent.width, parent.height)) {
    result.second = { matrix: full(other), n: other.n, ...inlierPairs(other, rest, toDetail, fromParent) };
  }
  return result;
}

export function invert(m: AffineMatrix): AffineMatrix {
  const [a, b, tx, c, d, ty] = m;
  const det = a * d - b * c;
  return [d / det, -b / det, (b * ty - d * tx) / det, -c / det, a / det, (c * tx - a * ty) / det];
}

/** Sheared version of a detail: rotate by angle, squeeze x by tilt (ASIFT). Returns it and its px -> source px map. */
function shear(cv: OpenCV, src: Mat, tilt: number, angle: number): { mat: Mat; toSource: AffineMatrix } {
  const r = (angle * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  let fwd: AffineMatrix = multiply(scaling(1 / tilt, 1), [cos, -sin, 0, sin, cos, 0]);
  const corners = footprint(fwd, src.cols, src.rows);
  const minX = Math.min(...corners.map((p) => p[0]));
  const minY = Math.min(...corners.map((p) => p[1]));
  const w = Math.ceil(Math.max(...corners.map((p) => p[0])) - minX);
  const h = Math.ceil(Math.max(...corners.map((p) => p[1])) - minY);
  fwd = multiply(translation(-minX, -minY), fwd);
  const M = cv.matFromArray(2, 3, cv.CV_64F, fwd);
  const mat = new cv.Mat();
  // Outside the source is mid-gray with no texture, so it gives no keypoints
  cv.warpAffine(src, mat, M, new cv.Size(w, h), cv.INTER_AREA, cv.BORDER_CONSTANT, new cv.Scalar(128));
  M.delete();
  return { mat, toSource: invert(fwd) };
}

function shrink(cv: OpenCV, src: Mat, f: number): Mat {
  const out = new cv.Mat();
  cv.resize(src, out, new cv.Size(Math.max(1, Math.round(src.cols * f)), Math.max(1, Math.round(src.rows * f))), 0, 0, cv.INTER_AREA);
  return out;
}

/**
 * Searches the detail at several sizes (and, if needed, sheared) against one view of the parent.
 * view maps working parent px -> full parent px; detailFull holds the detail at detailScale of full size.
 */
async function search(
  cv: OpenCV,
  detailMat: Mat,
  detailScale: number,
  parentMat: Mat,
  fromParent: AffineMatrix,
  allowShear: boolean,
  progress: (step: string, percent: number) => void,
  percentFrom: number,
  percentTo: number,
): Promise<{ candidates: Candidate[]; rejected: string[] }> {
  const parent = findFeatures(cv, parentMat, PARENT_KEYPOINTS);
  const keepGraphics = graphicShare(parent) > DRAWING_SHARE;
  const candidates: Candidate[] = [];
  const rejected: string[] = [];
  const consider = (a: Attempt) => {
    if (a.best) candidates.push(a.best);
    if (a.second) candidates.push(a.second);
    if (a.rejected) rejected.push(a.rejected);
  };

  // Detail sizes: as read, then halves down to MIN_DETAIL_SIDE
  const levels: Array<{ mat: Mat; f: number }> = [{ mat: detailMat, f: 1 }];
  while (Math.max(levels[levels.length - 1].mat.cols, levels[levels.length - 1].mat.rows) / 2 >= MIN_DETAIL_SIDE) {
    const prev = levels[levels.length - 1];
    levels.push({ mat: shrink(cv, prev.mat, 0.5), f: prev.f * 0.5 });
  }
  const span = percentTo - percentFrom;
  for (let i = 0; i < levels.length; i++) {
    progress('Matching', percentFrom + (span * 0.5 * i) / levels.length);
    const { mat, f } = levels[i];
    consider(attempt(cv, mat, scaling(1 / (f * detailScale)), parent, fromParent, keepGraphics));
    await tick();
  }

  if (allowShear && !candidates.some((c) => c.n >= LOW_INLIERS)) {
    // Sheared tries on the largest size up to 1024 px (cheaper, and enough for the shape)
    const small = levels.filter((l) => Math.max(l.mat.cols, l.mat.rows) <= 1024).slice(0, 1);
    const total = small.length * TILTS.length * TILT_ANGLES.length;
    let done = 0;
    for (const { mat, f } of small) {
      for (const tilt of TILTS) {
        for (const angle of TILT_ANGLES) {
          progress('Trying sheared versions', percentFrom + span * (0.5 + (0.5 * done++) / Math.max(1, total)));
          const s = shear(cv, mat, tilt, angle);
          consider(attempt(cv, s.mat, multiply(scaling(1 / (f * detailScale)), s.toSource), parent, fromParent, keepGraphics));
          s.mat.delete();
          await tick();
        }
      }
    }
  }

  levels.slice(1).forEach((l) => l.mat.delete());
  freeFeatures(parent);
  return { candidates, rejected };
}

/** Lets a worker answer messages (cancel, progress) between tries */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Best candidate, and the best one at a clearly different place */
function rank(candidates: Candidate[], dw: number, dh: number): { best: Candidate | null; runnerUp: Candidate | null } {
  const sorted = [...candidates].sort((a, b) => b.n - a.n);
  const best = sorted[0] ?? null;
  if (!best) return { best: null, runnerUp: null };
  const corners = footprint(best.matrix, dw, dh);
  const diag = Math.hypot(corners[2][0] - corners[0][0], corners[2][1] - corners[0][1]);
  const runnerUp = sorted.slice(1).find((c) => cornerDistance(c.matrix, best.matrix, dw, dh) > 0.25 * diag) ?? null;
  return { best, runnerUp };
}

export async function findPlacement(
  cv: OpenCV,
  detail: ImageSource,
  parent: ImageSource,
  options: MatchOptions = {},
): Promise<PlacementResult> {
  const t0 = Date.now();
  const progress = options.onProgress ?? (() => {});
  const dw = detail.width;
  const dh = detail.height;
  const done = (r: Omit<PlacementResult, 'ms'>): PlacementResult => ({ ...r, ms: Date.now() - t0 });

  progress('Reading images', 2);
  const parentWork = await parent.read({ x: 0, y: 0, width: parent.width, height: parent.height }, WORKING_SIDE);
  const detailWork = await detail.read({ x: 0, y: 0, width: dw, height: dh }, WORKING_SIDE);
  const pf = parentWork.width / parent.width;
  const df = detailWork.width / dw;
  const parentMat = toMat(cv, parentWork);
  const detailMat = toMat(cv, detailWork);

  let found;
  try {
    found = await search(cv, detailMat, df, parentMat, scaling(1 / pf), true, progress, 5, 85);
  } finally {
    parentMat.delete();
  }

  let { best, runnerUp } = rank(found.candidates, dw, dh);
  if (!best || best.n < LOW_INLIERS) {
    detailMat.delete();
    const why = found.rejected.length > 0 && !best ? `no match (${[...new Set(found.rejected)].join(', ')})` : 'no match';
    return done({ status: 'none', matrix: null, kind: null, inliers: best?.n ?? 0, runnerUp: runnerUp?.n ?? 0, reason: why });
  }

  // Refine on a full-resolution crop around the footprint when the parent was shrunk a lot
  let reason = 'matched';
  if (pf < REFINE_BELOW) {
    progress('Refining', 88);
    const corners = footprint(best.matrix, dw, dh);
    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    const pad = 0.2 * Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    const x0 = Math.max(0, Math.floor(Math.min(...xs) - pad));
    const y0 = Math.max(0, Math.floor(Math.min(...ys) - pad));
    const x1 = Math.min(parent.width, Math.ceil(Math.max(...xs) + pad));
    const y1 = Math.min(parent.height, Math.ceil(Math.max(...ys) + pad));
    if (x1 - x0 > 16 && y1 - y0 > 16) {
      const crop = await parent.read({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, WORKING_SIDE);
      const cf = crop.width / (x1 - x0);
      const cropMat = toMat(cv, crop);
      try {
        const refined = await search(cv, detailMat, df, cropMat, multiply(translation(x0, y0), scaling(1 / cf)), false, () => {}, 88, 98);
        const r = rank(refined.candidates, dw, dh).best;
        const diag = Math.hypot(corners[2][0] - corners[0][0], corners[2][1] - corners[0][1]);
        if (r && r.n >= LOW_INLIERS && cornerDistance(r.matrix, best.matrix, dw, dh) < 0.05 * diag) {
          best = r;
          reason = 'matched, refined on full resolution';
        }
      } finally {
        cropMat.delete();
      }
    }
  }
  detailMat.delete();

  const { matrix, kind } = settle(best, dw, dh);
  if (runnerUp && runnerUp.n >= Math.max(LOW_INLIERS, AMBIGUOUS_SHARE * best.n)) {
    return done({ status: 'ambiguous', matrix, kind, inliers: best.n, runnerUp: runnerUp.n, reason: 'another location fits about as well' });
  }
  progress('Done', 100);
  return done({
    status: best.n >= GOOD_INLIERS ? 'placed' : 'low',
    matrix,
    kind,
    inliers: best.n,
    runnerUp: runnerUp?.n ?? 0,
    reason,
  });
}
