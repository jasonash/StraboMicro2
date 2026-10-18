/**
 * Grain Spot (docs/click-a-grain-design.md): turns the model's mask for a
 * click into a clean polygon. The model (SAM 2.1) answers a click with three
 * candidate masks as low-resolution logits over its 1024x1024 input, which is
 * the view on screen stretched to a square. Here: sample the logits at each
 * view pixel, keep only the piece that contains the click, fill its holes,
 * trace its outline (marching squares, so edges are smooth rather than
 * stair-stepped) and simplify it.
 *
 * Pure (no DOM, no model), so it runs in the worker and in Node tests
 * (npm run test:grain-outline). Coordinates are view pixels: (0, 0) is the
 * top-left corner of the view, a pixel's center is at (x + 0.5, y + 0.5).
 */

/** A binary grid: 1 = inside */
export interface MaskGrid {
  data: Uint8Array;
  width: number;
  height: number;
}

export type Point = [number, number];

export interface GrainOutline {
  /** Closed ring, first point not repeated, in view pixels */
  points: Point[];
  /** Pixels inside (after filling holes) */
  area: number;
  /** The grain reaches the edge of the view, so part of it is probably off screen */
  touchesEdge: boolean;
  /** Which of the model's candidate masks was used */
  maskIndex: number;
}

export interface OutlineOptions {
  /** Douglas-Peucker tolerance in view pixels */
  tolerance?: number;
  /** Smaller pieces are not a grain (a speck under the cursor) */
  minArea?: number;
  /** Candidates within this much of the best predicted IoU count as equally good; the smallest wins (a grain, not a cluster) */
  iouMargin?: number;
  /** How far from the click to look for the mask when the click itself is just outside it */
  searchRadius?: number;
}

const DEFAULTS: Required<OutlineOptions> = { tolerance: 0.8, minArea: 16, iouMargin: 0.05, searchRadius: 3 };

/**
 * Sample one candidate's logits (lw x lh over the model's square input) at
 * every view pixel, bilinear; inside where the logit is above 0.
 * @param offset start of this candidate in `logits`
 */
export function maskFromLogits(logits: Float32Array, offset: number, lw: number, lh: number, viewW: number, viewH: number): MaskGrid {
  const data = new Uint8Array(viewW * viewH);
  const sx = lw / viewW;
  const sy = lh / viewH;
  for (let y = 0; y < viewH; y++) {
    const v = Math.min(Math.max((y + 0.5) * sy - 0.5, 0), lh - 1);
    const y0 = Math.floor(v);
    const y1 = Math.min(y0 + 1, lh - 1);
    const fy = v - y0;
    const row0 = offset + y0 * lw;
    const row1 = offset + y1 * lw;
    for (let x = 0; x < viewW; x++) {
      const u = Math.min(Math.max((x + 0.5) * sx - 0.5, 0), lw - 1);
      const x0 = Math.floor(u);
      const x1 = Math.min(x0 + 1, lw - 1);
      const fx = u - x0;
      const top = logits[row0 + x0] * (1 - fx) + logits[row0 + x1] * fx;
      const bottom = logits[row1 + x0] * (1 - fx) + logits[row1 + x1] * fx;
      if (top * (1 - fy) + bottom * fy > 0) data[y * viewW + x] = 1;
    }
  }
  return { data, width: viewW, height: viewH };
}

/** The pixel nearest (x, y) that is inside, within radius, or null */
function nearestInside(mask: MaskGrid, x: number, y: number, radius: number): Point | null {
  const { data, width, height } = mask;
  let best: Point | null = null;
  let bestD = Infinity;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || py < 0 || px >= width || py >= height || !data[py * width + px]) continue;
      const d = dx * dx + dy * dy;
      if (d <= radius * radius && d < bestD) {
        bestD = d;
        best = [px, py];
      }
    }
  }
  return best;
}

