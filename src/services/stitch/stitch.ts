/**
 * Image stitcher: the automatic pass, start to finish, on one thread.
 *
 * Quick pass: features of every tile, every pair compared, layout. Harder pass (only when the
 * quick pass leaves tiles outside the largest group): features at a larger size, the pairs that
 * are not yet in one group compared again, layout again.
 *
 * The app runs the same steps spread over workers (features and pairs are independent jobs);
 * quickPairs and hardPairs say which pairs to compare, so both run the same plan.
 *
 * Design: docs/image-stitcher-design.md
 */

import type { ImageSource, OpenCV } from '../autoPlace/placementMatch.ts';
import { solveLayout, type Overlap, type StitchLayout, type StitchTile } from './stitchLayout.ts';
import { matchPair, tileFeatures, type TileFeatures } from './stitchMatch.ts';

export type StitchStage = 'features' | 'pairs' | 'layout' | 'hard-features' | 'hard-pairs';

export interface StitchProgress {
  stage: StitchStage;
  done: number;
  total: number;
  /** Overlaps found so far */
  overlaps: number;
  /** Tiles the harder pass is looking at (hard stages only) */
  unplaced?: number;
}

export interface StitchInput {
  id: string;
  source: ImageSource;
}

export interface StitchOptions {
  onProgress?: (progress: StitchProgress) => void;
  /** Checked between jobs; true stops the run */
  cancelled?: () => boolean;
  /** Checked between jobs of the harder pass; true ends it early with what the quick pass found */
  skipHard?: () => boolean;
  /** false: never run the harder pass */
  hardPass?: boolean;
}

export interface StitchResult {
  /** Null when cancelled */
  layout: StitchLayout | null;
  /** Per tile, the most detailed features made (for snaps) */
  features: TileFeatures[];
  ranHardPass: boolean;
}

/** More images than this are refused (design decision 18) */
export const MAX_IMAGES = 200;
/** From this many images on, a time estimate is shown before starting */
export const ESTIMATE_FROM = 60;

/**
 * Rough time of the quick pass, in seconds, for the estimate shown before starting. Measured
 * 2026-11-12 on an Apple M-series Mac: 0.17 s per image and per pair on one worker, close to
 * evenly divided by the workers; the figures here leave room for slower computers.
 */
export function estimateSeconds(images: number, workers: number): number {
  const pairs = (images * (images - 1)) / 2;
  return (images * 0.3 + pairs * 0.25) / Math.max(1, workers);
}

/** Every pair of n tiles */
export function quickPairs(n: number): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([i, j]);
  return pairs;
}

/** Tiles outside the largest group */
export function unplacedTiles(layout: StitchLayout): number[] {
  return layout.groups.slice(1).flatMap((g) => g.tiles);
}

/** The pairs worth a harder look: those not yet in one group. Empty when all tiles are in one. */
export function hardPairs(layout: StitchLayout): Array<[number, number]> {
  const groupOf = new Map<number, number>();
  layout.groups.forEach((g, k) => g.tiles.forEach((t) => groupOf.set(t, k)));
  return quickPairs(layout.tiles.length).filter(([i, j]) => groupOf.get(i) !== groupOf.get(j));
}

/** Lets a waiting cancel (a worker message) be seen */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function stitchTiles(cv: OpenCV, inputs: StitchInput[], options: StitchOptions = {}): Promise<StitchResult> {
  const report = options.onProgress ?? (() => undefined);
  const cancelled = options.cancelled ?? (() => false);
  const tiles: StitchTile[] = inputs.map((t) => ({ id: t.id, width: t.source.width, height: t.source.height }));
  const features: TileFeatures[] = [];
  const stopped: StitchResult = { layout: null, features, ranHardPass: false };

  for (let i = 0; i < inputs.length; i++) {
    if (cancelled()) return stopped;
    report({ stage: 'features', done: i, total: inputs.length, overlaps: 0 });
    features.push(await tileFeatures(cv, inputs[i].source, 'quick'));
  }

  const overlaps: Overlap[] = [];
  const pairs = quickPairs(inputs.length);
  for (let k = 0; k < pairs.length; k++) {
    if (k % 8 === 0) {
      await tick();
      if (cancelled()) return stopped;
      report({ stage: 'pairs', done: k, total: pairs.length, overlaps: overlaps.length });
    }
    const [i, j] = pairs[k];
    const o = matchPair(cv, i, j, features[i], features[j]);
    if (o) overlaps.push(o);
  }

  report({ stage: 'layout', done: 0, total: 1, overlaps: overlaps.length });
  let layout = solveLayout(tiles, overlaps);
  const again = hardPairs(layout);
  if (again.length === 0 || options.hardPass === false) return { layout, features, ranHardPass: false };

  // Harder pass
  const skip = options.skipHard ?? (() => false);
  const unplaced = unplacedTiles(layout).length;
  const hard: TileFeatures[] = [];
  for (let i = 0; i < inputs.length; i++) {
    await tick();
    if (cancelled()) return stopped;
    if (skip()) return { layout, features, ranHardPass: false };
    report({ stage: 'hard-features', done: i, total: inputs.length, overlaps: overlaps.length, unplaced });
    hard.push(await tileFeatures(cv, inputs[i].source, 'hard'));
  }
  const more: Overlap[] = [];
  for (let k = 0; k < again.length; k++) {
    if (k % 2 === 0) {
      await tick();
      if (cancelled()) return stopped;
      if (skip()) return { layout, features: hard, ranHardPass: false };
      report({ stage: 'hard-pairs', done: k, total: again.length, overlaps: overlaps.length + more.length, unplaced });
    }
    const [i, j] = again[k];
    const o = matchPair(cv, i, j, hard[i], hard[j], { hard: true });
    if (o) more.push(o);
  }
  report({ stage: 'layout', done: 0, total: 1, overlaps: overlaps.length + more.length });
  // The overlaps the quick layout kept (its false ones stay dropped), plus the new ones
  layout = solveLayout(tiles, [...layout.overlaps, ...more]);
  return { layout, features: hard, ranHardPass: true };
}
