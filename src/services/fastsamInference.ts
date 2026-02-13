/**
 * FastSAM Inference Service (Renderer Process)
 *
 * Uses onnxruntime-web (WebAssembly) for cross-platform ONNX inference.
 * This runs entirely in the renderer process, avoiding native module issues
 * with onnxruntime-node (DLL loading failures on Windows).
 *
 * Key improvement: Configures ort.env.wasm.wasmPaths so WASM binaries
 * are found correctly in both dev and packaged Electron builds.
 *
 * @module fastsamInference
 */

import * as ort from 'onnxruntime-web';

// ============================================================================
// Configuration
// ============================================================================

const INPUT_SIZE = 1024; // Match GrainSight default

// Default detection parameters (matching GrainSight)
const DEFAULT_PARAMS = {
  confidenceThreshold: 0.5,
  iouThreshold: 0.7,
  minAreaPercent: 0.01,
  maxDetections: 500,
};

// ============================================================================
// Types
// ============================================================================

export interface FastSAMParams {
  confidenceThreshold?: number;
  iouThreshold?: number;
  minAreaPercent?: number;
  maxDetections?: number;
}

export interface PreprocessInfo {
  scale: number;
  padX: number;
  padY: number;
  origW: number;
  origH: number;
}

export interface RawMask {
  maskBase64: string;
  confidence: number;
  area: number;
  box: number[];
}

export interface FastSAMDetectionResult {
  masks: RawMask[];
  preprocessInfo: PreprocessInfo;
  processingTimeMs: number;
  inferenceTimeMs: number;
  inputSize: number;
}

export interface ProgressInfo {
  step: string;
  percent: number;
}

// ============================================================================
// WASM Configuration
// ============================================================================

let wasmConfigured = false;

/**
 * Configure WASM paths for onnxruntime-web.
 * This is CRITICAL for packaged Electron apps where the WASM files
 * won't be found relative to the bundled JS by default.
 *
 * In development: WASM files are served from node_modules via Vite dev server
 * In production: WASM files are copied to the dist output alongside the app
 */
function configureWasm(): void {
  if (wasmConfigured) return;

  // Point to the WASM files location
  // In packaged builds, these files are alongside the renderer JS in dist/
  // In dev, Vite serves them from node_modules
  const wasmBasePath = import.meta.env.DEV
    ? '/node_modules/onnxruntime-web/dist/'
    : './';

  ort.env.wasm.wasmPaths = wasmBasePath;

  // Use available hardware threads for better perf
  ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4;

  // Disable proxy worker since we're in Electron (same-origin)
  ort.env.wasm.proxy = false;

  console.log('[FastSAM-Web] WASM configured:', {
    wasmPaths: wasmBasePath,
    numThreads: ort.env.wasm.numThreads,
    isDev: import.meta.env.DEV,
  });

  wasmConfigured = true;
}

// ============================================================================
// State
// ============================================================================

let session: ort.InferenceSession | null = null;
let isLoading = false;

// ============================================================================
// Model Management
// ============================================================================

/**
 * Load the FastSAM ONNX model from the given URL/path.
 */
export async function loadModel(
  modelUrl: string,
  progressCallback?: (info: ProgressInfo) => void
): Promise<ort.InferenceSession> {
  if (session) {
    return session;
  }

  if (isLoading) {
    // Wait for existing load to complete
    while (isLoading) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (session) return session;
    throw new Error('Model loading failed');
  }

  isLoading = true;

  try {
    // Ensure WASM is configured before first model load
    configureWasm();

    if (progressCallback) {
      progressCallback({ step: 'Loading FastSAM model...', percent: 5 });
    }

    console.log('[FastSAM-Web] Loading model from:', modelUrl);
    const startTime = Date.now();

    session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });

    const loadTime = Date.now() - startTime;
    console.log('[FastSAM-Web] Model loaded in', loadTime, 'ms');
    console.log('[FastSAM-Web] Input names:', session.inputNames);
    console.log('[FastSAM-Web] Output names:', session.outputNames);

    return session;
  } catch (err) {
    console.error('[FastSAM-Web] Model loading failed:', err);
    throw err;
  } finally {
    isLoading = false;
  }
}

/**
 * Unload the model to free memory.
 */
export function unloadModel(): void {
  if (session) {
    console.log('[FastSAM-Web] Unloading model');
    session = null;
  }
}

/**
 * Check if model is loaded.
 */
export function isModelLoaded(): boolean {
  return session !== null;
}

// ============================================================================
// Image Preprocessing
// ============================================================================

