/**
 * Image stitcher: the automatic pass spread over several workers.
 *
 * The same plan as stitchTiles (stitch.ts), with the independent jobs (features per tile, one
 * comparison per pair) handed to whichever worker is free: quick features, every pair, layout;
 * then, only if tiles are left outside the largest group, harder features and the pairs not yet
 * in one group, and the layout again. The layout itself is solved here (it takes milliseconds).
 *
 * The workers stay alive after the run, holding the features, for snaps on the review screen;
 * close() ends them.
 *
 * Workers come from a factory, so the pool runs with Web Workers in the app and with
 * worker_threads in the Node test (npm run test:stitch-pool).
 *
 * Design: docs/image-stitcher-design.md
 */

import type { AffineMatrix } from '@/utils/affineTransform';
import type { GrayImage } from '../autoPlace/placementMatch.ts';
import { solveLayout, type Overlap, type StitchGroup, type StitchLayout, type StitchTile } from './stitchLayout.ts';
import { hasGraphics, type MatchLevel, type SnapResult, type TileFeatures } from './stitchMatch.ts';
import { hardPairs, quickPairs, unplacedTiles, type StitchProgress } from './stitch.ts';
import type { FromStitchWorker, StitchJob, StitchJobResult, ToStitchWorker } from './stitchJobs.ts';

export interface StitchWorkerLike {
  postMessage(message: ToStitchWorker): void;
  /** Set by the pool */
  onmessage: ((message: FromStitchWorker) => void) | null;
  /** Set by the pool: the worker died or could not start */
  onerror: ((message: string) => void) | null;
  terminate(): void;
}

export interface PoolDeps {
  createWorker(): StitchWorkerLike;
  /** The whole tile as a gray copy, long side at most maxSide */
  read(tile: number, maxSide: number): Promise<GrayImage>;
  /** How many workers (at least 1) */
  workers: number;
  /** OpenCV.js source for the workers, or null to let them fetch it */
  opencvScript: string | null;
}

export interface PoolOptions {
  onProgress?: (progress: StitchProgress) => void;
  /** false: never run the harder pass */
  hardPass?: boolean;
}

export interface PoolResult {
  /** Null when cancelled */
  layout: StitchLayout | null;
  ranHardPass: boolean;
  /** Per tile: burned-in graphics (a scale bar, a label) were seen */
  graphics: boolean[];
}

export interface StitchRun {
  done: Promise<PoolResult>;
  /** Stops everything; done resolves with no layout. The workers are ended. */
  cancel(): void;
  /** Ends the harder pass early; done resolves with what the quick pass found */
  skipHard(): void;
  /** The exact fit of a group dropped roughly in place (stitchMatch.ts snapGroup), in a worker */
  snap(layout: StitchLayout, moved: StitchGroup, target: StitchGroup, rough: AffineMatrix): Promise<SnapResult | null>;
  /** Ends the workers */
  close(): void;
}

/**
 * Making harder features takes a few hundred MB of working memory, which a worker never gives
 * back. Only the first workers of the pool make them, so only their memory grows; comparisons
 * use every worker.
 */
export const HARD_FEATURES_AT_ONCE = 2;

/**
 * Workers to use: two processors are left free, a worker needs about 2 GB of the computer's
 * memory to itself (measured 2026-11-12: about 200 MB per worker, 400 MB or more for the two
 * that make harder features), at most six, at least one.
 */
export function workerCount(processors: number, memoryGb: number = Infinity): number {
  return Math.max(1, Math.min(6, Math.floor(processors) - 2, Math.floor(memoryGb / 2)));
}

class Stopped extends Error {}

interface Waiting {
  job: StitchJob;
  resolve: (result: StitchJobResult) => void;
  reject: (error: Error) => void;
}

