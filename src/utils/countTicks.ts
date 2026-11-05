/**
 * Whole-number steps for chart axes that show counts (grain size histogram, rose diagram rings).
 */

/** A step of 1, 2 or 5 x 10^k (at least 1) giving about `intervals` steps up to maxCount */
export function countStep(maxCount: number, intervals: number): number {
  const raw = Math.max(1, maxCount) / Math.max(1, intervals);
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  return Math.max(1, [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? 10 * magnitude);
}

/** Histogram count axis: whole-number ticks, the top one step above the largest count */
export function countAxis(maxCount: number): { yMax: number; yStep: number } {
  const yStep = countStep(maxCount, 5);
  return { yMax: yStep * (Math.floor(Math.max(1, maxCount) / yStep) + 1), yStep };
}

/** Rose diagram rings: whole-number counts, the outer ring at or just above the largest count */
export function roseRings(maxCount: number): number[] {
  const step = countStep(maxCount, 4);
  const top = step * Math.ceil(Math.max(1, maxCount) / step);
  const rings: number[] = [];
  for (let c = step; c <= top; c += step) rings.push(c);
  return rings;
}

/** Equal-area rose: a petal's AREA is proportional to its count, so its radius goes with sqrt */
export function equalAreaRadius(count: number, outerCount: number, outerRadius: number): number {
  if (outerCount <= 0 || count <= 0) return 0;
  return Math.sqrt(count / outerCount) * outerRadius;
}
