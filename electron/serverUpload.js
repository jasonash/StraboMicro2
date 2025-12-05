/**
 * Server Upload Service
 *
 * Handles uploading projects to the StraboSpot server.
 * Two-phase upload process:
 * 1. Upload ZIP file to upload server (Basic Auth with service credentials)
 * 2. Trigger database population (Bearer JWT auth)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const log = require('electron-log');
const { app } = require('electron');
const FormData = require('form-data');

// Import smzExport for creating temp archives
const smzExport = require('./smzExport');

/**
 * Server endpoints
 */
const ENDPOINTS = {
  VERSION_CHECK: 'https://strabospot.org/straboMicroVersion.json',
  PROJECT_COUNT: 'https://strabospot.org/jwtmicrodb/projectCount',
  FILE_UPLOAD: 'https://microupload.strabospot.org/upload.php',
  DB_POPULATE: 'https://strabospot.org/jwtmicrodb/projectwithoutfile',
};

/**
 * Service credentials for file upload endpoint
 * These are fixed credentials for the upload service, not user credentials
 */
const SERVICE_CREDENTIALS = {
  username: 'micro',
  password: 'Jv6715EMZD5q',
};

/**
 * Upload phase constants
 */
const UploadPhase = {
  CHECKING_AUTH: 'checking_auth',
  CHECKING_CONNECTIVITY: 'checking_connectivity',
  CHECKING_EXISTS: 'checking_exists',
  EXPORTING_SMZ: 'exporting_smz',
  UPLOADING_FILE: 'uploading_file',
  POPULATING_DATABASE: 'populating_database',
  COMPLETE: 'complete',
  ERROR: 'error',
};

/**
 * Check if the server is reachable
 * @returns {Promise<{online: boolean, error?: string}>}
 */
async function checkConnectivity() {
  try {
    log.info('[ServerUpload] Checking connectivity...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(ENDPOINTS.VERSION_CHECK, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      log.info('[ServerUpload] Server is online');
      return { online: true };
    } else {
      log.warn('[ServerUpload] Server returned non-OK status:', response.status);
      return { online: false, error: `Server returned status ${response.status}` };
    }
  } catch (error) {
    log.error('[ServerUpload] Connectivity check failed:', error.message);
    if (error.name === 'AbortError') {
      return { online: false, error: 'Connection timed out' };
    }
    return { online: false, error: error.message };
  }
}

/**
 * Check if a project already exists on the server
 * @param {string} projectId - Project UUID
 * @param {string} accessToken - JWT access token
 * @returns {Promise<{exists: boolean, error?: string}>}
 */
