/**
 * Contour Extraction Web Worker
 *
 * Extracts contours from binary masks using OpenCV.js
 * Uses the exact GrainSight algorithm (segment.py:88-102)
 *
 * IMPORTANT: This worker loads OpenCV ONCE and then processes all masks sequentially.
 */

// OpenCV instance - loaded once, reused for all masks
let cv: any = null;
let opencvLoadPromise: Promise<void> | null = null;

/**
 * Load OpenCV.js once and cache it
 */
async function ensureOpenCVLoaded(scriptContent?: string): Promise<void> {
  // Already loaded
  if (cv) return;

  // Currently loading - wait for it
  if (opencvLoadPromise) {
    return opencvLoadPromise;
  }

  // Start loading
  opencvLoadPromise = loadOpenCV(scriptContent);
  await opencvLoadPromise;
}

async function loadOpenCV(scriptContent?: string): Promise<void> {
  console.log('[ContourWorker] Loading OpenCV.js...');

  let scriptText: string;

  try {
    if (scriptContent) {
      scriptText = scriptContent;
    } else {
      const possibleUrls = ['/opencv.js', 'http://localhost:5173/opencv.js'];
      let response: Response | null = null;

      for (const url of possibleUrls) {
        try {
          response = await fetch(url);
          if (response.ok) break;
          response = null;
        } catch {
          response = null;
        }
      }

      if (!response || !response.ok) {
        throw new Error('Failed to fetch OpenCV.js');
      }
      scriptText = await response.text();
    }

    // Execute the script
    // eslint-disable-next-line no-eval
    (0, eval)(scriptText);

    // Wait for OpenCV to initialize
    await new Promise<void>((resolve, reject) => {
      const startTime = Date.now();
      const timeoutMs = 30000;

      const checkReady = () => {
        const globalCv = (self as any).cv;

        if (globalCv && typeof globalCv.Mat === 'function') {
          cv = globalCv;
          console.log('[ContourWorker] OpenCV.js ready');
          resolve();
          return;
        }

        if (globalCv && typeof globalCv === 'function') {
          try {
            const result = globalCv();
            if (result && typeof result.then === 'function') {
              result.then((resolvedCv: any) => {
                cv = resolvedCv;
                (self as any).cv = resolvedCv;
                resolve();
              }).catch(reject);
              return;
            }
          } catch {
            // Continue polling
          }
        }

        if (globalCv && 'onRuntimeInitialized' in globalCv) {
          globalCv.onRuntimeInitialized = () => {
            cv = globalCv;
            resolve();
          };
          return;
        }

        if (Date.now() - startTime > timeoutMs) {
          reject(new Error('OpenCV.js initialization timed out'));
          return;
        }

        setTimeout(checkReady, 100);
      };

      checkReady();
    });
  } catch (e) {
    throw new Error(`Failed to load OpenCV.js: ${e}`);
  }
}

function generateId(): string {
  return 'grain-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36);
}

/**
 * Extract contours from a single mask using the GrainSight algorithm
 */
async function extractContours(
  maskBase64: string,
  originalWidth: number,
  originalHeight: number,
  previewWidth: number,
  previewHeight: number,
  confidence: number
): Promise<any[]> {
  const grains: any[] = [];

  // Decode base64 PNG
  const response = await fetch(`data:image/png;base64,${maskBase64}`);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

  // Convert to OpenCV Mat
  const src = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  // GrainSight algorithm:
  // 1. Morphological opening with 5x5 kernel
  const kernel = cv.Mat.ones(5, 5, cv.CV_8U);
  const opened = new cv.Mat();
  cv.morphologyEx(gray, opened, cv.MORPH_OPEN, kernel);

  // 2. Gaussian blur
  const blurred = new cv.Mat();
  cv.GaussianBlur(opened, blurred, new cv.Size(5, 5), 0);

  // 3. Threshold
  const binary = new cv.Mat();
  cv.threshold(blurred, binary, 127, 255, cv.THRESH_BINARY);

  // 4. Find contours
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(binary, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE);

  // Scale factors
  const scaleX = previewWidth / originalWidth;
  const scaleY = previewHeight / originalHeight;

  // Process contours
  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i);
    const perimeter = cv.arcLength(contour, true);
    const epsilon = 0.005 * perimeter;
    const approx = new cv.Mat();
    cv.approxPolyDP(contour, approx, epsilon, true);

    if (approx.rows < 3) {
      approx.delete();
      continue;
    }

    const points: Array<{ x: number; y: number }> = [];
    for (let j = 0; j < approx.rows; j++) {
      points.push({
        x: Math.round(approx.data32S[j * 2] * scaleX),
        y: Math.round(approx.data32S[j * 2 + 1] * scaleY),
      });
    }

    const area = cv.contourArea(contour) * scaleX * scaleY;
    const moments = cv.moments(contour);
    const cx = moments.m00 > 0 ? moments.m10 / moments.m00 * scaleX : 0;
    const cy = moments.m00 > 0 ? moments.m01 / moments.m00 * scaleY : 0;
    const rect = cv.boundingRect(contour);
    const circularity = perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter * scaleX * scaleY) : 0;

    grains.push({
      tempId: generateId(),
      contour: points,
      area,
      centroid: { x: Math.round(cx), y: Math.round(cy) },
      boundingBox: {
        x: Math.round(rect.x * scaleX),
        y: Math.round(rect.y * scaleY),
        width: Math.round(rect.width * scaleX),
        height: Math.round(rect.height * scaleY),
      },
      perimeter: perimeter * Math.sqrt(scaleX * scaleY),
      circularity: Math.min(circularity, 1),
      confidence,
    });

    approx.delete();
  }

  // Cleanup
  src.delete();
  gray.delete();
  kernel.delete();
  opened.delete();
  blurred.delete();
  binary.delete();
  contours.delete();
  hierarchy.delete();

  return grains;
}

// Message handler - processes masks sequentially
self.onmessage = async (event: MessageEvent) => {
  const data = event.data;

  if (data.type === 'init') {
    // Initialize OpenCV once
    try {
      await ensureOpenCVLoaded(data.opencvScript);
      self.postMessage({ type: 'init-complete' });
    } catch (error) {
      self.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to load OpenCV',
      });
    }
  } else if (data.type === 'process-masks') {
    // Process all masks sequentially
    const { masks, originalWidth, originalHeight, previewWidth, previewHeight } = data;
    const allGrains: any[] = [];

    try {
      // Ensure OpenCV is loaded
      if (!cv) {
        throw new Error('OpenCV not initialized. Call init first.');
      }

      for (let i = 0; i < masks.length; i++) {
        const mask = masks[i];

        self.postMessage({
          type: 'progress',
          current: i + 1,
          total: masks.length,
        });

        try {
          const grains = await extractContours(
            mask.maskBase64,
            originalWidth,
            originalHeight,
            previewWidth,
            previewHeight,
            mask.confidence
          );
          allGrains.push(...grains);
        } catch (err) {
          console.warn('[ContourWorker] Failed to process mask', i, ':', err);
        }
      }

      self.postMessage({
        type: 'complete',
        grains: allGrains,
      });

    } catch (error) {
      self.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'Processing failed',
      });
    }
  }
};

export {};
