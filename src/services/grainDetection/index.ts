/**
 * Grain Detection Service
 *
 * Uses OpenCV.js to detect grain boundaries in thin section micrographs.
 *
 * Pipeline:
 * 1. Preprocessing - Convert to grayscale, apply Gaussian blur
 * 2. Edge Detection - Canny edge detection
 * 3. Segmentation - Watershed algorithm to separate touching grains
 * 4. Contour Extraction - Extract polygon boundaries, filter by size
 *
 * @module grainDetection
 */

import { loadOpenCV } from './opencvLoader';
import type {
  DetectionSettings,
  DetectionResult,
  DetectedGrain,
  RegionMask,
} from './types';

// Re-export types and loader functions
export * from './types';
export * from './opencvLoader';

/**
 * Maximum image dimension for processing.
 * Larger images are downscaled to prevent memory issues.
 */
const MAX_PROCESSING_SIZE = 2048;

/**
 * Detect grain boundaries in an image.
 *
 * @param imageData - ImageData from a canvas context
 * @param settings - Detection settings
 * @param regionMask - Optional region to limit detection
 * @returns Detection result with array of detected grains
 */
export async function detectGrainBoundaries(
  imageData: ImageData,
  settings: DetectionSettings,
  regionMask?: RegionMask
): Promise<DetectionResult> {
  const startTime = performance.now();

  // Load OpenCV if not already loaded
  const cv = await loadOpenCV();

  // Track all Mats for cleanup
  const mats: unknown[] = [];

  try {
    // Prepare image (downscale if needed)
    const { processedImageData, scaleFactor } = prepareImageForProcessing(imageData);

    // Convert ImageData to OpenCV Mat
    const src = cv.matFromImageData(processedImageData);
    mats.push(src);

    // Apply region mask if provided
    let masked = src;
    if (regionMask) {
      masked = applyRegionMask(cv, src, regionMask, scaleFactor, mats);
    }

    // Step 1: Preprocessing
    const preprocessed = preprocess(cv, masked, mats);

    // Step 2: Edge detection
    const edges = detectEdges(cv, preprocessed, settings, mats);

    // Step 3: Watershed segmentation
    const markers = watershedSegment(cv, preprocessed, edges, mats);

    // Step 4: Extract contours from markers
    const grains = extractGrains(cv, markers, settings, scaleFactor, mats);

    const processingTimeMs = performance.now() - startTime;

    console.log(
      `[GrainDetection] Detected ${grains.length} grains in ${processingTimeMs.toFixed(0)}ms`
    );

    return {
      grains,
      processingTimeMs,
      settings,
      imageDimensions: {
        width: imageData.width,
        height: imageData.height,
      },
      scaleFactor,
    };
  } finally {
    // Clean up all OpenCV Mats
    for (const mat of mats) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mat as any).delete();
      } catch {
        // Already deleted or not a Mat
      }
    }
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

  // Create canvas for downscaling
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = imageData.width;
  sourceCanvas.height = imageData.height;
  const sourceCtx = sourceCanvas.getContext('2d')!;
  sourceCtx.putImageData(imageData, 0, 0);

  const destCanvas = document.createElement('canvas');
  destCanvas.width = newWidth;
  destCanvas.height = newHeight;
  const destCtx = destCanvas.getContext('2d')!;
  destCtx.drawImage(sourceCanvas, 0, 0, newWidth, newHeight);

  console.log(
    `[GrainDetection] Downscaled image from ${imageData.width}x${imageData.height} to ${newWidth}x${newHeight}`
  );

  return {
    processedImageData: destCtx.getImageData(0, 0, newWidth, newHeight),
    scaleFactor,
  };
}

/**
 * Apply a polygon region mask to the image.
 */
function applyRegionMask(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cv: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  src: any,
  regionMask: RegionMask,
  scaleFactor: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mats: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  // Scale region vertices if image was downscaled
  const scaledVertices = regionMask.vertices.map((v) => ({
    x: Math.round(v.x * scaleFactor),
    y: Math.round(v.y * scaleFactor),
  }));

  // Create mask
  const mask = new cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC1);
  mats.push(mask);

  // Draw filled polygon on mask
  const points = new cv.MatVector();
  const polygon = new cv.Mat(scaledVertices.length, 1, cv.CV_32SC2);
  for (let i = 0; i < scaledVertices.length; i++) {
    polygon.intPtr(i, 0)[0] = scaledVertices[i].x;
    polygon.intPtr(i, 0)[1] = scaledVertices[i].y;
  }
  points.push_back(polygon);
  cv.fillPoly(mask, points, new cv.Scalar(255));
  polygon.delete();
  points.delete();

  // Apply mask
  const masked = new cv.Mat();
  src.copyTo(masked, mask);
  mats.push(masked);

  return masked;
}