async function checkProjectExists(projectId, accessToken) {
  try {
    log.info('[ServerUpload] Checking if project exists:', projectId);

    const url = `${ENDPOINTS.PROJECT_COUNT}/${projectId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { exists: false, error: 'Authentication expired. Please log in again.' };
      }
      return { exists: false, error: `Server error: ${response.status}` };
    }

    const data = await response.json();
    const exists = data.count > 0;

    log.info('[ServerUpload] Project exists:', exists);
    return { exists };
  } catch (error) {
    log.error('[ServerUpload] Project check failed:', error.message);
    return { exists: false, error: error.message };
  }
}

/**
 * Upload ZIP file to the upload server with progress tracking
 * @param {string} zipPath - Path to the .smz file
 * @param {string} projectId - Project UUID
 * @param {boolean} overwrite - Whether to overwrite existing project
 * @param {Function} progressCallback - Callback for upload progress
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function uploadZipFile(zipPath, projectId, overwrite, progressCallback) {
  return new Promise(async (resolve) => {
    try {
      log.info('[ServerUpload] Starting file upload:', zipPath);
      log.info('[ServerUpload] Project ID:', projectId);
      log.info('[ServerUpload] Overwrite:', overwrite);

      // Get file size for progress tracking
      const stats = await fs.promises.stat(zipPath);
      const totalBytes = stats.size;

      log.info('[ServerUpload] File size:', totalBytes, 'bytes');

      // Read the file into a buffer (for reliable FormData handling)
      const fileBuffer = await fs.promises.readFile(zipPath);

      // Create form data with all required fields
      // Order matters for some servers - put text fields first, then file
      const form = new FormData();
      form.append('overwrite', overwrite ? 'yes' : 'no');
      form.append('project_id', projectId);
      form.append('microProject', fileBuffer, {
        filename: 'temp.zip',
        contentType: 'application/octet-stream',
      });

      // Build Basic Auth header for service credentials
      const authString = `${SERVICE_CREDENTIALS.username}:${SERVICE_CREDENTIALS.password}`;
      const authBase64 = Buffer.from(authString).toString('base64');

      // Log what we're sending
      log.info('[ServerUpload] Sending to:', ENDPOINTS.FILE_UPLOAD);
      log.info('[ServerUpload] Form fields: overwrite=' + (overwrite ? 'yes' : 'no') + ', project_id=' + projectId);

      // Parse the upload URL
      const uploadUrl = new URL(ENDPOINTS.FILE_UPLOAD);

      // Set up the request options
      const options = {
        hostname: uploadUrl.hostname,
        port: 443,
        path: uploadUrl.pathname,
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authBase64}`,
          ...form.getHeaders(),
        },
      };

      // Track bytes sent for progress
      let bytesSent = 0;

      const req = https.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          console.log('[ServerUpload] Upload response (status ' + res.statusCode + '):\n', responseData);

          if (res.statusCode < 200 || res.statusCode >= 300) {
            let errorMessage = `Upload failed: ${res.statusCode}`;
            try {
              const errorJson = JSON.parse(responseData);
              if (errorJson.message) {
                errorMessage = errorJson.message;
              }
            } catch {
              if (responseData.includes('<html') || responseData.includes('<HTML')) {
                errorMessage = 'Server error during upload. Please try again.';
              } else if (responseData.length < 200) {
                errorMessage = responseData;
              }
            }
            resolve({ success: false, error: errorMessage });
            return;
          }

          let result;
          try {
            result = JSON.parse(responseData);
          } catch (parseError) {
            resolve({ success: false, error: `Server returned invalid JSON: ${responseData.substring(0, 500)}` });
            return;
          }

          if (result.status === 'error') {
            resolve({ success: false, error: result.message || 'Upload failed' });
            return;
          }

          resolve({ success: true });
        });
      });

      req.on('error', (error) => {
        console.error('[ServerUpload] Upload error:', error);
        resolve({ success: false, error: error.message });
      });

      // Track upload progress by monitoring the socket
      req.on('socket', (socket) => {
        socket.on('data', () => {
          // This is for response data, not upload
        });
      });

      // Use form-data's pipe with progress tracking
      // Get the form as a buffer and write in chunks to track progress
      const formBuffer = form.getBuffer();
      const chunkSize = 64 * 1024; // 64KB chunks
      let offset = 0;

      const writeNextChunk = () => {
        while (offset < formBuffer.length) {
          const end = Math.min(offset + chunkSize, formBuffer.length);
          const chunk = formBuffer.slice(offset, end);
          const canContinue = req.write(chunk);

          bytesSent += chunk.length;

          // Calculate progress based on form buffer (includes overhead) but display file size
          const progressPercent = Math.min(100, Math.round((bytesSent / formBuffer.length) * 100));
          const estimatedFileBytes = Math.min(totalBytes, Math.round((bytesSent / formBuffer.length) * totalBytes));

          progressCallback({
            bytesUploaded: estimatedFileBytes,
            bytesTotal: totalBytes,
            percentage: progressPercent,
          });

          offset = end;

          if (!canContinue) {
            // Wait for drain event before continuing
            req.once('drain', writeNextChunk);
            return;
          }
        }

        // All data written, end the request
        req.end();
      };

      writeNextChunk();

    } catch (error) {
      console.error('[ServerUpload] Upload error:', error);
      resolve({ success: false, error: error.message });
    }
  });
}

/**
 * Trigger database population after file upload
 * @param {string} projectId - Project UUID
 * @param {boolean} overwrite - Whether to overwrite existing project
 * @param {string} accessToken - JWT access token
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function populateDatabase(projectId, overwrite, accessToken) {
  try {
    log.info('[ServerUpload] Triggering database population for:', projectId);
    log.info('[ServerUpload] Project ID:', projectId);
    log.info('[ServerUpload] Overwrite:', overwrite);

    // Create form data for the request
    const form = new FormData();
    form.append('overwrite', overwrite ? 'yes' : 'no');
    form.append('project_id', projectId);

    // Get buffer for reliable transmission
    const formBuffer = form.getBuffer();

    log.info('[ServerUpload] Sending to:', ENDPOINTS.DB_POPULATE);
    log.info('[ServerUpload] Form fields: overwrite=' + (overwrite ? 'yes' : 'no') + ', project_id=' + projectId);

    const response = await fetch(ENDPOINTS.DB_POPULATE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        ...form.getHeaders(),
      },
      body: formBuffer,
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error('[ServerUpload] DB population failed:', response.status);
      log.error('[ServerUpload] Raw server response:', errorText);
      console.error('[ServerUpload] DB population failed - Status:', response.status);
      console.error('[ServerUpload] Raw server response:\n', errorText);

      if (response.status === 401) {
        return { success: false, error: 'Authentication expired. Please log in again.' };
      }

      let errorMessage = `Database sync failed: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.message) {
          errorMessage = errorJson.message;
        }
      } catch {
        if (errorText.length < 200) {
          errorMessage = errorText;
        }
      }

      return { success: false, error: errorMessage };
    }

    // Get response as text first so we can log it
    const responseText = await response.text();
    console.log('[ServerUpload] DB population response (status ' + response.status + '):\n', responseText);

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      return { success: false, error: `Server returned invalid JSON: ${responseText.substring(0, 500)}` };
    }

    if (result.status === 'error') {
      return { success: false, error: result.message || 'Database sync failed' };
    }

    return { success: true };
  } catch (error) {
    console.error('[ServerUpload] DB population error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Main orchestrator function for pushing a project to the server
 *
 * @param {Object} options - Upload options
 * @param {string} options.projectId - Project UUID
 * @param {Object} options.projectData - Full project data
 * @param {Object} options.folderPaths - Project folder paths
 * @param {string} options.accessToken - JWT access token
 * @param {boolean} options.overwrite - Whether to overwrite existing project
 * @param {Function} options.progressCallback - Progress callback
 * @param {Function} options.pdfGenerator - PDF generator function
 * @param {Object} options.projectSerializer - Project serializer module
 * @returns {Promise<{success: boolean, needsOverwriteConfirm?: boolean, error?: string}>}
 */
