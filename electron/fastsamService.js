/**
 * FastSAM Grain Detection Service
 *
 * Uses FastSAM (Fast Segment Anything Model) via ONNX Runtime for grain detection.
 * Based on GrainSight's approach but runs natively in Node.js.
 *
 * @module fastsamService
 */

const ort = require('onnxruntime-node');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

// ============================================================================
// Configuration
// ============================================================================

const INPUT_SIZE = 1024; // Match GrainSight default
const MODEL_FILENAME = 'FastSAM-x.onnx';
const MODEL_URL = 'https://huggingface.co/jasonash1/fastsam-onnx/resolve/main/FastSAM-x.onnx';
const MODEL_SIZE_BYTES = 289_000_000; // ~276MB, used for progress estimation

// Default detection parameters (matching GrainSight)
const DEFAULT_PARAMS = {
  confidenceThreshold: 0.5,
  iouThreshold: 0.7,
  minAreaPercent: 0.01, // Minimum area as % of image
  maxDetections: 500,
};

// ============================================================================
// State
// ============================================================================

let session = null;
let modelPath = null;
let isLoading = false;
let loadError = null;

// ============================================================================
// Model Management
// ============================================================================

/**
 * Get the path to the FastSAM ONNX model.
 * Checks multiple locations:
 * 1. App resources (bundled with app)
 * 2. User data directory (downloaded)
 * 3. Development prototypes folder
 */
function getModelPath() {
  if (modelPath && fs.existsSync(modelPath)) {
    return modelPath;
  }

  const possiblePaths = [
    // Bundled with app (production)
    path.join(process.resourcesPath || '', 'models', MODEL_FILENAME),
    // App user data directory (downloaded)
    path.join(app.getPath('userData'), 'models', MODEL_FILENAME),
    // Development: prototype folder
    path.join(__dirname, '..', 'prototypes', 'fastsam-onnx-test', 'models', MODEL_FILENAME),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      console.log('[FastSAM] Found model at:', p);
      modelPath = p;
      return p;
    }
  }

  console.log('[FastSAM] Model not found in any location:', possiblePaths);
  return null;
}

/**
 * Check if the FastSAM model is available.
 */
function isModelAvailable() {
  return getModelPath() !== null;
}

/**
 * Get the expected model download path.
 */
function getModelDownloadPath() {
  const modelsDir = path.join(app.getPath('userData'), 'models');
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
  }
  return path.join(modelsDir, MODEL_FILENAME);
}

/**
 * Get model status information.
 */
function getModelStatus() {
  const existingPath = getModelPath();
  if (existingPath) {
    const stats = fs.statSync(existingPath);
    return {
      available: true,
      path: existingPath,
      sizeBytes: stats.size,
    };
  }
  return {
    available: false,
    downloadPath: getModelDownloadPath(),
    downloadUrl: MODEL_URL,
    expectedSizeBytes: MODEL_SIZE_BYTES,
  };
}

/**
 * Download the FastSAM model from Hugging Face.
 * @param {function} progressCallback - Called with { percent, downloadedBytes, totalBytes, status }
 * @returns {Promise<string>} Path to downloaded model
 */
