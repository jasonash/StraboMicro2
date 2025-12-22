/**
 * FastSAM test with GrainSight-style filtering
 * - Filter by minimum area
 * - Filter by roundness (0 <= r <= 1)
 */

import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MODEL_PATH = path.join(__dirname, 'models', 'FastSAM-x.onnx');
const TEST_IMAGE = process.argv[2] || path.join(__dirname, 'test-image-xpl.tif');
const INPUT_SIZE = 1024;
const CONF_THRESHOLD = 0.50;
const IOU_THRESHOLD = 0.7;
const MIN_AREA_PERCENT = 0.03; // Minimum area as % of image

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
  console.log('=== FastSAM Test with GrainSight-style Filtering ===\n');

  const session = await ort.InferenceSession.create(MODEL_PATH, { executionProviders: ['cpu'] });
  console.log('Model loaded');

  const metadata = await sharp(TEST_IMAGE).metadata();
  const { width: origW, height: origH } = metadata;
  console.log(`Image: ${origW}x${origH}`);

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
  const startTime = performance.now();
  const tensor = new ort.Tensor('float32', float32Data, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  const results = await session.run({ [session.inputNames[0]]: tensor });
  console.log(`Inference time: ${(performance.now() - startTime).toFixed(0)}ms`);

  const output0 = results.output0;
  const output1 = results.output1;
  const numDetections = output0.dims[2];
  const numMaskCoeffs = 32;
  const maskH = output1.dims[2];
  const maskW = output1.dims[3];

  // Define the active region (exclude padding where black border is)
  // padY is the top/bottom padding where border fragments might be detected
  const activeTop = padY + 20; // Skip first 20px of image content
  const activeBottom = INPUT_SIZE - padY - 20;
  const activeLeft = 50; // Skip left edge
  const activeRight = INPUT_SIZE - 50; // Skip right edge

  console.log(`Active region: y=${activeTop}-${activeBottom}, x=${activeLeft}-${activeRight}`);

  // Extract detections
  const detections = [];
  for (let i = 0; i < numDetections; i++) {
    const cx = output0.data[0 * numDetections + i];
    const cy = output0.data[1 * numDetections + i];
    const w = output0.data[2 * numDetections + i];
    const h = output0.data[3 * numDetections + i];
    const score = output0.data[4 * numDetections + i];

    if (score < CONF_THRESHOLD) continue;

    // Skip detections outside active region (in the black border area)
    if (cy < activeTop || cy > activeBottom || cx < activeLeft || cx > activeRight) continue;

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

  console.log(`Raw detections (conf >= ${CONF_THRESHOLD}): ${detections.length}`);

  // Apply NMS
  const nmsDetections = nms(detections, IOU_THRESHOLD);
  console.log(`After NMS: ${nmsDetections.length}`);

  // Calculate mask areas and filter
  const imageArea = INPUT_SIZE * INPUT_SIZE;
  const minArea = imageArea * (MIN_AREA_PERCENT / 100);

  const filteredDetections = [];
  for (const det of nmsDetections) {
    // Compute mask and count pixels
    let maskPixels = 0;
    const boxArea = (det.box[2] - det.box[0]) * (det.box[3] - det.box[1]);

    // Quick area estimate from bounding box
    if (boxArea < minArea) continue;

    // Compute actual mask area
    for (let my = 0; my < maskH; my++) {
      for (let mx = 0; mx < maskW; mx++) {
        let sum = 0;
        for (let m = 0; m < numMaskCoeffs; m++) {
          sum += det.maskCoeffs[m] * output1.data[m * maskH * maskW + my * maskW + mx];
        }

        if (sigmoid(sum) > 0.5) {
          const imgX = Math.floor(mx * INPUT_SIZE / maskW);
          const imgY = Math.floor(my * INPUT_SIZE / maskH);
          if (imgX >= det.box[0] && imgX <= det.box[2] &&
              imgY >= det.box[1] && imgY <= det.box[3]) {
            maskPixels++;
          }
        }
      }
    }

    // Scale mask pixels to image coordinates
    const scaledMaskArea = maskPixels * (INPUT_SIZE / maskW) * (INPUT_SIZE / maskH);

    if (scaledMaskArea >= minArea) {
      // Calculate roundness: 4π*area/perimeter²
      // Approximate perimeter from bounding box
      const perimeter = 2 * ((det.box[2] - det.box[0]) + (det.box[3] - det.box[1]));
      const roundness = (4 * Math.PI * scaledMaskArea) / (perimeter * perimeter);

      // Filter by roundness (GrainSight uses 0 <= roundness <= 1)
      if (roundness >= 0 && roundness <= 1.5) { // Slightly relaxed
        filteredDetections.push({
          ...det,
          area: scaledMaskArea,
          roundness
        });
      }
    }
  }

  console.log(`After area/roundness filter: ${filteredDetections.length}`);

  // Size distribution
  const sizes = filteredDetections.map(d => d.area);
  sizes.sort((a, b) => a - b);
  console.log(`\nArea distribution:`);
  console.log(`  Min: ${sizes[0]?.toFixed(0)} px²`);
  console.log(`  Median: ${sizes[Math.floor(sizes.length/2)]?.toFixed(0)} px²`);
  console.log(`  Max: ${sizes[sizes.length-1]?.toFixed(0)} px²`);

  // Confidence distribution
  const confs = filteredDetections.map(d => d.confidence);
  confs.sort((a, b) => a - b);
  console.log(`\nConfidence distribution:`);
  console.log(`  Min: ${confs[0]?.toFixed(3)}`);
  console.log(`  Median: ${confs[Math.floor(confs.length/2)]?.toFixed(3)}`);
  console.log(`  Max: ${confs[confs.length-1]?.toFixed(3)}`);

  // Create visualization
  console.log('\nCreating visualization...');
  const colors = filteredDetections.map(() => [
    Math.floor(Math.random() * 200) + 55,
    Math.floor(Math.random() * 200) + 55,
    Math.floor(Math.random() * 200) + 55
  ]);

  const overlay = Buffer.alloc(INPUT_SIZE * INPUT_SIZE * 4);

  for (let idx = 0; idx < filteredDetections.length; idx++) {
    const det = filteredDetections[idx];
    const [r, g, b] = colors[idx];

    for (let my = 0; my < maskH; my++) {
      for (let mx = 0; mx < maskW; mx++) {
        let sum = 0;
        for (let m = 0; m < numMaskCoeffs; m++) {
          sum += det.maskCoeffs[m] * output1.data[m * maskH * maskW + my * maskW + mx];
        }

        if (sigmoid(sum) > 0.5) {
          const imgX = Math.floor(mx * INPUT_SIZE / maskW);
          const imgY = Math.floor(my * INPUT_SIZE / maskH);

          if (imgX >= det.box[0] && imgX <= det.box[2] &&
              imgY >= det.box[1] && imgY <= det.box[3]) {
            const pixelIdx = (imgY * INPUT_SIZE + imgX) * 4;
            overlay[pixelIdx] = r;
            overlay[pixelIdx + 1] = g;
            overlay[pixelIdx + 2] = b;
            overlay[pixelIdx + 3] = 128;
          }
        }
      }
    }
  }

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

  const outputPath = path.join(__dirname, 'output-filtered.png');
  await sharp(baseImage)
    .composite([{ input: overlayImage, blend: 'over' }])
    .toFile(outputPath);

  console.log(`\n=== Summary ===`);
  console.log(`GrainSight detected: 91 grains`);
  console.log(`Our implementation: ${filteredDetections.length} segments`);
  console.log(`Visualization: ${outputPath}`);
}

run().catch(console.error);
