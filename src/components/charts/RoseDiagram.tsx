/**
 * Rose Diagram Component
 *
 * Circular histogram for orientation data (0-180° axial data).
 * Shows distribution of grain orientations with mean direction indicator.
 *
 * Angles are counterclockwise from the image horizontal (0° at the right, 90° at the top),
 * so each petal is parallel to the grains it counts as they appear in the image.
 * A direction of theta degrees points along (cos θ, -sin θ) on screen (canvas y grows
 * downward), which is canvas arc angle -θ. Every element below uses that one rule.
 *
 * Equal-area rose: a petal's area, not its length, is proportional to its count (radius goes
 * with the square root), so busy sectors are not visually exaggerated. The rings are drawn at
 * whole-number counts on the same square-root scale and labelled with them.
 */

import { useEffect, useRef, useMemo } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { generateRoseSectors, calculateCircularMean, calculateCircularStdDev, PREFERRED_ORIENTATION_MIN_R } from '@/services/grainAnalysis/statistics';
import { roseRings, equalAreaRadius } from '@/utils/countTicks';

interface RoseDiagramProps {
  /** Array of orientation values in degrees (0-180) */
  orientations: number[];
  /** Size of the diagram (width and height) */
  size?: number;
  /** Number of sectors (bins) */
  sectorCount?: number;
  /** Show mean direction indicator */
  showMean?: boolean;
  /** Optional title */
  title?: string;
  /** Which image's right side 0° points to, for the caption (e.g. "the micrograph image") */
  frameDescription?: string;
}

// Colors (same in both themes)
const SECTOR_COLOR = 'rgba(76, 175, 80, 0.7)';
const SECTOR_STROKE_COLOR = 'rgba(56, 142, 60, 1)';
const MEAN_COLOR = '#D32F2F';