/**
 * Preprocess image: convert to grayscale, apply Gaussian blur.
 */
function preprocess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cv: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  src: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mats: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  // Convert to grayscale
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  mats.push(gray);

  // Apply Gaussian blur to reduce noise
  const blurred = new cv.Mat();
  cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
  mats.push(blurred);

  // Apply CLAHE (Contrast Limited Adaptive Histogram Equalization) for better contrast
  const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
  const enhanced = new cv.Mat();
  clahe.apply(blurred, enhanced);
  clahe.delete();
  mats.push(enhanced);

  return enhanced;
}

/**
 * Detect edges using Canny edge detection.
 */
function detectEdges(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cv: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  preprocessed: any,
  settings: DetectionSettings,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mats: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const edges = new cv.Mat();

  // Map sensitivity (0-100) to Canny thresholds
  // Higher sensitivity = lower thresholds = more edges detected
  // sensitivity 0 -> thresholds 150/250 (few edges)
  // sensitivity 100 -> thresholds 50/150 (many edges)
  const lowThreshold = Math.max(30, 150 - settings.sensitivity);
  const highThreshold = Math.max(100, 250 - settings.sensitivity);

  cv.Canny(preprocessed, edges, lowThreshold, highThreshold);
  mats.push(edges);

  // Dilate edges slightly to close small gaps
  // More dilation for lower edge contrast (softer boundaries)
  const dilationSize = Math.max(1, Math.round(3 - (settings.edgeContrast / 50)));
  const kernel = cv.Mat.ones(dilationSize, dilationSize, cv.CV_8U);
  cv.dilate(edges, edges, kernel);
  kernel.delete();

  return edges;
}

/**
 * Perform watershed segmentation to separate touching grains.
 */
function watershedSegment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cv: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  preprocessed: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  edges: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mats: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  // Invert edges to get regions (white = grain interiors)
  const inverted = new cv.Mat();
  cv.bitwise_not(edges, inverted);
  mats.push(inverted);

  // Distance transform to find grain centers
  const dist = new cv.Mat();
  cv.distanceTransform(inverted, dist, cv.DIST_L2, 5);
  cv.normalize(dist, dist, 0, 255, cv.NORM_MINMAX);
  mats.push(dist);

  // Threshold to get sure foreground (grain centers)
  const sureFg = new cv.Mat();
  cv.threshold(dist, sureFg, 0.4 * 255, 255, cv.THRESH_BINARY);
  sureFg.convertTo(sureFg, cv.CV_8U);
  mats.push(sureFg);

  // Sure background (dilated edges)
  const sureBg = new cv.Mat();
  const bgKernel = cv.Mat.ones(3, 3, cv.CV_8U);
  cv.dilate(inverted, sureBg, bgKernel, new cv.Point(-1, -1), 3);
  bgKernel.delete();
  mats.push(sureBg);

  // Unknown region
  const unknown = new cv.Mat();
  cv.subtract(sureBg, sureFg, unknown);
  mats.push(unknown);

  // Create markers for watershed
  const markers = new cv.Mat();
  cv.connectedComponents(sureFg, markers);
  mats.push(markers);

  // Add 1 to all markers so background is 1, not 0
  // Mark unknown region as 0
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

  // Convert preprocessed to 3-channel for watershed
  const src3 = new cv.Mat();
  cv.cvtColor(preprocessed, src3, cv.COLOR_GRAY2RGB);
  mats.push(src3);

  // Apply watershed
  cv.watershed(src3, markers);

  return markers;
}

/**
 * Extract grain contours from watershed markers.
 */
