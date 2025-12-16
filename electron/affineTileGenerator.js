/**
 * Affine Tile Generator
 *
 * Generates pre-transformed tiles for affine-placed overlays.
 * The transformation is "baked in" during tile generation so
 * the tiles can be rendered as a standard axis-aligned grid.
 *
 * This allows Konva to render affine (skewed) overlays without
 * runtime transform support, which Konva Groups don't provide.
 */

const sharp = require('sharp');
const tileCache = require('./tileCache');

// Configuration (matches tileGenerator.js)
const TILE_SIZE = 256;
const THUMBNAIL_SIZE = 512;
const MEDIUM_SIZE = 2048;
const PNG_COMPRESSION = 6;
const WEBP_QUALITY = 90;

/**
 * Compute the inverse of an affine matrix.
 * @param {number[]} matrix - Affine matrix [a, b, tx, c, d, ty]
 * @returns {number[]} Inverse matrix [a', b', tx', c', d', ty']
 */
function invertAffineMatrix(matrix) {
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
 * Compute the bounding box of a transformed image.
 * Transforms the four corners and finds min/max coordinates.
 *
 * @param {number} width - Source image width
 * @param {number} height - Source image height
 * @param {number[]} matrix - Affine matrix [a, b, tx, c, d, ty]
 * @returns {{minX: number, minY: number, maxX: number, maxY: number, width: number, height: number}}
 */
function computeTransformedBounds(width, height, matrix) {
  const [a, b, tx, c, d, ty] = matrix;

  // Transform the four corners
  const corners = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height]
  ];

  const transformed = corners.map(([x, y]) => [
    a * x + b * y + tx,
    c * x + d * y + ty
  ]);

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
 * Bilinear interpolation for sampling a pixel from raw RGBA data.
 * Returns [r, g, b, a] for the interpolated pixel, or [0,0,0,0] if out of bounds.
 *
 * @param {Buffer} data - Raw RGBA pixel data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} x - X coordinate (can be fractional)
 * @param {number} y - Y coordinate (can be fractional)
 * @returns {number[]} [r, g, b, a]
 */
function sampleBilinear(data, width, height, x, y) {
  // Check bounds - return transparent if outside
  if (x < 0 || x >= width - 1 || y < 0 || y >= height - 1) {
    // Handle edge cases with nearest neighbor for pixels partially in bounds
    if (x >= -0.5 && x < width - 0.5 && y >= -0.5 && y < height - 0.5) {
      const nx = Math.round(x);
      const ny = Math.round(y);
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const idx = (ny * width + nx) * 4;
        return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
      }
    }
    return [0, 0, 0, 0];
  }

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;

  const xFrac = x - x0;
  const yFrac = y - y0;

  // Get the four surrounding pixels
  const idx00 = (y0 * width + x0) * 4;
  const idx10 = (y0 * width + x1) * 4;
  const idx01 = (y1 * width + x0) * 4;
  const idx11 = (y1 * width + x1) * 4;

  const result = [];
  for (let c = 0; c < 4; c++) {
    const v00 = data[idx00 + c];
    const v10 = data[idx10 + c];
    const v01 = data[idx01 + c];
    const v11 = data[idx11 + c];

    // Bilinear interpolation
    const v0 = v00 + (v10 - v00) * xFrac;
    const v1 = v01 + (v11 - v01) * xFrac;
    const v = v0 + (v1 - v0) * yFrac;

    result.push(Math.round(v));
  }

  return result;
}

/**
 * Generate affine-transformed tiles for an overlay image.
 *
 * The process:
 * 1. Load source image as raw RGBA
 * 2. Compute output bounds and inverse matrix
 * 3. Create output buffer with correct dimensions
 * 4. For each output pixel, sample from source using inverse transform
 * 5. Generate thumbnail, medium, and tiles from the transformed image
 *
 * @param {string} imagePath - Path to source image
 * @param {string} imageHash - Hash for cache directory
 * @param {number[]} affineMatrix - [a, b, tx, c, d, ty]
 * @param {function} onProgress - Progress callback (0-100)
 * @returns {Promise<Object>} Metadata including transformed dimensions
 */
