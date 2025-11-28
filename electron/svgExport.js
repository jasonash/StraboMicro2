/**
 * SVG Export Service
 *
 * Exports micrographs as SVG files with:
 * - Base composite image (micrograph + overlays) embedded as base64 JPEG
 * - Spots rendered as vector elements (editable in Illustrator, Inkscape, etc.)
 * - Labels as editable text elements
 */

const fs = require('fs');
const path = require('path');
const log = require('electron-log');
const sharp = require('sharp');

/**
 * Generate composite base image buffer (micrograph + child overlays, no spots)
 * @param {Object} micrograph - Micrograph data
 * @param {Object} projectData - Full project data
 * @param {Object} folderPaths - Project folder paths
 * @returns {Promise<{buffer: Buffer, width: number, height: number}>}
 */
async function generateCompositeBaseImage(micrograph, projectData, folderPaths) {
  // Find child micrographs for this micrograph
  const childMicrographs = [];
  for (const dataset of projectData.datasets || []) {
    for (const sample of dataset.samples || []) {
      const children = (sample.micrographs || []).filter(
        m => m.parentID === micrograph.id
      );
      childMicrographs.push(...children);
    }
  }

  // Load base micrograph image
  const basePath = path.join(folderPaths.images, micrograph.imagePath);
  let baseImage = sharp(basePath);
  const baseMetadata = await baseImage.metadata();
  const baseWidth = baseMetadata.width;
  const baseHeight = baseMetadata.height;

  // Build composite layers for child micrographs
  const compositeInputs = [];

  for (const child of childMicrographs) {
    try {
      // Skip point-located micrographs
      if (child.pointInParent) continue;

      // Skip hidden micrographs
      if (child.isMicroVisible === false) continue;

      const childPath = path.join(folderPaths.images, child.imagePath);

      // Check if child image exists
      if (!fs.existsSync(childPath)) {
        log.warn(`[SVGExport] Child image not found: ${childPath}`);
        continue;
      }

      let childImage = sharp(childPath);
      const childMetadata = await childImage.metadata();

      // Use stored dimensions
      const childImageWidth = child.imageWidth || child.width || childMetadata.width;
      const childImageHeight = child.imageHeight || child.height || childMetadata.height;

      // Calculate display scale based on pixels per centimeter
      const childPxPerCm = child.scalePixelsPerCentimeter || 100;
      const parentPxPerCm = micrograph.scalePixelsPerCentimeter || 100;
      const displayScale = parentPxPerCm / childPxPerCm;

      // Calculate child dimensions in parent's coordinate space
      const childDisplayWidth = Math.round(childImageWidth * displayScale);
      const childDisplayHeight = Math.round(childImageHeight * displayScale);

      // Get child position
      let topLeftX = 0, topLeftY = 0;
      if (child.offsetInParent) {
        topLeftX = Math.round(child.offsetInParent.X);
        topLeftY = Math.round(child.offsetInParent.Y);
      } else if (child.xOffset !== undefined && child.yOffset !== undefined) {
        topLeftX = Math.round(child.xOffset);
        topLeftY = Math.round(child.yOffset);
      }

      // Resize child image to display dimensions
      childImage = childImage.resize(childDisplayWidth, childDisplayHeight, {
        fit: 'fill',
        kernel: sharp.kernel.lanczos3
      });

      // Apply opacity
      const childOpacity = child.opacity ?? 1.0;
      childImage = childImage.ensureAlpha();

      if (childOpacity < 1.0) {
        const { data, info } = await childImage.raw().toBuffer({ resolveWithObject: true });
        for (let i = 3; i < data.length; i += 4) {
          data[i] = Math.round(data[i] * childOpacity);
        }
        childImage = sharp(data, {
          raw: { width: info.width, height: info.height, channels: info.channels }
        });
      }

      // Apply rotation if needed
      let finalX = topLeftX, finalY = topLeftY, finalBuffer;
      if (child.rotation) {
        const centerX = topLeftX + childDisplayWidth / 2;
        const centerY = topLeftY + childDisplayHeight / 2;

        childImage = childImage.rotate(child.rotation, {
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        });

        const radians = (child.rotation * Math.PI) / 180;
        const cos = Math.abs(Math.cos(radians));
        const sin = Math.abs(Math.sin(radians));
        const rotatedWidth = childDisplayWidth * cos + childDisplayHeight * sin;
        const rotatedHeight = childDisplayWidth * sin + childDisplayHeight * cos;

        finalX = Math.round(centerX - rotatedWidth / 2);
        finalY = Math.round(centerY - rotatedHeight / 2);
        finalBuffer = await childImage.png().toBuffer();
      } else {
        finalBuffer = await childImage.png().toBuffer();
      }

      // Bounds checking and cropping
      const childBufferMeta = await sharp(finalBuffer).metadata();
      const childW = childBufferMeta.width;
      const childH = childBufferMeta.height;

      if (finalX + childW <= 0 || finalY + childH <= 0 || finalX >= baseWidth || finalY >= baseHeight) {
        continue;
      }

      let cropX = 0, cropY = 0, cropW = childW, cropH = childH;
      let compositeX = finalX, compositeY = finalY;

      if (finalX < 0) { cropX = -finalX; cropW -= cropX; compositeX = 0; }
      if (finalY < 0) { cropY = -finalY; cropH -= cropY; compositeY = 0; }
      if (compositeX + cropW > baseWidth) { cropW = baseWidth - compositeX; }
      if (compositeY + cropH > baseHeight) { cropH = baseHeight - compositeY; }

      if (cropW <= 0 || cropH <= 0) continue;

      cropX = Math.round(cropX);
      cropY = Math.round(cropY);
      cropW = Math.round(cropW);
      cropH = Math.round(cropH);
      compositeX = Math.round(compositeX);
      compositeY = Math.round(compositeY);

      let compositeBuffer = finalBuffer;
      if (cropX > 0 || cropY > 0 || cropW !== childW || cropH !== childH) {
        compositeBuffer = await sharp(finalBuffer)
          .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
          .toBuffer();
      }

      compositeInputs.push({ input: compositeBuffer, left: compositeX, top: compositeY });
    } catch (error) {
      log.error(`[SVGExport] Failed to composite child ${child.id}:`, error);
    }
  }

  // Apply all composites and get JPEG buffer
  let finalImage;
  if (compositeInputs.length > 0) {
    finalImage = baseImage.composite(compositeInputs);
  } else {
    finalImage = baseImage;
  }

  const buffer = await finalImage.jpeg({ quality: 90 }).toBuffer();

  return { buffer, width: baseWidth, height: baseHeight };
}

