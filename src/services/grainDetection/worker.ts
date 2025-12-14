/**
 * Grain Detection Web Worker
 *
 * Runs OpenCV-based grain detection in a background thread
 * to prevent UI blocking.
 */

// Worker message types
interface DetectionRequest {
  type: 'detect';
  imageData: ImageData;
  opencvScript?: string; // OpenCV script content passed from main thread (for production)
  settings: {
    sensitivity: number;
    minGrainSize: number;
    edgeContrast: number;
    simplifyOutlines: boolean;
    simplifyTolerance: number;
  };
}

interface DetectionResponse {
  type: 'result';
  grains: Array<{
    tempId: string;
    contour: Array<{ x: number; y: number }>;
    area: number;
    centroid: { x: number; y: number };
    boundingBox: { x: number; y: number; width: number; height: number };
    perimeter: number;
    circularity: number;
  }>;
  processingTimeMs: number;
  imageDimensions: { width: number; height: number };
  scaleFactor: number;
}

interface ProgressMessage {
  type: 'progress';
  step: string;
  percent: number;
}

interface ErrorMessage {
  type: 'error';
  message: string;
}

// OpenCV instance
let cv: any = null;

/**
 * Maximum image dimension for processing.
 * 1024 for faster detection - can increase if quality is insufficient.
 */
const MAX_PROCESSING_SIZE = 1024;

/**
 * Load OpenCV.js in the worker context
 * Prefers script passed from main thread (works in production),
 * falls back to fetch (works in dev mode)
 */
async function loadOpenCVInWorker(scriptContent?: string): Promise<void> {
  if (cv) return;

  self.postMessage({ type: 'progress', step: 'Loading OpenCV...', percent: 5 } as ProgressMessage);

  let scriptText: string;

  try {
    // If script content was passed from main thread, use it directly
    if (scriptContent) {
      console.log('[Worker] Using OpenCV script passed from main thread');
      scriptText = scriptContent;
    } else {
      // Fall back to fetch (works in dev mode)
      console.log('[Worker] Fetching OpenCV script...');
      const possibleUrls = [
        '/opencv.js', // Works in dev mode with Vite
        'http://localhost:5173/opencv.js', // Vite dev server explicit
      ];

      let response: Response | null = null;
      let lastError: Error | null = null;

      for (const url of possibleUrls) {
        try {
          response = await fetch(url);
          if (response.ok) {
            break;
          }
          response = null;
        } catch (e) {
          lastError = e instanceof Error ? e : new Error(String(e));
          response = null;
        }
      }

      if (!response || !response.ok) {
        throw lastError || new Error('Failed to fetch OpenCV.js from any location');
      }
      scriptText = await response.text();
    }

    // Execute the script in worker context
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
          resolve();
          return;
        }

        // Check for factory pattern
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
          } catch (e) {
            // Continue polling
          }
        }

        // Check for onRuntimeInitialized
        if (globalCv && 'onRuntimeInitialized' in globalCv) {
          globalCv.onRuntimeInitialized = () => {
            cv = globalCv;
            resolve();
          };
          return;
        }

        // Check timeout
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

/**
 * Prepare image for processing, downscaling if necessary.
 */
function prepareImageForProcessing(imageData: ImageData): {
  processedImageData: ImageData;
  scaleFactor: number;
} {
  const maxDim = Math.max(imageData.width, imageData.height);

  if (maxDim <= MAX_PROCESSING_SIZE) {
    return { processedImageData: imageData, scaleFactor: 1 };
  }

  const scaleFactor = MAX_PROCESSING_SIZE / maxDim;
  const newWidth = Math.round(imageData.width * scaleFactor);
  const newHeight = Math.round(imageData.height * scaleFactor);

  // Create OffscreenCanvas for downscaling (available in workers)
  const sourceCanvas = new OffscreenCanvas(imageData.width, imageData.height);
  const sourceCtx = sourceCanvas.getContext('2d')!;
  sourceCtx.putImageData(imageData, 0, 0);

  const destCanvas = new OffscreenCanvas(newWidth, newHeight);
  const destCtx = destCanvas.getContext('2d')!;
  destCtx.drawImage(sourceCanvas, 0, 0, newWidth, newHeight);

  return {
    processedImageData: destCtx.getImageData(0, 0, newWidth, newHeight),
    scaleFactor,
  };
}

/**
 * Main detection pipeline
 */