async function generateAffineTiles(imagePath, imageHash, affineMatrix, onProgress = null) {
  console.log(`[AffineTileGenerator] Starting for image: ${imagePath}`);
  console.log(`[AffineTileGenerator] Forward matrix (overlay→parent): [${affineMatrix.join(', ')}]`);

  // 1. Load source image as raw RGBA
  const sourceRaw = await sharp(imagePath, { limitInputPixels: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const srcData = sourceRaw.data;
  const srcWidth = sourceRaw.info.width;
  const srcHeight = sourceRaw.info.height;

  console.log(`[AffineTileGenerator] Source: ${srcWidth}x${srcHeight}`);

  if (onProgress) onProgress(5);

  // 2. Compute output bounding box using the FORWARD matrix
  const bounds = computeTransformedBounds(srcWidth, srcHeight, affineMatrix);
  console.log(`[AffineTileGenerator] Transformed bounds:`, bounds);

  // Output dimensions (in parent coordinate space)
  const outputWidth = Math.max(1, Math.ceil(bounds.width));
  const outputHeight = Math.max(1, Math.ceil(bounds.height));

  console.log(`[AffineTileGenerator] Output dimensions: ${outputWidth}x${outputHeight}`);

  // 3. Compute the INVERSE matrix
  // For each output pixel, we need to find where it samples from in the source
  const invMatrix = invertAffineMatrix(affineMatrix);
  const [aInv, bInv, txInv, cInv, dInv, tyInv] = invMatrix;

  console.log(`[AffineTileGenerator] Inverse matrix (parent→overlay): [${invMatrix.join(', ')}]`);

  if (onProgress) onProgress(10);

  // 4. Create output buffer and perform inverse transform sampling
  console.log(`[AffineTileGenerator] Applying transform (inverse sampling)...`);

  const outputData = Buffer.alloc(outputWidth * outputHeight * 4, 0);

  // For each output pixel (ox, oy), compute source position and sample
  for (let oy = 0; oy < outputHeight; oy++) {
    // Parent-space position for this row
    const parentY = bounds.minY + oy;

    for (let ox = 0; ox < outputWidth; ox++) {
      // Parent-space position
      const parentX = bounds.minX + ox;

      // Apply inverse transform to get source (overlay) position
      // source = M^(-1) * parent
      const srcX = aInv * parentX + bInv * parentY + txInv;
      const srcY = cInv * parentX + dInv * parentY + tyInv;

      // Sample from source with bilinear interpolation
      const [r, g, b, a] = sampleBilinear(srcData, srcWidth, srcHeight, srcX, srcY);

      // Write to output
      const outIdx = (oy * outputWidth + ox) * 4;
      outputData[outIdx] = r;
      outputData[outIdx + 1] = g;
      outputData[outIdx + 2] = b;
      outputData[outIdx + 3] = a;
    }

    // Progress updates during transform (10-30%)
    if (onProgress && oy % 100 === 0) {
      const progress = 10 + Math.floor((oy / outputHeight) * 20);
      onProgress(progress);
    }
  }

  if (onProgress) onProgress(30);

  // 5. Create Sharp instance from transformed data
  const transformedSharp = sharp(outputData, {
    raw: {
      width: outputWidth,
      height: outputHeight,
      channels: 4
    }
  });

  // 6. Generate thumbnail (PNG for transparency)
  console.log(`[AffineTileGenerator] Generating thumbnail...`);
  const thumbnailBuffer = await transformedSharp
    .clone()
    .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'inside' })
    .png({ compressionLevel: PNG_COMPRESSION })
    .toBuffer();

  await tileCache.saveAffineThumbnail(imageHash, thumbnailBuffer);

  if (onProgress) onProgress(40);

  // 7. Generate medium resolution (PNG for transparency)
  console.log(`[AffineTileGenerator] Generating medium resolution...`);
  const mediumBuffer = await transformedSharp
    .clone()
    .resize(MEDIUM_SIZE, MEDIUM_SIZE, { fit: 'inside' })
    .png({ compressionLevel: PNG_COMPRESSION })
    .toBuffer();

  await tileCache.saveAffineMedium(imageHash, mediumBuffer);

  if (onProgress) onProgress(50);

  // 8. Generate full-resolution tiles
  console.log(`[AffineTileGenerator] Generating tiles...`);

  const tilesX = Math.ceil(outputWidth / TILE_SIZE);
  const tilesY = Math.ceil(outputHeight / TILE_SIZE);
  const totalTiles = tilesX * tilesY;

  console.log(`[AffineTileGenerator] Generating ${totalTiles} tiles (${tilesX}x${tilesY})...`);

  let tilesGenerated = 0;

  for (let tileY = 0; tileY < tilesY; tileY++) {
    for (let tileX = 0; tileX < tilesX; tileX++) {
      await generateSingleTile(
        outputData,
        outputWidth,
        outputHeight,
        4, // channels
        tileX,
        tileY,
        imageHash
      );

      tilesGenerated++;
      if (onProgress) {
        const progress = 50 + Math.floor((tilesGenerated / totalTiles) * 45);
        onProgress(progress);
      }
    }
  }

  // 9. Save metadata
  const metadata = {
    originalWidth: srcWidth,
    originalHeight: srcHeight,
    transformedWidth: outputWidth,
    transformedHeight: outputHeight,
    affineMatrix,
    boundsOffset: { x: bounds.minX, y: bounds.minY },
    tileSize: TILE_SIZE,
    tilesX,
    tilesY,
    totalTiles,
    createdAt: new Date().toISOString()
  };

  await tileCache.saveAffineMetadata(imageHash, metadata);

  console.log(`[AffineTileGenerator] Complete! Generated ${totalTiles} tiles.`);
  if (onProgress) onProgress(100);

  return metadata;
}