function extractGrains(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cv: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  markers: any,
  settings: DetectionSettings,
  scaleFactor: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mats: any[]
): DetectedGrain[] {
  const grains: DetectedGrain[] = [];

  // Find unique marker values (each represents a grain)
  const markerValues = new Set<number>();
  for (let i = 0; i < markers.rows; i++) {
    for (let j = 0; j < markers.cols; j++) {
      const val = markers.intAt(i, j);
      // Skip background (1), boundaries (-1/watershed lines), and unknown (0)
      if (val > 1) {
        markerValues.add(val);
      }
    }
  }

  let grainIndex = 0;

  // Extract contour for each grain
  for (const markerVal of markerValues) {
    // Create binary mask for this grain
    const mask = new cv.Mat.zeros(markers.rows, markers.cols, cv.CV_8U);

    for (let i = 0; i < markers.rows; i++) {
      for (let j = 0; j < markers.cols; j++) {
        if (markers.intAt(i, j) === markerVal) {
          mask.ucharPtr(i, j)[0] = 255;
        }
      }
    }

    // Find contours
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    if (contours.size() > 0) {
      const contour = contours.get(0);
      const area = cv.contourArea(contour);

      // Scale minimum grain size based on scale factor
      const scaledMinSize = settings.minGrainSize * scaleFactor * scaleFactor;

      // Filter by minimum grain size
      if (area >= scaledMinSize) {
        // Calculate perimeter
        const perimeter = cv.arcLength(contour, true);

        // Simplify contour if enabled
        let finalContour = contour;
        if (settings.simplifyOutlines) {
          const simplified = new cv.Mat();
          const epsilon = settings.simplifyTolerance;
          cv.approxPolyDP(contour, simplified, epsilon, true);
          finalContour = simplified;
          mats.push(simplified);
        }

        // Convert contour to coordinate array
        // Scale coordinates back to original image size
        const points: Array<{ x: number; y: number }> = [];
        for (let i = 0; i < finalContour.rows; i++) {
          points.push({
            x: Math.round(finalContour.intAt(i, 0) / scaleFactor),
            y: Math.round(finalContour.intAt(i, 1) / scaleFactor),
          });
        }

        // Calculate centroid using moments
        const moments = cv.moments(contour);
        const centroid =
          moments.m00 > 0
            ? {
                x: Math.round(moments.m10 / moments.m00 / scaleFactor),
                y: Math.round(moments.m01 / moments.m00 / scaleFactor),
              }
            : { x: 0, y: 0 };

        // Get bounding box (scale to original size)
        const rect = cv.boundingRect(contour);

        // Calculate circularity (4 * pi * area / perimeter^2)
        const circularity =
          perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0;

        // Scale area back to original image
        const originalArea = area / (scaleFactor * scaleFactor);
        const originalPerimeter = perimeter / scaleFactor;

        grains.push({
          tempId: `grain-${grainIndex++}`,
          contour: points,
          area: originalArea,
          centroid,
          boundingBox: {
            x: Math.round(rect.x / scaleFactor),
            y: Math.round(rect.y / scaleFactor),
            width: Math.round(rect.width / scaleFactor),
            height: Math.round(rect.height / scaleFactor),
          },
          perimeter: originalPerimeter,
          circularity,
        });
      }
    }

    // Cleanup
    mask.delete();
    contours.delete();
    hierarchy.delete();
  }

  return grains;
}

/**
 * Convert detected grains to spot-compatible format.
 * This is a utility function for the UI layer.
 *
 * @param grains - Detected grains from detectGrainBoundaries
 * @param outputType - 'polygon' for outlines, 'point' for centroids
 * @returns Array of geometry data ready for spot creation
 */
export function grainsToSpotGeometry(
  grains: DetectedGrain[],
  outputType: 'polygon' | 'point' = 'polygon'
): Array<{
  geometryType: 'polygon' | 'point';
  points: Array<{ X: number; Y: number }>;
  area?: number;
  centroid?: { X: number; Y: number };
}> {
  return grains.map((grain) => {
    if (outputType === 'point') {
      return {
        geometryType: 'point' as const,
        points: [{ X: grain.centroid.x, Y: grain.centroid.y }],
        centroid: { X: grain.centroid.x, Y: grain.centroid.y },
      };
    }

    return {
      geometryType: 'polygon' as const,
      points: grain.contour.map((p) => ({ X: p.x, Y: p.y })),
      area: grain.area,
      centroid: { X: grain.centroid.x, Y: grain.centroid.y },
    };
  });
}