function runDetection(imageData: ImageData, settings: DetectionRequest['settings']): DetectionResponse {
  const startTime = performance.now();
  const mats: any[] = [];

  try {
    // Prepare image
    self.postMessage({ type: 'progress', step: 'Preparing image...', percent: 10 } as ProgressMessage);
    const { processedImageData, scaleFactor } = prepareImageForProcessing(imageData);

    // Convert to OpenCV Mat
    self.postMessage({ type: 'progress', step: 'Processing...', percent: 15 } as ProgressMessage);
    const src = cv.matFromImageData(processedImageData);
    mats.push(src);

    // Preprocessing
    self.postMessage({ type: 'progress', step: 'Preprocessing...', percent: 20 } as ProgressMessage);
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    mats.push(gray);

    const blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    mats.push(blurred);

    const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
    const enhanced = new cv.Mat();
    clahe.apply(blurred, enhanced);
    clahe.delete();
    mats.push(enhanced);

    // Edge detection
    self.postMessage({ type: 'progress', step: 'Detecting edges...', percent: 35 } as ProgressMessage);
    const edges = new cv.Mat();
    const lowThreshold = Math.max(30, 150 - settings.sensitivity);
    const highThreshold = Math.max(100, 250 - settings.sensitivity);
    cv.Canny(enhanced, edges, lowThreshold, highThreshold);
    mats.push(edges);

    const dilationSize = Math.max(1, Math.round(3 - (settings.edgeContrast / 50)));
    const kernel = cv.Mat.ones(dilationSize, dilationSize, cv.CV_8U);
    cv.dilate(edges, edges, kernel);
    kernel.delete();

    // Watershed segmentation
    self.postMessage({ type: 'progress', step: 'Segmenting grains...', percent: 50 } as ProgressMessage);

    const inverted = new cv.Mat();
    cv.bitwise_not(edges, inverted);
    mats.push(inverted);

    const dist = new cv.Mat();
    cv.distanceTransform(inverted, dist, cv.DIST_L2, 5);
    cv.normalize(dist, dist, 0, 255, cv.NORM_MINMAX);
    mats.push(dist);

    const sureFg = new cv.Mat();
    cv.threshold(dist, sureFg, 0.4 * 255, 255, cv.THRESH_BINARY);
    sureFg.convertTo(sureFg, cv.CV_8U);
    mats.push(sureFg);

    const sureBg = new cv.Mat();
    const bgKernel = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(inverted, sureBg, bgKernel, new cv.Point(-1, -1), 3);
    bgKernel.delete();
    mats.push(sureBg);

    const unknown = new cv.Mat();
    cv.subtract(sureBg, sureFg, unknown);
    mats.push(unknown);

    const markers = new cv.Mat();
    cv.connectedComponents(sureFg, markers);
    mats.push(markers);

    // Adjust markers
    self.postMessage({ type: 'progress', step: 'Refining boundaries...', percent: 65 } as ProgressMessage);
    for (let i = 0; i < markers.rows; i++) {
      for (let j = 0; j < markers.cols; j++) {
        const val = markers.intAt(i, j);
        if (unknown.ucharAt(i, j) === 255) {
          markers.intPtr(i, j)[0] = 0;
        } else {
          markers.intPtr(i, j)[0] = val + 1;
        }
      }
    }

    const src3 = new cv.Mat();
    cv.cvtColor(enhanced, src3, cv.COLOR_GRAY2RGB);
    mats.push(src3);

    cv.watershed(src3, markers);

    // Extract grains
    self.postMessage({ type: 'progress', step: 'Extracting grains...', percent: 80 } as ProgressMessage);

    const markerValues = new Set<number>();
    for (let i = 0; i < markers.rows; i++) {
      for (let j = 0; j < markers.cols; j++) {
        const val = markers.intAt(i, j);
        if (val > 1) {
          markerValues.add(val);
        }
      }
    }

    const grains: DetectionResponse['grains'] = [];
    let grainIndex = 0;

    for (const markerVal of markerValues) {
      const mask = new cv.Mat.zeros(markers.rows, markers.cols, cv.CV_8U);

      for (let i = 0; i < markers.rows; i++) {
        for (let j = 0; j < markers.cols; j++) {
          if (markers.intAt(i, j) === markerVal) {
            mask.ucharPtr(i, j)[0] = 255;
          }
        }
      }

      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      if (contours.size() > 0) {
        const contour = contours.get(0);
        const area = cv.contourArea(contour);
        const scaledMinSize = settings.minGrainSize * scaleFactor * scaleFactor;

        if (area >= scaledMinSize) {
          const perimeter = cv.arcLength(contour, true);

          let finalContour = contour;
          if (settings.simplifyOutlines) {
            const simplified = new cv.Mat();
            cv.approxPolyDP(contour, simplified, settings.simplifyTolerance, true);
            finalContour = simplified;
            mats.push(simplified);
          }

          const points: Array<{ x: number; y: number }> = [];
          for (let i = 0; i < finalContour.rows; i++) {
            points.push({
              x: Math.round(finalContour.intAt(i, 0) / scaleFactor),
              y: Math.round(finalContour.intAt(i, 1) / scaleFactor),
            });
          }

          const moments = cv.moments(contour);
          const centroid = moments.m00 > 0
            ? {
                x: Math.round(moments.m10 / moments.m00 / scaleFactor),
                y: Math.round(moments.m01 / moments.m00 / scaleFactor),
              }
            : { x: 0, y: 0 };

          const rect = cv.boundingRect(contour);
          const circularity = perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0;

          grains.push({
            tempId: `grain-${grainIndex++}`,
            contour: points,
            area: area / (scaleFactor * scaleFactor),
            centroid,
            boundingBox: {
              x: Math.round(rect.x / scaleFactor),
              y: Math.round(rect.y / scaleFactor),
              width: Math.round(rect.width / scaleFactor),
              height: Math.round(rect.height / scaleFactor),
            },
            perimeter: perimeter / scaleFactor,
            circularity,
          });
        }
      }

      mask.delete();
      contours.delete();
      hierarchy.delete();
    }

    self.postMessage({ type: 'progress', step: 'Done!', percent: 100 } as ProgressMessage);

    const processingTimeMs = performance.now() - startTime;

    return {
      type: 'result',
      grains,
      processingTimeMs,
      imageDimensions: {
        width: imageData.width,
        height: imageData.height,
      },
      scaleFactor,
    };
  } finally {
    // Cleanup
    for (const mat of mats) {
      try {
        mat.delete();
      } catch {
        // Already deleted
      }
    }
  }
}

// Message handler
self.onmessage = async (event: MessageEvent<DetectionRequest>) => {
  const { type, imageData, opencvScript, settings } = event.data;

  if (type === 'detect') {
    try {
      // Load OpenCV if needed (pass script content if provided)
      await loadOpenCVInWorker(opencvScript);

      // Run detection
      const result = runDetection(imageData, settings);
      self.postMessage(result);
    } catch (error) {
      self.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'Detection failed',
      } as ErrorMessage);
    }
  }
};

export {};
