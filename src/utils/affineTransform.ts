/**
 * Affine Transform Utilities
 *
 * Computes 2x3 affine matrices from control point pairs and provides
 * coordinate transformation functions for image registration.
 *
 * The affine transformation maps overlay image pixels to parent image pixels:
 *   x' = a*x + b*y + tx
 *   y' = c*x + d*y + ty
 *
 * Matrix format: [a, b, tx, c, d, ty]
 */

/**
 * A control point pair mapping overlay coordinates to parent coordinates.
 */
export interface ControlPoint {
  /** (x, y) coordinates in overlay image pixels */
  source: [number, number];
  /** (x, y) coordinates in parent image pixels */
  target: [number, number];
}

/**
 * 2x3 affine transformation matrix as flat array.
 * [a, b, tx, c, d, ty] where:
 *   x' = a*x + b*y + tx
 *   y' = c*x + d*y + ty
 */
export type AffineMatrix = [number, number, number, number, number, number];

/**
 * Bounding box in 2D space.
 */
export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

/**
 * Compute affine transformation matrix from exactly 3 control point pairs.
 * Solves the linear system to find the unique matrix that maps source→target.
 *
 * Uses Cramer's rule to solve the system of linear equations.
 *
 * @param points - Array of exactly 3 control points
 * @returns 2x3 affine matrix as [a, b, tx, c, d, ty]
 * @throws Error if points array doesn't have exactly 3 points
 * @throws Error if points are collinear (determinant ≈ 0)
 */
export function computeAffineMatrix(points: ControlPoint[]): AffineMatrix {
  if (points.length !== 3) {
    throw new Error(`Exactly 3 control points required for affine transform, got ${points.length}`);
  }

  const [p1, p2, p3] = points;
  const [x1, y1] = p1.source;
  const [x2, y2] = p2.source;
  const [x3, y3] = p3.source;
  const [x1p, y1p] = p1.target;
  const [x2p, y2p] = p2.target;
  const [x3p, y3p] = p3.target;

  // Compute determinant of source point matrix
  // | x1  y1  1 |
  // | x2  y2  1 |
  // | x3  y3  1 |
  const det = x1 * (y2 - y3) - y1 * (x2 - x3) + (x2 * y3 - x3 * y2);

  if (Math.abs(det) < 1e-10) {
    throw new Error('Control points are collinear - cannot compute affine transform');
  }

  // Solve for affine matrix coefficients using Cramer's rule
  // We need to solve:
  // | x1  y1  1 |   | a  c |   | x1'  y1' |
  // | x2  y2  1 | × | b  d | = | x2'  y2' |
  // | x3  y3  1 |   | tx ty|   | x3'  y3' |

  // For x' coefficients (a, b, tx):
  // a = det(| x1' y1 1 |, | x2' y2 1 |, | x3' y3 1 |) / det
  const a = (x1p * (y2 - y3) - y1 * (x2p - x3p) + (x2p * y3 - x3p * y2)) / det;

  // b = det(| x1 x1' 1 |, | x2 x2' 1 |, | x3 x3' 1 |) / det
  const b = (x1 * (x2p - x3p) - x1p * (x2 - x3) + (x2 * x3p - x3 * x2p)) / det;

  // tx = det(| x1 y1 x1' |, | x2 y2 x2' |, | x3 y3 x3' |) / det
  const tx = (x1 * (y2 * x3p - y3 * x2p) - y1 * (x2 * x3p - x3 * x2p) + x1p * (x2 * y3 - x3 * y2)) / det;

  // For y' coefficients (c, d, ty):
  const c = (y1p * (y2 - y3) - y1 * (y2p - y3p) + (y2p * y3 - y3p * y2)) / det;
  const d = (x1 * (y2p - y3p) - y1p * (x2 - x3) + (x2 * y3p - x3 * y2p)) / det;
  const ty = (x1 * (y2 * y3p - y3 * y2p) - y1 * (x2 * y3p - x3 * y2p) + y1p * (x2 * y3 - x3 * y2)) / det;

  return [a, b, tx, c, d, ty];
}

/**
 * Apply affine transform to a single point.
 *
 * @param x - Source x coordinate
 * @param y - Source y coordinate
 * @param matrix - Affine matrix [a, b, tx, c, d, ty]
 * @returns Transformed [x', y'] coordinates
 */
