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

// ============================================================================
// Configuration
// ============================================================================

const MODEL_FILENAME = 'FastSAM-x.onnx';
const MODEL_URL = 'https://huggingface.co/jasonash1/fastsam-onnx/resolve/main/FastSAM-x.onnx';
const MODEL_SIZE_BYTES = 289_000_000; // ~276MB, used for progress estimation

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

  console.log('[FastSAM] Starting model download from:', MODEL_URL);
  console.log('[FastSAM] Download destination:', downloadPath);

  if (progressCallback) {
    progressCallback({ percent: 0, downloadedBytes: 0, totalBytes: MODEL_SIZE_BYTES, status: 'Starting download...' });
  }

  try {
    // Use dynamic import for node-fetch (ESM module)
    const fetch = (await import('node-fetch')).default;

    const response = await fetch(MODEL_URL);

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    const contentLength = parseInt(response.headers.get('content-length') || MODEL_SIZE_BYTES, 10);
    let downloadedBytes = 0;

    // Create write stream to temp file
    const fileStream = fs.createWriteStream(tempPath);

    // Process the response body as a stream
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
    // Clean up partial download
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }

    console.error('[FastSAM] Download failed:', err);
    throw new Error(`Failed to download FastSAM model: ${err.message}`);
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
