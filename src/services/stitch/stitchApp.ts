/**
 * Image stitcher: the renderer's side of a stitch session. Ties together the main process
 * (window.api.stitch: preview copies, the mosaic build) and the worker pool (stitchPool.ts).
 *
 * A session is one run of the wizard: prepare the chosen images, fit them together, build.
 *
 * Design: docs/image-stitcher-design.md
 */

import type { GrayImage } from '../autoPlace/placementMatch';
import { mosaicFrame, type MosaicFrame, type StitchGroup, type StitchLayout } from './stitchLayout';
import { startStitch, workerCount, type PoolOptions, type StitchRun, type StitchWorkerLike } from './stitchPool';
import type { FromStitchWorker } from './stitchJobs';

/** One chosen image after "Reading images" */
export interface PreparedImage {
  /** Its number within the session (names its preview copy) */
  index: number;
  /** The original file */
  path: string;
  /** Full size in pixels */
  width: number;
  height: number;
  previewPath: string;
  previewWidth: number;
  previewHeight: number;
  /** Small picture for the list (data URL) */
  thumbnail: string;
}

export type PrepareOutcome = { ok: true; image: PreparedImage } | { ok: false; path: string; error: string };

/** Long side the saved mosaic is limited to, like every imported image (imageConverter MAX_IMAGE_DIMENSION) */
export const MOSAIC_MAX_SIDE = 10000;

/** Preview copies made at once: a TIFF is decoded whole in memory, so not many */
const PREPARE_AT_ONCE = 2;

export function newSession(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function api() {
  const a = window.api;
  if (!a) throw new Error('Not available outside the app');
  return a;
}

/**
 * Preview copies of chosen images, a few at a time. An image that cannot be used comes back with
 * the reason; the others go on. firstIndex: the session number of paths[0] (a session's images
 * are numbered in the order they were added, also over several calls).
 */
export async function prepareImages(
  session: string,
  paths: string[],
  options: {
    firstIndex?: number;
    /** Called as each image finishes, in any order; position is its place in paths */
    onOne?: (outcome: PrepareOutcome, position: number) => void;
    cancelled?: () => boolean;
  } = {},
): Promise<PrepareOutcome[]> {
  const firstIndex = options.firstIndex ?? 0;
  const cancelled = options.cancelled ?? (() => false);
  const out: PrepareOutcome[] = paths.map((path) => ({ ok: false, path, error: 'Not read' }));
  let next = 0;
  const work = async () => {
    for (;;) {
      const position = next++;
      if (position >= paths.length || cancelled()) return;
      const path = paths[position];
      const index = firstIndex + position;
      let outcome: PrepareOutcome;
      try {
        const r = await api().stitch.prepare(session, index, path);
        outcome = r.ok
          ? { ok: true, image: { index, path, width: r.width, height: r.height, previewPath: r.previewPath, previewWidth: r.previewWidth, previewHeight: r.previewHeight, thumbnail: r.thumbnail } }
          : { ok: false, path, error: r.error };
      } catch (error) {
        outcome = { ok: false, path, error: error instanceof Error ? error.message : String(error) };
      }
      out[position] = outcome;
      options.onOne?.(outcome, position);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PREPARE_AT_ONCE, paths.length) }, work));
  return out;
}

function webWorker(): StitchWorkerLike {
  const worker = new Worker(new URL('./stitchWorker.ts', import.meta.url), { type: 'module' });
  const like: StitchWorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage: (message) => worker.postMessage(message),
    terminate: () => worker.terminate(),
  };
  worker.onmessage = (event: MessageEvent<FromStitchWorker>) => like.onmessage?.(event.data);
  worker.onerror = (event) => like.onerror?.(event.message || 'A stitch worker failed');
  return like;
}

/** The automatic pass over prepared images, in workers. Tile n of the layout is images[n]. */
export async function fitImagesTogether(images: PreparedImage[], options: PoolOptions = {}): Promise<StitchRun> {
  const a = api();
  const [machine, script] = await Promise.all([
    a.stitch.machine(),
    a.loadOpencvScript().then(
      (text) => text || null,
      (error: unknown) => {
        console.warn('[Stitch] OpenCV script not loaded through IPC; the workers will fetch it', error);
        return null;
      },
    ),
  ]);
  // No more workers than pairs to compare
  const pairs = (images.length * (images.length - 1)) / 2;
  const workers = Math.max(1, Math.min(workerCount(machine.processors, machine.memoryGb), pairs));
  console.log(`[Stitch] ${images.length} images, ${workers} worker(s)`);
  return startStitch(
    images.map((image) => ({ id: image.path, width: image.width, height: image.height })),
    {
      createWorker: webWorker,
      workers,
      opencvScript: script,
      read: (tile: number, maxSide: number): Promise<GrayImage> => {
        const image = images[tile];
        return a.readGrayRegion(image.previewPath, { x: 0, y: 0, width: image.previewWidth, height: image.previewHeight }, maxSide);
      },
    },
    options,
  );
}

export interface BuildChoices {
  /** Tiles not to include */
  leftOut?: ReadonlySet<number>;
  fill?: [number, number, number];
  crop?: { left: number; top: number; width: number; height: number };
}

/** Size of the mosaic of one group, full and as it will be saved */
export function frameOf(layout: StitchLayout, group: StitchGroup, leftOut?: ReadonlySet<number>): MosaicFrame | null {
  return mosaicFrame(layout, group, MOSAIC_MAX_SIDE, leftOut);
}

/** Builds the mosaic of one group in the main process; progress in rows */
export async function buildGroup(
  session: string,
  images: PreparedImage[],
  layout: StitchLayout,
  group: StitchGroup,
  choices: BuildChoices = {},
  onProgress?: (done: number, total: number) => void,
): Promise<{ success: boolean; cancelled?: boolean; error?: string; path?: string; width?: number; height?: number; frame?: MosaicFrame }> {
  const frame = frameOf(layout, group, choices.leftOut);
  if (!frame) return { success: false, error: 'No images to build a mosaic from' };
  const a = api();
  const stop = a.stitch.onBuildProgress((p) => {
    if (p.session === session) onProgress?.(p.done, p.total);
  });
  try {
    const result = await a.stitch.build(session, {
      tiles: Object.entries(frame.toMosaic).map(([tile, matrix]) => {
        const image = images[Number(tile)];
        return { path: image.path, width: image.width, height: image.height, matrix };
      }),
      width: frame.width,
      height: frame.height,
      crop: choices.crop,
      fill: choices.fill,
    });
    return { ...result, frame };
  } finally {
    stop();
  }
}

/** Long side of the copies the review canvas draws, by how many images there are (memory on screen stays bounded) */
export function canvasPreviewSide(count: number): number {
  if (count <= 12) return 1024;
  if (count <= 40) return 640;
  if (count <= 100) return 384;
  return 256;
}

/** A prepared image's preview copy as an object URL (revoke it when done) */
export async function previewUrl(session: string, image: PreparedImage, maxSide: number): Promise<string> {
  const bytes = await api().stitch.preview(session, image.index, maxSide);
  // A copy: what arrives over IPC is typed as possibly shared memory, which a Blob does not take
  return URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }));
}
