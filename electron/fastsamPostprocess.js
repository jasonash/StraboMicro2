/**
 * FastSAM Post-Processing Module
 *
 * Converts FastSAM mask output to polygon contours suitable for Spot creation.
 * Uses marching squares for contour extraction and Douglas-Peucker simplification.
 *
 * @module fastsamPostprocess
 */

// ============================================================================
// Contour Extraction - Marching Squares Algorithm
// ============================================================================

/**
 * Marching squares contour extraction.
 * More robust than Moore-neighbor tracing for binary masks.
 *
 * @param {Uint8Array} mask - Binary mask (1 = foreground, 0 = background)
 * @param {number} width - Mask width
 * @param {number} height - Mask height
 * @returns {Array<{x: number, y: number}>} Contour points
 */
function marchingSquaresContour(mask, width, height) {
  // Helper to get pixel value with bounds check (treat out-of-bounds as 0)
  const getPixel = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return 0;
    return mask[y * width + x];
  };

  // Find starting point on the boundary (first transition from 0 to 1 scanning left-to-right)
  let startX = -1, startY = -1;
  outer: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (getPixel(x, y) === 1 && (x === 0 || getPixel(x - 1, y) === 0)) {
        startX = x;
        startY = y;
        break outer;
      }
    }
  }

  if (startX === -1) {
    return []; // No foreground pixels
  }

  const contour = [];
  let x = startX, y = startY;
  let prevDir = 0; // 0=right, 1=down, 2=left, 3=up

  // Direction vectors
  const dx = [1, 0, -1, 0];
  const dy = [0, 1, 0, -1];

  const maxIterations = width * height * 4;
  let iterations = 0;

  do {
    contour.push({ x, y });

    // Get the 2x2 cell configuration at current position
    // Cell corners: top-left (x-1,y-1), top-right (x,y-1), bottom-left (x-1,y), bottom-right (x,y)
    const tl = getPixel(x - 1, y - 1);
    const tr = getPixel(x, y - 1);
    const bl = getPixel(x - 1, y);
    const br = getPixel(x, y);

    // Determine next direction based on cell configuration
    // Using a lookup approach for marching squares
    const cellType = (tl << 3) | (tr << 2) | (br << 1) | bl;

    let nextDir;
    switch (cellType) {
      case 1: case 5: case 13: nextDir = 0; break;  // right
      case 2: case 3: case 7: nextDir = 1; break;   // down
      case 4: case 12: case 14: nextDir = 2; break; // left
      case 8: case 10: case 11: nextDir = 3; break; // up
      case 6: nextDir = (prevDir === 3) ? 2 : 0; break; // saddle: prefer previous direction
      case 9: nextDir = (prevDir === 0) ? 3 : 1; break; // saddle: prefer previous direction
      default: nextDir = prevDir; break;
    }

    x += dx[nextDir];
    y += dy[nextDir];
    prevDir = nextDir;

    iterations++;
    if (iterations > maxIterations) {
      console.warn('[FastSAM] Marching squares exceeded max iterations');
      break;
    }
  } while ((x !== startX || y !== startY) && iterations < maxIterations);

  return contour;
}

/**
 * Extract boundary pixels and order them into a contour.
 * Works by collecting all boundary pixels, then ordering them by nearest-neighbor.
 *
 * @param {Uint8Array} mask - Binary mask (1 = foreground, 0 = background)
 * @param {number} width - Mask width
 * @param {number} height - Mask height
 * @returns {Array<{x: number, y: number}>} Contour points
 */
