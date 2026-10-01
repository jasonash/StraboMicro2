/**
 * Atomic file replacement helpers
 *
 * A file is never written in place: new content goes to a temporary file in
 * the same folder, is flushed to disk, and is then renamed over the target.
 * A crash or power loss leaves either the old file or the new one, never a
 * half-written mix. Writing a new file also keeps hard-linked copies of the
 * target from changing along with it.
 *
 * Windows can briefly refuse unlink/rename with EPERM, EBUSY or EACCES while
 * antivirus or another handle has the file open, so those are retried.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RETRYABLE_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);

/**
 * Run a file operation, retrying transient Windows lock errors
 * @param {() => Promise<T>} operation
 * @param {{attempts?: number, baseDelayMs?: number}} [options]
 * @returns {Promise<T>}
 * @template T
 */
async function withRetry(operation, { attempts = 6, baseDelayMs = 50 } = {}) {
  for (let i = 0; ; i++) {
    try {
      return await operation();
    } catch (err) {
      const retryable = err && RETRYABLE_CODES.has(err.code);
      if (!retryable || i >= attempts - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, baseDelayMs * (i + 1)));
    }
  }
}

/**
 * Delete a file, retrying transient Windows lock errors
 * @param {string} filePath
 * @param {{attempts?: number, baseDelayMs?: number}} [options]
 */
async function unlinkWithRetry(filePath, options) {
  await withRetry(() => fs.promises.unlink(filePath), options);
}

/**
 * Temporary file name next to the target (same folder, so the rename never
 * crosses disks). Dot-prefixed so it stays out of the way if left behind.
 * @param {string} targetPath
 * @returns {string}
 */
function tempPathFor(targetPath) {
  const suffix = `${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  return path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.${suffix}`);
}

/**
 * Rename a finished temporary file over the target, removing the temporary
 * file if the rename fails
 * @param {string} tmpPath
 * @param {string} targetPath
 */
async function moveIntoPlace(tmpPath, targetPath) {
  try {
    await withRetry(() => fs.promises.rename(tmpPath, targetPath));
  } catch (err) {
    await fs.promises.rm(tmpPath, { force: true }).catch(() => {});
    throw err;
  }
}

/**
 * Flush a finished file's contents to disk
 * @param {string} filePath
 */
async function syncFile(filePath) {
  const handle = await fs.promises.open(filePath, 'r+');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/**
 * Write data to a file atomically (temporary file, flush, rename)
 * @param {string} targetPath
 * @param {string | Buffer} data
 * @param {BufferEncoding} [encoding]
 */
async function writeFileAtomic(targetPath, data, encoding = 'utf8') {
  const tmpPath = tempPathFor(targetPath);
  let handle = null;
  try {
    handle = await fs.promises.open(tmpPath, 'wx');
    await handle.writeFile(data, typeof data === 'string' ? encoding : undefined);
    await handle.sync();
  } catch (err) {
    if (handle) await handle.close().catch(() => {});
    handle = null;
    await fs.promises.rm(tmpPath, { force: true }).catch(() => {});
    throw err;
  }
  await handle.close();
  await moveIntoPlace(tmpPath, targetPath);
}

/**
 * Copy a file over the target atomically (copy to a temporary file, flush,
 * rename). The target's old inode is replaced, never written into.
 * @param {string} sourcePath
 * @param {string} targetPath
 */
async function copyFileAtomic(sourcePath, targetPath) {
  const tmpPath = tempPathFor(targetPath);
  try {
    await fs.promises.copyFile(sourcePath, tmpPath, fs.constants.COPYFILE_EXCL);
    await syncFile(tmpPath);
  } catch (err) {
    await fs.promises.rm(tmpPath, { force: true }).catch(() => {});
    throw err;
  }
  await moveIntoPlace(tmpPath, targetPath);
}

module.exports = {
  withRetry,
  unlinkWithRetry,
  writeFileAtomic,
  copyFileAtomic,
  // For callers that stream into the temporary file themselves
  tempPathFor,
  syncFile,
  moveIntoPlace,
};
