import React, { useRef, useEffect } from 'react';

interface RulerCanvasProps {
  orientation: 'horizontal' | 'vertical';
  width: number;
  height: number;
  zoom: number;
  position: { x: number; y: number };
  imageWidth: number;
  imageHeight: number;
  scalePixelsPerCentimeter: number | null;
}

/**
 * RulerCanvas component renders measurement rulers along the top and left edges
 * of the canvas viewer, similar to Photoshop-style rulers.
 *
 * The rulers automatically adjust their scale based on zoom level:
 * - cm (centimeters) - zoomed out
 * - mm (millimeters) - moderate zoom
 * - 0.1mm - zoomed in
 * - 10µm (ten microns) - very zoomed in
 *
 * Rulers update dynamically as the user pans and zooms to maintain proper alignment
 * with the current viewport position in the micrograph.
 */
const RulerCanvas: React.FC<RulerCanvasProps> = ({
  orientation,
  width,
  height,
  zoom,
  position,
  imageWidth,
  imageHeight,
  scalePixelsPerCentimeter,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scalePixelsPerCentimeter) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Set high DPI scaling for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Calculate ruler metrics based on zoom and position
    const isHorizontal = orientation === 'horizontal';
    const rulerSize = isHorizontal ? width : height;

    // Calculate pixels per centimeter at current zoom level
    const rulerPixelsPerCentimeter = zoom * scalePixelsPerCentimeter;

    // Calculate viewport offset in ruler space
    // The position is in stage coordinates, we need to find where image coordinate 0 appears on screen
    // When position.x is positive, the image has moved right (image origin is to the right of viewport origin)
    // When position.x is negative, the image has moved left (image origin is to the left of viewport origin)
    // The ruler should show where we are in the IMAGE coordinate space
    const viewportOffset = isHorizontal ? position.x : position.y;

    // Calculate where the image origin (0,0) appears in the ruler
    // If viewportOffset is positive, origin is to the right/below viewport
    // We want the first tick to represent image coordinate 0, positioned at viewportOffset pixels
    const imageOriginInRuler = viewportOffset;

    // Determine how many centimeters are visible
    const numRulerCent = rulerSize / rulerPixelsPerCentimeter;

    // Adaptive scale selection - switch to finer scales when zoomed in
    let showLevel: 'cm' | 'mm' | 'mmTenths' | 'tenMicrons';
    showLevel = 'cm';
    let numRulerUnits = numRulerCent;
    let unitLabel = 'cm';

    if (numRulerCent < 2) {
      showLevel = 'mm';
      numRulerUnits = numRulerCent * 10;
      unitLabel = 'mm';

      if (numRulerUnits < 2) {
        showLevel = 'mmTenths';
        numRulerUnits = numRulerUnits * 10;
        unitLabel = 'mm';

        if (numRulerUnits < 2) {
          showLevel = 'tenMicrons';
          numRulerUnits = numRulerUnits * 10;
          unitLabel = 'µm';
        }
      }
    }

    // Calculate tick spacing
    const pixelsPerBigTick = rulerSize / numRulerUnits;
    const pixelsPerLittleTick = pixelsPerBigTick / 10;

    // Draw little ticks (only if spacing is large enough to be visible)
    if (pixelsPerLittleTick > 5) {
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 1;

      // Start from image origin and draw ticks
      let pos = imageOriginInRuler;
      while (pos < rulerSize) {
        if (pos >= 0) {
          if (isHorizontal) {
            ctx.beginPath();
            ctx.moveTo(pos, 20);
            ctx.lineTo(pos, 30);
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.moveTo(20, pos);
            ctx.lineTo(30, pos);
            ctx.stroke();
          }
        }
        pos += pixelsPerLittleTick;
      }

      // Draw ticks before origin (negative image coordinates)
      pos = imageOriginInRuler - pixelsPerLittleTick;
      while (pos >= 0) {
        if (isHorizontal) {
          ctx.beginPath();
          ctx.moveTo(pos, 20);
          ctx.lineTo(pos, 30);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(20, pos);
          ctx.lineTo(30, pos);
          ctx.stroke();
        }
        pos -= pixelsPerLittleTick;
      }
    }

    // Draw big ticks
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;

    let pos = imageOriginInRuler;
    while (pos < rulerSize) {
      if (pos >= 0) {
        if (isHorizontal) {
          ctx.beginPath();
          ctx.moveTo(pos, 15);
          ctx.lineTo(pos, 30);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(15, pos);
          ctx.lineTo(30, pos);
          ctx.stroke();
        }
      }
      pos += pixelsPerBigTick;
    }

    // Draw big ticks before origin
    pos = imageOriginInRuler - pixelsPerBigTick;
    while (pos >= 0) {
      if (isHorizontal) {
        ctx.beginPath();
        ctx.moveTo(pos, 15);
        ctx.lineTo(pos, 30);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(15, pos);
        ctx.lineTo(30, pos);
        ctx.stroke();
      }
      pos -= pixelsPerBigTick;
    }

    // Draw labels
    ctx.fillStyle = '#555';
    ctx.font = '12px system-ui, -apple-system, sans-serif';

    // Start labeling from image origin
    pos = imageOriginInRuler;
    let labelValue = 0; // This represents the image coordinate in the chosen unit

    // Labels going forward from origin
    while (pos < rulerSize) {
      if (pos >= 0 && pos < rulerSize - 40) {
        let labelText: string;

        if (showLevel === 'mmTenths') {
          labelText = labelValue.toFixed(1);
        } else {
          labelText = String(labelValue);
        }

        if (isHorizontal) {
          ctx.save();
          ctx.translate(pos - 3, 10);
          ctx.fillText(labelText, 5, 0);
          ctx.restore();
        } else {
          ctx.save();
          ctx.translate(0, pos);
          ctx.rotate(Math.PI / 2);
          ctx.fillText(labelText, 5, 0);
          ctx.restore();
        }
      }

      pos += pixelsPerBigTick;

      // Increment label value based on scale
      if (showLevel === 'mmTenths') {
        labelValue += 0.1;
      } else if (showLevel === 'tenMicrons') {
        labelValue += 10;
      } else {
        labelValue += 1;
      }
    }

    // Labels going backward from origin (not typically needed but included for completeness)
    pos = imageOriginInRuler - pixelsPerBigTick;
    labelValue = showLevel === 'mmTenths' ? -0.1 : (showLevel === 'tenMicrons' ? -10 : -1);

    while (pos >= 0) {
      let labelText: string;

      if (showLevel === 'mmTenths') {
        labelText = labelValue.toFixed(1);
      } else {
        labelText = String(labelValue);
      }

      if (isHorizontal) {
        ctx.save();
        ctx.translate(pos - 3, 10);
        ctx.fillText(labelText, 5, 0);
        ctx.restore();
      } else {
        ctx.save();
        ctx.translate(0, pos);
        ctx.rotate(Math.PI / 2);
        ctx.fillText(labelText, 5, 0);
        ctx.restore();
      }

      pos -= pixelsPerBigTick;

      if (showLevel === 'mmTenths') {
        labelValue -= 0.1;
      } else if (showLevel === 'tenMicrons') {
        labelValue -= 10;
      } else {
        labelValue -= 1;
      }
    }

    // Draw unit badge (only for horizontal ruler, in top-right corner)
    if (isHorizontal) {
      const badgeWidth = 35;
      const badgeHeight = 20;
      const badgeX = width - badgeWidth - 5; // 5px margin from right edge
      const badgeY = 5; // 5px margin from top
      const borderRadius = 6;

      // Draw rounded rectangle background
      ctx.fillStyle = '#666';
      ctx.beginPath();
      ctx.moveTo(badgeX + borderRadius, badgeY);
      ctx.lineTo(badgeX + badgeWidth - borderRadius, badgeY);
      ctx.quadraticCurveTo(badgeX + badgeWidth, badgeY, badgeX + badgeWidth, badgeY + borderRadius);
      ctx.lineTo(badgeX + badgeWidth, badgeY + badgeHeight - borderRadius);
      ctx.quadraticCurveTo(badgeX + badgeWidth, badgeY + badgeHeight, badgeX + badgeWidth - borderRadius, badgeY + badgeHeight);
      ctx.lineTo(badgeX + borderRadius, badgeY + badgeHeight);
      ctx.quadraticCurveTo(badgeX, badgeY + badgeHeight, badgeX, badgeY + badgeHeight - borderRadius);
      ctx.lineTo(badgeX, badgeY + borderRadius);
      ctx.quadraticCurveTo(badgeX, badgeY, badgeX + borderRadius, badgeY);
      ctx.closePath();
      ctx.fill();

      // Draw unit text (centered in badge)
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(unitLabel, badgeX + badgeWidth / 2, badgeY + badgeHeight / 2);

      // Reset text alignment for other text
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }

  }, [orientation, width, height, zoom, position, imageWidth, imageHeight, scalePixelsPerCentimeter]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        display: 'block',
        backgroundColor: '#f0f0f0',
        borderRight: orientation === 'vertical' ? '1px solid #ccc' : 'none',
        borderBottom: orientation === 'horizontal' ? '1px solid #ccc' : 'none',
      }}
    />
  );
};

export default RulerCanvas;