async function downloadModel(progressCallback = null) {
  const downloadPath = getModelDownloadPath();
  const tempPath = downloadPath + '.downloading';

  // Check if already downloaded
  if (fs.existsSync(downloadPath)) {
    console.log('[FastSAM] Model already exists at:', downloadPath);
    return downloadPath;
  }

  console.log('[FastSAM] Starting model download from:', MODEL_URL);
  console.log('[FastSAM] Download destination:', downloadPath);

  if (progressCallback) {
    progressCallback({ percent: 0, downloadedBytes: 0, totalBytes: MODEL_SIZE_BYTES, status: 'Starting download...' });
  }

  try {
    // Use dynamic import for node-fetch (ESM module)
    const fetch = (await import('node-fetch')).default;

    const response = await fetch(MODEL_URL);

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    const contentLength = parseInt(response.headers.get('content-length') || MODEL_SIZE_BYTES, 10);
    let downloadedBytes = 0;

    // Create write stream to temp file
    const fileStream = fs.createWriteStream(tempPath);

    // Process the response body as a stream
    for await (const chunk of response.body) {
      fileStream.write(chunk);
      downloadedBytes += chunk.length;

      if (progressCallback) {
        const percent = Math.round((downloadedBytes / contentLength) * 100);
        progressCallback({
          percent,
          downloadedBytes,
          totalBytes: contentLength,
          status: `Downloading... ${Math.round(downloadedBytes / 1024 / 1024)}MB / ${Math.round(contentLength / 1024 / 1024)}MB`,
        });
      }
    }

    fileStream.end();

    // Wait for file to finish writing
    await new Promise((resolve, reject) => {
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
    });

    // Rename temp file to final path
    fs.renameSync(tempPath, downloadPath);

    console.log('[FastSAM] Model downloaded successfully to:', downloadPath);

    // Clear cached model path so it gets re-detected
    modelPath = null;

    if (progressCallback) {
      progressCallback({ percent: 100, downloadedBytes: contentLength, totalBytes: contentLength, status: 'Download complete!' });
    }

    return downloadPath;
  } catch (err) {
    // Clean up partial download
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }

    console.error('[FastSAM] Download failed:', err);
    throw new Error(`Failed to download FastSAM model: ${err.message}`);
  }
}

/**
 * Load the FastSAM ONNX model.
 * The session is cached for subsequent calls.
 */
async function loadModel(progressCallback) {
  if (session) {
    return session;
  }

  if (isLoading) {
    // Wait for existing load to complete
    while (isLoading) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (loadError) throw loadError;
    return session;
  }

  isLoading = true;
  loadError = null;

  try {
    const modelFilePath = getModelPath();
    if (!modelFilePath) {
      throw new Error('FastSAM model not found. Please download the model first.');
    }

    if (progressCallback) {
      progressCallback({ step: 'Loading FastSAM model...', percent: 5 });
    }

    console.log('[FastSAM] Loading model from:', modelFilePath);
    const startTime = Date.now();

    session = await ort.InferenceSession.create(modelFilePath, {
      executionProviders: ['cpu'],
      // Optimize for single-threaded inference
      graphOptimizationLevel: 'all',
    });

    const loadTime = Date.now() - startTime;
    console.log('[FastSAM] Model loaded in', loadTime, 'ms');
    console.log('[FastSAM] Input names:', session.inputNames);
    console.log('[FastSAM] Output names:', session.outputNames);

    return session;
  } catch (err) {
    loadError = err;
    throw err;
  } finally {
    isLoading = false;
  }
}

/**
 * Unload the model to free memory.
 */
async function unloadModel() {
  if (session) {
    console.log('[FastSAM] Unloading model');
    session = null;
  }
}

// ============================================================================
// Image Preprocessing
// ============================================================================

/**
 * Preprocess image for FastSAM inference.
 * - Resize with letterboxing to INPUT_SIZE x INPUT_SIZE
 * - Convert to RGB float32 normalized to [0, 1]
 * - Channel order: CHW (channels, height, width)
 *
 * @param {string} imagePath - Path to the image file
 * @returns {Promise<{tensor, scale, padX, padY, origW, origH}>}
 */
