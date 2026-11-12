/**
 * Image stitcher: the jobs a stitch worker does, and the messages between the pool
 * (stitchPool.ts) and its workers (stitchWorker.ts in the app; a worker_threads twin in tests).
 *
 * A worker keeps the features of every tile (its own and those other workers made, sent on by
 * the pool), so any worker can compare any pair and do a snap.
 *
 * Design: docs/image-stitcher-design.md
 */

import type { AffineMatrix } from '@/utils/affineTransform';
import type { GrayImage, OpenCV } from '../autoPlace/placementMatch.ts';
import type { Overlap, StitchGroup, StitchLayout } from './stitchLayout.ts';
import { matchPair, snapGroup, tileFeatures, type MatchLevel, type SnapResult, type TileFeatures } from './stitchMatch.ts';

export type StitchJob =
  | { kind: 'features'; tile: number; width: number; height: number; level: MatchLevel }
  | { kind: 'pair'; a: number; b: number; level: MatchLevel }
  | { kind: 'snap'; layout: StitchLayout; moved: StitchGroup; target: StitchGroup; rough: AffineMatrix };

export type StitchJobResult =
  | { kind: 'features'; features: TileFeatures }
  | { kind: 'pair'; overlap: Overlap | null }
  | { kind: 'snap'; snap: SnapResult | null };

export type ToStitchWorker =
  | { type: 'init'; opencvScript: string | null }
  | { type: 'job'; id: number; job: StitchJob }
  /** Features another worker made */
  | { type: 'store'; tile: number; features: TileFeatures }
  /** Answer to a 'read' */
  | { type: 'image'; id: number; image: GrayImage }
  | { type: 'read-error'; id: number; message: string };

export type FromStitchWorker =
  /** The whole tile as a gray copy with its long side at most maxSide */
  | { type: 'read'; id: number; tile: number; maxSide: number }
  | { type: 'done'; id: number; result: StitchJobResult }
  | { type: 'error'; id: number; message: string };

export interface JobRunner {
  run(job: StitchJob): Promise<StitchJobResult>;
  store(tile: number, features: TileFeatures): void;
}

/** read: the whole tile as a gray copy, long side at most maxSide */
export function createJobRunner(cv: OpenCV, read: (tile: number, maxSide: number) => Promise<GrayImage>): JobRunner {
  const stored: Record<MatchLevel, Array<TileFeatures | undefined>> = { quick: [], hard: [] };
  const store = (tile: number, features: TileFeatures) => {
    stored[features.level][tile] = features;
  };
  return {
    store,
    async run(job) {
      if (job.kind === 'features') {
        const features = await tileFeatures(
          cv,
          { width: job.width, height: job.height, read: (_rect, maxSide) => read(job.tile, maxSide) },
          job.level,
        );
        store(job.tile, features);
        return { kind: 'features', features };
      }
      if (job.kind === 'pair') {
        const fa = stored[job.level][job.a];
        const fb = stored[job.level][job.b];
        if (!fa || !fb) throw new Error(`No ${job.level} features for tiles ${job.a} and ${job.b}`);
        return { kind: 'pair', overlap: matchPair(cv, job.a, job.b, fa, fb, job.level === 'hard' ? { hard: true } : {}) };
      }
      // The most detailed features each tile has
      const best = job.layout.tiles.map((_, t) => stored.hard[t] ?? stored.quick[t]);
      return { kind: 'snap', snap: snapGroup(cv, job.layout, job.moved, job.target, job.rough, best) };
    },
  };
}

/**
 * The worker side of the messages, for any kind of worker: give it a way to post and call
 * handle() for every message that arrives.
 */
export function createWorkerSide(
  loadOpenCV: (script: string | null) => Promise<{ cv: OpenCV }>,
  post: (message: FromStitchWorker) => void,
): { handle(message: ToStitchWorker): void } {
  let runner: Promise<JobRunner> | null = null;
  let nextRead = 1;
  const reads = new Map<number, { resolve: (image: GrayImage) => void; reject: (error: Error) => void }>();
  const read = (tile: number, maxSide: number) =>
    new Promise<GrayImage>((resolve, reject) => {
      const id = nextRead++;
      reads.set(id, { resolve, reject });
      post({ type: 'read', id, tile, maxSide });
    });
  // Jobs one at a time, in the order they arrive
  let chain: Promise<void> = Promise.resolve();
  return {
    handle(message) {
      if (message.type === 'init') {
        runner = loadOpenCV(message.opencvScript).then(({ cv }) => createJobRunner(cv, read));
        // A failed start is reported by the first job
        runner.catch(() => undefined);
      } else if (message.type === 'image' || message.type === 'read-error') {
        const waiting = reads.get(message.id);
        reads.delete(message.id);
        if (!waiting) return;
        if (message.type === 'image') waiting.resolve(message.image);
        else waiting.reject(new Error(message.message));
      } else if (message.type === 'store') {
        const { tile, features } = message;
        chain = chain.then(async () => {
          (await runner)?.store(tile, features);
        }).catch(() => undefined);
      } else {
        const { id, job } = message;
        chain = chain.then(async () => {
          try {
            if (!runner) throw new Error('The worker was not started');
            const result = await (await runner).run(job);
            // Nothing is transferred: this worker keeps its own copy of the features it made
            post({ type: 'done', id, result });
          } catch (error) {
            post({ type: 'error', id, message: error instanceof Error ? error.message : String(error) });
          }
        });
      }
    },
  };
}