function mooreNeighborContour(mask, width, height) {
  const getPixel = (px, py) => {
    if (px < 0 || px >= width || py < 0 || py >= height) return 0;
    return mask[py * width + px];
  };

  // Collect all boundary pixels (foreground pixels with at least one 4-connected background neighbor)
  const boundaryPixels = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (getPixel(x, y) === 1) {
        // Check if this is a boundary pixel
        if (getPixel(x - 1, y) === 0 || getPixel(x + 1, y) === 0 ||
            getPixel(x, y - 1) === 0 || getPixel(x, y + 1) === 0) {
          boundaryPixels.push({ x, y });
        }
      }
    }
  }

  if (boundaryPixels.length === 0) return [];
  if (boundaryPixels.length < 4) return boundaryPixels;

  // Order boundary pixels by nearest-neighbor to form a contour
  const contour = [boundaryPixels[0]];
  const used = new Set([0]);

  while (contour.length < boundaryPixels.length) {
    const current = contour[contour.length - 1];
    let nearestIdx = -1;
    let nearestDist = Infinity;

    // Find nearest unused boundary pixel
    for (let i = 0; i < boundaryPixels.length; i++) {
      if (used.has(i)) continue;

      const p = boundaryPixels[i];
      const dist = Math.abs(p.x - current.x) + Math.abs(p.y - current.y); // Manhattan distance

      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }

      // Early exit if we found an adjacent pixel
      if (dist <= 2) break;
    }

    if (nearestIdx === -1 || nearestDist > 10) {
      // No nearby pixels found, might be disconnected - stop here
      break;
    }

    contour.push(boundaryPixels[nearestIdx]);
    used.add(nearestIdx);
  }

  return contour;
}

/**
 * Extract contour from binary mask using Moore-neighbor tracing.
 * This is more reliable than marching squares for binary masks.
 */
function extractContour(mask, width, height) {
  // Use Moore-neighbor tracing - more reliable for our masks
  const contour = mooreNeighborContour(mask, width, height);
  return contour;
}

/**
 * Subsample a contour to reduce point count while preserving shape.
 * Keeps every nth point.
 */
function subsampleContour(contour, maxPoints = 500) {
  if (contour.length <= maxPoints) return contour;

  const step = Math.ceil(contour.length / maxPoints);
  const result = [];
  for (let i = 0; i < contour.length; i += step) {
    result.push(contour[i]);
  }
  return result;
}

// ============================================================================
// Polygon Simplification
// ============================================================================

/**
 * Calculate perpendicular distance from point to line segment.
 */
function perpendicularDistance(point, lineStart, lineEnd) {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;

  if (dx === 0 && dy === 0) {
    return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2);
  }

  const t = Math.max(0, Math.min(1,
    ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (dx * dx + dy * dy)
  ));

  const projX = lineStart.x + t * dx;
  const projY = lineStart.y + t * dy;

  return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);
}

/**
 * Douglas-Peucker polygon simplification algorithm.
 *
 * @param {Array<{x: number, y: number}>} points - Input polygon points
 * @param {number} epsilon - Tolerance (higher = more simplification)
 * @returns {Array<{x: number, y: number}>} Simplified polygon
 */
function douglasPeucker(points, epsilon) {
  if (points.length < 3) return points;

  // Find point with maximum distance from line between first and last
  let maxDist = 0;
  let maxIdx = 0;

  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  // If max distance is greater than epsilon, recursively simplify
  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
    const right = douglasPeucker(points.slice(maxIdx), epsilon);
    return left.slice(0, -1).concat(right);
  } else {
    return [first, last];
  }
}

/**
 * Simplify a closed polygon (contour).
 */
function simplifyPolygon(contour, epsilon = 2.0) {
  if (contour.length < 4) return contour;

  // For closed polygons, duplicate first point at end, simplify, then remove duplicate
  const closed = [...contour, contour[0]];
  const simplified = douglasPeucker(closed, epsilon);

  // Remove duplicated closing point
  if (simplified.length > 1 &&
      simplified[0].x === simplified[simplified.length - 1].x &&
      simplified[0].y === simplified[simplified.length - 1].y) {
    simplified.pop();
  }

  return simplified;
}

// ============================================================================
// Morphological Operations (using Sharp)
// ============================================================================

/**
 * Apply morphological opening to clean up mask.
 * This removes small noise while preserving larger structures.
 *
 * Note: Sharp doesn't have morphological operations, so we implement
 * a simple erosion-dilation sequence using thresholding.
 */
