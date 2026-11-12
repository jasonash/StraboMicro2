/**
 * Image stitcher: what the main process does for it (IPC `stitch:*`).
 *
 * - prepare: checks one chosen image and makes a small color copy of it in the scratch folder
 *   (long side at most 2048 px) plus a thumbnail. The stitcher's workers find features on that
 *   copy and the review screen draws it; the original is read again only to build the mosaic.
 * - build: the mosaic from the originals and their placements (mosaicBuilder.js), with progress
 *   and cancel; save-as: the built mosaic as a JPEG, PNG or TIFF somewhere else.
 * - preview: a prepared image's copy as JPEG bytes, for the review canvas; choose-folder: every
 *   supported image in a folder; save-dialog: Save As for the built mosaic.
 * - machine: processors and memory, for the number of workers.
 * - cleanup: removes the session's scratch folder.
 *
 * A session is one run of the stitcher wizard; its files live in <scratch>/stitch-<session>/.
 *
 * Design: docs/image-stitcher-design.md
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { BrowserWindow, dialog } = require('electron');
const log = require('electron-log');
const dialogDirs = require('./dialogDirs');
const scratchSpace = require('./scratchSpace');
const imageConverter = require('./imageConverter');
const { openUserImage } = require('./userImage');
const { buildMosaic, saveMosaicAs, BuildCancelled } = require('./mosaicBuilder');

/** Long side of the preview copy: the harder matching level reads it at this size */
const PREVIEW_SIDE = 2048;
const THUMBNAIL_SIDE = 160;

function sessionDir(session) {
  if (typeof session !== 'string' || !/^[a-z0-9-]{1,64}$/.test(session)) throw new Error('Bad stitch session');
  return path.join(scratchSpace.scratchDir, `stitch-${session}`);
}

async function prepare(session, index, imagePath) {
  if (!Number.isInteger(index) || index < 0) throw new Error('Bad image number');
  const validation = await imageConverter.validateImageFile(imagePath);
  if (!validation.valid) return { ok: false, error: validation.error };
  const dir = sessionDir(session);
  await fs.promises.mkdir(dir, { recursive: true });
  let opened;
  try {
    opened = await openUserImage(imagePath);
  } catch (error) {
    log.warn('[Stitch] Could not open', imagePath, error.message);
    return { ok: false, error: `"${path.basename(imagePath)}" could not be read (${error.message}).` };
  }
  const f = Math.min(1, PREVIEW_SIDE / Math.max(opened.width, opened.height));
  const previewWidth = Math.max(1, Math.round(opened.width * f));
  const previewHeight = Math.max(1, Math.round(opened.height * f));
  const previewPath = path.join(dir, `tile-${index}.jpg`);
  try {
    await opened.image().resize(previewWidth, previewHeight, { fit: 'fill' }).removeAlpha().jpeg({ quality: 90 }).toFile(previewPath);
    const thumb = await opened.image().resize(THUMBNAIL_SIDE, THUMBNAIL_SIDE, { fit: 'inside' }).removeAlpha().jpeg({ quality: 75 }).toBuffer();
    return {
      ok: true,
      width: opened.width,
      height: opened.height,
      previewPath,
      previewWidth,
      previewHeight,
      thumbnail: `data:image/jpeg;base64,${thumb.toString('base64')}`,
    };
  } catch (error) {
    log.warn('[Stitch] Could not make a preview of', imagePath, error.message);
    return { ok: false, error: `"${path.basename(imagePath)}" could not be read (${error.message}).` };
  }
}

