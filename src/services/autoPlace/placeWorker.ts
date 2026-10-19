/**
 * Worker for "Place automatically on parent": runs findPlacement (placementMatch.ts) off the
 * main thread. Images are read through the main thread (window.api is not available here):
 * the worker asks for a region with a 'read' message and gets the pixels back as 'image'.
 */

import { findPlacement, type GrayImage, type ImageSource, type OpenCV, type PlacementResult, type Rect } from './placementMatch';

export type Which = 'detail' | 'parent';

export type ToWorker =
  | {
      type: 'place';
      opencvScript: string | null;
      detail: { width: number; height: number };
      parent: { width: number; height: number };
    }
  | { type: 'image'; id: number; image: GrayImage }
  | { type: 'read-error'; id: number; message: string };

export type FromWorker =
  | { type: 'read'; id: number; which: Which; rect: Rect; maxSide: number }
  | { type: 'progress'; step: string; percent: number }
  | { type: 'result'; result: PlacementResult }
  | { type: 'error'; message: string };

const post = (message: FromWorker) => self.postMessage(message);

let cv: OpenCV | null = null;

/**
 * Sets cv. Returns nothing on purpose: the module is thenable, so an async function returning it
 * would make its promise adopt the module and loop forever.
 */
async function loadOpenCV(script: string | null): Promise<void> {
  if (cv) return;
  const text = script ?? (await (await fetch('/opencv.js')).text());
  // eslint-disable-next-line no-eval
  (0, eval)(text);
  // The module sets self.cv and fills in Mat once its WebAssembly is ready
  const started = Date.now();
  while (Date.now() - started < 30000) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const global = (self as any).cv;
    if (global && typeof global.Mat === 'function') {
      cv = global;
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('OpenCV.js did not start within 30 s');
}

let nextId = 1;
const pending = new Map<number, { resolve: (image: GrayImage) => void; reject: (error: Error) => void }>();

function source(which: Which, size: { width: number; height: number }): ImageSource {
  return {
    width: size.width,
    height: size.height,
    read(rect, maxSide) {
      const id = nextId++;
      return new Promise<GrayImage>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        post({ type: 'read', id, which, rect, maxSide });
      });
    },
  };
}

self.onmessage = async (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  if (message.type === 'image' || message.type === 'read-error') {
    const waiting = pending.get(message.id);
    pending.delete(message.id);
    if (!waiting) return;
    if (message.type === 'image') waiting.resolve(message.image);
    else waiting.reject(new Error(message.message));
    return;
  }
  try {
    post({ type: 'progress', step: 'Loading OpenCV', percent: 1 });
    await loadOpenCV(message.opencvScript);
    const result = await findPlacement(cv, source('detail', message.detail), source('parent', message.parent), {
      onProgress: (step, percent) => post({ type: 'progress', step, percent }),
    });
    post({ type: 'result', result });
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
