/**
 * Plain-language text for a failed image conversion (New Micrograph, Add
 * Sibling, Batch Import). The raw error still goes to the log and Sentry;
 * this is only what the person sees.
 *
 * A file that is cut off or corrupted fails inside the image decoders with
 * messages like "vipspng: libpng read error" (Sentry ELECTRON-2Y, 2026-10-22:
 * an XPL PNG in Add Sibling, shown as "Error invoking remote method
 * 'image:convert-to-scratch': Error: vipspng: libpng read error"). The
 * messages below were collected by converting damaged files with
 * convertToScratchJPEG (npm run test:image-load-error lists them).
 * Missing, empty, cloud-placeholder and non-image files are refused earlier
 * by validateImageFile with their own readable text, which is passed through.
 */

/** Decoder errors that mean the file's data is cut off or corrupted. */
const DAMAGED_PATTERNS: readonly RegExp[] = [
  /libpng read error/i, // PNG cut off or corrupted (libvips)
  /pngload: load error/i, // interlaced PNG cut off (libvips)
  /has corrupt header/i, // PNG cut off inside its header (sharp)
  /premature end of JPEG/i, // JPEG cut off (libvips)
  /Offset is outside the bounds of the DataView/i, // TIFF cut off (tiff library)
];

/**
 * sharp could not read a file whose first bytes passed validateImageFile:
 * a cut-off TIFF lands here, but so could a format variant sharp cannot open.
 */
const UNREADABLE_PATTERNS: readonly RegExp[] = [/contains unsupported image format/i];

export const DAMAGED_IMAGE_MESSAGE =
  'This image file appears to be damaged or incomplete (for example, cut off while it was ' +
  'being copied or exported), so it cannot be opened. Try exporting or copying it again, ' +
  'and check that it opens in another program.';

export const UNREADABLE_IMAGE_MESSAGE =
  'This image file could not be read. It may be damaged or incomplete, or saved in a form ' +
  'StraboMicro cannot open. Try exporting it again, for example as a PNG or an uncompressed TIFF.';

/** Drop Electron's IPC wrapper: "Error invoking remote method 'x': Error: <message>" */
function stripIpcWrapper(message: string): string {
  return message.replace(/^Error invoking remote method '[^']*':\s*/, '').replace(/^Error:\s*/, '');
}

export function describeImageLoadError(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (!raw) return 'Unknown error';
  if (DAMAGED_PATTERNS.some((p) => p.test(raw))) return DAMAGED_IMAGE_MESSAGE;
  if (UNREADABLE_PATTERNS.some((p) => p.test(raw))) return UNREADABLE_IMAGE_MESSAGE;
  return stripIpcWrapper(raw);
}
