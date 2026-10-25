/**
 * FastSAM Model Management Service (Main Process)
 *
 * Handles model file management: finding, downloading, and providing
 * the model URL to the renderer process. All inference is now done
 * in the renderer using onnxruntime-web (WebAssembly).
 *
 * @module fastsamService
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { downloadFailure } = require('./downloadError');

// ============================================================================
// Configuration
// ============================================================================

const MODEL_FILENAME = 'FastSAM-x.onnx';
const MODEL_URL = 'https://huggingface.co/jasonash1/fastsam-onnx/resolve/main/FastSAM-x.onnx';
const MODEL_SIZE_BYTES = 289_000_000; // ~276MB, used for progress estimation

/** Development only: STRABO_FASTSAM_MODEL_URL replaces MODEL_URL (tests/modelDownloadError point it at failing servers) */
function modelUrl() {
  return (!app.isPackaged && process.env.STRABO_FASTSAM_MODEL_URL) || MODEL_URL;
}

// ============================================================================
// State
// ============================================================================

let modelPath = null;

// ============================================================================
// Model Management
// ============================================================================

/**
 * Get the path to the FastSAM ONNX model.
 * Checks multiple locations:
 * 1. App resources (bundled with app)
 * 2. User data directory (downloaded)
 * 3. Development prototypes folder
 */
function getModelPath() {
  if (modelPath && fs.existsSync(modelPath)) {
    return modelPath;
  }

  const possiblePaths = [
    // Bundled with app (production)
    path.join(process.resourcesPath || '', 'models', MODEL_FILENAME),
    // App user data directory (downloaded)
    path.join(app.getPath('userData'), 'models', MODEL_FILENAME),
    // Development: prototype folder
    path.join(__dirname, '..', 'prototypes', 'fastsam-onnx-test', 'models', MODEL_FILENAME),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      console.log('[FastSAM] Found model at:', p);
      modelPath = p;
      return p;
    }
  }

  console.log('[FastSAM] Model not found in any location:', possiblePaths);
  return null;
}

/**
 * Check if the FastSAM model file is available on disk.
 * No longer checks ONNX runtime availability since inference
 * is now handled by onnxruntime-web in the renderer.
 */
function isModelAvailable() {
  return getModelPath() !== null;
}

/**
 * Get the expected model download path.
 */
function getModelDownloadPath() {
  const modelsDir = path.join(app.getPath('userData'), 'models');
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
  }
  return path.join(modelsDir, MODEL_FILENAME);
}

/**
 * Get model status information.
 */
function getModelStatus() {
  const existingPath = getModelPath();
  if (existingPath) {
    const stats = fs.statSync(existingPath);
    return {
      available: true,
      path: existingPath,
      sizeBytes: stats.size,
    };
  }
  return {
    available: false,
    downloadPath: getModelDownloadPath(),
    downloadUrl: MODEL_URL,
    expectedSizeBytes: MODEL_SIZE_BYTES,
  };
}

/** Close a write stream and wait for its file handle to be released (Windows cannot delete an open file) */
function closeStream(stream) {
  if (stream.closed) return Promise.resolve();
  return new Promise((resolve) => {
    stream.once('close', resolve);
    stream.destroy();
  });
}

/**
 * Download the FastSAM model from Hugging Face.
 * @param {function} progressCallback - Called with { percent, downloadedBytes, totalBytes, status }
 * @returns {Promise<string>} Path to downloaded model
 */
async function downloadModel(progressCallback = null) {
  const downloadPath = getModelDownloadPath();
  const tempPath = downloadPath + '.downloading';

  // Check if already downloaded
  if (fs.existsSync(downloadPath)) {
    console.log('[FastSAM] Model already exists at:', downloadPath);
    return downloadPath;
  }

  const url = modelUrl();
  console.log('[FastSAM] Starting model download from:', url);
  console.log('[FastSAM] Download destination:', downloadPath);

  if (progressCallback) {
    progressCallback({ percent: 0, downloadedBytes: 0, totalBytes: MODEL_SIZE_BYTES, status: 'Starting download...' });
  }

  try {
    // Use dynamic import for node-fetch (ESM module)
    const fetch = (await import('node-fetch')).default;

    let response;
    try {
      response = await fetch(url);
    } catch (err) {
      throw downloadFailure('connect', url, { cause: err });
    }

    if (!response.ok) {
      throw downloadFailure('http', url, { status: response.status });
    }

    const contentLength = parseInt(response.headers.get('content-length') || MODEL_SIZE_BYTES, 10);
    let downloadedBytes = 0;

    // Create write stream to temp file
    const fileStream = fs.createWriteStream(tempPath);

    // Process the response body as a stream
    try {
      for await (const chunk of response.body) {
        fileStream.write(chunk);
        downloadedBytes += chunk.length;

        if (progressCallback) {
          const percent = Math.round((downloadedBytes / contentLength) * 100);
          progressCallback({
            percent,
            downloadedBytes,
            totalBytes: contentLength,
            status: `Downloading... ${Math.round(downloadedBytes / 1024 / 1024)}MB / ${Math.round(contentLength / 1024 / 1024)}MB`,
          });
        }
      }
    } catch (err) {
      await closeStream(fileStream);
      throw downloadFailure('transfer', url, { cause: err });
    }

    // A connection that closes early can end the stream without an error
    if (response.headers.get('content-length') && downloadedBytes < contentLength) {
      await closeStream(fileStream);
      throw downloadFailure('transfer', url, { cause: new Error(`got ${downloadedBytes} of ${contentLength} bytes`) });
    }

    fileStream.end();

    // Wait for file to finish writing
    await new Promise((resolve, reject) => {
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
    });

    // Rename temp file to final path
    fs.renameSync(tempPath, downloadPath);

    console.log('[FastSAM] Model downloaded successfully to:', downloadPath);

    // Clear cached model path so it gets re-detected
    modelPath = null;

    if (progressCallback) {
      progressCallback({ percent: 100, downloadedBytes: contentLength, totalBytes: contentLength, status: 'Download complete!' });
    }

    return downloadPath;
  } catch (err) {
    // Clean up partial download (a failed removal must not hide the download error)
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch (cleanupErr) {
      console.warn('[FastSAM] Could not remove the partial download:', cleanupErr);
    }

    console.error('[FastSAM] Download failed:', err.detail ?? err);
    throw new Error(`The FastSAM model did not download. ${err.message}`);
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Model management
  isModelAvailable,
  getModelPath,
  getModelDownloadPath,
  getModelStatus,
  downloadModel,
};