async function preprocessImage(imagePath, progressCallback) {
  if (progressCallback) {
    progressCallback({ step: 'Preprocessing image...', percent: 15 });
  }

  // Load and get original dimensions
  const metadata = await sharp(imagePath).metadata();
  const { width: origW, height: origH } = metadata;
  console.log('[FastSAM] Original image size:', origW, 'x', origH);

  // Calculate letterbox dimensions (preserve aspect ratio)
  const scale = Math.min(INPUT_SIZE / origW, INPUT_SIZE / origH);
  const newW = Math.round(origW * scale);
  const newH = Math.round(origH * scale);
  const padX = Math.floor((INPUT_SIZE - newW) / 2);
  const padY = Math.floor((INPUT_SIZE - newH) / 2);

  console.log('[FastSAM] Resized:', newW, 'x', newH, ', padding:', padX, ',', padY);

  // Resize and pad to INPUT_SIZE x INPUT_SIZE
  const { data } = await sharp(imagePath)
    .resize(newW, newH, { fit: 'fill' })
    .extend({
      top: padY,
      bottom: INPUT_SIZE - newH - padY,
      left: padX,
      right: INPUT_SIZE - newW - padX,
      background: { r: 114, g: 114, b: 114 }, // YOLO gray padding
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Convert to float32 CHW format normalized to [0, 1]
  const float32Data = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < INPUT_SIZE; y++) {
      for (let x = 0; x < INPUT_SIZE; x++) {
        const srcIdx = (y * INPUT_SIZE + x) * 3 + c;
        const dstIdx = c * INPUT_SIZE * INPUT_SIZE + y * INPUT_SIZE + x;
        float32Data[dstIdx] = data[srcIdx] / 255.0;
      }
    }
  }

  return {
    tensor: new ort.Tensor('float32', float32Data, [1, 3, INPUT_SIZE, INPUT_SIZE]),
    scale,
    padX,
    padY,
    origW,
    origH,
  };
}

/**
 * Preprocess from buffer (for renderer images).
 */
async function preprocessFromBuffer(imageBuffer, progressCallback) {
  if (progressCallback) {
    progressCallback({ step: 'Preprocessing image...', percent: 15 });
  }

  const metadata = await sharp(imageBuffer).metadata();
  const { width: origW, height: origH } = metadata;
  console.log('[FastSAM] Original image size:', origW, 'x', origH);

  const scale = Math.min(INPUT_SIZE / origW, INPUT_SIZE / origH);
  const newW = Math.round(origW * scale);
  const newH = Math.round(origH * scale);
  const padX = Math.floor((INPUT_SIZE - newW) / 2);
  const padY = Math.floor((INPUT_SIZE - newH) / 2);

  console.log('[FastSAM] Resized:', newW, 'x', newH, ', padding:', padX, ',', padY);

  const { data } = await sharp(imageBuffer)
    .resize(newW, newH, { fit: 'fill' })
    .extend({
      top: padY,
      bottom: INPUT_SIZE - newH - padY,
      left: padX,
      right: INPUT_SIZE - newW - padX,
      background: { r: 114, g: 114, b: 114 },
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const float32Data = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < INPUT_SIZE; y++) {
      for (let x = 0; x < INPUT_SIZE; x++) {
        const srcIdx = (y * INPUT_SIZE + x) * 3 + c;
        const dstIdx = c * INPUT_SIZE * INPUT_SIZE + y * INPUT_SIZE + x;
        float32Data[dstIdx] = data[srcIdx] / 255.0;
      }
    }
  }

  return {
    tensor: new ort.Tensor('float32', float32Data, [1, 3, INPUT_SIZE, INPUT_SIZE]),
    scale,
    padX,
    padY,
    origW,
    origH,
  };
}

// ============================================================================
// Post-Processing
// ============================================================================

/**
 * Apply sigmoid function.
 */
function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Calculate IoU (Intersection over Union) for two boxes.
 */
