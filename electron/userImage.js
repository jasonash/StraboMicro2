/**
 * Opens an image file a person brought in (TIFF, JPEG, PNG, BMP) as 8-bit pixels for sharp,
 * decoded the way the import does it (imageConverter.convertToScratchJPEG):
 *
 * - TIFF: the `tiff` library first (palette colors applied, 16-bit scaled to 8-bit by
 *   tiffPixels.js); sharp/libvips for the variants that library refuses.
 * - BMP: bmp-js (libvips has no BMP reader).
 * - Everything else: sharp reads the file itself (a JPEG is then shrunk while decoding).
 *
 * Used by the image stitcher, which reads each tile twice: once for a small preview copy and
 * once for the mosaic. No Electron imports, so it also runs in plain Node tests.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const bmp = require('bmp-js');
const { tiffImageTo8Bit } = require('./tiffPixels');
const { USER_IMAGE_INPUT } = require('./sharpInput');

// tiff is an ES module: imported when first needed
let decodeTIFF = null;
async function getTiffDecoder() {
  if (!decodeTIFF) decodeTIFF = (await import('tiff')).decode;
  return decodeTIFF;
}

/**
 * @param {string} inputPath
 * @returns {Promise<{width: number, height: number, image: () => import('sharp').Sharp}>}
 *   image() gives a fresh sharp pipeline over the pixels each time it is called. For a TIFF or
 *   BMP the decoded pixels stay in memory until the returned object is dropped.
 */
async function openUserImage(inputPath) {
  const ext = path.extname(inputPath).toLowerCase();

  if (ext === '.tif' || ext === '.tiff') {
    const decode = await getTiffDecoder();
    let fileBuffer = await fs.promises.readFile(inputPath);
    let decoded = null;
    try {
      const pages = decode(fileBuffer);
      const page = pages[0];
      const { data, channels } = tiffImageTo8Bit(page);
      decoded = { data, channels, width: page.width, height: page.height };
    } catch (error) {
      // The same fallback rule as the import: only for what the tiff library says it cannot read
      if (!(error && typeof error.message === 'string' && error.message.startsWith('Unsupported '))) throw error;
    }
    fileBuffer = null;
    if (decoded) {
      const raw = { width: decoded.width, height: decoded.height, channels: decoded.channels };
      return {
        width: decoded.width,
        height: decoded.height,
        image: () => sharp(decoded.data, { raw, limitInputPixels: false }),
      };
    }
  } else if (ext === '.bmp') {
    const bmpData = bmp.decode(await fs.promises.readFile(inputPath));
    const { width, height } = bmpData;
    // bmp-js gives ABGR
    const rgb = Buffer.alloc(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      rgb[i * 3] = bmpData.data[i * 4 + 3];
      rgb[i * 3 + 1] = bmpData.data[i * 4 + 2];
      rgb[i * 3 + 2] = bmpData.data[i * 4 + 1];
    }
    return {
      width,
      height,
      image: () => sharp(rgb, { raw: { width, height, channels: 3 }, limitInputPixels: false }),
    };
  }

  const metadata = await sharp(inputPath, USER_IMAGE_INPUT).metadata();
  return {
    width: metadata.width,
    height: metadata.height,
    image: () => sharp(inputPath, USER_IMAGE_INPUT),
  };
}

/**
 * 8-bit RGB pixels of an opened image at a given size (gray becomes three equal channels,
 * alpha is dropped).
 *
 * @returns {Promise<{data: Buffer, width: number, height: number}>}
 */
async function rgbPixels(opened, width, height) {
  let pipeline = opened.image();
  if (width !== opened.width || height !== opened.height) pipeline = pipeline.resize(width, height, { fit: 'fill' });
  const { data, info } = await pipeline.removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  if (info.channels === 3) return { data, width: info.width, height: info.height };
  const rgb = Buffer.alloc(info.width * info.height * 3);
  for (let i = 0; i < info.width * info.height; i++) {
    const v = data[i * info.channels];
    rgb[i * 3] = v;
    rgb[i * 3 + 1] = v;
    rgb[i * 3 + 2] = v;
  }
  return { data: rgb, width: info.width, height: info.height };
}

module.exports = { openUserImage, rgbPixels };
