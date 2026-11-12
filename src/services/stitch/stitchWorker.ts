/**
 * Image stitcher: the Web Worker of the pool (stitchPool.ts). All the work is in stitchJobs.ts;
 * this file only loads OpenCV.js and passes messages.
 */

import type { OpenCV } from '../autoPlace/placementMatch';
import { createWorkerSide, type FromStitchWorker, type ToStitchWorker } from './stitchJobs';

/**
 * The module is thenable: never resolve a promise with it or return it from an async function
 * (the promise would adopt it and loop forever). It travels inside a wrapper object.
 */
async function loadOpenCV(script: string | null): Promise<{ cv: OpenCV }> {
  const text = script ?? (await (await fetch('/opencv.js')).text());
  // eslint-disable-next-line no-eval
  (0, eval)(text);
  // The module sets self.cv and fills in Mat once its WebAssembly is ready
  const started = Date.now();
  while (Date.now() - started < 30000) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const global = (self as any).cv;
    if (global && typeof global.Mat === 'function') return { cv: global };
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('OpenCV.js did not start within 30 s');
}

const side = createWorkerSide(loadOpenCV, (message: FromStitchWorker) => self.postMessage(message));

self.onmessage = (event: MessageEvent<ToStitchWorker>) => side.handle(event.data);
