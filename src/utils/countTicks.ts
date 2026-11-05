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

/**
 * Labels for grain size axis ticks given in µm: below 1000 µm in µm, from 1000 µm in mm.
 * Each unit gets the fewest decimals (µm from 0, mm from 1, at most 4) that keep neighbouring
 * ticks apart, so a narrow range such as 1.09-1.17 mm does not read 1.1mm 1.1mm 1.1mm.
 */
export function sizeTickLabels(valuesMicrons: number[]): string[] {
  const inMm = valuesMicrons.map((v) => v >= 1000);
  const decimalsFor = (mm: boolean): number => {
    const group = valuesMicrons.filter((_, i) => inMm[i] === mm).map((v) => (mm ? v / 1000 : v));
    for (let d = mm ? 1 : 0; d < 4; d++) {
      const labels = group.map((v) => v.toFixed(d));
      const apart = labels.every((l, i) => i === 0 || l !== labels[i - 1] || group[i] === group[i - 1]);
      if (apart) return d;
    }
    return 4;
  };
  const dUm = decimalsFor(false);
  const dMm = decimalsFor(true);
  return valuesMicrons.map((v, i) => (inMm[i] ? `${(v / 1000).toFixed(dMm)}mm` : `${v.toFixed(dUm)}µm`));
}

/**
 * Round tick positions for a linear axis from min to max: a step of 1, 2 or 5 x 10^k giving
 * about `target` intervals, ticks at the multiples of the step that fall inside the range.
 */
export function niceTicks(min: number, max: number, target: number): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / Math.max(1, target);
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? 10 * magnitude;
  const ticks: number[] = [];
  const eps = step * 1e-9;
  for (let k = Math.ceil((min - eps) / step); k * step <= max + eps; k++) {
    // Round away floating-point noise (0.30000000000000004)
    ticks.push(Number((k * step).toPrecision(12)));
  }
  return ticks;
}
