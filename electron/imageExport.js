/**
 * Unified Micrograph Image Export
 *
 * Single renderer behind every image export surface: the single-micrograph
 * download in the properties pane, the batch ZIP export in the File menu, and
 * the micrograph pages of the PDF report.
 *
 * Produces raster (JPEG / PNG) or SVG output at the source image's native
 * resolution from:
 *   - the base micrograph image (optional; omit it for a transparent
 *     annotation-only overlay, which forces PNG)
 *   - child micrograph overlays (rectangular and affine placements) plus the
 *     marker circle for point-located children
 *   - spot shapes and spot labels
 *   - sketch layers (freeform strokes and text)
 *
 * Drawing rules follow the on-screen viewer: hidden children
 * (isMicroVisible === false) and secondary siblings (isPrimarySibling === false,
 * e.g. the XPL half of a PPL/XPL pair) are never drawn as overlays.
 *
 * In SVG output, spots, labels, markers and sketches are real vector elements
 * (editable in Illustrator / Inkscape); the base image and any child overlays
 * are embedded as a single raster layer.
 */

const fs = require('fs');
const path = require('path');
const log = require('electron-log');
const sharp = require('sharp');
const tileCache = require('./tileCache');

// Konva's default Catmull-Rom tension used by SketchLayerRenderer for strokes.
const SKETCH_STROKE_TENSION = 0.3;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

const FORMATS = ['jpeg', 'png', 'svg'];

/**
 * @typedef {Object} ImageExportOptions
 * @property {'jpeg'|'png'|'svg'} format
 * @property {boolean} includeImage     Base micrograph pixels (false = transparent annotation overlay)
 * @property {boolean} includeOverlays  Child micrograph overlays and point-located markers
 * @property {boolean} includeSpots     Spot shapes
 * @property {boolean} includeLabels    Spot name labels
 * @property {'visible'|'all'|'none'|string[]} sketchLayers  Which sketch layers to draw
 */

/**
 * Fill in defaults and enforce cross-option rules.
 * @param {Partial<ImageExportOptions>} [options]
 * @returns {ImageExportOptions}
 */
function normalizeOptions(options = {}) {
  const includeImage = options.includeImage !== false;
  let format = FORMATS.includes(options.format) ? options.format : 'jpeg';
  // JPEG has no alpha channel, so an annotation-only export must be PNG.
  if (!includeImage && format === 'jpeg') format = 'png';

  let sketchLayers = options.sketchLayers;
  if (!Array.isArray(sketchLayers) && !['visible', 'all', 'none'].includes(sketchLayers)) {
    sketchLayers = 'visible';
  }

  return {
    format,
    includeImage,
    includeOverlays: options.includeOverlays !== false,
    includeSpots: options.includeSpots !== false,
    includeLabels: options.includeLabels !== false,
    sketchLayers,
  };
}

/** File extension for a normalized format. */
function extensionForFormat(format) {
  if (format === 'png') return 'png';
  if (format === 'svg') return 'svg';
  return 'jpg';
}

/** MIME type for a normalized format. */
function mimeTypeForFormat(format) {
  if (format === 'png') return 'image/png';
  if (format === 'svg') return 'image/svg+xml';
  return 'image/jpeg';
}

// ---------------------------------------------------------------------------
// Project traversal helpers
// ---------------------------------------------------------------------------

/**
 * Find a micrograph anywhere in the project hierarchy.
 * @returns {Object|null}
 */
function findMicrograph(projectData, micrographId) {
  for (const dataset of projectData?.datasets || []) {
    for (const sample of dataset.samples || []) {
      for (const micro of sample.micrographs || []) {
        if (micro.id === micrographId) return micro;
      }
    }
  }
  return null;
}

/**
 * Flatten the project's micrographs in tree order, optionally restricted to a
 * set of ids. Returns one entry per micrograph with its containing names.
 * @param {Object} projectData
 * @param {string[]|null} [micrographIds]  null/undefined = every micrograph
 * @returns {Array<{micrograph: Object, datasetName: string, sampleName: string}>}
 */