export function startStitch(tiles: StitchTile[], deps: PoolDeps, options: PoolOptions = {}): StitchRun {
  const report = options.onProgress ?? (() => undefined);
  let closed = false;
  let cancelled = false;
  let skipping = false;

  const workers = Array.from({ length: Math.max(1, deps.workers) }, () => deps.createWorker());
  const queue: Waiting[] = [];
  const working = new Map<StitchWorkerLike, { id: number; waiting: Waiting }>();
  let nextId = 1;
  let failure: Error | null = null;

  const isHardFeatures = (job: StitchJob) => job.kind === 'features' && job.level === 'hard';

  const pump = () => {
    if (closed) return;
    for (let k = 0; k < workers.length; k++) {
      const worker = workers[k];
      if (working.has(worker)) continue;
      const at = queue.findIndex((w) => !isHardFeatures(w.job) || k < HARD_FEATURES_AT_ONCE);
      if (at < 0) continue;
      const [waiting] = queue.splice(at, 1);
      const id = nextId++;
      working.set(worker, { id, waiting });
      worker.postMessage({ type: 'job', id, job: waiting.job });
    }
  };

  const stopAll = (error: Error) => {
    if (closed) return;
    closed = true;
    for (const worker of workers) worker.terminate();
    for (const w of queue.splice(0)) w.reject(error);
    for (const w of working.values()) w.waiting.reject(error);
    working.clear();
  };

  for (const worker of workers) {
    worker.onmessage = (message) => {
      if (closed) return;
      if (message.type === 'read') {
        deps.read(message.tile, message.maxSide).then(
          (image) => {
            if (!closed) worker.postMessage({ type: 'image', id: message.id, image });
          },
          (error: unknown) => {
            if (!closed) worker.postMessage({ type: 'read-error', id: message.id, message: error instanceof Error ? error.message : String(error) });
          },
        );
        return;
      }
      const current = working.get(worker);
      if (!current || current.id !== message.id) return;
      working.delete(worker);
      if (message.type === 'done') current.waiting.resolve(message.result);
      else current.waiting.reject(new Error(message.message));
      pump();
    };
    worker.onerror = (message) => {
      failure = new Error(message || 'A stitch worker failed');
      stopAll(failure);
    };
    worker.postMessage({ type: 'init', opencvScript: deps.opencvScript });
  }

  const submit = (job: StitchJob) =>
    new Promise<StitchJobResult>((resolve, reject) => {
      if (closed) {
        reject(failure ?? new Stopped());
        return;
      }
      queue.push({ job, resolve, reject });
      pump();
    });

  const graphics: boolean[] = tiles.map(() => false);

  /** Features of every tile at one level, made by whichever worker is free and passed on to the others */
  const makeFeatures = async (level: MatchLevel, onOne: () => void) => {
    await Promise.all(tiles.map(async (tile, index) => {
      const result = await submit({ kind: 'features', tile: index, width: tile.width, height: tile.height, level });
      if (result.kind !== 'features') throw new Error('Unexpected answer to a features job');
      const features: TileFeatures = result.features;
      if (hasGraphics(features)) graphics[index] = true;
      if (!closed) {
        // Every worker keeps every tile's features (the one that made them already has them)
        for (const worker of workers) worker.postMessage({ type: 'store', tile: index, features });
      }
      onOne();
    }));
  };

  const comparePairs = async (pairs: Array<[number, number]>, level: MatchLevel, onOne: (found: Overlap | null) => void) => {
    await Promise.all(pairs.map(async ([a, b]) => {
      const result = await submit({ kind: 'pair', a, b, level });
      if (result.kind !== 'pair') throw new Error('Unexpected answer to a pair job');
      onOne(result.overlap);
    }));
  };

  const run = async (): Promise<PoolResult> => {
    const overlaps: Overlap[] = [];
    let done = 0;
    report({ stage: 'features', done: 0, total: tiles.length, overlaps: 0 });
    await makeFeatures('quick', () => report({ stage: 'features', done: ++done, total: tiles.length, overlaps: 0 }));

    const pairs = quickPairs(tiles.length);
    done = 0;
    report({ stage: 'pairs', done: 0, total: pairs.length, overlaps: 0 });
    await comparePairs(pairs, 'quick', (found) => {
      if (found) overlaps.push(found);
      report({ stage: 'pairs', done: ++done, total: pairs.length, overlaps: overlaps.length });
    });

    report({ stage: 'layout', done: 0, total: 1, overlaps: overlaps.length });
    // Workers answer in any order: sort, so the same images always give the same layout
    overlaps.sort((x, y) => x.a - y.a || x.b - y.b);
    const quick = solveLayout(tiles, overlaps);
    const again = hardPairs(quick);
    if (again.length === 0 || options.hardPass === false || skipping) return { layout: quick, ranHardPass: false, graphics };

    const unplaced = unplacedTiles(quick).length;
    const more: Overlap[] = [];
    try {
      done = 0;
      report({ stage: 'hard-features', done: 0, total: tiles.length, overlaps: overlaps.length, unplaced });
      await makeFeatures('hard', () => report({ stage: 'hard-features', done: ++done, total: tiles.length, overlaps: overlaps.length, unplaced }));
      done = 0;
      report({ stage: 'hard-pairs', done: 0, total: again.length, overlaps: overlaps.length, unplaced });
      await comparePairs(again, 'hard', (found) => {
        if (found) more.push(found);
        report({ stage: 'hard-pairs', done: ++done, total: again.length, overlaps: overlaps.length + more.length, unplaced });
      });
    } catch (error) {
      if (skipping && !cancelled && !failure) return { layout: quick, ranHardPass: false, graphics };
      throw error;
    }
    if (skipping) return { layout: quick, ranHardPass: false, graphics };
    report({ stage: 'layout', done: 0, total: 1, overlaps: overlaps.length + more.length });
    more.sort((x, y) => x.a - y.a || x.b - y.b);
    return { layout: solveLayout(tiles, [...quick.overlaps, ...more]), ranHardPass: true, graphics };
  };

  const done = run().catch((error: unknown): PoolResult => {
    if (cancelled) return { layout: null, ranHardPass: false, graphics };
    throw error;
  });

  return {
    done,
    cancel() {
      cancelled = true;
      stopAll(new Stopped());
    },
    skipHard() {
      if (skipping || closed) return;
      skipping = true;
      // Jobs of the harder pass still waiting are not started; those running finish unheard
      const isHard = (job: StitchJob) => job.kind !== 'snap' && job.level === 'hard';
      for (let i = queue.length - 1; i >= 0; i--) {
        if (isHard(queue[i].job)) queue.splice(i, 1)[0].reject(new Stopped());
      }
      for (const w of working.values()) if (isHard(w.waiting.job)) w.waiting.reject(new Stopped());
    },
    async snap(layout, moved, target, rough) {
      const result = await submit({ kind: 'snap', layout, moved, target, rough });
      return result.kind === 'snap' ? result.snap : null;
    },
    close() {
      stopAll(new Stopped());
    },
  };
}
