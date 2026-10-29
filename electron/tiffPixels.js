/**
 * 8-bit pixels from an image decoded by the `tiff` library.
 *
 * The library hands back the samples as stored: a palette TIFF gives one color
 * map INDEX per pixel, a 16-bit TIFF gives a Uint16Array. Reading those bytes
 * as 8-bit pixels turned a palette color image into black and white (the index
 * shown as gray) and kept only the low byte of each 16-bit value, so the real
 * contrast became noise (Peter's EDS map and BSE image, 2026-10-29; also the
 * parked 16-bit gray import, Sentry ELECTRON-2Q..2V).
 *
 * 16-bit values are scaled straight to 8 bits (value / 257, as libvips does),
 * no contrast stretch. Other sample formats (32-bit, float) throw an
 * 'Unsupported ' error, which convertToScratchJPEG sends to sharp/libvips.
 */

/**
 * @param {{width: number, height: number, data: ArrayLike<number>, palette?: Array<[number, number, number]>}} image
 * @returns {{data: Buffer, channels: number}}
 */
function tiffImageTo8Bit(image) {
  const pixelCount = image.width * image.height;
  const source = image.data;

  if (image.palette) {
    // Color map entries are 16-bit (0..65535); keep the high byte
    const lut = Buffer.alloc(image.palette.length * 3);
    image.palette.forEach(([r, g, b], i) => {
      lut[i * 3] = r >> 8;
      lut[i * 3 + 1] = g >> 8;
      lut[i * 3 + 2] = b >> 8;
    });
    if (source.length !== pixelCount) {
      throw new Error(`Unsupported palette TIFF: ${source.length / pixelCount} samples per pixel`);
    }
    const data = Buffer.alloc(pixelCount * 3);
    for (let i = 0; i < pixelCount; i++) {
      const at = source[i] * 3;
      data[i * 3] = lut[at];
      data[i * 3 + 1] = lut[at + 1];
      data[i * 3 + 2] = lut[at + 2];
    }
    return { data, channels: 3 };
  }

  let data;
  if (source instanceof Uint8Array) {
    data = Buffer.from(source.buffer, source.byteOffset, source.byteLength);
  } else if (source instanceof Uint16Array) {
    data = Buffer.alloc(source.length);
    for (let i = 0; i < source.length; i++) data[i] = Math.round(source[i] / 257);
  } else {
    throw new Error(`Unsupported TIFF sample format: ${source.constructor.name}`);
  }
  return { data, channels: data.length / pixelCount };
}

/**
 * RGBA from 8-bit pixels with 1 (gray), 2 (gray + alpha), 3 (RGB) or 4 (RGBA) channels.
 *
 * @param {Buffer} data
 * @param {number} channels
 * @returns {Uint8Array}
 */
function toRgba(data, channels) {
  if (channels === 4) return data;
  if (![1, 2, 3].includes(channels)) {
    throw new Error(`Unsupported TIFF format: ${channels} channels`);
  }
  const pixelCount = data.length / channels;
  const rgba = new Uint8Array(pixelCount * 4);
  for (let i = 0, j = 0; i < pixelCount; i++, j += 4) {
    const s = i * channels;
    if (channels === 3) {
      rgba[j] = data[s];
      rgba[j + 1] = data[s + 1];
      rgba[j + 2] = data[s + 2];
      rgba[j + 3] = 255;
    } else {
      rgba[j] = rgba[j + 1] = rgba[j + 2] = data[s];
      rgba[j + 3] = channels === 2 ? data[s + 1] : 255;
    }
  }
  return rgba;
}

module.exports = { tiffImageTo8Bit, toRgba };
