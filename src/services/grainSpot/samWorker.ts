/**
 * Grain Spot worker (docs/click-a-grain-design.md): runs SAM 2.1 tiny off
 * the main thread. 'encode' analyzes the view on screen once (about a second
 * on a recent Mac); each 'outline' then answers a click in tens of
 * milliseconds and returns the grain's polygon in view pixels
 * (src/utils/grainOutline.ts). Only the latest view is kept.
 *
 * The image encoder (fp16) runs on the GPU through WebGPU where there is one
 * (about 0.13 s a view on an M4 Pro instead of 1.1 s), else on the CPU
 * (WASM, all threads). Should the GPU fail or give non-numbers, the worker
 * moves to the CPU for good and analyzes the view again. The decoder is
 * small and runs on the CPU either way. This is the 'onnxruntime-web/webgpu'
 * build: the default build's older WebGPU path gives wrong outlines with the
 * fp16 encoder.
 *
 * Messages in:  init { model, wasmPaths, numThreads }
 *               encode { viewId, rgba, width, height }
 *               outline { viewId, points, labels, click }
 * Messages out: the same type with the request id, or { type: 'error', id, message }
 */

import * as ort from 'onnxruntime-web/webgpu';
import { outlineFromLogits, type GrainOutline, type Point } from '@/utils/grainOutline';

/** The model's input is a square of this many pixels; the view is stretched onto it */
const INPUT = 1024;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

export type SamRequest =
  | { type: 'init'; id: number; model: SamModelBytes; wasmPaths: string | { mjs: string }; numThreads: number; useGpu: boolean }
  | { type: 'encode'; id: number; viewId: number; rgba: Uint8ClampedArray; width: number; height: number }
  | { type: 'outline'; id: number; viewId: number; points: Point[]; labels: number[]; click: Point };

export type SamResponse =
  | { type: 'init'; id: number; ms: number; backend: SamBackend }
  | { type: 'encode'; id: number; viewId: number; ms: number; backend: SamBackend }
  | { type: 'outline'; id: number; viewId: number; outline: GrainOutline | null; ms: number }
  | { type: 'error'; id: number; message: string };

/** Where the image encoder runs */
export type SamBackend = 'webgpu' | 'wasm';

export interface SamModelBytes {
  encoder: Uint8Array;
  encoderData: Uint8Array;
  decoder: Uint8Array;
  decoderData: Uint8Array;
  names: { encoderData: string; decoderData: string };
}

let encoder: ort.InferenceSession | null = null;
let backend: SamBackend = 'wasm';
/** Kept to build a CPU encoder should the GPU one fail */
let encoderModel: { bytes: Uint8Array; data: Uint8Array; dataName: string } | null = null;
let decoder: ort.InferenceSession | null = null;
/** The decoder of this export may or may not take input_boxes; learned on the first click */
let decoderTakesBoxes = true;
let view: { viewId: number; width: number; height: number; embeddings: Record<string, ort.Tensor> } | null = null;

const reply = (message: SamResponse) => (self as unknown as Worker).postMessage(message);

/** RGBA view pixels -> normalized CHW float tensor of INPUT x INPUT, bilinear */
function toPixelValues(rgba: Uint8ClampedArray, width: number, height: number): ort.Tensor {
  const out = new Float32Array(3 * INPUT * INPUT);
  const plane = INPUT * INPUT;
  const sx = width / INPUT;
  const sy = height / INPUT;
  for (let y = 0; y < INPUT; y++) {
    const v = Math.min(Math.max((y + 0.5) * sy - 0.5, 0), height - 1);
    const y0 = Math.floor(v);
    const y1 = Math.min(y0 + 1, height - 1);
    const fy = v - y0;
    for (let x = 0; x < INPUT; x++) {
      const u = Math.min(Math.max((x + 0.5) * sx - 0.5, 0), width - 1);
      const x0 = Math.floor(u);
      const x1 = Math.min(x0 + 1, width - 1);
      const fx = u - x0;
      const i00 = (y0 * width + x0) * 4;
      const i01 = (y0 * width + x1) * 4;
      const i10 = (y1 * width + x0) * 4;
      const i11 = (y1 * width + x1) * 4;
      for (let c = 0; c < 3; c++) {
        const value = (rgba[i00 + c] * (1 - fx) + rgba[i01 + c] * fx) * (1 - fy) + (rgba[i10 + c] * (1 - fx) + rgba[i11 + c] * fx) * fy;
        out[c * plane + y * INPUT + x] = (value / 255 - MEAN[c]) / STD[c];
      }
    }
  }
  return new ort.Tensor('float32', out, [1, 3, INPUT, INPUT]);
}

