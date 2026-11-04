/**
 * Geometry previews of the sync decisions dialog (collaboration spec v3
 * §4.6): the points of a spot shape and the outline of a placed micrograph,
 * in the pixel space of the micrograph they are drawn on, and the area of
 * that image a preview shows.
 *
 * Inputs are legacy entity bodies as main sends them (electron/sync/
 * decisions.js geometryPreview). Placement follows AssociatedImageRenderer:
 * affine = the matrix applied to the image corners; otherwise the image
 * scaled by parent px/cm over its own px/cm (100 when unset), rotated about
 * its center, placed by offsetInParent (top left), else pointInParent
 * (center), else the legacy xOffset/yOffset (top left).
 */

export interface PreviewPoint {
  x: number;
  y: number;
}

export interface PreviewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Coord = { X?: number | null; Y?: number | null; x?: number | null; y?: number | null } | null | undefined;

function coord(c: Coord): PreviewPoint | null {
  if (!c || typeof c !== 'object') return null;
  const x = c.X ?? c.x;
  const y = c.Y ?? c.y;
  return typeof x === 'number' && typeof y === 'number' ? { x, y } : null;
}

/** A spot's shape: geometry type and its points (legacy points, else GeoJSON coordinates). */
export function shapePoints(side: SyncShapeSide): { kind: 'point' | 'line' | 'polygon'; points: PreviewPoint[] } {
  const t = String(side.geometryType || side.geometry?.type || '').toLowerCase();
  const kind = t === 'point' ? 'point' : t === 'line' || t === 'linestring' ? 'line' : 'polygon';
  let points: PreviewPoint[] = [];
  if (Array.isArray(side.points) && side.points.length > 0) {
    points = side.points.map((p) => coord(p)).filter((p): p is PreviewPoint => p !== null);
  } else if (side.geometry && Array.isArray(side.geometry.coordinates)) {
    const c = side.geometry.coordinates as unknown[];
    const flat = typeof c[0] === 'number' ? [c] : Array.isArray(c[0]) && Array.isArray((c[0] as unknown[])[0]) ? (c[0] as unknown[]) : c;
    points = flat
      .filter((p): p is number[] => Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number')
      .map((p) => ({ x: p[0], y: p[1] }));
  }
  return { kind: points.length === 1 ? 'point' : kind, points };
}

/** Corners of a placed micrograph in its parent's pixels (empty when it has no placement). */
export function placementOutline(side: SyncPlacementSide, parentPxPerCm: number | null | undefined): PreviewPoint[] {
  const w = side.width || 0;
  const h = side.height || 0;
  if (w <= 0 || h <= 0) return [];
  const corners = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  const m = side.affineMatrix;
  if (side.placementType === 'affine' && Array.isArray(m) && m.length === 6) {
    const [a, b, tx, c, d, ty] = m;
    return corners.map((p) => ({ x: a * p.x + b * p.y + tx, y: c * p.x + d * p.y + ty }));
  }
  const scale = (parentPxPerCm || 100) / (side.scalePixelsPerCentimeter || 100);
  const sw = w * scale;
  const sh = h * scale;
  const offset = coord(side.offsetInParent);
  const point = coord(side.pointInParent);
  let center: PreviewPoint;
  if (offset) center = { x: offset.x + sw / 2, y: offset.y + sh / 2 };
  else if (point) center = point;
  else if (typeof side.xOffset === 'number' && typeof side.yOffset === 'number') {
    center = { x: side.xOffset + sw / 2, y: side.yOffset + sh / 2 };
  } else return [];
  const r = ((side.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return corners.map((p) => {
    const dx = (p.x - w / 2) * scale;
    const dy = (p.y - h / 2) * scale;
    return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
  });
}

/**
 * The area of the image a preview shows: every point set inside it with a
 * margin, at the preview's aspect ratio, kept within the image where it
 * fits. Both columns use the same area, so a difference shows as a shift.
 */
export function previewCrop(sets: PreviewPoint[][], image: { width: number; height: number }, aspect: number): PreviewRect {
  if (!(image.width > 0 && image.height > 0)) return { x: 0, y: 0, width: aspect, height: 1 };
  const all = sets.flat();
  if (all.length === 0) return fitAspect({ x: 0, y: 0, width: image.width, height: image.height }, aspect);
  let minX = Math.min(...all.map((p) => p.x));
  let maxX = Math.max(...all.map((p) => p.x));
  let minY = Math.min(...all.map((p) => p.y));
  let maxY = Math.max(...all.map((p) => p.y));
  // Margin around the shapes, and a floor so a point or a tiny spot keeps some context
  const floor = Math.max(40, 0.04 * Math.max(image.width, image.height));
  const padX = Math.max((maxX - minX) * 0.25, (floor - (maxX - minX)) / 2, 0);
  const padY = Math.max((maxY - minY) * 0.25, (floor - (maxY - minY)) / 2, 0);
  minX -= padX;
  maxX += padX;
  minY -= padY;
  maxY += padY;
  const rect = fitAspect({ x: minX, y: minY, width: maxX - minX, height: maxY - minY }, aspect);
  // Inside the image when it fits; a shape partly outside keeps its whole extent
  if (rect.width <= image.width) rect.x = Math.min(Math.max(rect.x, 0), image.width - rect.width);
  if (rect.height <= image.height) rect.y = Math.min(Math.max(rect.y, 0), image.height - rect.height);
  return rect;
}

/** Grow a rectangle about its center to the given width / height. */
function fitAspect(r: PreviewRect, aspect: number): PreviewRect {
  let { width, height } = r;
  if (width / height < aspect) width = height * aspect;
  else height = width / aspect;
  return { x: r.x + (r.width - width) / 2, y: r.y + (r.height - height) / 2, width, height };
}
