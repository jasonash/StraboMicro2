/**
 * ZIP archive factory
 *
 * archiver 8 is ESM-only and replaced the `archiver('zip', options)` factory
 * with a `ZipArchive` class, so it is loaded with a dynamic import() like the
 * app's other ESM-only dependencies (tiff, node-fetch, electron-store).
 *
 * Both .smz export and batch image export go through here so the compression
 * settings stay identical. Output was verified byte-identical to archiver 7.
 */

const ZIP_OPTIONS = { zlib: { level: 6 } };

/**
 * Create a ZIP archive stream. Callers pipe it to an output stream, append
 * entries, and await finalize().
 * @returns {Promise<import('archiver').ZipArchive>}
 */
async function createZipArchive() {
  const { ZipArchive } = await import('archiver');
  return new ZipArchive(ZIP_OPTIONS);
}

module.exports = { createZipArchive };