function calculateIoU(box1, box2) {
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

/**
 * Non-Maximum Suppression.
 */
function nms(detections, iouThreshold) {
  detections.sort((a, b) => b.confidence - a.confidence);

  const kept = [];
  const suppressed = new Set();

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

/**
 * Post-process YOLOv8-seg (FastSAM) output.
 * Extracts detections and computes masks from the model output.
 *
 * @param {Tensor} output0 - Detection output [1, 37, N] where N = num detections
 * @param {Tensor} output1 - Prototype masks [1, 32, maskH, maskW]
 * @param {object} params - Detection parameters
 * @param {object} preprocessInfo - Preprocessing info (scale, padding, etc.)
 * @param {function} progressCallback - Progress callback
 * @returns {Array} Array of detection objects with masks
 */
function postprocessOutput(output0, output1, params, preprocessInfo, progressCallback) {
  if (progressCallback) {
    progressCallback({ step: 'Processing detections...', percent: 60 });
  }

  const output0Data = output0.data;
  const output0Dims = output0.dims;
  const output1Data = output1.data;
  const output1Dims = output1.dims;

  console.log('[FastSAM] output0 shape:', output0Dims);
  console.log('[FastSAM] output1 shape:', output1Dims);

  const numDetections = output0Dims[2];
  const numFeatures = output0Dims[1];
  const numMaskCoeffs = 32;
  const numClasses = numFeatures - 4 - numMaskCoeffs;

  const maskH = output1Dims[2];
  const maskW = output1Dims[3];

  console.log('[FastSAM] Detections:', numDetections, ', Classes:', numClasses);
  console.log('[FastSAM] Prototype mask size:', maskH, 'x', maskW);

  // Define active region (exclude padding)
  const { padX, padY } = preprocessInfo;
  const margin = 20;
  const activeTop = padY + margin;
  const activeBottom = INPUT_SIZE - padY - margin;
  const activeLeft = padX + margin;
  const activeRight = INPUT_SIZE - padX - margin;

  // Extract detections above confidence threshold
  const detections = [];
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

  console.log('[FastSAM] Detections above threshold:', detections.length);

  // Apply NMS
  if (progressCallback) {
    progressCallback({ step: 'Applying NMS...', percent: 70 });
  }

  const nmsDetections = nms(detections, params.iouThreshold);
  console.log('[FastSAM] Detections after NMS:', nmsDetections.length);

  // Limit detections
  const limitedDetections = nmsDetections.slice(0, params.maxDetections);

  // Compute masks for each detection
  if (progressCallback) {
    progressCallback({ step: 'Computing masks...', percent: 75 });
  }

  const results = [];
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
        const imgX = Math.floor(x * INPUT_SIZE / maskW);
        const imgY = Math.floor(y * INPUT_SIZE / maskH);

        if (sigmoid(sum) > 0.5 &&
            imgX >= det.box[0] && imgX <= det.box[2] &&
            imgY >= det.box[1] && imgY <= det.box[3]) {
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

  console.log('[FastSAM] Final detections after area filter:', results.length);
  return results;
}

// ============================================================================
// Main Detection Function
// ============================================================================

/**
 * Run FastSAM grain detection on an image.
 *
 * @param {string} imagePath - Path to the image file
 * @param {object} params - Detection parameters
 * @param {function} progressCallback - Optional progress callback
 * @returns {Promise<{masks: Array, preprocessInfo: object, processingTimeMs: number}>}
 */
async function detectGrains(imagePath, params = {}, progressCallback = null) {
  const startTime = Date.now();
  const mergedParams = { ...DEFAULT_PARAMS, ...params };

  console.log('[FastSAM] Starting detection with params:', mergedParams);

  // Load model
  const modelSession = await loadModel(progressCallback);

  // Preprocess image
  const preprocessInfo = await preprocessImage(imagePath, progressCallback);

  // Run inference
  if (progressCallback) {
    progressCallback({ step: 'Running inference...', percent: 40 });
  }

  const inferenceStart = Date.now();
  const feeds = {};
  feeds[modelSession.inputNames[0]] = preprocessInfo.tensor;

  const results = await modelSession.run(feeds);
  const inferenceTime = Date.now() - inferenceStart;
  console.log('[FastSAM] Inference time:', inferenceTime, 'ms');

  // Post-process
  const output0 = results[modelSession.outputNames[0]];
  const output1 = results[modelSession.outputNames[1]];

  const masks = postprocessOutput(output0, output1, mergedParams, preprocessInfo, progressCallback);

  if (progressCallback) {
    progressCallback({ step: 'Detection complete', percent: 100 });
  }

  const totalTime = Date.now() - startTime;
  console.log('[FastSAM] Total processing time:', totalTime, 'ms');

  return {
    masks,
    preprocessInfo,
    processingTimeMs: totalTime,
    inferenceTimeMs: inferenceTime,
    inputSize: INPUT_SIZE,
  };
}

/**
 * Run FastSAM detection from image buffer (for renderer images).
 */
async function detectGrainsFromBuffer(imageBuffer, params = {}, progressCallback = null) {
  const startTime = Date.now();
  const mergedParams = { ...DEFAULT_PARAMS, ...params };

  console.log('[FastSAM] Starting detection from buffer with params:', mergedParams);

  const modelSession = await loadModel(progressCallback);
  const preprocessInfo = await preprocessFromBuffer(imageBuffer, progressCallback);

  if (progressCallback) {
    progressCallback({ step: 'Running inference...', percent: 40 });
  }

  const inferenceStart = Date.now();
  const feeds = {};
  feeds[modelSession.inputNames[0]] = preprocessInfo.tensor;

  const results = await modelSession.run(feeds);
  const inferenceTime = Date.now() - inferenceStart;
  console.log('[FastSAM] Inference time:', inferenceTime, 'ms');

  const output0 = results[modelSession.outputNames[0]];
  const output1 = results[modelSession.outputNames[1]];

  const masks = postprocessOutput(output0, output1, mergedParams, preprocessInfo, progressCallback);

  if (progressCallback) {
    progressCallback({ step: 'Detection complete', percent: 100 });
  }

  const totalTime = Date.now() - startTime;
  console.log('[FastSAM] Total processing time:', totalTime, 'ms');

  return {
    masks,
    preprocessInfo,
    processingTimeMs: totalTime,
    inferenceTimeMs: inferenceTime,
    inputSize: INPUT_SIZE,
  };
}

// ============================================================================
// Mask Upsampling for OpenCV.js Processing
// ============================================================================

/**
 * Upsample a binary mask to a target size using Sharp.
 * Returns base64-encoded PNG for efficient transfer to renderer.
 *
 * @param {Uint8Array} mask - Binary mask (0/1 values)
 * @param {number} maskW - Mask width
 * @param {number} maskH - Mask height
 * @param {number} targetW - Target width
 * @param {number} targetH - Target height
 * @returns {Promise<string>} Base64-encoded PNG image
 */
async function upsampleMask(mask, maskW, maskH, targetW, targetH) {
  // Convert binary mask to grayscale image (0 or 255)
  const grayMask = Buffer.alloc(maskW * maskH);
  for (let i = 0; i < mask.length; i++) {
    grayMask[i] = mask[i] ? 255 : 0;
  }

  // Use Sharp to resize with nearest-neighbor interpolation (preserves binary values)
  const resized = await sharp(grayMask, {
    raw: { width: maskW, height: maskH, channels: 1 },
  })
    .resize(targetW, targetH, { kernel: 'nearest' })
    .png()
    .toBuffer();

  return resized.toString('base64');
}

/**
 * Run FastSAM detection and return raw masks for OpenCV.js processing.
 * This is the GrainSight-compatible approach where contour extraction
 * happens in the renderer using OpenCV.js.
 *
 * @param {string} imagePath - Path to the image file
 * @param {object} params - Detection parameters
 * @param {function} progressCallback - Optional progress callback
 * @returns {Promise<{masks: Array, preprocessInfo: object, processingTimeMs: number}>}
 */
async function detectGrainsRawMasks(imagePath, params = {}, progressCallback = null) {
  const startTime = Date.now();
  const mergedParams = { ...DEFAULT_PARAMS, ...params };

  console.log('[FastSAM] Starting raw mask detection with params:', mergedParams);

  // Load model
  const modelSession = await loadModel(progressCallback);

  // Preprocess image
  const preprocessInfo = await preprocessImage(imagePath, progressCallback);

  // Run inference
  if (progressCallback) {
    progressCallback({ step: 'Running inference...', percent: 40 });
  }

  const inferenceStart = Date.now();
  const feeds = {};
  feeds[modelSession.inputNames[0]] = preprocessInfo.tensor;

  const results = await modelSession.run(feeds);
  const inferenceTime = Date.now() - inferenceStart;
  console.log('[FastSAM] Inference time:', inferenceTime, 'ms');

  // Post-process to get masks
  const output0 = results[modelSession.outputNames[0]];
  const output1 = results[modelSession.outputNames[1]];

  const rawMasks = postprocessOutput(output0, output1, mergedParams, preprocessInfo, progressCallback);

  // Upsample masks to original image size
  if (progressCallback) {
    progressCallback({ step: 'Preparing masks for processing...', percent: 85 });
  }

  const { origW, origH } = preprocessInfo;
  const upsampledMasks = [];

  for (let i = 0; i < rawMasks.length; i++) {
    const m = rawMasks[i];
    try {
      const base64Mask = await upsampleMask(m.mask, m.maskW, m.maskH, origW, origH);
      upsampledMasks.push({
        maskBase64: base64Mask,
        confidence: m.confidence,
        area: m.area,
        box: m.box,
      });
    } catch (err) {
      console.error('[FastSAM] Error upsampling mask', i, ':', err);
    }
  }

  if (progressCallback) {
    progressCallback({ step: 'Masks ready', percent: 95 });
  }

  const totalTime = Date.now() - startTime;
  console.log('[FastSAM] Total processing time:', totalTime, 'ms');
  console.log('[FastSAM] Returning', upsampledMasks.length, 'upsampled masks');

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

/**
 * Run FastSAM detection from buffer and return raw masks.
 */
async function detectGrainsRawMasksFromBuffer(imageBuffer, params = {}, progressCallback = null) {
  const startTime = Date.now();
  const mergedParams = { ...DEFAULT_PARAMS, ...params };

  console.log('[FastSAM] Starting raw mask detection from buffer');

  const modelSession = await loadModel(progressCallback);
  const preprocessInfo = await preprocessFromBuffer(imageBuffer, progressCallback);

  if (progressCallback) {
    progressCallback({ step: 'Running inference...', percent: 40 });
  }

  const inferenceStart = Date.now();
  const feeds = {};
  feeds[modelSession.inputNames[0]] = preprocessInfo.tensor;

  const results = await modelSession.run(feeds);
  const inferenceTime = Date.now() - inferenceStart;
  console.log('[FastSAM] Inference time:', inferenceTime, 'ms');

  const output0 = results[modelSession.outputNames[0]];
  const output1 = results[modelSession.outputNames[1]];

  const rawMasks = postprocessOutput(output0, output1, mergedParams, preprocessInfo, progressCallback);

  if (progressCallback) {
    progressCallback({ step: 'Preparing masks for processing...', percent: 85 });
  }

  const { origW, origH } = preprocessInfo;
  const upsampledMasks = [];

  for (let i = 0; i < rawMasks.length; i++) {
    const m = rawMasks[i];
    try {
      const base64Mask = await upsampleMask(m.mask, m.maskW, m.maskH, origW, origH);
      upsampledMasks.push({
        maskBase64: base64Mask,
        confidence: m.confidence,
        area: m.area,
        box: m.box,
      });
    } catch (err) {
      console.error('[FastSAM] Error upsampling mask', i, ':', err);
    }
  }

  if (progressCallback) {
    progressCallback({ step: 'Masks ready', percent: 95 });
  }

  const totalTime = Date.now() - startTime;
  console.log('[FastSAM] Total processing time:', totalTime, 'ms');

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

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Model management
  isModelAvailable,
  getModelPath,
  getModelDownloadPath,
  getModelStatus,
  downloadModel,
  loadModel,
  unloadModel,

  // Detection (original - with broken contour extraction)
  detectGrains,
  detectGrainsFromBuffer,

  // Detection (new - returns raw masks for OpenCV.js processing)
  detectGrainsRawMasks,
  detectGrainsRawMasksFromBuffer,

  // Constants
  INPUT_SIZE,
  DEFAULT_PARAMS,
};