/**
 * Preprocess image for FastSAM inference using canvas.
 * - Resize with letterboxing to INPUT_SIZE x INPUT_SIZE
 * - Convert to RGB float32 normalized to [0, 1]
 * - Channel order: CHW (channels, height, width)
 */
async function preprocessImage(
  imageData: ImageData,
  progressCallback?: (info: ProgressInfo) => void
): Promise<{ tensor: ort.Tensor; preprocessInfo: PreprocessInfo }> {
  if (progressCallback) {
    progressCallback({ step: 'Preprocessing image...', percent: 15 });
  }

  const origW = imageData.width;
  const origH = imageData.height;
  console.log('[FastSAM-Web] Original image size:', origW, 'x', origH);

  // Calculate letterbox dimensions (preserve aspect ratio)
  const scale = Math.min(INPUT_SIZE / origW, INPUT_SIZE / origH);
  const newW = Math.round(origW * scale);
  const newH = Math.round(origH * scale);
  const padX = Math.floor((INPUT_SIZE - newW) / 2);
  const padY = Math.floor((INPUT_SIZE - newH) / 2);

  console.log('[FastSAM-Web] Resized:', newW, 'x', newH, ', padding:', padX, ',', padY);

  // Create canvas for resizing
  const canvas = document.createElement('canvas');
  canvas.width = INPUT_SIZE;
  canvas.height = INPUT_SIZE;
  const ctx = canvas.getContext('2d')!;

  // Fill with gray padding (YOLO style)
  ctx.fillStyle = 'rgb(114, 114, 114)';
  ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);

  // Create temp canvas with original image
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = origW;
  tempCanvas.height = origH;
  const tempCtx = tempCanvas.getContext('2d')!;
  tempCtx.putImageData(imageData, 0, 0);

  // Draw resized image with letterboxing
  ctx.drawImage(tempCanvas, padX, padY, newW, newH);

  // Get pixel data
  const resizedData = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);

  // Convert to float32 CHW format normalized to [0, 1]
  const float32Data = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < INPUT_SIZE; y++) {
      for (let x = 0; x < INPUT_SIZE; x++) {
        const srcIdx = (y * INPUT_SIZE + x) * 4 + c; // RGBA format
        const dstIdx = c * INPUT_SIZE * INPUT_SIZE + y * INPUT_SIZE + x;
        float32Data[dstIdx] = resizedData.data[srcIdx] / 255.0;
      }
    }
  }

  return {
    tensor: new ort.Tensor('float32', float32Data, [1, 3, INPUT_SIZE, INPUT_SIZE]),
    preprocessInfo: { scale, padX, padY, origW, origH },
  };
}

/**
 * Load an image from a data URL and return ImageData.
 */
export async function loadImageAsImageData(imageUrl: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, img.width, img.height));
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
}

// ============================================================================
// Post-Processing
// ============================================================================

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function calculateIoU(box1: number[], box2: number[]): number {
  const x1 = Math.max(box1[0], box2[0]);
  const y1 = Math.max(box1[1], box2[1]);
  const x2 = Math.min(box1[2], box2[2]);
  const y2 = Math.min(box1[3], box2[3]);

  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const area1 = (box1[2] - box1[0]) * (box1[3] - box1[1]);
  const area2 = (box2[2] - box2[0]) * (box2[3] - box2[1]);
  const union = area1 + area2 - intersection;

  return union > 0 ? intersection / union : 0;
}

interface Detection {
  box: number[];
  confidence: number;
  maskCoeffs: Float32Array;
}

function nms(detections: Detection[], iouThreshold: number): Detection[] {
  detections.sort((a, b) => b.confidence - a.confidence);

  const kept: Detection[] = [];
  const suppressed = new Set<number>();

  for (let i = 0; i < detections.length; i++) {
    if (suppressed.has(i)) continue;

    kept.push(detections[i]);

    for (let j = i + 1; j < detections.length; j++) {
      if (suppressed.has(j)) continue;

      const iou = calculateIoU(detections[i].box, detections[j].box);
      if (iou > iouThreshold) {
        suppressed.add(j);
      }
    }
  }

  return kept;
}

interface MaskResult {
  mask: Uint8Array;
  maskH: number;
  maskW: number;
  box: number[];
  confidence: number;
  area: number;
}

