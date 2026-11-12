/**
 * The stitch worker for Node (worker_threads): the twin of src/services/stitch/stitchWorker.ts,
 * used by tests/stitchPool.test.mts. Same jobs, same messages; only OpenCV loading and the
 * message channel differ.
 */

import path from 'path';
import { createRequire } from 'module';
import { parentPort } from 'worker_threads';
import type { OpenCV } from '../src/services/autoPlace/placementMatch.ts';
import { createWorkerSide, type ToStitchWorker } from '../src/services/stitch/stitchJobs.ts';

const root = path.resolve(import.meta.dirname, '..');

function loadOpenCV(): Promise<{ cv: OpenCV }> {
  return new Promise((resolve) => {
    const g = globalThis as Record<string, unknown>;
    g.Module = { onRuntimeInitialized() { resolve({ cv: g.cv }); } };
    g.cv = createRequire(import.meta.url)(path.join(root, 'public/opencv.js'));
  });
}

const side = createWorkerSide(loadOpenCV, (message) => parentPort!.postMessage(message));
parentPort!.on('message', (message: ToStitchWorker) => side.handle(message));
