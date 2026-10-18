/**
 * Grain Spot model (docs/click-a-grain-design.md): SAM 2.1 tiny, int8 ONNX
 * (onnx-community/sam2.1-hiera-tiny-ONNX, Apache-2.0 upstream), four files,
 * about 61 MB. Downloaded once to userData/models/sam2.1-hiera-tiny-int8 from
 * a pinned revision, each file checked by size and SHA-256 before it is
 * kept. Inference runs in the renderer (src/services/grainSpot/).
 *
 * STRABO_GRAIN_MODEL_DIR (tests) points at a folder that already holds the
 * files, so every e2e copy does not download them again.
 *
 * @module grainSpotModel
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app } = require('electron');
const log = require('electron-log');
const { writeFileAtomic } = require('./atomicFile');

const REVISION = '814a066640debee5a91e70aa401fb8e17e030503';
const BASE_URL = `https://huggingface.co/onnx-community/sam2.1-hiera-tiny-ONNX/resolve/${REVISION}/onnx`;

/** The .onnx files name their weights files, so the names must stay as they are */
const FILES = [
  { role: 'encoder', name: 'vision_encoder_int8.onnx', size: 440423, sha256: 'd848e08b747ba44ee59b31246988528d5ecc67d1e1c0a2f5c08395c86d92176f' },
  { role: 'encoderData', name: 'vision_encoder_int8.onnx_data', size: 52573088, sha256: '4359d45f8aafcbc69f945e714af7fb06b74b24c753b5af86b6a230ecd0e737bc' },
  { role: 'decoder', name: 'prompt_encoder_mask_decoder_int8.onnx', size: 289885, sha256: 'e53727dc441a3c8716dd4a606d5bbf920e33e7545d1a6ff843c9fb804c7d19b6' },
  { role: 'decoderData', name: 'prompt_encoder_mask_decoder_int8.onnx_data', size: 8662016, sha256: 'fdb3179a32388267a944a416c0f992c77a138b69a4bfd94f0bbf7089430d7489' },
];
const TOTAL_BYTES = FILES.reduce((sum, f) => sum + f.size, 0);

function modelDir() {
  return process.env.STRABO_GRAIN_MODEL_DIR || path.join(app.getPath('userData'), 'models', 'sam2.1-hiera-tiny-int8');
}

/** Files present with the right size (the checksum was checked when they were saved) */
function isAvailable() {
  const dir = modelDir();
  return FILES.every((f) => {
    try {
      return fs.statSync(path.join(dir, f.name)).size === f.size;
    } catch {
      return false;
    }
  });
}

function status() {
  return { available: isAvailable(), totalBytes: TOTAL_BYTES };
}

let downloading = null;

/**
 * Download the missing files, one after another; progress({ percent, downloadedBytes, totalBytes }).
 * A second call while one runs shares it.
 */
function download(progress) {
  if (!downloading) {
    downloading = runDownload(progress).finally(() => {
      downloading = null;
    });
  }
  return downloading;
}

async function runDownload(progress) {
  const dir = modelDir();
  fs.mkdirSync(dir, { recursive: true });
  let done = 0;
  const report = () => progress?.({ percent: Math.round((done / TOTAL_BYTES) * 100), downloadedBytes: done, totalBytes: TOTAL_BYTES });
  for (const f of FILES) {
    const target = path.join(dir, f.name);
    try {
      if (fs.statSync(target).size === f.size) {
        done += f.size;
        report();
        continue;
      }
    } catch {
      // not there yet
    }
    log.info(`[GrainSpot] Downloading ${f.name} (${(f.size / 1e6).toFixed(1)} MB)`);
    const response = await fetch(`${BASE_URL}/${f.name}`);
    if (!response.ok || !response.body) throw new Error(`Download of ${f.name} failed: HTTP ${response.status}`);
    const chunks = [];
    let got = 0;
    for await (const chunk of response.body) {
      chunks.push(Buffer.from(chunk));
      got += chunk.length;
      done += chunk.length;
      report();
    }
    const data = Buffer.concat(chunks);
    const sha = crypto.createHash('sha256').update(data).digest('hex');
    if (data.length !== f.size || sha !== f.sha256) {
      throw new Error(`${f.name} did not download correctly (size ${got} of ${f.size}, checksum ${sha === f.sha256 ? 'ok' : 'wrong'})`);
    }
    await writeFileAtomic(target, data);
  }
  log.info(`[GrainSpot] Model ready in ${dir}`);
  report();
}

/** The four files' bytes for onnxruntime-web, by role */
async function load() {
  const dir = modelDir();
  const out = {};
  for (const f of FILES) out[f.role] = await fs.promises.readFile(path.join(dir, f.name));
  return { ...out, names: { encoderData: FILES[1].name, decoderData: FILES[3].name } };
}

/** IPC: grainspot:status, grainspot:download (progress on grainspot:download-progress), grainspot:load */
function registerIpc(ipcMain) {
  ipcMain.handle('grainspot:status', () => status());
  ipcMain.handle('grainspot:download', async (event) => {
    try {
      await download((p) => {
        if (!event.sender.isDestroyed()) event.sender.send('grainspot:download-progress', p);
      });
      return { success: true };
    } catch (error) {
      log.error('[GrainSpot] Download failed:', error);
      return { success: false, error: error.message };
    }
  });
  ipcMain.handle('grainspot:load', async () => {
    try {
      if (!isAvailable()) return { success: false, error: 'The grain model is not downloaded' };
      return { success: true, ...(await load()) };
    } catch (error) {
      log.error('[GrainSpot] Could not read the model:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { status, download, load, registerIpc, FILES, TOTAL_BYTES };
