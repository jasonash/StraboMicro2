/**
 * Rose Diagram Component
 *
 * Circular histogram for orientation data (0-180° axial data).
 * Shows distribution of grain orientations with mean direction indicator.
 */

import { useEffect, useRef, useMemo } from 'react';
import { Box } from '@mui/material';
import { generateRoseSectors, calculateCircularMean, calculateCircularStdDev } from '@/services/grainAnalysis/statistics';

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
}

// Colors
const SECTOR_COLOR = 'rgba(76, 175, 80, 0.7)';
const SECTOR_STROKE_COLOR = 'rgba(56, 142, 60, 1)';
const MEAN_COLOR = '#D32F2F';
const GRID_COLOR = 'rgba(128, 128, 128, 0.3)';
const TEXT_COLOR = '#333';

export function RoseDiagram({
  orientations,
  size = 250,
  sectorCount = 18, // 10° sectors
  showMean = true,
  title,
}: RoseDiagramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No orientation data', centerX, centerY);
      return;
    }

    // Find max count for scaling
    const maxCount = Math.max(...sectors.map(s => s.count));
    if (maxCount === 0) return;

    // Draw grid circles
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    const gridCircles = 4;
    for (let i = 1; i <= gridCircles; i++) {
      const r = (i / gridCircles) * maxRadius;
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

      const radius = (sector.count / maxCount) * maxRadius;
      const startAngle = ((sector.angleMin - 90) * Math.PI) / 180;
      const endAngle = ((sector.angleMax - 90) * Math.PI) / 180;

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

    // Draw mean direction indicator
    if (showMean && circularStats.resultantLength > 0.1) {
      const meanRad = ((circularStats.mean - 90) * Math.PI) / 180;
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
          meanRad - stdDevRad,
          meanRad + stdDevRad
        );
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw axis labels
    ctx.fillStyle = TEXT_COLOR;
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
      const rad = ((angle - 90) * Math.PI) / 180;
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
    if (showMean && circularStats.resultantLength > 0.1) {
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = MEAN_COLOR;
      ctx.fillText(
        `Mean: ${circularStats.mean.toFixed(1)}° ± ${circularStats.stdDev.toFixed(1)}°`,
        5,
        size - 5
      );
    }

  }, [sectors, orientations.length, circularStats, size, showMean, title]);

  return (
    <Box sx={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          maxWidth: '100%',
        }}
      />
    </Box>
  );
}