async function pushProject({
  projectId,
  projectData,
  folderPaths,
  accessToken,
  overwrite = false,
  progressCallback,
  pdfGenerator,
  projectSerializer,
}) {
  let tempSmzPath = null;

  try {
    log.info('[ServerUpload] Starting push for project:', projectId);

    // Helper to send progress updates
    const sendProgress = (phase, percentage, message, extra = {}) => {
      progressCallback({
        phase,
        percentage,
        message,
        ...extra,
      });
    };

    // --- Step 1: Check connectivity ---
    sendProgress(UploadPhase.CHECKING_CONNECTIVITY, 2, 'Checking server connection...');

    const connectivityResult = await checkConnectivity();
    if (!connectivityResult.online) {
      return {
        success: false,
        error: connectivityResult.error || 'Cannot connect to server. Check your internet connection.',
      };
    }

    // --- Step 2: Check if project exists ---
    sendProgress(UploadPhase.CHECKING_EXISTS, 5, 'Checking project status...');

    const existsResult = await checkProjectExists(projectId, accessToken);
    if (existsResult.error) {
      return { success: false, error: existsResult.error };
    }

    // If project exists and overwrite not confirmed, return for confirmation
    if (existsResult.exists && !overwrite) {
      log.info('[ServerUpload] Project exists, requesting overwrite confirmation');
      return { success: false, needsOverwriteConfirm: true };
    }

    // --- Step 3: Create temporary .smz archive ---
    sendProgress(UploadPhase.EXPORTING_SMZ, 10, 'Creating archive...');

    tempSmzPath = path.join(app.getPath('temp'), `strabomicro-upload-${projectId}-${Date.now()}.smz`);

    const smzResult = await smzExport.exportSmz(
      tempSmzPath,
      projectId,
      projectData,
      folderPaths,
      (smzProgress) => {
        // Scale SMZ progress from 10% to 50%
        const scaledPercent = 10 + Math.round(smzProgress.percentage * 0.4);
        sendProgress(
          UploadPhase.EXPORTING_SMZ,
          scaledPercent,
          smzProgress.phase,
          { itemName: smzProgress.itemName }
        );
      },
      pdfGenerator,
      projectSerializer
    );

    if (!smzResult.success) {
      return { success: false, error: smzResult.error || 'Failed to create archive' };
    }

    // --- Step 4: Upload ZIP file ---
    sendProgress(UploadPhase.UPLOADING_FILE, 50, 'Uploading archive...');

    const uploadResult = await uploadZipFile(
      tempSmzPath,
      projectId,
      overwrite || existsResult.exists,
      (uploadProgress) => {
        // Scale upload progress from 50% to 90%
        const scaledPercent = 50 + Math.round((uploadProgress.percentage / 100) * 40);
        const mbUploaded = (uploadProgress.bytesUploaded / (1024 * 1024)).toFixed(1);
        const mbTotal = (uploadProgress.bytesTotal / (1024 * 1024)).toFixed(1);
        sendProgress(
          UploadPhase.UPLOADING_FILE,
          scaledPercent,
          `Uploading archive... (${mbUploaded} MB / ${mbTotal} MB)`,
          {
            bytesUploaded: uploadProgress.bytesUploaded,
            bytesTotal: uploadProgress.bytesTotal,
          }
        );
      }
    );

    if (!uploadResult.success) {
      return { success: false, error: uploadResult.error };
    }

    // --- Step 5: Populate database ---
    sendProgress(UploadPhase.POPULATING_DATABASE, 92, 'Syncing database...');

    const dbResult = await populateDatabase(
      projectId,
      overwrite || existsResult.exists,
      accessToken
    );

    if (!dbResult.success) {
      return { success: false, error: dbResult.error };
    }

    // --- Complete ---
    sendProgress(UploadPhase.COMPLETE, 100, 'Upload complete!');

    log.info('[ServerUpload] Push completed successfully');
    return { success: true };

  } catch (error) {
    log.error('[ServerUpload] Push failed:', error);
    return { success: false, error: error.message };

  } finally {
    // Clean up temp file
    if (tempSmzPath) {
      try {
        await fs.promises.unlink(tempSmzPath);
        log.info('[ServerUpload] Cleaned up temp file:', tempSmzPath);
      } catch (err) {
        log.warn('[ServerUpload] Could not delete temp file:', err.message);
      }
    }
  }
}

module.exports = {
  checkConnectivity,
  checkProjectExists,
  uploadZipFile,
  populateDatabase,
  pushProject,
  UploadPhase,
  ENDPOINTS,
};
