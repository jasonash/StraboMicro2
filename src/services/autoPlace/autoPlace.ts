/**
 * "Place automatically on parent" from the renderer: runs the matcher in placeWorker.ts and
 * answers its image reads through window.api.readGrayRegion. The result's matrix is converted
 * to the app's stored pixel sizes (imageWidth/imageHeight), which can differ from the files.
 *
 * Design: docs/drop-to-place-design.md
 */

import type { AffineMatrix } from '@/utils/affineTransform';
import type { ProjectMetadata } from '@/types/project-types';
import { getMicrographAncestorChain } from '@/store/helpers';
import type { GrayImage, PlacementResult, Rect } from './placementMatch';
import type { FromWorker, ToWorker } from './placeWorker';
import { affineFields, toAppPixels, type AutoPlacementOutcome } from './placementFields';

export interface AutoPlaceImage {
  /** Full path of the image file */
  path: string;
  /** The app's stored size (imageWidth/imageHeight or the wizard's micrographWidth/Height) */
  width: number;
  height: number;
}

export interface AutoPlaceResult extends PlacementResult {
  /** Detail px -> parent px in the app's stored sizes; null when status is none */
  appMatrix: AffineMatrix | null;
}

export interface AutoPlaceRun {
  promise: Promise<AutoPlaceResult>;
  /** Stops the worker; the promise rejects with 'cancelled' */
  cancel: () => void;
}

export interface Placer {
  /** One placement at a time; the worker (and OpenCV) stays loaded between them */
  place: (detail: AutoPlaceImage, parent: AutoPlaceImage, onProgress?: (step: string, percent: number) => void) => Promise<AutoPlaceResult>;
  /** Stops the worker; a placement in progress rejects with 'cancelled' */
  close: () => void;
}

/**
 * A worker for several placements, e.g. every unplaced child of one parent. Reads of the parent
 * are kept, so its overview is read from disk once for all children.
 */
export function createPlacer(): Placer {
  let worker: Worker | null = null;
  let closed = false;
  let rejectRun: ((error: Error) => void) | null = null;
  let opencvScript: Promise<string | null> | null = null;
  const parentReads = new Map<string, Promise<GrayImage>>();

  const close = () => {
    closed = true;
    worker?.terminate();
    worker = null;
    rejectRun?.(new Error('cancelled'));
    rejectRun = null;
  };

  const place: Placer['place'] = async (detail, parent, onProgress) => {
    const api = window.api;
    if (!api) throw new Error('Not available outside the app');
    if (closed) throw new Error('cancelled');
    const [detailFile, parentFile] = await Promise.all([
      api.getImageDimensions(detail.path),
      api.getImageDimensions(parent.path),
    ]);
    opencvScript ??= api.loadOpencvScript().then(
      (script) => script || null,
      (error: unknown) => {
        console.warn('[AutoPlace] OpenCV script not loaded through IPC; the worker will fetch it', error);
        return null;
      },
    );
    const script = await opencvScript;
    if (closed) throw new Error('cancelled');

    const readParent = (rect: Rect, maxSide: number) => {
      const key = `${parent.path}|${rect.x},${rect.y},${rect.width},${rect.height}|${maxSide}`;
      let read = parentReads.get(key);
      if (!read) {
        read = api.readGrayRegion(parent.path, rect, maxSide);
        read.catch(() => parentReads.delete(key));
        parentReads.set(key, read);
      }
      return read;
    };

    const result = await new Promise<PlacementResult>((resolve, reject) => {
      rejectRun = reject;
      worker ??= new Worker(new URL('./placeWorker.ts', import.meta.url), { type: 'module' });
      const w = worker;
      const send = (message: ToWorker) => w.postMessage(message);
      w.onmessage = async (event: MessageEvent<FromWorker>) => {
        const message = event.data;
        if (message.type === 'read') {
          try {
            const image = message.which === 'detail'
              ? await api.readGrayRegion(detail.path, message.rect, message.maxSide)
              : await readParent(message.rect, message.maxSide);
            send({ type: 'image', id: message.id, image });
          } catch (error) {
            send({ type: 'read-error', id: message.id, message: error instanceof Error ? error.message : String(error) });
          }
        } else if (message.type === 'progress') {
          onProgress?.(message.step, message.percent);
        } else if (message.type === 'result') {
          resolve(message.result);
        } else {
          reject(new Error(message.message));
        }
      };
      w.onerror = (event) => reject(new Error(event.message || 'Worker failed'));
      send({
        type: 'place',
        opencvScript: script,
        detail: { width: detailFile.width, height: detailFile.height },
        parent: { width: parentFile.width, height: parentFile.height },
      });
    }).finally(() => {
      rejectRun = null;
    });

    console.log('[AutoPlace]', result.status, result.kind, `inliers ${result.inliers}`, `runner-up ${result.runnerUp}`, `${result.ms} ms`, result.reason);
    return {
      ...result,
      appMatrix: result.matrix ? toAppPixels(result.matrix, detailFile, detail, parentFile, parent) : null,
    };
  };

  return { place, close };
}

/** One placement in its own worker */
export function placeAutomatically(
  detail: AutoPlaceImage,
  parent: AutoPlaceImage,
  onProgress?: (step: string, percent: number) => void,
): AutoPlaceRun {
  const placer = createPlacer();
  const promise = placer.place(detail, parent, onProgress).finally(() => placer.close());
  return { promise, cancel: placer.close };
}

/**
 * An ancestor placed with 3-Point Registration keeps a placeholder scale; only an affine
 * placement gets the real scale from the chain (docs/drop-to-place-design.md D6)
 */
export function mustPlaceAffine(project: ProjectMetadata | null, parentMicrographId: string): boolean {
  return getMicrographAncestorChain(project, parentMicrographId).some((m) => m.parentID && m.placementType === 'affine');
}

/** Bakes the overlay tiles the way the 3-Point Registration modal does; throws when they cannot be made */
export async function bakeAffineOutcome(
  appMatrix: AffineMatrix,
  detail: AutoPlaceImage,
): Promise<Extract<AutoPlacementOutcome, { kind: 'affine' }>> {
  const api = window.api;
  if (!api) throw new Error('Not available outside the app');
  const fields = affineFields(appMatrix, detail.width, detail.height);
  const tiles = await api.loadImageWithTiles(detail.path);
  const baked = await api.generateAffineTiles(detail.path, tiles.hash, fields.matrix);
  if (!baked?.success) throw new Error(`The overlay tiles could not be made: ${baked?.error ?? 'unknown error'}`);
  return { kind: 'affine', ...fields, tileHash: tiles.hash };
}