export function RoseDiagram({
  orientations,
  size = 250,
  sectorCount = 18, // 10° sectors
  showMean = true,
  title,
  frameDescription = 'the micrograph image',
}: RoseDiagramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  // Theme-aware colors
  const textColor = isDarkMode ? '#fff' : '#333';
  const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(128, 128, 128, 0.3)';
  const haloColor = theme.palette.background.paper;

  // Generate sectors
  const sectors = useMemo(() => {
    return generateRoseSectors(orientations, sectorCount);
  }, [orientations, sectorCount]);

  // Calculate circular statistics
  const circularStats = useMemo(() => {
    if (orientations.length === 0) {
      return { mean: 0, resultantLength: 0, stdDev: 90 };
    }
    const stats = calculateCircularMean(orientations);
    return {
      ...stats,
      stdDev: calculateCircularStdDev(stats.resultantLength),
    };
  }, [orientations]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set up for high-DPI displays
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, size, size);

    const centerX = size / 2;
    const centerY = size / 2;
    const maxRadius = (size / 2) - 30;

    if (orientations.length === 0) {
      ctx.fillStyle = textColor;
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No orientation data', centerX, centerY);
      return;
    }

    // Find max count for scaling
    const maxCount = Math.max(...sectors.map(s => s.count));
    if (maxCount === 0) return;

    // Rings at whole-number counts; the outer ring is at or just above the busiest sector
    const rings = roseRings(maxCount);
    const outerCount = rings[rings.length - 1];

    // Draw grid circles
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (const ringCount of rings) {
      const r = equalAreaRadius(ringCount, outerCount, maxRadius);
      ctx.beginPath();
      ctx.arc(centerX, centerY, r, 0, 2 * Math.PI);
      ctx.stroke();
    }

    // Draw radial lines every 30°
    for (let angle = 0; angle < 180; angle += 30) {
      const rad = (angle * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(
        centerX + maxRadius * Math.cos(rad),
        centerY - maxRadius * Math.sin(rad)
      );
      ctx.lineTo(
        centerX - maxRadius * Math.cos(rad),
        centerY + maxRadius * Math.sin(rad)
      );
      ctx.stroke();
    }

    // Draw sectors (rose petals)
    for (const sector of sectors) {
      if (sector.count === 0) continue;

      const radius = equalAreaRadius(sector.count, outerCount, maxRadius);
      // Canvas arc angles run clockwise, so the sector from angleMin to angleMax
      // (counterclockwise) is the arc from -angleMax to -angleMin.
      const startAngle = (-sector.angleMax * Math.PI) / 180;
      const endAngle = (-sector.angleMin * Math.PI) / 180;

      // Draw the petal (and its mirror at +180°)
      for (const offset of [0, Math.PI]) {
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle + offset, endAngle + offset);
        ctx.closePath();
        ctx.fillStyle = SECTOR_COLOR;
        ctx.fill();
        ctx.strokeStyle = SECTOR_STROKE_COLOR;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Ring labels (grain counts), along a fixed direction just below the 0° axis on the right,
    // with a halo so they stay readable over petals
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = haloColor;
    ctx.fillStyle = textColor;
    const ringLabelRad = (-20 * Math.PI) / 180;
    for (const ringCount of rings) {
      const r = equalAreaRadius(ringCount, outerCount, maxRadius);
      const x = centerX + r * Math.cos(ringLabelRad);
      const y = centerY - r * Math.sin(ringLabelRad) + 4;
      ctx.strokeText(String(ringCount), x, y);
      ctx.fillText(String(ringCount), x, y);
    }

    // Draw mean direction indicator
    if (showMean && circularStats.resultantLength > PREFERRED_ORIENTATION_MIN_R) {
      const meanRad = (circularStats.mean * Math.PI) / 180;
      const indicatorLength = maxRadius + 15;

      ctx.strokeStyle = MEAN_COLOR;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(
        centerX - indicatorLength * Math.cos(meanRad),
        centerY + indicatorLength * Math.sin(meanRad)
      );
      ctx.lineTo(
        centerX + indicatorLength * Math.cos(meanRad),
        centerY - indicatorLength * Math.sin(meanRad)
      );
      ctx.stroke();

      // Arrow head
      const arrowSize = 8;
      const arrowAngle = 0.5;
      const tipX = centerX + indicatorLength * Math.cos(meanRad);
      const tipY = centerY - indicatorLength * Math.sin(meanRad);

      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(
        tipX - arrowSize * Math.cos(meanRad - arrowAngle),
        tipY + arrowSize * Math.sin(meanRad - arrowAngle)
      );
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(
        tipX - arrowSize * Math.cos(meanRad + arrowAngle),
        tipY + arrowSize * Math.sin(meanRad + arrowAngle)
      );
      ctx.stroke();

      // Draw std dev arc if significant
      if (circularStats.stdDev < 80) {
        const stdDevRad = (circularStats.stdDev * Math.PI) / 180;
        ctx.strokeStyle = MEAN_COLOR;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(
          centerX,
          centerY,
          maxRadius * 0.8,
          -meanRad - stdDevRad,
          -meanRad + stdDevRad
        );
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw axis labels
    ctx.fillStyle = textColor;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';

    // Cardinal directions
    const labels = [
      { angle: 0, label: '0°' },
      { angle: 30, label: '30°' },
      { angle: 60, label: '60°' },
      { angle: 90, label: '90°' },
      { angle: 120, label: '120°' },
      { angle: 150, label: '150°' },
    ];

    for (const { angle, label } of labels) {
      const rad = (angle * Math.PI) / 180;
      const labelRadius = maxRadius + 18;
      ctx.fillText(
        label,
        centerX + labelRadius * Math.cos(rad),
        centerY - labelRadius * Math.sin(rad) + 4
      );
    }

    // Title
    if (title) {
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(title, centerX, 15);
    }

    // Stats annotation
    if (showMean && circularStats.resultantLength > PREFERRED_ORIENTATION_MIN_R) {
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = MEAN_COLOR;
      ctx.fillText(
        `Mean: ${circularStats.mean.toFixed(1)}° ± ${circularStats.stdDev.toFixed(1)}°`,
        5,
        size - 5
      );
    }

  }, [sectors, orientations.length, circularStats, size, showMean, title, textColor, gridColor, haloColor]);

  return (
    // Caption to the left of the rose; it moves below when the dialog is too narrow for both
    <Box sx={{ display: 'flex', flexDirection: 'row-reverse', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          maxWidth: '100%',
        }}
      />
      {orientations.length > 0 && (
        <Typography
          variant="caption"
          component="p"
          sx={{ color: 'text.secondary', flex: '1 1 200px', maxWidth: 260, lineHeight: 1.5, m: 0 }}
        >
          {/* Wording approved by Peter Lindquist and Claire Martin, 2026-11-05 */}
          Rose diagram of the long-axis orientations of the best-fit ellipses of the polygon
          spots. Angles are measured counterclockwise from the image horizontal, with 0° towards
          the right side of {frameDescription}. Long axes have no direction, so the diagram spans
          0–180° and each sector is mirrored across the center.
          <br /><br />
          Equal-area rose: a petal&apos;s area is proportional to the number of polygons with
          long-axis directions that fall into that 10° bin; rings are labeled with polygon spot
          counts.
          {showMean && (
            <>
              <br /><br />
              Red line (when the polygons share a preferred orientation): mean orientation; dashed
              arc and ±: circular standard deviation (about 1 sd).
            </>
          )}
        </Typography>
      )}
    </Box>
  );
}
