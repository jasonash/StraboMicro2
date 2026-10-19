/**
 * "Place automatically on parent" from the renderer: runs the matcher in placeWorker.ts and
 * answers its image reads through window.api.readGrayRegion. The result's matrix is converted
 * to the app's stored pixel sizes (imageWidth/imageHeight), which can differ from the files.
 *
 * Design: docs/drop-to-place-design.md
 */

import type { AffineMatrix } from '@/utils/affineTransform';
import type { PlacementResult } from './placementMatch';
import type { FromWorker, ToWorker } from './placeWorker';
import { toAppPixels } from './placementFields';

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

export function placeAutomatically(
  detail: AutoPlaceImage,
  parent: AutoPlaceImage,
  onProgress?: (step: string, percent: number) => void,
): AutoPlaceRun {
  let worker: Worker | null = null;
  let rejectRun: ((error: Error) => void) | null = null;
  const cancel = () => {
    worker?.terminate();
    worker = null;
    rejectRun?.(new Error('cancelled'));
  };

  const promise = (async () => {
    const api = window.api;
    if (!api) throw new Error('Not available outside the app');
    const [detailFile, parentFile] = await Promise.all([
      api.getImageDimensions(detail.path),
      api.getImageDimensions(parent.path),
    ]);
    let opencvScript: string | null = null;
    try {
      opencvScript = (await api.loadOpencvScript()) || null;
    } catch (error) {
      console.warn('[AutoPlace] OpenCV script not loaded through IPC; the worker will fetch it', error);
    }

    const result = await new Promise<PlacementResult>((resolve, reject) => {
      rejectRun = reject;
      const w = new Worker(new URL('./placeWorker.ts', import.meta.url), { type: 'module' });
      worker = w;
      const send = (message: ToWorker) => w.postMessage(message);
      w.onmessage = async (event: MessageEvent<FromWorker>) => {
        const message = event.data;
        if (message.type === 'read') {
          try {
            const path = message.which === 'detail' ? detail.path : parent.path;
            const image = await api.readGrayRegion(path, message.rect, message.maxSide);
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
        opencvScript,
        detail: { width: detailFile.width, height: detailFile.height },
        parent: { width: parentFile.width, height: parentFile.height },
      });
    }).finally(() => {
      worker?.terminate();
      worker = null;
    });

    console.log('[AutoPlace]', result.status, result.kind, `inliers ${result.inliers}`, `runner-up ${result.runnerUp}`, `${result.ms} ms`, result.reason);
    return {
      ...result,
      appMatrix: result.matrix ? toAppPixels(result.matrix, detailFile, detail, parentFile, parent) : null,
    };
  })();

  return { promise, cancel };
}