function collectMicrographs(projectData, micrographIds = null) {
  const wanted = Array.isArray(micrographIds) ? new Set(micrographIds) : null;
  const result = [];
  for (const dataset of projectData?.datasets || []) {
    for (const sample of dataset.samples || []) {
      for (const micrograph of sample.micrographs || []) {
        if (wanted && !wanted.has(micrograph.id)) continue;
        result.push({
          micrograph,
          datasetName: dataset.name || 'Unknown Dataset',
          sampleName: sample.name || 'Unknown Sample',
        });
      }
    }
  }
  return result;
}

/**
 * Children that the viewer would draw on top of this micrograph: direct
 * children that are not hidden and not secondary siblings.
 */
function getDrawableChildren(projectData, micrograph) {
  const children = [];
  for (const dataset of projectData?.datasets || []) {
    for (const sample of dataset.samples || []) {
      for (const child of sample.micrographs || []) {
        if (child.parentID !== micrograph.id) continue;
        if (child.isMicroVisible === false) continue;
        if (child.isPrimarySibling === false) continue;
        children.push(child);
      }
    }
  }
  return children;
}

/** Sketch layers selected by an ImageExportOptions.sketchLayers value. */
function selectSketchLayers(micrograph, selection) {
  const layers = Array.isArray(micrograph.sketchLayers) ? micrograph.sketchLayers : [];
  if (selection === 'none') return [];
  if (selection === 'all') return layers;
  if (Array.isArray(selection)) {
    const wanted = new Set(selection);
    return layers.filter((layer) => wanted.has(layer.id));
  }
  return layers.filter((layer) => layer.visible);
}

/** Strip characters that are illegal in filenames on any platform. */
function sanitizeFilename(name, fallback = 'micrograph') {
  return (name || fallback).replace(/[<>:"/\\|?*]/g, '_');
}

// ---------------------------------------------------------------------------
// Image path resolution
// ---------------------------------------------------------------------------

/**
 * Resolve an images/ path, falling back to uiImages/ for legacy projects whose
 * originals were only ever stored there.
 */
async function resolveImagePathWithLegacyFallback(imagePath) {
  try {
    await fs.promises.access(imagePath, fs.constants.F_OK);
    return imagePath;
  } catch {
    // fall through to the uiImages/ candidate
  }

  if (imagePath.includes('/images/') || imagePath.includes('\\images\\')) {
    const uiImagesPath = imagePath
      .replace('/images/', '/uiImages/')
      .replace('\\images\\', '\\uiImages\\');
    try {
      await fs.promises.access(uiImagesPath, fs.constants.F_OK);
      log.info(`[ImageExport] Image not found in images/, using uiImages/: ${uiImagesPath}`);
      return uiImagesPath;
    } catch {
      // neither exists; return the original so the caller's error names the expected path
    }
  }

  return imagePath;
}

// ---------------------------------------------------------------------------
// SVG text helpers
// ---------------------------------------------------------------------------

/** Convert legacy 0xRRGGBBAA colors to #RRGGBB; pass web colors through. */
function convertColor(color, fallback = '#00ff00') {
  if (!color) return fallback;
  if (color.startsWith('#')) return color;
  if (color.startsWith('0x')) return '#' + color.slice(2, 8);
  return color;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Format a coordinate compactly for SVG attributes. */
function num(value) {
  return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : '0';
}

// ---------------------------------------------------------------------------
// Child overlay compositing (rectangular + affine placements)
// ---------------------------------------------------------------------------

/** Multiply an RGBA buffer's alpha channel by a constant opacity. */
async function applyOpacity(image, opacity) {
  if (opacity >= 1.0) return image;
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) {
    data[i] = Math.round(data[i] * opacity);
  }
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  });
}

/**
 * Clip a positioned PNG buffer to the base image bounds. Returns a sharp
 * composite input, or null when the overlay lies entirely outside the base.
 */