async function init(request: Extract<SamRequest, { type: 'init' }>): Promise<SamResponse> {
  const started = performance.now();
  ort.env.wasm.wasmPaths = request.wasmPaths;
  ort.env.wasm.numThreads = request.numThreads;
  ort.env.logLevel = 'error';
  const { model } = request;
  encoderModel = { bytes: model.encoder, data: model.encoderData, dataName: model.names.encoderData };
  if (request.useGpu && await hasGpu()) {
    try {
      encoder = await createEncoder('webgpu');
      backend = 'webgpu';
    } catch (error) {
      console.warn('[GrainSpot] WebGPU is not usable, analyzing on the CPU:', error);
    }
  }
  if (!encoder) encoder = await createEncoder('wasm');
  decoder = await ort.InferenceSession.create(model.decoder, {
    executionProviders: ['wasm'],
    externalData: [{ path: model.names.decoderData, data: model.decoderData }],
  });
  return { type: 'init', id: request.id, ms: performance.now() - started, backend };
}

async function hasGpu(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

function createEncoder(provider: SamBackend): Promise<ort.InferenceSession> {
  const m = encoderModel;
  if (!m) throw new Error('The grain model is not loaded');
  return ort.InferenceSession.create(m.bytes, {
    executionProviders: [provider],
    externalData: [{ path: m.dataName, data: m.data }],
  });
}

/** Every value a number (a GPU gone wrong can give NaN or Infinity) */
function allFinite(outputs: Record<string, ort.Tensor>): boolean {
  for (const t of Object.values(outputs)) {
    const data = t.data;
    if (!(data instanceof Float32Array)) continue;
    for (let i = 0; i < data.length; i++) if (!Number.isFinite(data[i])) return false;
  }
  return true;
}

/** Leave the GPU for good: the CPU encoder takes over */
async function fallBackToCpu(reason: unknown): Promise<void> {
  console.warn('[GrainSpot] The GPU analysis failed, moving to the CPU:', reason);
  const old = encoder;
  encoder = null;
  backend = 'wasm';
  await old?.release().catch(() => undefined);
  encoder = await createEncoder('wasm');
}

async function encode(request: Extract<SamRequest, { type: 'encode' }>): Promise<SamResponse> {
  if (!encoder) throw new Error('The grain model is not loaded');
  const started = performance.now();
  const input = { pixel_values: toPixelValues(request.rgba, request.width, request.height) };
  let result: Record<string, ort.Tensor> | null = null;
  if (backend === 'webgpu') {
    try {
      result = await encoder.run(input);
      if (!allFinite(result)) {
        await fallBackToCpu('the view analysis gave non-numbers');
        result = null;
      }
    } catch (error) {
      await fallBackToCpu(error);
    }
  }
  if (!result) {
    if (!encoder) throw new Error('The grain model is not loaded');
    result = await encoder.run(input);
  }
  view = { viewId: request.viewId, width: request.width, height: request.height, embeddings: result };
  return { type: 'encode', id: request.id, viewId: request.viewId, ms: performance.now() - started, backend };
}

async function outline(request: Extract<SamRequest, { type: 'outline' }>): Promise<SamResponse> {
  if (!decoder) throw new Error('The grain model is not loaded');
  if (!view || view.viewId !== request.viewId) throw new Error('This view has not been analyzed');
  const started = performance.now();
  const { width, height, embeddings } = view;
  const n = request.points.length;
  const coords = new Float32Array(n * 2);
  request.points.forEach(([x, y], i) => {
    coords[2 * i] = (x * INPUT) / width;
    coords[2 * i + 1] = (y * INPUT) / height;
  });
  const feeds: Record<string, ort.Tensor> = {
    input_points: new ort.Tensor('float32', coords, [1, 1, n, 2]),
    input_labels: new ort.Tensor('int64', BigInt64Array.from(request.labels.map((l) => BigInt(l))), [1, 1, n]),
    'image_embeddings.0': embeddings['image_embeddings.0'],
    'image_embeddings.1': embeddings['image_embeddings.1'],
    'image_embeddings.2': embeddings['image_embeddings.2'],
  };
  let result: ort.InferenceSession.OnnxValueMapType;
  if (decoderTakesBoxes) {
    try {
      result = await decoder.run({ ...feeds, input_boxes: new ort.Tensor('float32', new Float32Array(0), [1, 0, 4]) });
    } catch {
      decoderTakesBoxes = false;
      result = await decoder.run(feeds);
    }
  } else {
    result = await decoder.run(feeds);
  }
  const masks = result.pred_masks as ort.Tensor;
  const iou = (result.iou_scores as ort.Tensor).data as Float32Array;
  const dims = masks.dims;
  const lh = dims[dims.length - 2];
  const lw = dims[dims.length - 1];
  const candidates = dims[dims.length - 3];
  // The first point is the click; the rest are refine clicks (label 1 adds, 0 cuts)
  const include = request.points.filter((_, i) => i > 0 && request.labels[i] === 1);
  const exclude = request.points.filter((_, i) => request.labels[i] === 0);
  const found = outlineFromLogits(masks.data as Float32Array, candidates, lw, lh, iou, width, height, request.click, { include, exclude });
  return { type: 'outline', id: request.id, viewId: request.viewId, outline: found, ms: performance.now() - started };
}

self.onmessage = async (event: MessageEvent<SamRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'init') reply(await init(request));
    else if (request.type === 'encode') reply(await encode(request));
    else reply(await outline(request));
  } catch (error) {
    reply({ type: 'error', id: request.id, message: error instanceof Error ? error.message : String(error) });
  }
};
