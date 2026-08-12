/**
 * Deep Link Service (strabomicro:// protocol)
 *
 * The app registers the strabomicro:// URI scheme with the OS so that
 * "Open in StraboMicro" links on strabospot.org can launch the app and
 * open a project. Any website on the internet can invoke a registered
 * scheme, so every URI is treated as untrusted input: the parser accepts
 * exactly the shapes we support and rejects everything else.
 *
 * Supported URI shape:
 *   strabomicro://open?p=<pkey>
 * where <pkey> is the numeric micro_projectmetadata.id primary key used
 * by the strabospot.org viewer URLs (e.g. /microview/?p=863).
 *
 * Fetch path (decided 2026-08-12, see docs/StraboMicro_OpenIn_DeepLink.md):
 * the unauthenticated download endpoint. A HEAD request doubles as the
 * metadata resolver: Content-Disposition carries the project name and
 * Content-Length the .smz size. A nonexistent pkey returns 200 with an
 * empty filename and no Content-Length rather than a 404, so "not found"
 * is detected from those headers.
 */

const path = require('path');
const log = require('electron-log');
const { app } = require('electron');
const { downloadFile, formatBytes, DownloadPhase } = require('./serverDownload');

const DOWNLOAD_ENDPOINT = 'https://strabospot.org/download_micro_file';
const SCHEME = 'strabomicro';

// pkey is a database integer primary key; 12 digits is far beyond any
// realistic id and bounds the input without ever rejecting a real one.
const PKEY_PATTERN = /^\d{1,12}$/;

/**
 * Parse and validate a deep link URI.
 * Returns { action: 'open', pkey } for a valid URI, or null for anything
 * else. Rejection is silent by design; callers may log the raw value.
 *
 * @param {unknown} rawUrl - The URI as received from the OS
 * @returns {{ action: 'open', pkey: string } | null}
 */
function parseDeepLink(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > 2048) {
    return null;
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== `${SCHEME}:`) {
    return null;
  }

  // strabomicro://open?p=863 parses with host 'open'; tolerate the
  // strabomicro:/open or strabomicro:open forms some launchers produce
  // by falling back to the pathname.
  const action = url.host || url.pathname.replace(/^\/+/, '');
  if (action !== 'open') {
    return null;
  }

  const pkey = url.searchParams.get('p');
  if (!pkey || !PKEY_PATTERN.test(pkey)) {
    return null;
  }

  return { action: 'open', pkey };
}

/**
 * Resolve project name and download size for a pkey via a HEAD request.
 *
 * @param {string} pkey - Numeric project pkey (re-validated here; the
 *   value may come from the renderer over IPC)
 * @returns {Promise<{success: boolean, found?: boolean, name?: string,
 *   bytes?: number, bytesFormatted?: string, error?: string}>}
 */
async function inspectRemoteProject(pkey) {
  if (!PKEY_PATTERN.test(String(pkey))) {
    return { success: false, error: 'Invalid project id' };
  }

  const url = `${DOWNLOAD_ENDPOINT}?project_id=${pkey}`;
  log.info(`[DeepLink] Inspecting remote project via HEAD: ${url}`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 404) {
        return { success: true, found: false };
      }
      return { success: false, error: `Server error: ${response.status}` };
    }

    // Extract the project name from Content-Disposition:
    //   attachment; filename=<name>.smz
    // An unknown pkey yields "filename=.smz" (empty name) with a 200.
    const disposition = response.headers.get('content-disposition') || '';
    const filenameMatch = disposition.match(/filename\s*=\s*"?([^";]*)"?/i);
    let name = filenameMatch ? filenameMatch[1].trim() : '';
    if (name.toLowerCase().endsWith('.smz')) {
      name = name.slice(0, -4);
    }

    const lengthHeader = response.headers.get('content-length');
    const bytes = lengthHeader ? parseInt(lengthHeader, 10) : NaN;

    if (!name || !Number.isFinite(bytes) || bytes <= 0) {
      log.info(`[DeepLink] Project ${pkey} not found (empty filename or no length)`);
      return { success: true, found: false };
    }

    log.info(`[DeepLink] Project ${pkey}: "${name}", ${formatBytes(bytes)}`);
    return {
      success: true,
      found: true,
      name,
      bytes,
      bytesFormatted: formatBytes(bytes),
    };
  } catch (error) {
    log.error('[DeepLink] Inspect failed:', error);
    if (error.name === 'AbortError') {
      return { success: false, error: 'Request timed out. Please try again.' };
    }
    return { success: false, error: error.message };
  }
}

/**
 * Download the project .smz to a temp file with progress reporting.
 * The caller inspects/imports the file and cleans it up afterward
 * (serverDownload.cleanupDownload works on the returned path).
 *
 * @param {string} pkey - Numeric project pkey (re-validated here)
 * @param {(progress: object) => void} progressCallback - Same shape as
 *   serverDownload.downloadProject progress
 * @returns {Promise<{success: boolean, zipPath?: string, error?: string}>}
 */
async function downloadRemoteProject(pkey, progressCallback) {
  if (!PKEY_PATTERN.test(String(pkey))) {
    return { success: false, error: 'Invalid project id' };
  }

  const url = `${DOWNLOAD_ENDPOINT}?project_id=${pkey}`;
  const tempZipPath = path.join(
    app.getPath('temp'),
    `strabomicro-deeplink-${pkey}-${Date.now()}.zip`
  );

  log.info(`[DeepLink] Downloading project ${pkey} to ${tempZipPath}`);

  try {
    const result = await downloadFile(url, tempZipPath, (downloadProgress) => {
      progressCallback({
        phase: DownloadPhase.DOWNLOADING,
        percentage: downloadProgress.percentage,
        message: `Downloading... (${downloadProgress.bytesDownloadedFormatted} / ${downloadProgress.bytesTotalFormatted})`,
        bytesDownloaded: downloadProgress.bytesDownloaded,
        bytesTotal: downloadProgress.bytesTotal,
      });
    });

    if (!result.success) {
      await removeQuietly(tempZipPath);
      return { success: false, error: result.error };
    }

    progressCallback({
      phase: DownloadPhase.COMPLETE,
      percentage: 100,
      message: 'Download complete!',
    });

    return { success: true, zipPath: tempZipPath };
  } catch (error) {
    log.error('[DeepLink] Download failed:', error);
    await removeQuietly(tempZipPath);
    return { success: false, error: error.message };
  }
}

async function removeQuietly(filePath) {
  try {
    await require('fs').promises.unlink(filePath);
  } catch {
    // File may not exist; nothing to clean up
  }
}

module.exports = {
  parseDeepLink,
  inspectRemoteProject,
  downloadRemoteProject,
  SCHEME,
  DOWNLOAD_ENDPOINT,
};