/**
 * Convert legacy color format (0xRRGGBBAA) to web format (#RRGGBB)
 */
function convertColor(color) {
  if (!color) return '#00ff00';
  if (color.startsWith('#')) return color;
  if (color.startsWith('0x')) {
    const hex = color.slice(2);
    const rgb = hex.slice(0, 6);
    return '#' + rgb;
  }
  return color;
}

/**
 * Escape XML special characters
 */
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate vector SVG elements for spots
 * @param {Array} spots - Array of spot objects
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {string} SVG elements as string
 */
function generateSpotSvgElements(spots, width, height) {
  if (!spots || spots.length === 0) return '';

  // Calculate size multiplier based on image dimensions
  const longestSide = Math.max(width, height);
  const sizeMultiplier = longestSide / 1000;

  // Base sizes (for a ~1000px image)
  const basePointRadius = 6;
  const basePointStrokeWidth = 2;
  const baseLineStrokeWidth = 3;
  const baseFontSize = 16;
  const basePadding = 4;
  const baseOffset = 8;
  const baseCornerRadius = 3;

  // Scaled sizes
  const pointRadius = Math.round(basePointRadius * sizeMultiplier);
  const pointStrokeWidth = Math.round(basePointStrokeWidth * sizeMultiplier);
  const lineStrokeWidth = Math.round(baseLineStrokeWidth * sizeMultiplier);
  const fontSize = Math.round(baseFontSize * sizeMultiplier);
  const padding = Math.round(basePadding * sizeMultiplier);
  const labelOffset = Math.round(baseOffset * sizeMultiplier);
  const cornerRadius = Math.round(baseCornerRadius * sizeMultiplier);
  const charWidth = 8.5 * sizeMultiplier;

  const svgParts = [];

  // Create a group for spots
  svgParts.push('  <!-- Spots Layer (Vector - Editable) -->');
  svgParts.push('  <g id="spots">');

  for (const spot of spots) {
    const geometryType = spot.geometryType || spot.geometry?.type;
    const color = convertColor(spot.color || '#00ff00');
    const opacity = (spot.opacity ?? 50) / 100;
    const spotName = spot.name || 'Unnamed';

    // Create a group for this spot
    svgParts.push(`    <g id="spot-${escapeXml(spot.id)}" data-name="${escapeXml(spotName)}">`);

    // Render spot shape
    if (geometryType === 'point' || geometryType === 'Point') {
      const x = Array.isArray(spot.geometry?.coordinates)
        ? spot.geometry.coordinates[0]
        : spot.points?.[0]?.X ?? 0;
      const y = Array.isArray(spot.geometry?.coordinates)
        ? spot.geometry.coordinates[1]
        : spot.points?.[0]?.Y ?? 0;

      svgParts.push(`      <circle cx="${x}" cy="${y}" r="${pointRadius}" fill="${color}" stroke="#ffffff" stroke-width="${pointStrokeWidth}"/>`);

    } else if (geometryType === 'line' || geometryType === 'LineString') {
      const coords = Array.isArray(spot.geometry?.coordinates)
        ? spot.geometry.coordinates
        : spot.points?.map(p => [p.X ?? 0, p.Y ?? 0]) || [];

      if (coords.length >= 2) {
        const pathData = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c[0]},${c[1]}`).join(' ');
        svgParts.push(`      <path d="${pathData}" fill="none" stroke="${color}" stroke-width="${lineStrokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`);
      }

    } else if (geometryType === 'polygon' || geometryType === 'Polygon') {
      const coords = Array.isArray(spot.geometry?.coordinates)
        ? (spot.geometry.coordinates[0] || [])
        : spot.points?.map(p => [p.X ?? 0, p.Y ?? 0]) || [];

      if (coords.length >= 3) {
        const pointsStr = coords.map(c => `${c[0]},${c[1]}`).join(' ');
        svgParts.push(`      <polygon points="${pointsStr}" fill="${color}" fill-opacity="${opacity}" stroke="${color}" stroke-width="${lineStrokeWidth}"/>`);
      }
    }

    svgParts.push('    </g>');
  }

  svgParts.push('  </g>');

  // Create a separate group for labels (so they render on top)
  svgParts.push('');
  svgParts.push('  <!-- Labels Layer (Editable Text) -->');
  svgParts.push('  <g id="labels">');

  for (const spot of spots) {
    const geometryType = spot.geometryType || spot.geometry?.type;
    const labelColor = convertColor(spot.labelColor || '#ffffff');
    const showLabel = spot.showLabel !== false;

    if (!showLabel || !spot.name) continue;

    let labelX = 0, labelY = 0;

    if (geometryType === 'point' || geometryType === 'Point') {
      labelX = (Array.isArray(spot.geometry?.coordinates) ? spot.geometry.coordinates[0] : spot.points?.[0]?.X) || 0;
      labelY = (Array.isArray(spot.geometry?.coordinates) ? spot.geometry.coordinates[1] : spot.points?.[0]?.Y) || 0;
    } else {
      const coords = Array.isArray(spot.geometry?.coordinates)
        ? (spot.geometry.coordinates[0] || spot.geometry.coordinates)
        : spot.points?.map(p => [p.X ?? 0, p.Y ?? 0]) || [];
      if (coords[0]) {
        labelX = coords[0][0] || coords[0];
        labelY = coords[0][1] || coords[1];
      }
    }

    // Label dimensions
    const labelWidth = spot.name.length * charWidth + padding * 2;
    const labelHeight = fontSize + padding * 2;

    svgParts.push(`    <g id="label-${escapeXml(spot.id)}">`);
    // Background box
    svgParts.push(`      <rect x="${labelX + labelOffset}" y="${labelY + labelOffset}" width="${labelWidth}" height="${labelHeight}" rx="${cornerRadius}" fill="#000000" fill-opacity="0.7"/>`);
    // Label text (editable in vector editors!)
    svgParts.push(`      <text x="${labelX + labelOffset + padding}" y="${labelY + labelOffset + fontSize + padding/2}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="${labelColor}">${escapeXml(spot.name)}</text>`);
    svgParts.push('    </g>');
  }

  svgParts.push('  </g>');

  return svgParts.join('\n');
}

