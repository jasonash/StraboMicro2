/**
 * Visualize FastSAM masks by overlaying them on the original image
 */

import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MODEL_PATH = path.join(__dirname, 'models', 'FastSAM-x.onnx');
const TEST_IMAGE = process.argv[2] || path.join(__dirname, 'test-image.tif');
const OUTPUT_IMAGE = path.join(__dirname, 'output-visualization.png');
const INPUT_SIZE = 1024;
const CONF_THRESHOLD = 0.25;
const IOU_THRESHOLD = 0.7;

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function calculateIoU(box1, box2) {
  const x1 = Math.max(box1[0], box2[0]);
  const y1 = Math.max(box1[1], box2[1]);
  const x2 = Math.min(box1[2], box2[2]);
  const y2 = Math.min(box1[3], box2[3]);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const area1 = (box1[2] - box1[0]) * (box1[3] - box1[1]);
  const area2 = (box2[2] - box2[0]) * (box2[3] - box2[1]);
  return (area1 + area2 - intersection) > 0 ? intersection / (area1 + area2 - intersection) : 0;
}

function nms(detections, iouThreshold) {
  detections.sort((a, b) => b.confidence - a.confidence);
  const kept = [];
  const suppressed = new Set();
  for (let i = 0; i < detections.length; i++) {
    if (suppressed.has(i)) continue;
    kept.push(detections[i]);
    for (let j = i + 1; j < detections.length; j++) {
      if (!suppressed.has(j) && calculateIoU(detections[i].box, detections[j].box) > iouThreshold) {
        suppressed.add(j);
      }
    }
  }
  return kept;
}

async function run() {
  console.log('Loading model...');
  const session = await ort.InferenceSession.create(MODEL_PATH, { executionProviders: ['cpu'] });

  console.log('Loading image...');
  const metadata = await sharp(TEST_IMAGE).metadata();
  const { width: origW, height: origH } = metadata;

  const scale = Math.min(INPUT_SIZE / origW, INPUT_SIZE / origH);
  const newW = Math.round(origW * scale);
  const newH = Math.round(origH * scale);
  const padX = Math.floor((INPUT_SIZE - newW) / 2);
  const padY = Math.floor((INPUT_SIZE - newH) / 2);

  const { data: preprocessedData } = await sharp(TEST_IMAGE)
    .resize(newW, newH, { fit: 'fill' })
    .extend({
      top: padY, bottom: INPUT_SIZE - newH - padY,
      left: padX, right: INPUT_SIZE - newW - padX,
      background: { r: 114, g: 114, b: 114 }
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const float32Data = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < INPUT_SIZE; y++) {
      for (let x = 0; x < INPUT_SIZE; x++) {
        float32Data[c * INPUT_SIZE * INPUT_SIZE + y * INPUT_SIZE + x] =
          preprocessedData[(y * INPUT_SIZE + x) * 3 + c] / 255.0;
      }
    }
  }

  console.log('Running inference...');
  const tensor = new ort.Tensor('float32', float32Data, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  const results = await session.run({ [session.inputNames[0]]: tensor });

  const output0 = results.output0;
  const output1 = results.output1;
  const numDetections = output0.dims[2];
  const numMaskCoeffs = 32;
  const maskH = output1.dims[2];
  const maskW = output1.dims[3];

  console.log('Post-processing...');
  const detections = [];
  for (let i = 0; i < numDetections; i++) {
    const cx = output0.data[0 * numDetections + i];
    const cy = output0.data[1 * numDetections + i];
    const w = output0.data[2 * numDetections + i];
    const h = output0.data[3 * numDetections + i];
    const score = output0.data[4 * numDetections + i];

    if (score < CONF_THRESHOLD) continue;

    const maskCoeffs = new Float32Array(numMaskCoeffs);
    for (let m = 0; m < numMaskCoeffs; m++) {
      maskCoeffs[m] = output0.data[(5 + m) * numDetections + i];
    }

    detections.push({
      box: [cx - w/2, cy - h/2, cx + w/2, cy + h/2],
      confidence: score,
      maskCoeffs
    });
  }

  const nmsDetections = nms(detections, IOU_THRESHOLD);
  console.log(`Detected ${nmsDetections.length} segments`);

  // Create visualization overlay
  console.log('Creating visualization...');

  // Generate random colors for each mask
  const colors = nmsDetections.map(() => [
    Math.floor(Math.random() * 200) + 55,
    Math.floor(Math.random() * 200) + 55,
    Math.floor(Math.random() * 200) + 55
  ]);

  // Create RGBA overlay buffer for the 1024x1024 processed image
  const overlay = Buffer.alloc(INPUT_SIZE * INPUT_SIZE * 4);

  for (let idx = 0; idx < nmsDetections.length; idx++) {
    const det = nmsDetections[idx];
    const [r, g, b] = colors[idx];

    // Compute mask from coefficients
    for (let my = 0; my < maskH; my++) {
      for (let mx = 0; mx < maskW; mx++) {
        let sum = 0;
        for (let m = 0; m < numMaskCoeffs; m++) {
          sum += det.maskCoeffs[m] * output1.data[m * maskH * maskW + my * maskW + mx];
        }

        if (sigmoid(sum) > 0.5) {
          // Scale mask coords to INPUT_SIZE
          const imgX = Math.floor(mx * INPUT_SIZE / maskW);
          const imgY = Math.floor(my * INPUT_SIZE / maskH);

          // Check if within bounding box
          if (imgX >= det.box[0] && imgX <= det.box[2] &&
              imgY >= det.box[1] && imgY <= det.box[3]) {
            const pixelIdx = (imgY * INPUT_SIZE + imgX) * 4;
            overlay[pixelIdx] = r;
            overlay[pixelIdx + 1] = g;
            overlay[pixelIdx + 2] = b;
            overlay[pixelIdx + 3] = 128; // 50% opacity
          }
        }
      }
    }
  }

  // Composite overlay on preprocessed image
  const baseImage = await sharp(TEST_IMAGE)
    .resize(newW, newH, { fit: 'fill' })
    .extend({
      top: padY, bottom: INPUT_SIZE - newH - padY,
      left: padX, right: INPUT_SIZE - newW - padX,
      background: { r: 114, g: 114, b: 114 }
    })
    .png()
    .toBuffer();

  const overlayImage = await sharp(overlay, {
    raw: { width: INPUT_SIZE, height: INPUT_SIZE, channels: 4 }
  }).png().toBuffer();

  await sharp(baseImage)
    .composite([{ input: overlayImage, blend: 'over' }])
    .toFile(OUTPUT_IMAGE);

  console.log(`Visualization saved to: ${OUTPUT_IMAGE}`);
}

run().catch(console.error);
