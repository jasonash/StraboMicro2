/**
 * Grain Spot worker (docs/click-a-grain-design.md): runs SAM 2.1 tiny off
 * the main thread. 'encode' analyzes the view on screen once (about a second
 * on a recent Mac); each 'outline' then answers a click in tens of
 * milliseconds and returns the grain's polygon in view pixels
 * (src/utils/grainOutline.ts). Only the latest view is kept.
 *
 * The image encoder (fp32: the fp16 one needs the GPU's shader-f16 feature,
 * missing on many Windows GPUs) runs on the GPU through WebGPU where there
 * is one (about 0.2 s a view on an M4 Pro instead of 1 s), else on the CPU
 * (WASM, all threads). Should the GPU fail or give non-numbers, the worker
 * moves to the CPU for good and analyzes the view again. Before it is used,
 * the GPU analyzes a built-in test image whose correct result is known
 * (encoderCheck.ts); a GPU that gets it wrong is not used. The decoder is
 * small and runs on the CPU either way. This is the 'onnxruntime-web/webgpu'
 * build: the default build's older WebGPU path gave wrong outlines with an
 * fp16 encoder in our tests.
 *
 * Messages in:  init { model, wasmPaths, numThreads }
 *               encode { viewId, rgba, width, height }
 *               outline { viewId, points, labels, click }
 * Messages out: the same type with the request id, or { type: 'error', id, message }
 */

import * as ort from 'onnxruntime-web/webgpu';
import { outlineFromLogits, type GrainOutline, type Point } from '@/utils/grainOutline';
import { checkImage, difference, pixelValues, EXPECTED, INPUT, MAX_DIFFERENCE } from './encoderCheck';

export type SamRequest =
  | { type: 'init'; id: number; model: SamModelBytes; wasmPaths: string | { mjs: string }; numThreads: number; useGpu: boolean; simulateBadGpu?: boolean }
  | { type: 'encode'; id: number; viewId: number; rgba: Uint8ClampedArray; width: number; height: number }
  | { type: 'outline'; id: number; viewId: number; points: Point[]; labels: number[]; click: Point };

export type SamResponse =
  | { type: 'init'; id: number; ms: number; backend: SamBackend; gpuCheck?: number }
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

async function init(request: Extract<SamRequest, { type: 'init' }>): Promise<SamResponse> {
  const started = performance.now();
  ort.env.wasm.wasmPaths = request.wasmPaths;
  ort.env.wasm.numThreads = request.numThreads;
  ort.env.logLevel = 'error';
  const { model } = request;
  encoderModel = { bytes: model.encoder, data: model.encoderData, dataName: model.names.encoderData };
  let gpuCheck: number | undefined;
  if (request.useGpu && await hasGpu()) {
    try {
      const gpu = await createEncoder('webgpu');
      gpuCheck = await checkEncoder(gpu, request.simulateBadGpu === true);
      if (gpuCheck <= MAX_DIFFERENCE) {
        encoder = gpu;
        backend = 'webgpu';
      } else {
        console.warn(`[GrainSpot] The GPU's test result differs from the CPU's (difference ${gpuCheck.toFixed(4)}, at most ${MAX_DIFFERENCE} allowed), analyzing on the CPU`);
        await gpu.release().catch(() => undefined);
      }
    } catch (error) {
      console.warn('[GrainSpot] WebGPU is not usable, analyzing on the CPU:', error);
    }
  }
  if (!encoder) encoder = await createEncoder('wasm');
  decoder = await ort.InferenceSession.create(model.decoder, {
    executionProviders: ['wasm'],
    logSeverityLevel: 3,
    externalData: [{ path: model.names.decoderData, data: model.decoderData }],
  });
  return { type: 'init', id: request.id, ms: performance.now() - started, backend, gpuCheck };
}

/**
 * The built-in test image through this encoder: how far its result is from
 * the CPU's (encoderCheck.ts). simulateBadGpu (tests only) skews the result
 * by 10 %, as a faulty GPU might.
 */
async function checkEncoder(session: ort.InferenceSession, simulateBadGpu: boolean): Promise<number> {
  const image = checkImage();
  const result = await session.run({ pixel_values: new ort.Tensor('float32', pixelValues(image.rgba, image.width, image.height), [1, 3, INPUT, INPUT]) });
  const outputs = Object.fromEntries(Object.entries(result).map(([name, t]) => {
    const data = t.data as Float32Array;
    return [name, simulateBadGpu ? data.map((v) => v * 1.1) : data];
  }));
  return difference(outputs, EXPECTED);
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
    // Errors only: "some nodes were not assigned to the preferred execution providers" is expected (shape ops go to the CPU)
    logSeverityLevel: 3,
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
  const input = { pixel_values: new ort.Tensor('float32', pixelValues(request.rgba, request.width, request.height), [1, 3, INPUT, INPUT]) };
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
