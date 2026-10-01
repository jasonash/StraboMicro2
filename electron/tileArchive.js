/**
 * Tile pyramid packaging
 *
 * Collects a micrograph's tile pyramid from the local tile cache in the
 * layout the .smz format, the web viewer and the sync server share:
 *
 *   metadata.json
 *   thumbnail.jpg
 *   medium.jpg
 *   tiles/tile_<x>_<y>.webp
 *
 * .smz export appends these entries under tiles/<micrographId>/ (and, for
 * affine overlays, the pre-transformed pyramid under tilesAffine/<id>/).
 * Sync uploads the same entries as one standalone ZIP per pyramid.
 *
 * Standalone ZIPs are deterministic: entries in a fixed order, a fixed
 * timestamp, no compression (WebP and JPEG are already compressed). The same
 * tiles therefore always produce the same bytes and the same SHA-256, so an
 * unchanged pyramid is never uploaded twice.
 *
 * Callers make sure the pyramid is complete first
 * (tileGenerator.processImageComplete); this module only reads the cache.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const log = require('electron-log');
const tileCache = require('./tileCache');
const { pipeline } = require('stream/promises');
const { tempPathFor, syncFile, moveIntoPlace } = require('./atomicFile');

/** Entry timestamp for standalone ZIPs (UTC; archiver writes UTC by default). */
const FIXED_ENTRY_DATE = new Date(Date.UTC(2000, 0, 1, 0, 0, 0));

/**
 * @typedef {Object} TileEntry
 * @property {string} name - Path inside the pyramid, e.g. 'tiles/tile_0_0.webp'
 * @property {string} [filePath] - Cache file to read
 * @property {string} [data] - Generated content (normalized affine metadata)
 */