/**
 * The 4-connected piece of the mask containing pixel (x, y) (or the nearest
 * inside pixel within searchRadius), or null when there is none.
 */
export function componentAt(mask: MaskGrid, x: number, y: number, searchRadius = DEFAULTS.searchRadius): MaskGrid | null {
  const { data, width, height } = mask;
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const start = nearestInside(mask, cx, cy, searchRadius);
  if (!start) return null;
  const out = new Uint8Array(width * height);
  const stack = [start[1] * width + start[0]];
  out[stack[0]] = 1;
  while (stack.length > 0) {
    const i = stack.pop() as number;
    const px = i % width;
    const py = (i - px) / width;
    if (px > 0 && data[i - 1] && !out[i - 1]) { out[i - 1] = 1; stack.push(i - 1); }
    if (px < width - 1 && data[i + 1] && !out[i + 1]) { out[i + 1] = 1; stack.push(i + 1); }
    if (py > 0 && data[i - width] && !out[i - width]) { out[i - width] = 1; stack.push(i - width); }
    if (py < height - 1 && data[i + width] && !out[i + width]) { out[i + width] = 1; stack.push(i + width); }
  }
  return { data: out, width, height };
}

/** Fill every hole: outside pixels not reachable from the border become inside (in place) */
export function fillHoles(mask: MaskGrid): MaskGrid {
  const { data, width, height } = mask;
  const reached = new Uint8Array(width * height);
  const stack: number[] = [];
  const seed = (i: number) => {
    if (!data[i] && !reached[i]) { reached[i] = 1; stack.push(i); }
  };
  for (let x = 0; x < width; x++) { seed(x); seed((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { seed(y * width); seed(y * width + width - 1); }
  while (stack.length > 0) {
    const i = stack.pop() as number;
    const px = i % width;
    const py = (i - px) / width;
    if (px > 0) seed(i - 1);
    if (px < width - 1) seed(i + 1);
    if (py > 0) seed(i - width);
    if (py < height - 1) seed(i + width);
  }
  for (let i = 0; i < data.length; i++) if (!reached[i]) data[i] = 1;
  return mask;
}

export function maskArea(mask: MaskGrid): number {
  let n = 0;
  for (let i = 0; i < mask.data.length; i++) n += mask.data[i];
  return n;
}

/** Does any inside pixel lie on the view's border? */
export function touchesEdge(mask: MaskGrid): boolean {
  const { data, width, height } = mask;
  for (let x = 0; x < width; x++) if (data[x] || data[(height - 1) * width + x]) return true;
  for (let y = 0; y < height; y++) if (data[y * width] || data[y * width + width - 1]) return true;
  return false;
}

/**
 * Outline of the mask by marching squares over pixel centers: one ring per
 * boundary loop, the largest returned. Edges cut corners at 45 degrees
 * instead of following pixel stairs. Pixels touching only at a corner are
 * kept apart (the same rule as componentAt's 4-connectivity).
 */
export function traceOutline(mask: MaskGrid): Point[] {
  const { data, width, height } = mask;
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < width && y < height ? data[y * width + x] : 0);
  // Bounding box of the inside, so cells far from the grain are not visited
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[y * width + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return [];

  // Corners clockwise: TL, TR, BR, BL; the edge after each: T, R, B, L.
  // A cell's segments run from the edge before a run of inside corners to
  // the edge after it, which keeps the inside on the same side throughout.
  // Points are stored doubled (all are multiples of 0.5) as integer keys.
  const next = new Map<number, number>();
  const KEY = 1 << 15;
  const key = (x2: number, y2: number) => (x2 + 4) * KEY + (y2 + 4);
  for (let y = minY - 1; y <= maxY; y++) {
    for (let x = minX - 1; x <= maxX; x++) {
      const inside = [at(x, y), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1)];
      const count = inside[0] + inside[1] + inside[2] + inside[3];
      if (count === 0 || count === 4) continue;
      // Edge midpoints (doubled pixel-index coordinates): T, R, B, L
      const edges: Point[] = [[2 * x + 1, 2 * y], [2 * x + 2, 2 * y + 1], [2 * x + 1, 2 * y + 2], [2 * x, 2 * y + 1]];
      for (let i = 0; i < 4; i++) {
        if (!inside[i] || inside[(i + 3) % 4]) continue;
        let j = i;
        while (inside[(j + 1) % 4]) j = (j + 1) % 4;
        const from = edges[(i + 3) % 4];
        const to = edges[j];
        next.set(key(from[0], from[1]), key(to[0], to[1]));
      }
    }
  }

  // Link segments into loops; keep the one enclosing the most area
  let best: Point[] = [];
  let bestArea = 0;
  const seen = new Set<number>();
  for (const startKey of next.keys()) {
    if (seen.has(startKey)) continue;
    const ring: Point[] = [];
    let k = startKey;
    while (!seen.has(k)) {
      seen.add(k);
      const x2 = Math.floor(k / KEY) - 4;
      const y2 = (k % KEY) - 4;
      // Doubled pixel-index coordinates -> view pixels (pixel centers at +0.5)
      ring.push([x2 / 2 + 0.5, y2 / 2 + 0.5]);
      const n = next.get(k);
      if (n === undefined) break;
      k = n;
    }
    const a = Math.abs(ringArea(ring));
    if (a > bestArea) {
      bestArea = a;
      best = ring;
    }
  }
  return best;
}

/** Signed shoelace area of a closed ring */
export function ringArea(ring: Point[]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
}

function simplifyOpen(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop() as [number, number];
    let maxD = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = perpendicularDistance(points[i], points[first], points[last]);
      if (d > maxD) { maxD = d; index = i; }
    }
    if (index >= 0 && maxD > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Douglas-Peucker on a closed ring: split at the point farthest from the first, simplify both halves */
export function simplifyRing(ring: Point[], tolerance: number): Point[] {
  if (ring.length <= 4) return ring.slice();
  let far = 0;
  let farD = -1;
  for (let i = 1; i < ring.length; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > farD) { farD = d; far = i; }
  }
  const a = simplifyOpen(ring.slice(0, far + 1), tolerance);
  const b = simplifyOpen([...ring.slice(far), ring[0]], tolerance);
  const out = [...a.slice(0, -1), ...b.slice(0, -1)];
  return out.length >= 3 ? out : ring.slice();
}

/**
 * The grain outline for a click from the model's answer.
 * @param logits candidates * lh * lw values (pred_masks of one point batch)
 * @param iou predicted IoU per candidate
 * @param click view pixel that was clicked
 */
export function outlineFromLogits(
  logits: Float32Array, candidates: number, lw: number, lh: number, iou: ArrayLike<number>,
  viewW: number, viewH: number, click: Point, options: OutlineOptions = {},
): GrainOutline | null {
  const o = { ...DEFAULTS, ...options };
  let bestIou = -Infinity;
  for (let k = 0; k < candidates; k++) bestIou = Math.max(bestIou, iou[k]);
  let chosen: { comp: MaskGrid; area: number; index: number } | null = null;
  for (let k = 0; k < candidates; k++) {
    if (iou[k] < bestIou - o.iouMargin) continue;
    const mask = maskFromLogits(logits, k * lw * lh, lw, lh, viewW, viewH);
    const comp = componentAt(mask, click[0], click[1], o.searchRadius);
    if (!comp) continue;
    fillHoles(comp);
    const area = maskArea(comp);
    if (area < o.minArea) continue;
    if (!chosen || area < chosen.area) chosen = { comp, area, index: k };
  }
  if (!chosen) return null;
  const ring = simplifyRing(traceOutline(chosen.comp), o.tolerance);
  if (ring.length < 3) return null;
  return { points: ring, area: chosen.area, touchesEdge: touchesEdge(chosen.comp), maskIndex: chosen.index };
}
