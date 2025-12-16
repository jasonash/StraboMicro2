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
const THUMBNAIL_SIZE = 512;
const MEDIUM_SIZE = 2048;
const JPEG_QUALITY = 85;
const WEBP_QUALITY = 90;

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
 * Generate affine-transformed tiles for an overlay image.
 *
 * The process:
 * 1. Apply affine transform to the source image using Sharp
 * 2. Generate thumbnail and medium resolution from transformed image
 * 3. Generate tile pyramid from transformed image
 * 4. Save all to tiles-affine/ subdirectory
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

  // 1. Get source image dimensions
  const sourceMetadata = await sharp(imagePath, { limitInputPixels: false }).metadata();
  const srcWidth = sourceMetadata.width;
  const srcHeight = sourceMetadata.height;

  console.log(`[AffineTileGenerator] Source: ${srcWidth}x${srcHeight}`);

  // 2. Compute output bounding box using the FORWARD matrix
  // This tells us where the overlay will appear in parent space
  const bounds = computeTransformedBounds(srcWidth, srcHeight, affineMatrix);
  console.log(`[AffineTileGenerator] Transformed bounds:`, bounds);

  // Ensure output dimensions are positive integers
  const outputWidth = Math.max(1, Math.ceil(bounds.width));
  const outputHeight = Math.max(1, Math.ceil(bounds.height));

  console.log(`[AffineTileGenerator] Output dimensions: ${outputWidth}x${outputHeight}`);

  // 3. Compute the INVERSE matrix for Sharp
  // Sharp's affine() maps output coordinates → input coordinates (inverse mapping)
  // Our forward matrix maps overlay → parent, so inverse maps parent → overlay
  const invMatrix = invertAffineMatrix(affineMatrix);
  const [aInv, bInv, txInv, cInv, dInv, tyInv] = invMatrix;

  console.log(`[AffineTileGenerator] Inverse matrix (parent→overlay): [${invMatrix.join(', ')}]`);

  // 4. Compute input offset for Sharp
  // Output pixel (ox, oy) corresponds to parent position (bounds.minX + ox, bounds.minY + oy)
  // We need to sample from overlay at M^(-1)(bounds.minX + ox, bounds.minY + oy)
  // = M^(-1) * [bounds.minX + ox, bounds.minY + oy]
  // = [aInv, bInv] * [bounds.minX + ox] + txInv
  //   [cInv, dInv]   [bounds.minY + oy]   tyInv
  // = aInv*ox + bInv*oy + (aInv*bounds.minX + bInv*bounds.minY + txInv)
  // = cInv*ox + dInv*oy + (cInv*bounds.minX + dInv*bounds.minY + tyInv)
  // So idx/idy are the constant offset terms
  const idx = aInv * bounds.minX + bInv * bounds.minY + txInv;
  const idy = cInv * bounds.minX + dInv * bounds.minY + tyInv;

  console.log(`[AffineTileGenerator] Input offset: idx=${idx.toFixed(2)}, idy=${idy.toFixed(2)}`);

  if (onProgress) onProgress(5);

  // 5. Create output directory
  const affineDir = tileCache.getAffineTilesDir(imageHash);

  // 6. Apply affine transform with Sharp using INVERSE matrix
  console.log(`[AffineTileGenerator] Applying transform...`);

  let transformedBuffer;
  try {
    // Sharp's affine() samples input at: matrix * (output_pos) + input_offset
    // We use the inverse matrix so Sharp correctly maps output → input
    transformedBuffer = await sharp(imagePath, { limitInputPixels: false })
      .ensureAlpha()
      .affine(
        [[aInv, bInv], [cInv, dInv]],
        {
          background: { r: 0, g: 0, b: 0, alpha: 0 },
          idx: idx,
          idy: idy,
          odx: 0,
          ody: 0
        }
      )
      .toBuffer();
  } catch (error) {
    console.error('[AffineTileGenerator] Affine transform failed:', error);
    throw new Error(`Failed to apply affine transform: ${error.message}`);
  }

  if (onProgress) onProgress(15);

  // Get actual dimensions of transformed image
  const transformedMetadata = await sharp(transformedBuffer).metadata();
  const actualWidth = transformedMetadata.width;
  const actualHeight = transformedMetadata.height;

  console.log(`[AffineTileGenerator] Transformed: ${actualWidth}x${actualHeight}`);

  // 6. Generate thumbnail
  console.log(`[AffineTileGenerator] Generating thumbnail...`);
  const thumbnailBuffer = await sharp(transformedBuffer)
    .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'inside' })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  await tileCache.saveAffineThumbnail(imageHash, thumbnailBuffer);

  if (onProgress) onProgress(25);

  // 7. Generate medium resolution
  console.log(`[AffineTileGenerator] Generating medium resolution...`);
  const mediumBuffer = await sharp(transformedBuffer)
    .resize(MEDIUM_SIZE, MEDIUM_SIZE, { fit: 'inside' })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  await tileCache.saveAffineMedium(imageHash, mediumBuffer);

  if (onProgress) onProgress(35);

  // 8. Generate full-resolution tiles
  console.log(`[AffineTileGenerator] Generating tiles...`);

  // Get raw pixel data for tile extraction
  const rawData = await sharp(transformedBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Release transformed buffer - we have the raw data now
  transformedBuffer = null;

  const { data, info } = rawData;
  const dataWidth = info.width;
  const dataHeight = info.height;
  const channels = info.channels;

  const tilesX = Math.ceil(dataWidth / TILE_SIZE);
  const tilesY = Math.ceil(dataHeight / TILE_SIZE);
  const totalTiles = tilesX * tilesY;

  console.log(`[AffineTileGenerator] Generating ${totalTiles} tiles (${tilesX}x${tilesY})...`);

  let tilesGenerated = 0;

  for (let tileY = 0; tileY < tilesY; tileY++) {
    for (let tileX = 0; tileX < tilesX; tileX++) {
      await generateSingleTile(
        data,
        dataWidth,
        dataHeight,
        channels,
        tileX,
        tileY,
        imageHash
      );

      tilesGenerated++;
      if (onProgress) {
        const progress = 35 + Math.floor((tilesGenerated / totalTiles) * 60);
        onProgress(progress);
      }
    }
  }

  // 9. Save metadata
  const metadata = {
    originalWidth: srcWidth,
    originalHeight: srcHeight,
    transformedWidth: dataWidth,
    transformedHeight: dataHeight,
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

  // Encode as WebP
  const webpBuffer = await sharp(tileBuffer, {
    raw: {
      width: TILE_SIZE,
      height: TILE_SIZE,
      channels
    }
  })
    .webp({ quality: WEBP_QUALITY })
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