/**
 * Export micrograph as SVG with embedded composite image and vector spots
 * @param {string} projectId - Project UUID
 * @param {string} micrographId - Micrograph UUID
 * @param {Object} projectData - Full project data
 * @param {Object} folderPaths - Project folder paths
 * @returns {Promise<{svg: string, width: number, height: number}>}
 */
async function exportMicrographAsSvg(projectId, micrographId, projectData, folderPaths) {
  log.info(`[SVGExport] Exporting micrograph ${micrographId} as SVG`);

  // Find the micrograph in the project hierarchy
  let micrograph = null;
  for (const dataset of projectData.datasets || []) {
    for (const sample of dataset.samples || []) {
      for (const micro of sample.micrographs || []) {
        if (micro.id === micrographId) {
          micrograph = micro;
          break;
        }
      }
      if (micrograph) break;
    }
    if (micrograph) break;
  }

  if (!micrograph) {
    throw new Error(`Micrograph ${micrographId} not found in project`);
  }

  // Generate composite base image (micrograph + overlays)
  const { buffer: imageBuffer, width, height } = await generateCompositeBaseImage(
    micrograph,
    projectData,
    folderPaths
  );

  // Convert to base64
  const base64Image = imageBuffer.toString('base64');

  // Build SVG document
  const svgParts = [];

  svgParts.push('<?xml version="1.0" encoding="UTF-8"?>');
  svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
  svgParts.push('  <!-- Generated by StraboMicro2 -->');
  svgParts.push(`  <!-- Micrograph: ${escapeXml(micrograph.name || 'Unnamed')} -->');
  svgParts.push('');

  // Embedded composite image (base layer)
  svgParts.push('  <!-- Base Image Layer (Raster - Composite with overlays) -->');
  svgParts.push(`  <image id="base-image" x="0" y="0" width="${width}" height="${height}" xlink:href="data:image/jpeg;base64,${base64Image}"/>`);
  svgParts.push('');

  // Vector spots and labels
  const spotElements = generateSpotSvgElements(micrograph.spots || [], width, height);
  if (spotElements) {
    svgParts.push(spotElements);
  }

  svgParts.push('</svg>');

  const svg = svgParts.join('\n');

  log.info(`[SVGExport] Generated SVG: ${width}x${height}, ${svg.length} bytes`);

  return { svg, width, height };
}

module.exports = {
  exportMicrographAsSvg,
  generateCompositeBaseImage,
  generateSpotSvgElements,
};