async function morphologicalOpen(mask, width, height, kernelSize = 3) {
  // Simple erosion: pixel is 1 only if all neighbors are 1
  const eroded = new Uint8Array(width * height);
  const halfK = Math.floor(kernelSize / 2);

  for (let y = halfK; y < height - halfK; y++) {
    for (let x = halfK; x < width - halfK; x++) {
      let allOnes = true;
      for (let ky = -halfK; ky <= halfK && allOnes; ky++) {
        for (let kx = -halfK; kx <= halfK && allOnes; kx++) {
          if (mask[(y + ky) * width + (x + kx)] === 0) {
            allOnes = false;
          }
        }
      }
      eroded[y * width + x] = allOnes ? 1 : 0;
    }
  }

  // Simple dilation: pixel is 1 if any neighbor is 1
  const dilated = new Uint8Array(width * height);

  for (let y = halfK; y < height - halfK; y++) {
    for (let x = halfK; x < width - halfK; x++) {
      let anyOnes = false;
      for (let ky = -halfK; ky <= halfK && !anyOnes; ky++) {
        for (let kx = -halfK; kx <= halfK && !anyOnes; kx++) {
          if (eroded[(y + ky) * width + (x + kx)] === 1) {
            anyOnes = true;
          }
        }
      }
      dilated[y * width + x] = anyOnes ? 1 : 0;
    }
  }

  return dilated;
}

// ============================================================================
// Coordinate Transformation
// ============================================================================

/**
 * Transform mask coordinates to original image coordinates.
 *
 * @param {Array<{x: number, y: number}>} contour - Contour in mask coordinates
 * @param {number} maskW - Mask width
 * @param {number} maskH - Mask height
 * @param {object} preprocessInfo - Preprocessing info from FastSAM
 * @returns {Array<{x: number, y: number}>} Contour in original image coordinates
 */
function transformToOriginalCoords(contour, maskW, maskH, preprocessInfo) {
  const { scale, padX, padY, origW, origH } = preprocessInfo;
  const inputSize = 1024; // FastSAM input size

  return contour.map(p => {
    // Scale mask coords to input size
    const inputX = (p.x / maskW) * inputSize;
    const inputY = (p.y / maskH) * inputSize;

    // Remove padding
    const unpaddedX = inputX - padX;
    const unpaddedY = inputY - padY;

    // Scale to original image size
    const origX = unpaddedX / scale;
    const origY = unpaddedY / scale;

    // Clamp to image bounds
    return {
      x: Math.max(0, Math.min(origW - 1, Math.round(origX))),
      y: Math.max(0, Math.min(origH - 1, Math.round(origY))),
    };
  });
}

// ============================================================================
// Grain Metrics
// ============================================================================

/**
 * Calculate polygon area using shoelace formula.
 */
function calculatePolygonArea(points) {
  if (points.length < 3) return 0;

  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Calculate polygon perimeter.
 */
function calculatePolygonPerimeter(points) {
  if (points.length < 2) return 0;

  let perimeter = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    perimeter += Math.sqrt(
      (points[j].x - points[i].x) ** 2 +
      (points[j].y - points[i].y) ** 2
    );
  }
  return perimeter;
}

/**
 * Calculate polygon centroid.
 */
function calculatePolygonCentroid(points) {
  if (points.length === 0) return { x: 0, y: 0 };

  let cx = 0, cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  return {
    x: Math.round(cx / points.length),
    y: Math.round(cy / points.length),
  };
}

/**
 * Calculate bounding box.
 */