export function transformPoint(
  x: number,
  y: number,
  matrix: AffineMatrix
): [number, number] {
  const [a, b, tx, c, d, ty] = matrix;
  return [
    a * x + b * y + tx,
    c * x + d * y + ty
  ];
}

/**
 * Compute the bounding box of a transformed image.
 * Transforms the four corners and finds min/max coordinates.
 *
 * @param imageWidth - Width of source image in pixels
 * @param imageHeight - Height of source image in pixels
 * @param matrix - Affine matrix to apply
 * @returns Bounding box in target coordinate space
 */
export function computeTransformedBounds(
  imageWidth: number,
  imageHeight: number,
  matrix: AffineMatrix
): BoundingBox {
  // Transform the four corners of the image
  const corners: [number, number][] = [
    [0, 0],
    [imageWidth, 0],
    [imageWidth, imageHeight],
    [0, imageHeight]
  ];

  const transformed = corners.map(([x, y]) => transformPoint(x, y, matrix));
  const xs = transformed.map(p => p[0]);
  const ys = transformed.map(p => p[1]);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/**
 * Check if three points are approximately collinear.
 * Returns true if the triangle area formed by the source points is below threshold.
 *
 * @param points - Array of control points (uses source coordinates)
 * @param threshold - Minimum triangle area in pixels squared (default: 100)
 * @returns True if points are collinear (bad for registration)
 */
export function arePointsCollinear(
  points: ControlPoint[],
  threshold: number = 100
): boolean {
  if (points.length < 3) return true;

  const [p1, p2, p3] = points;
  const [x1, y1] = p1.source;
  const [x2, y2] = p2.source;
  const [x3, y3] = p3.source;

  // Compute triangle area using cross product formula
  // Area = |((x2-x1)(y3-y1) - (x3-x1)(y2-y1))| / 2
  const area = Math.abs((x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1)) / 2;
  return area < threshold;
}

/**
 * Check if points are well-distributed across the image.
 * Returns a warning message if points are too close together.
 *
 * Well-distributed control points produce more accurate registration.
 *
 * @param points - Array of control points
 * @param imageWidth - Width of overlay image
 * @param imageHeight - Height of overlay image
 * @param minDistanceRatio - Minimum distance as fraction of image size (default: 0.1)
 * @returns Warning message if points are poorly distributed, null otherwise
 */
export function checkPointDistribution(
  points: ControlPoint[],
  imageWidth: number,
  imageHeight: number,
  minDistanceRatio: number = 0.1
): string | null {
  if (points.length < 2) return null;

  const minDistance = Math.min(imageWidth, imageHeight) * minDistanceRatio;

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const [x1, y1] = points[i].source;
      const [x2, y2] = points[j].source;
      const distance = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

      if (distance < minDistance) {
        return `Points ${i + 1} and ${j + 1} are very close together. Spread points apart for better accuracy.`;
      }
    }
  }

  return null;
}

/**
 * Convert our matrix format [a, b, tx, c, d, ty] to Sharp's affine() parameters.
 * Sharp uses a 2x2 matrix with separate offset options.
 *
 * @param matrix - Our affine matrix format
 * @returns Object with matrix and options for Sharp's affine() method
 */
export function toSharpAffineParams(matrix: AffineMatrix): {
  matrix: [[number, number], [number, number]];
  options: { odx: number; ody: number };
} {
  const [a, b, tx, c, d, ty] = matrix;
  return {
    matrix: [[a, b], [c, d]],
    options: { odx: tx, ody: ty }
  };
}

/**
 * Compute the inverse of an affine matrix.
 * Useful for transforming from parent coordinates back to overlay coordinates.
 *
 * @param matrix - Affine matrix to invert
 * @returns Inverse affine matrix
 * @throws Error if matrix is not invertible (determinant ≈ 0)
 */
