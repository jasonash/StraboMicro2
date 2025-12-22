/**
 * FastSAM ONNX Inference Test
 *
 * Tests loading FastSAM ONNX model and running inference with onnxruntime-node
 *
 * YOLOv8-seg (FastSAM) output format:
 * - output0: [1, 116, 8400] = 4 bbox + 80 classes + 32 mask coefficients per detection
 * - output1: [1, 32, 160, 160] = 32 prototype masks at 160x160
 *
 * For 1024x1024 input, output1 will be [1, 32, 256, 256]
 */

import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const MODEL_PATH = path.join(__dirname, 'models', 'FastSAM-x.onnx');
const TEST_IMAGE = process.argv[2] || path.join(__dirname, 'test-image.tif');
const INPUT_SIZE = 1024; // Match GrainSight
const CONF_THRESHOLD = 0.25; // GrainSight uses 0.25-0.50
const IOU_THRESHOLD = 0.7;

/**
 * Preprocess image for YOLO input
 * - Resize to INPUT_SIZE x INPUT_SIZE (letterbox)
 * - Convert to RGB float32 normalized to [0, 1]
 * - Channel order: CHW (channels, height, width)
 */
async function preprocessImage(imagePath) {
  console.log(`Loading image: ${imagePath}`);
  const startTime = performance.now();

  // Load and get original dimensions
  const metadata = await sharp(imagePath).metadata();
  const { width: origW, height: origH } = metadata;
  console.log(`Original size: ${origW}x${origH}`);

  // Calculate letterbox dimensions (preserve aspect ratio)
  const scale = Math.min(INPUT_SIZE / origW, INPUT_SIZE / origH);
  const newW = Math.round(origW * scale);
  const newH = Math.round(origH * scale);
  const padX = Math.floor((INPUT_SIZE - newW) / 2);
  const padY = Math.floor((INPUT_SIZE - newH) / 2);

  console.log(`Resized: ${newW}x${newH}, padding: (${padX}, ${padY})`);

  // Resize and pad to INPUT_SIZE x INPUT_SIZE
  const { data, info } = await sharp(imagePath)
    .resize(newW, newH, { fit: 'fill' })
    .extend({
      top: padY,
      bottom: INPUT_SIZE - newH - padY,
      left: padX,
      right: INPUT_SIZE - newW - padX,
      background: { r: 114, g: 114, b: 114 } // YOLO gray padding
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

  const elapsed = performance.now() - startTime;
  console.log(`Preprocessing time: ${elapsed.toFixed(1)}ms`);

  return {
    tensor: new ort.Tensor('float32', float32Data, [1, 3, INPUT_SIZE, INPUT_SIZE]),
    scale,
    padX,
    padY,
    origW,
    origH
  };
}

/**
 * Apply sigmoid function
 */
function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Calculate IoU (Intersection over Union) for two boxes
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
 * Non-Maximum Suppression
 */
function nms(detections, iouThreshold) {
  // Sort by confidence (descending)
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
 * Post-process YOLOv8-seg output
 */
function postprocessOutput(output0, output1, preprocessInfo) {
  console.log('\nPost-processing outputs...');
  const startTime = performance.now();

  // output0 shape: [1, 116, 8400] for 80 classes
  // For FastSAM (1 class), shape might be [1, 37, 8400] = 4 + 1 + 32
  const output0Data = output0.data;
  const output0Dims = output0.dims;
  console.log(`output0 shape: [${output0Dims.join(', ')}]`);

  // output1 shape: [1, 32, H, W] - prototype masks
  const output1Data = output1.data;
  const output1Dims = output1.dims;
  console.log(`output1 shape: [${output1Dims.join(', ')}]`);

  const numDetections = output0Dims[2]; // 8400 typically
  const numFeatures = output0Dims[1]; // 116 for 80 classes, 37 for 1 class
  const numMaskCoeffs = 32;
  const numClasses = numFeatures - 4 - numMaskCoeffs;

  console.log(`Detections: ${numDetections}, Features: ${numFeatures}, Classes: ${numClasses}`);

  const maskH = output1Dims[2];
  const maskW = output1Dims[3];
  console.log(`Prototype mask size: ${maskH}x${maskW}`);

  // Extract detections above confidence threshold
  const detections = [];
  for (let i = 0; i < numDetections; i++) {
    // Get bbox center x, y, w, h
    const cx = output0Data[0 * numDetections + i];
    const cy = output0Data[1 * numDetections + i];
    const w = output0Data[2 * numDetections + i];
    const h = output0Data[3 * numDetections + i];

    // Find best class score
    let maxScore = 0;
    let maxClass = 0;
    for (let c = 0; c < numClasses; c++) {
      const score = output0Data[(4 + c) * numDetections + i];
      if (score > maxScore) {
        maxScore = score;
        maxClass = c;
      }
    }

    if (maxScore < CONF_THRESHOLD) continue;

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
      classId: maxClass,
      maskCoeffs
    });
  }

  console.log(`Detections above threshold: ${detections.length}`);

  // Apply NMS
  const nmsDetections = nms(detections, IOU_THRESHOLD);
  console.log(`Detections after NMS: ${nmsDetections.length}`);

  // Generate masks for each detection
  const masks = [];
  for (const det of nmsDetections) {
    // Compute mask: sigmoid(coeffs @ prototypes)
    // prototypes shape: [32, maskH, maskW]
    const mask = new Float32Array(maskH * maskW);

    for (let y = 0; y < maskH; y++) {
      for (let x = 0; x < maskW; x++) {
        let sum = 0;
        for (let m = 0; m < numMaskCoeffs; m++) {
          const protoIdx = m * maskH * maskW + y * maskW + x;
          sum += det.maskCoeffs[m] * output1Data[protoIdx];
        }
        mask[y * maskW + x] = sigmoid(sum) > 0.5 ? 1 : 0;
      }
    }

    masks.push({
      box: det.box,
      confidence: det.confidence,
      mask,
      maskH,
      maskW
    });
  }

  const elapsed = performance.now() - startTime;
  console.log(`Post-processing time: ${elapsed.toFixed(1)}ms`);

  return masks;
}

/**
 * Main inference function
 */
async function runInference() {
  console.log('=== FastSAM ONNX Inference Test ===\n');

  // Check if model exists
  if (!fs.existsSync(MODEL_PATH)) {
    console.error(`Model not found: ${MODEL_PATH}`);
    console.log('\nTo download the model, run:');
    console.log('  node download-model.js');
    console.log('Or download manually from Hugging Face');
    process.exit(1);
  }

  // Check if test image exists
  if (!fs.existsSync(TEST_IMAGE)) {
    console.error(`Test image not found: ${TEST_IMAGE}`);
    console.log('\nPlease provide a test image:');
    console.log('  node test-inference.js path/to/image.jpg');
    process.exit(1);
  }

  // Load model
  console.log(`Loading model: ${MODEL_PATH}`);
  const modelLoadStart = performance.now();
  const session = await ort.InferenceSession.create(MODEL_PATH, {
    executionProviders: ['cpu']
  });
  const modelLoadTime = performance.now() - modelLoadStart;
  console.log(`Model load time: ${modelLoadTime.toFixed(1)}ms`);

  // Print model info
  console.log('\nModel inputs:');
  for (const name of session.inputNames) {
    console.log(`  ${name}`);
  }
  console.log('Model outputs:');
  for (const name of session.outputNames) {
    console.log(`  ${name}`);
  }

  // Preprocess image
  console.log('\n--- Preprocessing ---');
  const preprocessInfo = await preprocessImage(TEST_IMAGE);

  // Run inference
  console.log('\n--- Running Inference ---');
  const inferenceStart = performance.now();

  const feeds = {};
  feeds[session.inputNames[0]] = preprocessInfo.tensor;

  const results = await session.run(feeds);
  const inferenceTime = performance.now() - inferenceStart;
  console.log(`Inference time: ${inferenceTime.toFixed(1)}ms`);

  // Print output shapes
  console.log('\nOutput tensors:');
  for (const name of session.outputNames) {
    const tensor = results[name];
    console.log(`  ${name}: [${tensor.dims.join(', ')}] (${tensor.type})`);
  }

  // Post-process
  console.log('\n--- Post-processing ---');
  const outputNames = session.outputNames;
  const output0 = results[outputNames[0]];
  const output1 = results[outputNames[1]];

  const masks = postprocessOutput(output0, output1, preprocessInfo);

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Model load time: ${modelLoadTime.toFixed(1)}ms`);
  console.log(`Inference time: ${inferenceTime.toFixed(1)}ms`);
  console.log(`Detected segments: ${masks.length}`);

  if (masks.length > 0) {
    console.log('\nFirst 5 detections:');
    for (let i = 0; i < Math.min(5, masks.length); i++) {
      const m = masks[i];
      console.log(`  ${i + 1}. conf=${m.confidence.toFixed(3)}, box=[${m.box.map(v => v.toFixed(0)).join(', ')}]`);
    }
  }

  // Write masks to file for debugging
  const outputPath = path.join(__dirname, 'output-masks.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    modelLoadTime,
    inferenceTime,
    numMasks: masks.length,
    masks: masks.map(m => ({
      confidence: m.confidence,
      box: m.box,
      maskSize: [m.maskH, m.maskW]
    }))
  }, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);

  return {
    modelLoadTime,
    inferenceTime,
    masks
  };
}

// Run
runInference().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
