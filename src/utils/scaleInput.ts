/**
 * Pixels per centimeter from what was entered on a scale step: a traced scale
 * bar (its length in the image's own pixels), a Pixel Conversion Factor, or
 * the physical width of the whole image. The same formulas as the New
 * Micrograph wizard. Edit Micrograph Location uses it for a point placement,
 * whose scale nothing on the canvas works out (it saved the parent's scale
 * whatever was entered; 2026-10-29). Pure (npm run test:scale-input).
 */

export interface ScaleInput {
  scaleBarLineLengthPixels?: number;
  scaleBarPhysicalLength?: number;
  scaleBarUnits?: string;
  pixels?: number;
  physicalLength?: number;
  pixelUnits?: string;
  imageWidthPhysical?: number;
  imageHeightPhysical?: number;
  sizeUnits?: string;
}

/** How many of each unit make 1 cm */
const UNITS_PER_CM: Record<string, number> = {
  'μm': 10000,
  mm: 10,
  cm: 1,
  m: 0.01,
  inches: 0.393701,
};

function perCm(pixels: number | undefined, length: number | undefined, unit: string | undefined): number | null {
  if (!pixels || !length || !unit || !(unit in UNITS_PER_CM)) return null;
  const value = (pixels / length) * UNITS_PER_CM[unit];
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** px/cm for the scale method, or null when what was entered is not enough */
export function pixelsPerCentimeterFromInput(
  method: string,
  input: ScaleInput,
  imageWidth: number | null | undefined,
  imageHeight?: number | null
): number | null {
  if (method === 'Trace Scale Bar' || method === 'Trace Scale Bar and Drag') {
    return perCm(input.scaleBarLineLengthPixels, input.scaleBarPhysicalLength, input.scaleBarUnits);
  }
  if (method === 'Pixel Conversion Factor') {
    return perCm(input.pixels, input.physicalLength, input.pixelUnits);
  }
  if (method === 'Provide Width/Height of Image') {
    return perCm(imageWidth ?? undefined, input.imageWidthPhysical, input.sizeUnits)
      ?? perCm(imageHeight ?? undefined, input.imageHeightPhysical, input.sizeUnits);
  }
  return null;
}