async function clipToBase(pngBuffer, x, y, baseWidth, baseHeight) {
  const meta = await sharp(pngBuffer).metadata();
  const childW = meta.width;
  const childH = meta.height;

  if (x + childW <= 0 || y + childH <= 0 || x >= baseWidth || y >= baseHeight) {
    return null;
  }

  let cropX = 0;
  let cropY = 0;
  let cropW = childW;
  let cropH = childH;
  let left = x;
  let top = y;

  if (x < 0) { cropX = -x; cropW -= cropX; left = 0; }
  if (y < 0) { cropY = -y; cropH -= cropY; top = 0; }
  if (left + cropW > baseWidth) cropW = baseWidth - left;
  if (top + cropH > baseHeight) cropH = baseHeight - top;

  if (cropW <= 0 || cropH <= 0) return null;

  cropX = Math.round(cropX);
  cropY = Math.round(cropY);
  cropW = Math.round(cropW);
  cropH = Math.round(cropH);
  left = Math.round(left);
  top = Math.round(top);

  let input = pngBuffer;
  if (cropX > 0 || cropY > 0 || cropW !== childW || cropH !== childH) {
    input = await sharp(pngBuffer)
      .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
      .toBuffer();
  }

  return { input, left, top };
}

/** Composite input for an affine-placed child, from its pre-transformed cache entry. */
async function buildAffineOverlay(child, baseWidth, baseHeight) {
  if (!child.affineTileHash) {
    log.warn(`[ImageExport] Affine overlay ${child.id} missing affineTileHash, skipping`);
    return null;
  }

  const mediumBuffer = await tileCache.loadAffineMedium(child.affineTileHash);
  if (!mediumBuffer) {
    log.warn(`[ImageExport] Affine medium image not found for ${child.id}, skipping`);
    return null;
  }

  const boundsOffset = child.affineBoundsOffset || { x: 0, y: 0 };
  const transformedWidth = child.affineTransformedWidth || 0;
  const transformedHeight = child.affineTransformedHeight || 0;

  let image = sharp(mediumBuffer);
  if (transformedWidth > 0 && transformedHeight > 0) {
    image = image.resize(transformedWidth, transformedHeight, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3,
    });
  }

  image = await applyOpacity(image.ensureAlpha(), child.opacity ?? 1.0);
  const png = await image.png().toBuffer();

  return clipToBase(png, Math.round(boundsOffset.x), Math.round(boundsOffset.y), baseWidth, baseHeight);
}

/** Composite input for a rectangular (offset + scale + rotation) child. */
async function buildRectangularOverlay(child, parent, folderPaths, baseWidth, baseHeight) {
  // Children with no placement yet are not drawn (and their image is not loaded).
  if (!child.offsetInParent && child.xOffset === undefined) {
    return null;
  }

  const childPath = await resolveImagePathWithLegacyFallback(
    path.join(folderPaths.images, child.imagePath)
  );
  if (!fs.existsSync(childPath)) {
    log.warn(`[ImageExport] Child image not found: ${childPath}`);
    return null;
  }

  let image = sharp(childPath);
  const meta = await image.metadata();

  const childImageWidth = child.imageWidth || child.width || meta.width;
  const childImageHeight = child.imageHeight || child.height || meta.height;

  // Child size in the parent's pixel space comes from the ratio of their scales.
  const childPxPerCm = child.scalePixelsPerCentimeter || 100;
  const parentPxPerCm = parent.scalePixelsPerCentimeter || 100;
  const displayScale = parentPxPerCm / childPxPerCm;
  const displayWidth = Math.round(childImageWidth * displayScale);
  const displayHeight = Math.round(childImageHeight * displayScale);

  let topLeftX = 0;
  let topLeftY = 0;
  if (child.offsetInParent) {
    topLeftX = Math.round(child.offsetInParent.X);
    topLeftY = Math.round(child.offsetInParent.Y);
  } else if (child.xOffset !== undefined && child.yOffset !== undefined) {
    topLeftX = Math.round(child.xOffset);
    topLeftY = Math.round(child.yOffset);
  }

  image = image.resize(displayWidth, displayHeight, {
    fit: 'fill',
    kernel: sharp.kernel.lanczos3,
  });
  image = await applyOpacity(image.ensureAlpha(), child.opacity ?? 1.0);

  let finalX = topLeftX;
  let finalY = topLeftY;
  if (child.rotation) {
    // Rotate about the child's center; sharp expands the canvas to the rotated bounds.
    const centerX = topLeftX + displayWidth / 2;
    const centerY = topLeftY + displayHeight / 2;
    image = image.rotate(child.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } });

    const radians = (child.rotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    const rotatedWidth = displayWidth * cos + displayHeight * sin;
    const rotatedHeight = displayWidth * sin + displayHeight * cos;
    finalX = Math.round(centerX - rotatedWidth / 2);
    finalY = Math.round(centerY - rotatedHeight / 2);
  }

  const png = await image.png().toBuffer();
  return clipToBase(png, finalX, finalY, baseWidth, baseHeight);
}