function postprocessOutput(
  output0: ort.Tensor,
  output1: ort.Tensor,
  params: Required<FastSAMParams>,
  preprocessInfo: PreprocessInfo,
  progressCallback?: (info: ProgressInfo) => void
): MaskResult[] {
  if (progressCallback) {
    progressCallback({ step: 'Processing detections...', percent: 60 });
  }

  const output0Data = output0.data as Float32Array;
  const output0Dims = output0.dims;
  const output1Data = output1.data as Float32Array;
  const output1Dims = output1.dims;

  console.log('[FastSAM-Web] output0 shape:', output0Dims);
  console.log('[FastSAM-Web] output1 shape:', output1Dims);

  const numDetections = output0Dims[2] as number;
  const numFeatures = output0Dims[1] as number;
  const numMaskCoeffs = 32;
  const numClasses = numFeatures - 4 - numMaskCoeffs;

  const maskH = output1Dims[2] as number;
  const maskW = output1Dims[3] as number;

  console.log('[FastSAM-Web] Detections:', numDetections, ', Classes:', numClasses);
  console.log('[FastSAM-Web] Prototype mask size:', maskH, 'x', maskW);

  // Define active region (exclude padding)
  const { padX, padY } = preprocessInfo;
  const margin = 20;
  const activeTop = padY + margin;
  const activeBottom = INPUT_SIZE - padY - margin;
  const activeLeft = padX + margin;
  const activeRight = INPUT_SIZE - padX - margin;

  // Extract detections above confidence threshold
  const detections: Detection[] = [];
  for (let i = 0; i < numDetections; i++) {
    const cx = output0Data[0 * numDetections + i];
    const cy = output0Data[1 * numDetections + i];
    const w = output0Data[2 * numDetections + i];
    const h = output0Data[3 * numDetections + i];

    // Find best class score
    let maxScore = 0;
    for (let c = 0; c < numClasses; c++) {
      const score = output0Data[(4 + c) * numDetections + i];
      if (score > maxScore) {
        maxScore = score;
      }
    }

    if (maxScore < params.confidenceThreshold) continue;

    // Skip detections outside active region (in padding area)
    if (cy < activeTop || cy > activeBottom || cx < activeLeft || cx > activeRight) continue;

    // Convert center format to corner format
    const x1 = cx - w / 2;
    const y1 = cy - h / 2;
    const x2 = cx + w / 2;
    const y2 = cy + h / 2;

    // Extract mask coefficients
    const maskCoeffs = new Float32Array(numMaskCoeffs);
    for (let m = 0; m < numMaskCoeffs; m++) {
      maskCoeffs[m] = output0Data[(4 + numClasses + m) * numDetections + i];
    }

    detections.push({
      box: [x1, y1, x2, y2],
      confidence: maxScore,
      maskCoeffs,
    });
  }

  console.log('[FastSAM-Web] Detections above threshold:', detections.length);

  // Apply NMS
  if (progressCallback) {
    progressCallback({ step: 'Applying NMS...', percent: 70 });
  }

  const nmsDetections = nms(detections, params.iouThreshold);
  console.log('[FastSAM-Web] Detections after NMS:', nmsDetections.length);

  // Limit detections
  const limitedDetections = nmsDetections.slice(0, params.maxDetections);

  // Compute masks for each detection
  if (progressCallback) {
    progressCallback({ step: 'Computing masks...', percent: 75 });
  }

  const results: MaskResult[] = [];
  for (let idx = 0; idx < limitedDetections.length; idx++) {
    const det = limitedDetections[idx];

    // Compute mask: sigmoid(coeffs @ prototypes)
    const mask = new Uint8Array(maskH * maskW);
    let maskPixelCount = 0;

    for (let y = 0; y < maskH; y++) {
      for (let x = 0; x < maskW; x++) {
        let sum = 0;
        for (let m = 0; m < numMaskCoeffs; m++) {
          const protoIdx = m * maskH * maskW + y * maskW + x;
          sum += det.maskCoeffs[m] * output1Data[protoIdx];
        }

        // Apply sigmoid and threshold, clip to bounding box
        const imgX = Math.floor((x * INPUT_SIZE) / maskW);
        const imgY = Math.floor((y * INPUT_SIZE) / maskH);

        if (
          sigmoid(sum) > 0.5 &&
          imgX >= det.box[0] &&
          imgX <= det.box[2] &&
          imgY >= det.box[1] &&
          imgY <= det.box[3]
        ) {
          mask[y * maskW + x] = 1;
          maskPixelCount++;
        }
      }
    }

    // Calculate area in original image coordinates
    const scaleToOrig = (INPUT_SIZE / maskW) * (1 / preprocessInfo.scale);
    const areaOriginal = maskPixelCount * scaleToOrig * scaleToOrig;

    // Filter by minimum area
    const minArea = preprocessInfo.origW * preprocessInfo.origH * (params.minAreaPercent / 100);
    if (areaOriginal < minArea) continue;

    results.push({
      box: det.box,
      confidence: det.confidence,
      mask,
      maskH,
      maskW,
      area: areaOriginal,
    });
  }

  console.log('[FastSAM-Web] Final detections after area filter:', results.length);
  return results;
}