/**
 * Generate a single tile from raw pixel data.
 *
 * @param {Buffer} data - Raw RGBA pixel data
 * @param {number} imageWidth - Full image width
 * @param {number} imageHeight - Full image height
 * @param {number} channels - Number of color channels (4 for RGBA)
 * @param {number} tileX - Tile X coordinate
 * @param {number} tileY - Tile Y coordinate
 * @param {string} imageHash - Image hash for cache path
 */
async function generateSingleTile(data, imageWidth, imageHeight, channels, tileX, tileY, imageHash) {
  const x = tileX * TILE_SIZE;
  const y = tileY * TILE_SIZE;
  const tileWidth = Math.min(TILE_SIZE, imageWidth - x);
  const tileHeight = Math.min(TILE_SIZE, imageHeight - y);

  // Create buffer for this tile (always TILE_SIZE x TILE_SIZE for consistency)
  // Initialize with zeros (transparent)
  const tileBuffer = Buffer.alloc(TILE_SIZE * TILE_SIZE * channels, 0);

  // Copy pixel data for this tile
  for (let row = 0; row < tileHeight; row++) {
    const sourceRow = y + row;
    const sourceOffset = (sourceRow * imageWidth + x) * channels;
    const tileOffset = row * TILE_SIZE * channels;

    const rowData = data.slice(sourceOffset, sourceOffset + tileWidth * channels);
    rowData.copy(tileBuffer, tileOffset);
  }

  // Encode as WebP with alpha
  const webpBuffer = await sharp(tileBuffer, {
    raw: {
      width: TILE_SIZE,
      height: TILE_SIZE,
      channels
    }
  })
    .webp({ quality: WEBP_QUALITY, alphaQuality: 100 })
    .toBuffer();

  // Save tile
  await tileCache.saveAffineTile(imageHash, tileX, tileY, webpBuffer);
}

/**
 * Check if affine tiles already exist for an image with the same matrix.
 *
 * @param {string} imageHash - Image hash
 * @param {number[]} affineMatrix - Matrix to check against
 * @returns {Promise<boolean>} True if tiles exist with matching matrix
 */
async function hasMatchingAffineTiles(imageHash, affineMatrix) {
  const metadata = await tileCache.loadAffineMetadata(imageHash);
  if (!metadata) return false;

  // Check if matrices match
  const storedMatrix = metadata.affineMatrix;
  if (!storedMatrix || storedMatrix.length !== 6) return false;

  // Compare matrices with small tolerance for floating point
  const tolerance = 1e-6;
  for (let i = 0; i < 6; i++) {
    if (Math.abs(storedMatrix[i] - affineMatrix[i]) > tolerance) {
      return false;
    }
  }

  return true;
}

/**
 * Delete existing affine tiles for an image.
 *
 * @param {string} imageHash - Image hash
 */
async function deleteAffineTiles(imageHash) {
  await tileCache.deleteAffineTiles(imageHash);
}

module.exports = {
  generateAffineTiles,
  hasMatchingAffineTiles,
  deleteAffineTiles,
  computeTransformedBounds
};