/**
 * Build sharp composite inputs for every drawable child overlay. Point-located
 * children have no extent and are drawn as vector markers instead.
 */
async function buildOverlayInputs(parent, children, folderPaths, baseWidth, baseHeight) {
  const inputs = [];
  for (const child of children) {
    if (child.pointInParent) continue;
    try {
      const input = child.placementType === 'affine'
        ? await buildAffineOverlay(child, baseWidth, baseHeight)
        : await buildRectangularOverlay(child, parent, folderPaths, baseWidth, baseHeight);
      if (input) inputs.push(input);
    } catch (error) {
      log.error(`[ImageExport] Failed to composite child ${child.id}:`, error);
    }
  }
  return inputs;
}

// ---------------------------------------------------------------------------
// Vector annotation elements (spots, labels, markers, sketches)
// ---------------------------------------------------------------------------

/**
 * Annotation sizes scale with the image so a 1000px and a 10000px export look
 * the same when viewed at the same on-screen size.
 */
function annotationSizes(width, height) {
  const m = Math.max(width, height) / 1000;
  return {
    pointRadius: Math.round(6 * m),
    pointStrokeWidth: Math.round(2 * m),
    lineStrokeWidth: Math.round(3 * m),
    fontSize: Math.round(16 * m),
    padding: Math.round(4 * m),
    labelOffset: Math.round(8 * m),
    cornerRadius: Math.round(3 * m),
    charWidth: 8.5 * m,
    // Point-located micrograph marker: 9px radius / 1.5px white ring on screen.
    markerRadius: Math.round(9 * m),
    markerStrokeWidth: 1.5 * m,
  };
}

function spotGeometryType(spot) {
  return spot.geometryType || spot.geometry?.type;
}

function isPointGeometry(type) {
  return type === 'point' || type === 'Point';
}

/** Coordinates as [[x, y], ...] for line/polygon spots (GeoJSON or legacy points). */
function spotCoordinateList(spot, type) {
  if (Array.isArray(spot.geometry?.coordinates)) {
    if (type === 'polygon' || type === 'Polygon') {
      return spot.geometry.coordinates[0] || [];
    }
    return spot.geometry.coordinates;
  }
  return spot.points?.map((p) => [p.X ?? 0, p.Y ?? 0]) || [];
}

/** [x, y] of a point spot. */
function spotPointCoordinate(spot) {
  if (Array.isArray(spot.geometry?.coordinates)) {
    return [spot.geometry.coordinates[0], spot.geometry.coordinates[1]];
  }
  return [spot.points?.[0]?.X ?? 0, spot.points?.[0]?.Y ?? 0];
}