/** Byte-order name comparison, so the order never depends on locale. */
function compareNames(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Tile file names in a cache folder, sorted
 * @param {string} dir
 * @param {(name: string) => boolean} keep
 * @returns {Promise<string[] | null>} null when the folder does not exist
 */
async function listTileFiles(dir, keep) {
  if (!fs.existsSync(dir)) return null;
  const names = await fs.promises.readdir(dir);
  return names.filter(keep).sort(compareNames);
}

/**
 * Entries of a micrograph's original (untransformed) pyramid
 * @param {string} sourceImagePath - The micrograph's original image
 * @param {string} label - Name for log messages
 * @returns {Promise<TileEntry[]>}
 */
async function collectTileEntries(sourceImagePath, label) {
  const imageHash = await tileCache.generateImageHash(sourceImagePath);
  const cacheDir = tileCache.getCacheDir(imageHash);
  const entries = [];

  const metadataPath = path.join(cacheDir, 'metadata.json');
  if (fs.existsSync(metadataPath)) {
    entries.push({ name: 'metadata.json', filePath: metadataPath });
  } else {
    log.warn(`[TileArchive] Tile metadata not found for ${label}`);
  }
  const thumbnailPath = tileCache.getThumbnailPath(imageHash);
  if (fs.existsSync(thumbnailPath)) {
    entries.push({ name: 'thumbnail.jpg', filePath: thumbnailPath });
  }
  const mediumPath = tileCache.getMediumPath(imageHash);
  if (fs.existsSync(mediumPath)) {
    entries.push({ name: 'medium.jpg', filePath: mediumPath });
  }

  const tilesDir = path.join(cacheDir, 'tiles');
  const tileFiles = await listTileFiles(tilesDir, (f) => f.endsWith('.webp'));
  if (tileFiles === null) {
    log.warn(`[TileArchive] Tiles directory not found for ${label}`);
  } else {
    for (const f of tileFiles) {
      entries.push({ name: `tiles/${f}`, filePath: path.join(tilesDir, f) });
    }
  }
  return entries;
}

/**
 * Entries of an affine overlay's pre-transformed pyramid. The affine
 * generator writes transformedWidth/transformedHeight; the web viewer reads
 * width/height, so metadata.json is normalized here.
 * @param {string} affineHash - micrograph.affineTileHash
 * @param {string} label - Name for log messages
 * @returns {Promise<TileEntry[]>}
 */
async function collectAffineTileEntries(affineHash, label) {
  const entries = [];

  const metadataPath = tileCache.getAffineMetadataPath(affineHash);
  if (fs.existsSync(metadataPath)) {
    const raw = JSON.parse(await fs.promises.readFile(metadataPath, 'utf-8'));
    const normalized = {
      ...raw,
      width: raw.transformedWidth ?? raw.width,
      height: raw.transformedHeight ?? raw.height,
    };
    entries.push({ name: 'metadata.json', data: JSON.stringify(normalized, null, 2) });
  } else {
    log.warn(`[TileArchive] Affine tile metadata not found for ${label}`);
  }
  const thumbnailPath = tileCache.getAffineThumbnailPath(affineHash);
  if (fs.existsSync(thumbnailPath)) {
    entries.push({ name: 'thumbnail.jpg', filePath: thumbnailPath });
  }
  const mediumPath = tileCache.getAffineMediumPath(affineHash);
  if (fs.existsSync(mediumPath)) {
    entries.push({ name: 'medium.jpg', filePath: mediumPath });
  }

  const tilesDir = tileCache.getAffineTilesDir(affineHash);
  const tileFiles = await listTileFiles(tilesDir, (f) => f.startsWith('tile_') && f.endsWith('.webp'));
  if (tileFiles === null) {
    log.warn(`[TileArchive] Affine tiles directory not found for ${label}`);
  } else {
    for (const f of tileFiles) {
      entries.push({ name: `tiles/${f}`, filePath: path.join(tilesDir, f) });
    }
  }
  return entries;
}

/**
 * Content of one entry
 * @param {TileEntry} entry
 * @returns {Promise<Buffer | string>}
 */
function readEntry(entry) {
  return entry.data !== undefined ? Promise.resolve(entry.data) : fs.promises.readFile(entry.filePath);
}

/**
 * Append entries to an open archive under a prefix (e.g. '<projectId>/tiles/<id>')
 * @param {import('archiver').ZipArchive} archive
 * @param {string} prefix
 * @param {TileEntry[]} entries
 * @returns {Promise<number>} Number of tile images appended
 */
async function appendTileEntries(archive, prefix, entries) {
  let tiles = 0;
  for (const entry of entries) {
    archive.append(await readEntry(entry), { name: `${prefix}/${entry.name}` });
    if (entry.name.startsWith('tiles/')) tiles++;
  }
  return tiles;
}

/**
 * Resolves when the archive has processed the entry just appended; rejects
 * if the archive fails first
 * @param {import('archiver').ZipArchive} archive
 * @returns {Promise<void>}
 */
function nextEntryProcessed(archive) {
  return new Promise((resolve, reject) => {
    const ok = () => { archive.off('error', fail); resolve(); };
    const fail = (err) => { archive.off('entry', ok); reject(err); };
    archive.once('entry', ok);
    archive.once('error', fail);
  });
}

/**
 * Write a standalone, deterministic ZIP of one pyramid (store mode, entries
 * sorted, fixed timestamp) and return its SHA-256. Streams to a temporary
 * file next to the target (hashing as it goes) and renames it into place when
 * complete; entries are appended one at a time so memory stays at one tile.
 * @param {TileEntry[]} entries
 * @param {string} outputPath
 * @returns {Promise<{ sha256: string, size: number }>}
 */
async function writeTileZip(entries, outputPath) {
  const { ZipArchive } = await import('archiver');
  const archive = new ZipArchive({ store: true });
  const sorted = [...entries].sort((a, b) => compareNames(a.name, b.name));
  const hash = crypto.createHash('sha256');
  let size = 0;
  archive.on('data', (chunk) => {
    hash.update(chunk);
    size += chunk.length;
  });

  const tmpPath = tempPathFor(outputPath);
  try {
    const written = pipeline(archive, fs.createWriteStream(tmpPath, { flags: 'wx' }));
    written.catch(() => {}); // awaited below; keeps an early failure from going unhandled
    for (const entry of sorted) {
      const data = await readEntry(entry);
      const processed = nextEntryProcessed(archive);
      archive.append(data, { name: entry.name, date: FIXED_ENTRY_DATE });
      await processed;
    }
    await archive.finalize();
    await written;
    await syncFile(tmpPath);
  } catch (err) {
    archive.abort();
    await fs.promises.rm(tmpPath, { force: true }).catch(() => {});
    throw err;
  }
  await moveIntoPlace(tmpPath, outputPath);
  return { sha256: hash.digest('hex'), size };
}

module.exports = {
  collectTileEntries,
  collectAffineTileEntries,
  appendTileEntries,
  writeTileZip,
};
