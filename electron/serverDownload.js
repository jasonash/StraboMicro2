/**
 * Server Download Service
 *
 * Handles downloading projects from the StraboSpot server.
 * Flow:
 * 1. List user's projects via /jwtmicrodb/myProjects
 * 2. Get download URL via /jwtmicrodb/projectURL/<id>
 * 3. Download the .zip file with progress tracking
 * 4. Hand off to smzImport for extraction
 */

const fs = require('fs');
const path = require('path');
const log = require('electron-log');
const { app } = require('electron');
const https = require('https');
const http = require('http');

/**
 * Server endpoints
 */
const ENDPOINTS = {
  MY_PROJECTS: 'https://strabospot.org/jwtmicrodb/myProjects',
  PROJECT_URL: 'https://strabospot.org/jwtmicrodb/projectURL',
  BASE_URL: 'https://strabospot.org',
};

/**
 * Download phases for progress tracking
 */
const DownloadPhase = {
  FETCHING_LIST: 'fetching_list',
  FETCHING_URL: 'fetching_url',
  DOWNLOADING: 'downloading',
  COMPLETE: 'complete',
  ERROR: 'error',
};

/**
 * Format bytes to human-readable string
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted string (e.g., "1.5 MB")
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * List user's projects from the server
 * @param {string} accessToken - JWT access token
 * @returns {Promise<{success: boolean, projects?: Array, error?: string}>}
 */
async function listProjects(accessToken) {
  try {
    log.info('[ServerDownload] Fetching project list...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(ENDPOINTS.MY_PROJECTS, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: 'Authentication expired. Please log in again.' };
      }
      return { success: false, error: `Server error: ${response.status}` };
    }

    const data = await response.json();
    log.info(`[ServerDownload] Found ${data.projects?.length || 0} projects`);

    // Transform project data for UI
    const projects = (data.projects || []).map(p => ({
      id: p.id,
      name: p.name,
      uploadDate: p.uploaddate,
      modifiedTimestamp: p.modifiedtimestamp,
      bytes: p.bytes,
      bytesFormatted: formatBytes(p.bytes),
      self: p.self,
    }));

    // Sort by modified timestamp (newest first)
    projects.sort((a, b) => (b.modifiedTimestamp || 0) - (a.modifiedTimestamp || 0));

    return { success: true, projects };
  } catch (error) {
    log.error('[ServerDownload] Error fetching project list:', error);
    if (error.name === 'AbortError') {
      return { success: false, error: 'Request timed out. Please try again.' };
    }
    return { success: false, error: error.message };
  }
}

/**
 * Get the download URL for a project
 * @param {string} projectId - Project ID
 * @param {string} accessToken - JWT access token
 * @returns {Promise<{success: boolean, url?: string, bytes?: number, micrographCount?: string, error?: string}>}
 */
async function getProjectUrl(projectId, accessToken) {
  try {
    log.info(`[ServerDownload] Getting download URL for project: ${projectId}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(`${ENDPOINTS.PROJECT_URL}/${projectId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: 'Authentication expired. Please log in again.' };
      }
      if (response.status === 404) {
        return { success: false, error: 'Project not found on server.' };
      }
      return { success: false, error: `Server error: ${response.status}` };
    }

    const data = await response.json();

    // Construct full URL (the response gives a relative path)
    const fullUrl = data.url.startsWith('http')
      ? data.url
      : `${ENDPOINTS.BASE_URL}${data.url}`;

    log.info(`[ServerDownload] Download URL: ${fullUrl}`);
    log.info(`[ServerDownload] File size: ${formatBytes(data.bytes)}`);

    return {
      success: true,
      url: fullUrl,
      bytes: data.bytes,
      micrographCount: data.micrograph_count,
    };
  } catch (error) {
    log.error('[ServerDownload] Error getting project URL:', error);
    if (error.name === 'AbortError') {
      return { success: false, error: 'Request timed out. Please try again.' };
    }
    return { success: false, error: error.message };
  }
}