function spotShapeSvg(spot, sizes) {
  const type = spotGeometryType(spot);
  const color = convertColor(spot.color);
  const opacity = (spot.opacity ?? 50) / 100;

  if (isPointGeometry(type)) {
    const [x, y] = spotPointCoordinate(spot);
    return `<circle cx="${num(x)}" cy="${num(y)}" r="${sizes.pointRadius}" fill="${color}" stroke="#ffffff" stroke-width="${sizes.pointStrokeWidth}"/>`;
  }

  if (type === 'line' || type === 'LineString') {
    const coords = spotCoordinateList(spot, type);
    if (coords.length < 2) return '';
    const d = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${num(c[0])},${num(c[1])}`).join(' ');
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${sizes.lineStrokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  if (type === 'polygon' || type === 'Polygon') {
    const coords = spotCoordinateList(spot, type);
    if (coords.length < 3) return '';
    const points = coords.map((c) => `${num(c[0])},${num(c[1])}`).join(' ');
    return `<polygon points="${points}" fill="${color}" fill-opacity="${opacity}" stroke="${color}" stroke-width="${sizes.lineStrokeWidth}"/>`;
  }

  return '';
}

function spotLabelSvg(spot, sizes) {
  if (!spot.name) return '';
  const type = spotGeometryType(spot);
  const labelColor = convertColor(spot.labelColor, '#ffffff');

  let labelX = 0;
  let labelY = 0;
  if (isPointGeometry(type)) {
    [labelX, labelY] = spotPointCoordinate(spot);
  } else {
    const coords = spotCoordinateList(spot, type);
    if (coords[0]) {
      labelX = coords[0][0] || 0;
      labelY = coords[0][1] || 0;
    }
  }

  const labelWidth = spot.name.length * sizes.charWidth + sizes.padding * 2;
  const labelHeight = sizes.fontSize + sizes.padding * 2;
  const boxX = labelX + sizes.labelOffset;
  const boxY = labelY + sizes.labelOffset;

  return [
    `<rect x="${num(boxX)}" y="${num(boxY)}" width="${num(labelWidth)}" height="${num(labelHeight)}" rx="${sizes.cornerRadius}" fill="#000000" fill-opacity="0.7"/>`,
    `<text x="${num(boxX + sizes.padding)}" y="${num(boxY + sizes.fontSize + sizes.padding / 2)}" font-family="Arial, sans-serif" font-size="${sizes.fontSize}" font-weight="bold" fill="${labelColor}">${escapeXml(spot.name)}</text>`,
  ].join('\n');
}

/** Marker circle for a point-located child micrograph (matches the viewer). */
function pointMarkerSvg(child, sizes) {
  const p = child.pointInParent;
  const x = p.X ?? p.x ?? 0;
  const y = p.Y ?? p.y ?? 0;
  return `<circle cx="${num(x)}" cy="${num(y)}" r="${sizes.markerRadius}" fill="#e44c65" stroke="#ffffff" stroke-width="${num(sizes.markerStrokeWidth)}"/>`;
}

/**
 * Konva's control-point expansion for a tensioned Line (Util._expandPoints).
 * Reproduced so exported strokes curve exactly like the on-screen ones.
 */
function konvaExpandPoints(p, tension) {
  const out = [];
  for (let n = 2; n < p.length - 2; n += 2) {
    const x0 = p[n - 2], y0 = p[n - 1];
    const x1 = p[n], y1 = p[n + 1];
    const x2 = p[n + 2], y2 = p[n + 3];
    const d01 = Math.hypot(x1 - x0, y1 - y0);
    const d12 = Math.hypot(x2 - x1, y2 - y1);
    const fa = (tension * d01) / (d01 + d12);
    const fb = (tension * d12) / (d01 + d12);
    const p1x = x1 - fa * (x2 - x0);
    const p1y = y1 - fa * (y2 - y0);
    const p2x = x1 + fb * (x2 - x0);
    const p2y = y1 + fb * (y2 - y0);
    if (Number.isNaN(p1x)) continue; // coincident points
    out.push(p1x, p1y, x1, y1, p2x, p2y);
  }
  return out;
}

/** SVG path data equivalent to Konva.Line({ points, tension }) (open, not closed). */
function sketchStrokePath(points, tension) {
  const len = points.length;
  if (len < 4) return '';

  let d = `M${num(points[0])},${num(points[1])}`;
  const tp = tension !== 0 && len > 4 ? konvaExpandPoints(points, tension) : [];

  if (tp.length >= 4) {
    d += ` Q${num(tp[0])},${num(tp[1])} ${num(tp[2])},${num(tp[3])}`;
    let n = 4;
    while (n < tp.length - 2) {
      d += ` C${num(tp[n])},${num(tp[n + 1])} ${num(tp[n + 2])},${num(tp[n + 3])} ${num(tp[n + 4])},${num(tp[n + 5])}`;
      n += 6;
    }
    d += ` Q${num(tp[tp.length - 2])},${num(tp[tp.length - 1])} ${num(points[len - 2])},${num(points[len - 1])}`;
  } else {
    for (let n = 2; n < len; n += 2) {
      d += ` L${num(points[n])},${num(points[n + 1])}`;
    }
  }
  return d;
}

function sketchStrokeSvg(stroke) {
  const d = sketchStrokePath(stroke.points || [], SKETCH_STROKE_TENSION);
  if (!d) return '';
  const opacity = stroke.opacity ?? 1;
  return `<path d="${d}" fill="none" stroke="${convertColor(stroke.color, '#000000')}" stroke-width="${num(stroke.strokeWidth || 1)}" stroke-opacity="${num(opacity)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function sketchTextSvg(item) {
  if (!item.text) return '';
  const fontSize = item.fontSize || 16;
  const fontFamily = escapeXml(item.fontFamily || 'Arial, sans-serif');
  // Konva draws text with the top of the line box at y; SVG positions the
  // baseline, which for a single line sits roughly 0.85em below the top.
  const baseline = item.y + fontSize * 0.85;
  const transform = item.rotation ? ` transform="rotate(${num(item.rotation)} ${num(item.x)} ${num(item.y)})"` : '';
  const lines = String(item.text).split('\n');
  const tspans = lines
    .map((line, i) => `<tspan x="${num(item.x)}"${i === 0 ? '' : ` dy="${num(fontSize)}"`}>${escapeXml(line)}</tspan>`)
    .join('');
  return `<text x="${num(item.x)}" y="${num(baseline)}" font-family="${fontFamily}" font-size="${num(fontSize)}" fill="${convertColor(item.color, '#000000')}"${transform}>${tspans}</text>`;
}

/**
 * Build the vector annotation groups for a micrograph.
 * @returns {string} SVG element markup (no <svg> wrapper), empty when nothing to draw
 */
function buildAnnotationSvg({ micrograph, children, width, height, options }) {
  const sizes = annotationSizes(width, height);
  const parts = [];

  if (options.includeOverlays) {
    const markers = children.filter((child) => child.pointInParent != null);
    if (markers.length > 0) {
      parts.push('<g id="micrograph-markers">');
      for (const child of markers) parts.push(`  ${pointMarkerSvg(child, sizes)}`);
      parts.push('</g>');
    }
  }

  const spots = Array.isArray(micrograph.spots) ? micrograph.spots : [];
  if (options.includeSpots && spots.length > 0) {
    parts.push('<g id="spots">');
    for (const spot of spots) {
      const shape = spotShapeSvg(spot, sizes);
      if (!shape) continue;
      parts.push(`  <g id="spot-${escapeXml(spot.id)}" data-name="${escapeXml(spot.name || 'Unnamed')}">`);
      parts.push(`    ${shape}`);
      parts.push('  </g>');
    }
    parts.push('</g>');
  }

  if (options.includeLabels && spots.length > 0) {
    parts.push('<g id="labels">');
    for (const spot of spots) {
      const label = spotLabelSvg(spot, sizes);
      if (!label) continue;
      parts.push(`  <g id="label-${escapeXml(spot.id)}">`);
      parts.push(`    ${label}`);
      parts.push('  </g>');
    }
    parts.push('</g>');
  }

  const layers = selectSketchLayers(micrograph, options.sketchLayers);
  if (layers.length > 0) {
    parts.push('<g id="sketches">');
    for (const layer of layers) {
      parts.push(`  <g id="sketch-layer-${escapeXml(layer.id)}" data-name="${escapeXml(layer.name || 'Sketch')}">`);
      for (const stroke of layer.strokes || []) {
        const el = sketchStrokeSvg(stroke);
        if (el) parts.push(`    ${el}`);
      }
      for (const item of layer.textItems || []) {
        const el = sketchTextSvg(item);
        if (el) parts.push(`    ${el}`);
      }
      parts.push('  </g>');
    }
    parts.push('</g>');
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Load the base micrograph (or a transparent canvas of the same size) and
 * report its dimensions.
 */
async function loadBase(micrograph, folderPaths, includeImage) {
  const basePath = await resolveImagePathWithLegacyFallback(
    path.join(folderPaths.images, micrograph.imagePath)
  );
  const meta = await sharp(basePath).metadata();
  const width = meta.width;
  const height = meta.height;
  if (!width || !height) {
    throw new Error(`Could not read dimensions of ${basePath}`);
  }

  const image = includeImage
    ? sharp(basePath)
    : sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });

  return { image, width, height };
}

/**
 * Render a micrograph export.
 *
 * @param {string} projectId
 * @param {string|Object} micrographOrId  Micrograph id, or the micrograph object itself
 * @param {Object} projectData            Current project data from the renderer
 * @param {Object} folderPaths            From projectFolders.getProjectFolderPaths(projectId)
 * @param {Partial<ImageExportOptions>} [options]
 * @returns {Promise<{buffer: Buffer, format: string, extension: string, mimeType: string, width: number, height: number}>}
 */
async function renderMicrographExport(projectId, micrographOrId, projectData, folderPaths, options = {}) {
  const opts = normalizeOptions(options);
  const micrograph = typeof micrographOrId === 'string'
    ? findMicrograph(projectData, micrographOrId)
    : micrographOrId;

  if (!micrograph) {
    throw new Error(`Micrograph ${micrographOrId} not found in project`);
  }

  log.info(`[ImageExport] Rendering ${micrograph.id} (${micrograph.name || 'Unnamed'}) as ${opts.format}`);

  const { image: base, width, height } = await loadBase(micrograph, folderPaths, opts.includeImage);
  const children = getDrawableChildren(projectData, micrograph);

  const overlayInputs = opts.includeOverlays
    ? await buildOverlayInputs(micrograph, children, folderPaths, width, height)
    : [];

  const annotations = buildAnnotationSvg({ micrograph, children, width, height, options: opts });

  const common = { format: opts.format, extension: extensionForFormat(opts.format), mimeType: mimeTypeForFormat(opts.format), width, height };

  if (opts.format === 'svg') {
    const parts = [];
    parts.push('<?xml version="1.0" encoding="UTF-8"?>');
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
    parts.push('  <!-- Generated by StraboMicro2 -->');
    parts.push(`  <!-- Micrograph: ${escapeXml(micrograph.name || 'Unnamed')} -->`);

    // Raster layer: base image plus child overlays. Without the base image the
    // overlays (if any) go in as a transparent PNG so the document stays
    // transparent behind the vector annotations.
    if (opts.includeImage || overlayInputs.length > 0) {
      const raster = overlayInputs.length > 0 ? base.composite(overlayInputs) : base;
      const encoded = opts.includeImage
        ? { mime: 'image/jpeg', buffer: await raster.jpeg({ quality: 90 }).toBuffer() }
        : { mime: 'image/png', buffer: await raster.png().toBuffer() };
      parts.push('  <!-- Base Image Layer (Raster - micrograph with child overlays) -->');
      parts.push(`  <image id="base-image" x="0" y="0" width="${width}" height="${height}" xlink:href="data:${encoded.mime};base64,${encoded.buffer.toString('base64')}"/>`);
    }

    if (annotations) {
      parts.push('  <!-- Annotation Layers (Vector - Editable) -->');
      parts.push(annotations.replace(/^/gm, '  '));
    }

    parts.push('</svg>');
    const svg = parts.join('\n');
    log.info(`[ImageExport] Generated SVG: ${width}x${height}, ${svg.length} bytes`);
    return { ...common, buffer: Buffer.from(svg, 'utf8') };
  }

  // Raster output: overlays first, then the annotation SVG on top.
  const inputs = [...overlayInputs];
  if (annotations) {
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
      annotations,
      '</svg>',
    ].join('\n');
    inputs.push({ input: Buffer.from(svg), left: 0, top: 0 });
  }

  const composed = inputs.length > 0 ? base.composite(inputs) : base;
  const buffer = opts.format === 'png'
    ? await composed.png().toBuffer()
    : await composed.jpeg({ quality: 95 }).toBuffer();

  log.info(`[ImageExport] Rendered ${opts.format}: ${width}x${height}, ${buffer.length} bytes`);
  return { ...common, buffer };
}

module.exports = {
  renderMicrographExport,
  normalizeOptions,
  extensionForFormat,
  mimeTypeForFormat,
  findMicrograph,
  collectMicrographs,
  sanitizeFilename,
  resolveImagePathWithLegacyFallback,
  // Exposed for tests
  sketchStrokePath,
  buildAnnotationSvg,
};