// ============================================================================
// Mask Upsampling
// ============================================================================

/**
 * Upsample a binary mask to target size using canvas.
 * Returns base64-encoded PNG for efficient transfer.
 */
function upsampleMask(
  mask: Uint8Array,
  maskW: number,
  maskH: number,
  targetW: number,
  targetH: number
): string {
  // Create canvas at mask size
  const canvas = document.createElement('canvas');
  canvas.width = maskW;
  canvas.height = maskH;
  const ctx = canvas.getContext('2d')!;

  // Draw mask as grayscale image
  const imgData = ctx.createImageData(maskW, maskH);
  for (let i = 0; i < mask.length; i++) {
    const val = mask[i] ? 255 : 0;
    imgData.data[i * 4] = val;     // R
    imgData.data[i * 4 + 1] = val; // G
    imgData.data[i * 4 + 2] = val; // B
    imgData.data[i * 4 + 3] = 255; // A
  }
  ctx.putImageData(imgData, 0, 0);

  // Create target canvas and scale with nearest-neighbor
  const targetCanvas = document.createElement('canvas');
  targetCanvas.width = targetW;
  targetCanvas.height = targetH;
  const targetCtx = targetCanvas.getContext('2d')!;
  targetCtx.imageSmoothingEnabled = false; // Nearest neighbor
  targetCtx.drawImage(canvas, 0, 0, targetW, targetH);

  // Return as base64 PNG (strip data URL prefix)
  return targetCanvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
}

// ============================================================================
// Main Detection Function
// ============================================================================

/**
 * Run FastSAM grain detection on an image.
 *
 * @param imageData - ImageData from canvas
 * @param modelUrl - URL/path to the ONNX model (file:// URL from main process)
 * @param params - Detection parameters
 * @param progressCallback - Optional progress callback
 * @returns Detection result with masks
 */
export async function detectGrains(
  imageData: ImageData,
  modelUrl: string,
  params: FastSAMParams = {},
  progressCallback?: (info: ProgressInfo) => void
): Promise<FastSAMDetectionResult> {
  const startTime = Date.now();
  const mergedParams = { ...DEFAULT_PARAMS, ...params } as Required<FastSAMParams>;

  console.log('[FastSAM-Web] Starting detection with params:', mergedParams);

  // Load model if needed
  const modelSession = await loadModel(modelUrl, progressCallback);

  // Preprocess image
  const { tensor, preprocessInfo } = await preprocessImage(imageData, progressCallback);

  // Run inference
  if (progressCallback) {
    progressCallback({ step: 'Running inference...', percent: 40 });
  }

  const inferenceStart = Date.now();
  const feeds: Record<string, ort.Tensor> = {};
  feeds[modelSession.inputNames[0]] = tensor;

  const results = await modelSession.run(feeds);
  const inferenceTime = Date.now() - inferenceStart;
  console.log('[FastSAM-Web] Inference time:', inferenceTime, 'ms');

  // Post-process
  const output0 = results[modelSession.outputNames[0]];
  const output1 = results[modelSession.outputNames[1]];

  const rawMasks = postprocessOutput(output0, output1, mergedParams, preprocessInfo, progressCallback);

  // Upsample masks to original image size
  if (progressCallback) {
    progressCallback({ step: 'Preparing masks...', percent: 85 });
  }

  const { origW, origH } = preprocessInfo;
  const upsampledMasks: RawMask[] = [];

  for (let i = 0; i < rawMasks.length; i++) {
    const m = rawMasks[i];
    try {
      const maskBase64 = upsampleMask(m.mask, m.maskW, m.maskH, origW, origH);
      upsampledMasks.push({
        maskBase64,
        confidence: m.confidence,
        area: m.area,
        box: m.box,
      });
    } catch (err) {
      console.error('[FastSAM-Web] Error upsampling mask', i, ':', err);
    }
  }

  if (progressCallback) {
    progressCallback({ step: 'Detection complete', percent: 100 });
  }

  const totalTime = Date.now() - startTime;
  console.log('[FastSAM-Web] Total processing time:', totalTime, 'ms');

  return {
    masks: upsampledMasks,
    preprocessInfo: {
      origW,
      origH,
      scale: preprocessInfo.scale,
      padX: preprocessInfo.padX,
      padY: preprocessInfo.padY,
    },
    processingTimeMs: totalTime,
    inferenceTimeMs: inferenceTime,
    inputSize: INPUT_SIZE,
  };
}

export { INPUT_SIZE, DEFAULT_PARAMS };