/** The preview copy of one image as JPEG bytes, shrunk for the review canvas when asked */
async function preview(session, index, maxSide) {
  if (!Number.isInteger(index) || index < 0) throw new Error('Bad image number');
  const file = path.join(sessionDir(session), `tile-${index}.jpg`);
  if (!(maxSide > 0) || maxSide >= PREVIEW_SIDE) return new Uint8Array(await fs.promises.readFile(file));
  const data = await sharp(file).resize(Math.round(maxSide), Math.round(maxSide), { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  return new Uint8Array(data);
}

/** Image types the stitcher takes: those of the import's file picker */
const IMAGE_EXTENSIONS = ['.tif', '.tiff', '.jpg', '.jpeg', '.png', '.bmp'];

/** Every supported image directly in a folder (not its subfolders), in the order a person reads the names */
async function imagesInFolder(folder) {
  const entries = await fs.promises.readdir(folder, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && !e.name.startsWith('.') && IMAGE_EXTENSIONS.includes(path.extname(e.name).toLowerCase()))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map((name) => path.join(folder, name));
}

async function chooseFolder(window) {
  const result = await dialog.showOpenDialog(window, {
    title: 'Select a Folder of Images',
    defaultPath: dialogDirs.getDefaultPath('images'),
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true, paths: [] };
  const folder = result.filePaths[0];
  const paths = await imagesInFolder(folder);
  if (paths.length > 0) dialogDirs.remember('images', paths[0]);
  return { canceled: false, folder, paths };
}

const FORMAT_OF = { '.jpg': 'jpeg', '.jpeg': 'jpeg', '.png': 'png', '.tif': 'tiff', '.tiff': 'tiff' };

/** Save dialog, then the built mosaic in the format the chosen name ends in (JPEG if none) */
async function saveWithDialog(window, session, defaultName) {
  const result = await dialog.showSaveDialog(window, {
    title: 'Save Mosaic',
    defaultPath: `${defaultName}.jpg`,
    filters: [
      { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] },
      { name: 'PNG Image', extensions: ['png'] },
      { name: 'TIFF Image', extensions: ['tif', 'tiff'] },
    ],
  });
  if (result.canceled || !result.filePath) return { success: false, canceled: true };
  let outputPath = result.filePath;
  let format = FORMAT_OF[path.extname(outputPath).toLowerCase()];
  if (!format) {
    outputPath += '.jpg';
    format = 'jpeg';
  }
  return saveAs(session, outputPath, format);
}

/** session -> { cancelled } of the build in progress */
const builds = new Map();

async function build(session, job, onProgress) {
  const dir = sessionDir(session);
  if (builds.has(session)) throw new Error('This mosaic is already being built');
  await fs.promises.mkdir(dir, { recursive: true });
  const state = { cancelled: false };
  builds.set(session, state);
  const started = Date.now();
  try {
    const result = await buildMosaic({
      tiles: job.tiles,
      width: job.width,
      height: job.height,
      crop: job.crop,
      fill: job.fill,
      outputPath: path.join(dir, 'mosaic.tif'),
      onProgress,
      isCancelled: () => state.cancelled,
    });
    log.info(`[Stitch] Mosaic of ${job.tiles.length} images built: ${result.width} x ${result.height} in ${Date.now() - started} ms`);
    return { success: true, path: result.path, width: result.width, height: result.height };
  } catch (error) {
    if (error instanceof BuildCancelled) return { success: false, cancelled: true };
    log.error('[Stitch] Build failed:', error);
    return { success: false, error: error.message };
  } finally {
    builds.delete(session);
  }
}

function cancelBuild(session) {
  const state = builds.get(session);
  if (state) state.cancelled = true;
}

async function saveAs(session, outputPath, format) {
  const source = path.join(sessionDir(session), 'mosaic.tif');
  try {
    if (format === 'tiff-plain') await fs.promises.copyFile(source, outputPath);
    else await saveMosaicAs(source, outputPath, format);
    return { success: true, path: outputPath };
  } catch (error) {
    log.error('[Stitch] Save failed:', error);
    return { success: false, error: error.message };
  }
}

async function cleanup(session) {
  cancelBuild(session);
  await fs.promises.rm(sessionDir(session), { recursive: true, force: true });
}

function machine() {
  const processors = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
  return { processors, memoryGb: os.totalmem() / 1073741824 };
}

function registerIpc(ipcMain) {
  ipcMain.handle('stitch:machine', () => machine());
  ipcMain.handle('stitch:prepare', (event, session, index, imagePath) => prepare(session, index, imagePath));
  ipcMain.handle('stitch:build', (event, session, job) =>
    build(session, job, (done, total) => {
      if (!event.sender.isDestroyed()) event.sender.send('stitch:build-progress', { session, done, total });
    }));
  ipcMain.handle('stitch:cancel-build', (event, session) => cancelBuild(session));
  ipcMain.handle('stitch:save-as', (event, session, outputPath, format) => saveAs(session, outputPath, format));
  ipcMain.handle('stitch:preview', (event, session, index, maxSide) => preview(session, index, maxSide));
  ipcMain.handle('stitch:choose-folder', (event) => chooseFolder(BrowserWindow.fromWebContents(event.sender)));
  ipcMain.handle('stitch:save-dialog', (event, session, defaultName) => saveWithDialog(BrowserWindow.fromWebContents(event.sender), session, defaultName));
  ipcMain.handle('stitch:cleanup', (event, session) => cleanup(session));
}

module.exports = { registerIpc, prepare, preview, imagesInFolder, build, cancelBuild, saveAs, cleanup, machine, PREVIEW_SIDE };