export function invertAffineMatrix(matrix: AffineMatrix): AffineMatrix {
  const [a, b, tx, c, d, ty] = matrix;

  // Determinant of the 2x2 linear part
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-10) {
    throw new Error('Matrix is not invertible (determinant ≈ 0)');
  }

  const invDet = 1 / det;

  // Inverse of 2x2 matrix: [d, -b; -c, a] / det
  const aInv = d * invDet;
  const bInv = -b * invDet;
  const cInv = -c * invDet;
  const dInv = a * invDet;

  // Inverse translation: -[aInv, bInv; cInv, dInv] * [tx; ty]
  const txInv = -(aInv * tx + bInv * ty);
  const tyInv = -(cInv * tx + dInv * ty);

  return [aInv, bInv, txInv, cInv, dInv, tyInv];
}

/**
 * Create an identity affine matrix (no transformation).
 *
 * @returns Identity matrix [1, 0, 0, 0, 1, 0]
 */
export function identityMatrix(): AffineMatrix {
  return [1, 0, 0, 0, 1, 0];
}

/**
 * Create a translation-only affine matrix.
 *
 * @param tx - X translation
 * @param ty - Y translation
 * @returns Translation matrix
 */
export function translationMatrix(tx: number, ty: number): AffineMatrix {
  return [1, 0, tx, 0, 1, ty];
}

/**
 * Create a scale matrix (uniform or non-uniform).
 *
 * @param sx - X scale factor
 * @param sy - Y scale factor (defaults to sx for uniform scaling)
 * @returns Scale matrix
 */
export function scaleMatrix(sx: number, sy: number = sx): AffineMatrix {
  return [sx, 0, 0, 0, sy, 0];
}

/**
 * Create a rotation matrix.
 *
 * @param angleRadians - Rotation angle in radians (counter-clockwise)
 * @returns Rotation matrix
 */
export function rotationMatrix(angleRadians: number): AffineMatrix {
  const cos = Math.cos(angleRadians);
  const sin = Math.sin(angleRadians);
  return [cos, -sin, 0, sin, cos, 0];
}

/**
 * Compose two affine matrices: result = B * A (apply A first, then B).
 *
 * @param a - First matrix (applied first)
 * @param b - Second matrix (applied second)
 * @returns Composed matrix
 */
export function composeMatrices(a: AffineMatrix, b: AffineMatrix): AffineMatrix {
  const [a1, a2, a3, a4, a5, a6] = a; // [a, b, tx, c, d, ty]
  const [b1, b2, b3, b4, b5, b6] = b;

  // Matrix multiplication for 2x3 affine matrices
  // Treat as 3x3 with implicit [0, 0, 1] bottom row
  return [
    b1 * a1 + b2 * a4,           // a
    b1 * a2 + b2 * a5,           // b
    b1 * a3 + b2 * a6 + b3,      // tx
    b4 * a1 + b5 * a4,           // c
    b4 * a2 + b5 * a5,           // d
    b4 * a3 + b5 * a6 + b6       // ty
  ];
}

/**
 * Compute the determinant of the linear part of the affine matrix.
 * Used to check for valid/invertible transforms.
 * Positive = preserves orientation, negative = reflects.
 *
 * @param matrix - Affine matrix
 * @returns Determinant value
 */
export function matrixDeterminant(matrix: AffineMatrix): number {
  const [a, b, , c, d] = matrix;
  return a * d - b * c;
}

/**
 * Extract rotation angle from an affine matrix (assumes no shear).
 * Returns angle in radians.
 *
 * @param matrix - Affine matrix
 * @returns Rotation angle in radians
 */
export function extractRotation(matrix: AffineMatrix): number {
  const [a, , , c] = matrix;
  return Math.atan2(c, a);
}

/**
 * Extract scale factors from an affine matrix.
 * Returns [scaleX, scaleY]. May be negative if reflection is present.
 *
 * @param matrix - Affine matrix
 * @returns [scaleX, scaleY] tuple
 */
export function extractScale(matrix: AffineMatrix): [number, number] {
  const [a, b, , c, d] = matrix;
  const scaleX = Math.sqrt(a * a + c * c);
  const scaleY = Math.sqrt(b * b + d * d);

  // Check for reflection (negative determinant)
  const det = a * d - b * c;
  return det >= 0 ? [scaleX, scaleY] : [-scaleX, scaleY];
}

/**
 * Extract translation from an affine matrix.
 *
 * @param matrix - Affine matrix
 * @returns [tx, ty] tuple
 */
export function extractTranslation(matrix: AffineMatrix): [number, number] {
  return [matrix[2], matrix[5]];
}