/**
 * Download a file from URL with progress tracking
 * Uses Node.js http/https directly for proper progress tracking
 *
 * @param {string} url - URL to download from
 * @param {string} destPath - Destination file path
 * @param {Function} progressCallback - Progress callback (bytesDownloaded, bytesTotal, percentage)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
function downloadFile(url, destPath, progressCallback) {
  return new Promise((resolve) => {
    log.info(`[ServerDownload] Starting download from: ${url}`);
    log.info(`[ServerDownload] Destination: ${destPath}`);

    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        log.info(`[ServerDownload] Following redirect to: ${redirectUrl}`);
        downloadFile(redirectUrl, destPath, progressCallback).then(resolve);
        return;
      }

      if (response.statusCode !== 200) {
        log.error(`[ServerDownload] HTTP error: ${response.statusCode}`);
        resolve({ success: false, error: `Download failed: HTTP ${response.statusCode}` });
        return;
      }

      const contentLength = parseInt(response.headers['content-length'], 10);
      const totalBytes = isNaN(contentLength) ? 0 : contentLength;
      let downloadedBytes = 0;

      log.info(`[ServerDownload] Content-Length: ${formatBytes(totalBytes)}`);

      // Create write stream
      const fileStream = fs.createWriteStream(destPath);

      // Handle download progress
      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const percentage = totalBytes > 0
          ? Math.round((downloadedBytes / totalBytes) * 100)
          : 0;

        progressCallback({
          bytesDownloaded: downloadedBytes,
          bytesTotal: totalBytes,
          percentage,
          bytesDownloadedFormatted: formatBytes(downloadedBytes),
          bytesTotalFormatted: formatBytes(totalBytes),
        });
      });

      // Pipe response to file
      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        log.info(`[ServerDownload] Download complete: ${formatBytes(downloadedBytes)}`);
        resolve({ success: true });
      });

      fileStream.on('error', (err) => {
        log.error('[ServerDownload] File write error:', err);
        fs.unlink(destPath, () => {}); // Delete partial file
        resolve({ success: false, error: `File write error: ${err.message}` });
      });
    });

    request.on('error', (err) => {
      log.error('[ServerDownload] Request error:', err);
      resolve({ success: false, error: `Network error: ${err.message}` });
    });

    // Set timeout
    request.setTimeout(300000, () => { // 5 minute timeout
      request.destroy();
      resolve({ success: false, error: 'Download timed out. Please try again.' });
    });
  });
}

/**
 * Download a project from the server
 * Returns the path to the downloaded .zip file for subsequent import
 *
 * @param {string} projectId - Project ID
 * @param {string} accessToken - JWT access token
 * @param {Function} progressCallback - Progress callback
 * @returns {Promise<{success: boolean, zipPath?: string, error?: string}>}
 */
async function downloadProject(projectId, accessToken, progressCallback) {
  let tempZipPath = null;

  try {
    const sendProgress = (phase, percentage, message, extra = {}) => {
      progressCallback({
        phase,
        percentage,
        message,
        ...extra,
      });
    };

    // --- Step 1: Get download URL ---
    sendProgress(DownloadPhase.FETCHING_URL, 5, 'Getting download link...');

    const urlResult = await getProjectUrl(projectId, accessToken);
    if (!urlResult.success) {
      return { success: false, error: urlResult.error };
    }

    // --- Step 2: Download the file ---
    sendProgress(DownloadPhase.DOWNLOADING, 10, 'Starting download...');

    // Create temp file path
    tempZipPath = path.join(
      app.getPath('temp'),
      `strabomicro-download-${projectId}-${Date.now()}.zip`
    );

    const downloadResult = await downloadFile(
      urlResult.url,
      tempZipPath,
      (downloadProgress) => {
        // Scale download progress from 10% to 95%
        const scaledPercent = 10 + Math.round(downloadProgress.percentage * 0.85);
        sendProgress(
          DownloadPhase.DOWNLOADING,
          scaledPercent,
          `Downloading... (${downloadProgress.bytesDownloadedFormatted} / ${downloadProgress.bytesTotalFormatted})`,
          {
            bytesDownloaded: downloadProgress.bytesDownloaded,
            bytesTotal: downloadProgress.bytesTotal,
          }
        );
      }
    );

    if (!downloadResult.success) {
      // Clean up temp file if it exists
      if (tempZipPath) {
        try {
          await fs.promises.unlink(tempZipPath);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      return { success: false, error: downloadResult.error };
    }

    sendProgress(DownloadPhase.COMPLETE, 100, 'Download complete!');

    // Return the path to the downloaded file
    // The caller (main.js) will pass this to smzImport
    return { success: true, zipPath: tempZipPath };

  } catch (error) {
    log.error('[ServerDownload] Download failed:', error);

    // Clean up temp file on error
    if (tempZipPath) {
      try {
        await fs.promises.unlink(tempZipPath);
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    return { success: false, error: error.message };
  }
}

/**
 * Clean up a downloaded temp file
 * Call this after successful import or on cancel
 *
 * @param {string} zipPath - Path to the temp zip file
 */
async function cleanupDownload(zipPath) {
  if (!zipPath) return;

  try {
    await fs.promises.unlink(zipPath);
    log.info(`[ServerDownload] Cleaned up temp file: ${zipPath}`);
  } catch (error) {
    log.warn(`[ServerDownload] Could not delete temp file: ${error.message}`);
  }
}

module.exports = {
  listProjects,
  getProjectUrl,
  downloadFile,
  downloadProject,
  cleanupDownload,
  formatBytes,
  DownloadPhase,
  ENDPOINTS,
};
