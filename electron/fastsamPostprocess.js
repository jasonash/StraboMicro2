/**
 * FastSAM Post-Processing Module
 *
 * Converts FastSAM mask output to polygon contours suitable for Spot creation.
 * Uses Moore-Neighbor contour tracing and Douglas-Peucker simplification.
 *
 * @module fastsamPostprocess
 */

// ============================================================================
// Contour Extraction
// ============================================================================

/**
 * Moore-Neighbor contour tracing algorithm.
 * Extracts the boundary of a binary mask.
 *
 * @param {Uint8Array} mask - Binary mask (1 = foreground, 0 = background)
 * @param {number} width - Mask width
 * @param {number} height - Mask height
 * @returns {Array<{x: number, y: number}>} Contour points
 */
function traceContour(mask, width, height) {
  // Find starting point (first foreground pixel, scanning top-left to bottom-right)
  let startX = -1, startY = -1;
  outer: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] === 1) {
        startX = x;
        startY = y;
        break outer;
      }
    }
  }

  if (startX === -1) {
    return []; // No foreground pixels
  }

  // Moore neighborhood directions (8-connected, clockwise starting from left)
  // 0=left, 1=top-left, 2=top, 3=top-right, 4=right, 5=bottom-right, 6=bottom, 7=bottom-left
  const dx = [-1, -1, 0, 1, 1, 1, 0, -1];
  const dy = [0, -1, -1, -1, 0, 1, 1, 1];

  const contour = [];
  let x = startX, y = startY;
  let dir = 0; // Start by checking left

  // Helper to get pixel value with bounds check
  const getPixel = (px, py) => {
    if (px < 0 || px >= width || py < 0 || py >= height) return 0;
    return mask[py * width + px];
  };

  // Maximum iterations to prevent infinite loops
  const maxIterations = width * height * 2;
  let iterations = 0;

  do {
    contour.push({ x, y });

    // Search for next boundary pixel in Moore neighborhood
    // Start from (dir + 5) mod 8 to backtrack
    let startDir = (dir + 5) % 8;
    let found = false;

    for (let i = 0; i < 8; i++) {
      const checkDir = (startDir + i) % 8;
      const nx = x + dx[checkDir];
      const ny = y + dy[checkDir];

      if (getPixel(nx, ny) === 1) {
        x = nx;
        y = ny;
        dir = checkDir;
        found = true;
        break;
      }
    }

    if (!found) {
      break; // Isolated pixel
    }

    iterations++;
    if (iterations > maxIterations) {
      console.warn('[FastSAM] Contour tracing exceeded max iterations');
      break;
    }
  } while (x !== startX || y !== startY || contour.length < 3);

  return contour;
}

/**
 * Alternative: Simple boundary extraction using edge detection.
 * Faster but may produce more points.
 */
function extractBoundary(mask, width, height) {
  const boundary = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] !== 1) continue;

      // Check if this is a boundary pixel (has at least one background neighbor)
      let isBoundary = false;
      for (let dy = -1; dy <= 1 && !isBoundary; dy++) {
        for (let dx = -1; dx <= 1 && !isBoundary; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
            isBoundary = true;
          } else if (mask[ny * width + nx] === 0) {
            isBoundary = true;
          }
        }
      }

      if (isBoundary) {
        boundary.push({ x, y });
      }
    }
  }

  return boundary;
}

/**
 * Order boundary points to form a proper contour.
 * Uses nearest-neighbor linking.
 */
function orderBoundaryPoints(points) {
  if (points.length < 3) return points;

  const ordered = [points[0]];
  const used = new Set([0]);

  while (ordered.length < points.length) {
    const last = ordered[ordered.length - 1];
    let bestIdx = -1;
    let bestDist = Infinity;

    for (let i = 0; i < points.length; i++) {
      if (used.has(i)) continue;
      const dist = (points[i].x - last.x) ** 2 + (points[i].y - last.y) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    if (bestIdx === -1 || bestDist > 9) {
      // Gap too large, stop
      break;
    }

    ordered.push(points[bestIdx]);
    used.add(bestIdx);
  }

  return ordered;
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

    // Extract contour using boundary extraction + ordering
    // (More reliable than Moore tracing for noisy masks)
    const boundary = extractBoundary(processedMask, maskW, maskH);
    if (boundary.length < minVertices) {
      continue;
    }

    // Order points to form a proper contour
    const orderedContour = orderBoundaryPoints(boundary);
    if (orderedContour.length < minVertices) {
      continue;
    }

    // Simplify polygon
    let contour = orderedContour;
    if (simplifyOutlines) {
      contour = simplifyPolygon(orderedContour, simplifyTolerance);
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
  traceContour,
  extractBoundary,
  orderBoundaryPoints,

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
