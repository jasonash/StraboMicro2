/**
 * Color Format Utilities
 *
 * Conversions between web hex colors (#RRGGBB) and the legacy StraboMicro
 * color format (0xRRGGBBAA). Spot colors are stored in the legacy format for
 * data-model compatibility; MUI color inputs work in hex.
 */

/**
 * Convert a legacy color (0xRRGGBBAA) to web hex (#RRGGBB).
 * Hex input passes through; unknown formats return the fallback.
 */
export function legacyColorToHex(
  color: string | null | undefined,
  fallback = '#00ff00'
): string {
  if (!color) return fallback;
  if (color.startsWith('#')) return color;
  if (color.startsWith('0x')) {
    return '#' + color.slice(2, 8); // Take RRGGBB, ignore AA
  }
  return color;
}

/**
 * Convert a web hex color (#RRGGBB) to legacy format (0xRRGGBBFF).
 */
export function hexToLegacyColor(hexColor: string): string {
  return '0x' + hexColor.slice(1) + 'ff';
}
