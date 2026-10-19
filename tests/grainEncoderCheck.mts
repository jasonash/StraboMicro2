/**
 * Grain Spot GPU self-check (src/services/grainSpot/encoderCheck.ts): runs
 * the fp32 encoder on the CPU (onnxruntime-web in Node) on the built-in test
 * image and checks the values against EXPECTED; with --write, prints new
 * EXPECTED values to paste into encoderCheck.ts. Also checks that a slightly
 * wrong result is caught.
 *
 *   npm run test:grain-encoder-check [-- --write]
 *
 * Needs the model in ~/.cache/strabomicro-e2e/sam2.1-hiera-tiny-fp32
 * (npm run e2e -- 19-grain-spot downloads it) or GRAIN_MODEL_DIR.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import * as ort from 'onnxruntime-web';
import { checkImage, difference, pixelValues, sample, EXPECTED, INPUT, MAX_DIFFERENCE } from '../src/services/grainSpot/encoderCheck.ts';

const dir = process.env.GRAIN_MODEL_DIR || path.join(os.homedir(), '.cache', 'strabomicro-e2e', 'sam2.1-hiera-tiny-fp32');
if (!fs.existsSync(path.join(dir, 'vision_encoder.onnx_data'))) {
  console.error(`The model is not in ${dir} (run npm run e2e -- 19-grain-spot once, or set GRAIN_MODEL_DIR)`);
  process.exit(1);
}

ort.env.wasm.numThreads = 1;
ort.env.logLevel = 'error';
const session = await ort.InferenceSession.create(fs.readFileSync(path.join(dir, 'vision_encoder.onnx')), {
  executionProviders: ['wasm'],
  logSeverityLevel: 3,
  externalData: [{ path: 'vision_encoder.onnx_data', data: fs.readFileSync(path.join(dir, 'vision_encoder.onnx_data')) }],
});
const image = checkImage();
const result = await session.run({ pixel_values: new ort.Tensor('float32', pixelValues(image.rgba, image.width, image.height), [1, 3, INPUT, INPUT]) });
const outputs = Object.fromEntries(Object.entries(result).map(([name, t]) => [name, t.data as Float32Array]));

if (process.argv.includes('--write')) {
  const lines = Object.entries(outputs).map(([name, data]) => `  '${name}': [${sample(data).map((v) => Number(v.toFixed(5))).join(', ')}],`);
  console.log(`export const EXPECTED: Record<string, number[]> = {\n${lines.join('\n')}\n};`);
  process.exit(0);
}

let failures = 0;
let passes = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${name}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ''}`);
}

check('EXPECTED has the three encoder outputs', ['image_embeddings.0', 'image_embeddings.1', 'image_embeddings.2'].every((n) => (EXPECTED[n]?.length ?? 0) > 0), Object.keys(EXPECTED));
const same = difference(outputs, EXPECTED);
check('the CPU result matches EXPECTED', same < 1e-3, same);
// A GPU that is off by a few percent is caught; one that is right is not
const scaled = Object.fromEntries(Object.entries(outputs).map(([n, d]) => [n, d.map((v) => v * 1.1)]));
check('a result 10 % off is caught', difference(scaled, EXPECTED) > MAX_DIFFERENCE, difference(scaled, EXPECTED));
const shuffled = Object.fromEntries(Object.entries(outputs).map(([n, d]) => [n, Float32Array.from(d).reverse()]));
check('a scrambled result is caught', difference(shuffled, EXPECTED) > MAX_DIFFERENCE, difference(shuffled, EXPECTED));
const nan = Object.fromEntries(Object.entries(outputs).map(([n, d]) => [n, Float32Array.from(d).fill(NaN, 0, 1)]));
check('a non-number is caught', difference(nan, EXPECTED) === Infinity);
check('a missing output is caught', difference({ 'image_embeddings.0': outputs['image_embeddings.0'] }, EXPECTED) === Infinity);

console.log(failures === 0 ? `\nALL PASSED (${passes} checks)` : `\n${failures} FAILED, ${passes} passed`);
if (failures > 0) process.exit(1);
