/**
 * Image stitcher: the original images kept as associated micrographs of the mosaic (design
 * decisions 2, 26 to 31). Pure math: where an original lies on the mosaic as the project stores
 * it, after everything the import does to both images.
 *
 * The stitcher knows each original's place in the pixels of the mosaic as built. On the way into
 * the project the mosaic may be resized (the import's size rules), then turned or mirrored (the
 * Image Rotation step of New Micrograph); the original is resized by the same rules, and gets the
 * same turn and mirror, so it shows the rock the same way round as the mosaic does.
 */

import type { AffineMatrix } from '@/utils/affineTransform';
import type { Orientation } from '@/utils/rotationUtils';
import { rectangleFields, type RectanglePlacement } from '../autoPlace/placementFields.ts';
import { groupToMosaic, type MosaicFrame, type StitchGroup } from './stitchLayout.ts';

/** One original image to add under the mosaic */
export interface MosaicOriginal {
  /** The original file */
  path: string;
  /** Its micrograph name (the file name without its ending) */
  name: string;
  /** Size of the file in pixels */
  width: number;
  height: number;
  /** File pixel -> pixel of the mosaic as built (move, turn, resize) */
  toMosaic: AffineMatrix;
}

function multiply(a: AffineMatrix, b: AffineMatrix): AffineMatrix {
  return [
    a[0] * b[0] + a[1] * b[3], a[0] * b[1] + a[1] * b[4], a[0] * b[2] + a[1] * b[5] + a[2],
    a[3] * b[0] + a[4] * b[3], a[3] * b[1] + a[4] * b[4], a[3] * b[2] + a[4] * b[5] + a[5],
  ];
}

function invert(m: AffineMatrix): AffineMatrix {
  const det = m[0] * m[4] - m[1] * m[3];
  const a = m[4] / det;
  const b = -m[1] / det;
  const c = -m[3] / det;
  const d = m[0] / det;
  return [a, b, -(a * m[2] + b * m[5]), c, d, -(c * m[2] + d * m[5])];
}

/**
 * The original images of a built mosaic, each with its place on it (decision 29): every image
 * in the mosaic, and those in alsoKeep (left out for their magnification), which were not built
 * in but have a place. crop: the part of the frame that was built, when it was cropped.
 */
export function originalsOf(
  images: Array<{ path: string; width: number; height: number } | undefined>,
  group: StitchGroup,
  frame: MosaicFrame,
  crop: { left: number; top: number } | null,
  alsoKeep: number[] = [],
): MosaicOriginal[] {
  const toMosaic = groupToMosaic(group, frame);
  const out: MosaicOriginal[] = [];
  for (const tile of group.tiles) {
    const image = images[tile];
    const placed = frame.toMosaic[tile] ?? (alsoKeep.includes(tile) && toMosaic ? multiply(toMosaic, group.placements[tile]) : null);
    if (!image || !placed) continue;
    const file = image.path.split(/[\\/]/).pop() ?? image.path;
    const dot = file.lastIndexOf('.');
    out.push({
      path: image.path,
      name: dot > 0 ? file.slice(0, dot) : file,
      width: image.width,
      height: image.height,
      toMosaic: crop ? [placed[0], placed[1], placed[2] - crop.left, placed[3], placed[4], placed[5] - crop.top] : placed,
    });
  }
  return out;
}

/**
 * Where a pixel of an image of the given size goes when the image is turned clockwise by
 * o.rotation and then mirrored left-right when o.flip is set (rotationUtils.ts Orientation, as
 * the import applies it): pixel before -> pixel after.
 */
export function orientationMatrix(o: Orientation, width: number, height: number): AffineMatrix {
  let m: AffineMatrix;
  let turnedWidth = width;
  if (o.rotation === 90) {
    m = [0, -1, height, 1, 0, 0];
    turnedWidth = height;
  } else if (o.rotation === 180) {
    m = [-1, 0, width, 0, -1, height];
  } else if (o.rotation === 270) {
    m = [0, 1, 0, -1, 0, width];
    turnedWidth = height;
  } else {
    m = [1, 0, 0, 0, 1, 0];
  }
  return o.flip ? multiply([-1, 0, turnedWidth, 0, 1, 0], m) : m;
}

/** The size of an image after an orientation */
export function orientedSize(o: Orientation, width: number, height: number): { width: number; height: number } {
  return o.rotation === 90 || o.rotation === 270 ? { width: height, height: width } : { width, height };
}

export interface OriginalPlacementInput {
  original: Pick<MosaicOriginal, 'width' | 'height' | 'toMosaic'>;
  /** Size of the mosaic as built (the file the stitcher handed over) */
  mosaicBuilt: { width: number; height: number };
  /** Size of the mosaic after the import's resizing, before any turn */
  mosaicImported: { width: number; height: number };
  /** Size of the original after the import's resizing, before any turn */
  originalImported: { width: number; height: number };
  /** The turn and mirror applied to both images after that */
  orientation: Orientation;
}

/**
 * The original's place on the mosaic in the pixels the project stores for both: the fields of a
 * scaled rectangle (offsetInParent, rotation, parent pixels per child pixel).
 */
export function originalPlacement(input: OriginalPlacementInput): RectanglePlacement {
  const { original, mosaicBuilt, mosaicImported, originalImported, orientation } = input;
  // Imported original pixel -> file pixel -> built mosaic pixel -> imported mosaic pixel
  const toFile: AffineMatrix = [original.width / originalImported.width, 0, 0, 0, original.height / originalImported.height, 0];
  const toImported: AffineMatrix = [mosaicImported.width / mosaicBuilt.width, 0, 0, 0, mosaicImported.height / mosaicBuilt.height, 0];
  const beforeTurn = multiply(toImported, multiply(original.toMosaic, toFile));
  // Both images get the same turn and mirror, so the result is again a move, turn and resize
  const turned = multiply(
    orientationMatrix(orientation, mosaicImported.width, mosaicImported.height),
    multiply(beforeTurn, invert(orientationMatrix(orientation, originalImported.width, originalImported.height))),
  );
  const size = orientedSize(orientation, originalImported.width, originalImported.height);
  return rectangleFields(turned, size.width, size.height);
}