function calculateBoundingBox(points) {
  if (points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

// ============================================================================
// Main Conversion Function
// ============================================================================

/**
 * Convert FastSAM detection results to grain objects.
 *
 * @param {Array} detections - Array of detection objects from fastsamService
 * @param {object} preprocessInfo - Preprocessing info from fastsamService
 * @param {object} options - Conversion options
 * @returns {Array<object>} Array of detected grains in the same format as OpenCV detector
 */
function masksToGrains(detections, preprocessInfo, options = {}) {
  const {
    simplifyTolerance = 2.0,
    simplifyOutlines = true,
    minVertices = 4,
    betterQuality = true,
  } = options;

  console.log('[FastSAM Postprocess] Converting', detections.length, 'detections to grains');

  const grains = [];
  let grainIndex = 0;

  for (const det of detections) {
    const { mask, maskW, maskH, confidence, area: rawArea } = det;

    // Apply morphological opening for cleaner boundaries (if betterQuality)
    let processedMask = mask;
    if (betterQuality) {
      // Apply opening with 3x3 kernel
      processedMask = morphologicalOpenSync(mask, maskW, maskH, 3);
    }

    // Extract contour using marching squares algorithm
    let rawContour = extractContour(processedMask, maskW, maskH);
    if (rawContour.length < minVertices) {
      continue;
    }

    // Subsample if contour has too many points (for performance)
    let contour = subsampleContour(rawContour, 1000);
    if (simplifyOutlines) {
      contour = simplifyPolygon(contour, simplifyTolerance);
    }

    if (contour.length < minVertices) {
      continue;
    }

    // Transform to original image coordinates
    const origContour = transformToOriginalCoords(contour, maskW, maskH, preprocessInfo);

    // Calculate metrics
    const area = calculatePolygonArea(origContour);
    const perimeter = calculatePolygonPerimeter(origContour);
    const centroid = calculatePolygonCentroid(origContour);
    const boundingBox = calculateBoundingBox(origContour);

    // Circularity: 4 * pi * area / perimeter^2
    // 1.0 = perfect circle, lower = more irregular
    const circularity = perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0;

    grains.push({
      tempId: `grain-${grainIndex++}`,
      contour: origContour,
      area,
      centroid,
      boundingBox,
      perimeter,
      circularity,
      confidence, // Include confidence from FastSAM
    });
  }

  console.log('[FastSAM Postprocess] Produced', grains.length, 'grains');
  return grains;
}

/**
 * Synchronous morphological opening (for use in masksToGrains).
 */
function morphologicalOpenSync(mask, width, height, kernelSize = 3) {
  const halfK = Math.floor(kernelSize / 2);

  // Erosion
  const eroded = new Uint8Array(width * height);
  for (let y = halfK; y < height - halfK; y++) {
    for (let x = halfK; x < width - halfK; x++) {
      let allOnes = true;
      for (let ky = -halfK; ky <= halfK && allOnes; ky++) {
        for (let kx = -halfK; kx <= halfK && allOnes; kx++) {
          if (mask[(y + ky) * width + (x + kx)] === 0) {
            allOnes = false;
          }
        }
      }
      eroded[y * width + x] = allOnes ? 1 : 0;
    }
  }

  // Dilation
  const dilated = new Uint8Array(width * height);
  for (let y = halfK; y < height - halfK; y++) {
    for (let x = halfK; x < width - halfK; x++) {
      let anyOnes = false;
      for (let ky = -halfK; ky <= halfK && !anyOnes; ky++) {
        for (let kx = -halfK; kx <= halfK && !anyOnes; kx++) {
          if (eroded[(y + ky) * width + (x + kx)] === 1) {
            anyOnes = true;
          }
        }
      }
      dilated[y * width + x] = anyOnes ? 1 : 0;
    }
  }

  return dilated;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Contour extraction
  marchingSquaresContour,
  mooreNeighborContour,
  extractContour,
  subsampleContour,

  // Simplification
  douglasPeucker,
  simplifyPolygon,

  // Morphological operations
  morphologicalOpen,
  morphologicalOpenSync,

  // Coordinate transformation
  transformToOriginalCoords,

  // Metrics
  calculatePolygonArea,
  calculatePolygonPerimeter,
  calculatePolygonCentroid,
  calculateBoundingBox,

  // Main conversion
  masksToGrains,
};
