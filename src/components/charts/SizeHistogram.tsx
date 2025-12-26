/**
 * Size Histogram Component
 *
 * Canvas-based histogram for grain size distribution with optional
 * rock-type classification scale overlay.
 */

import { useEffect, useRef, useMemo } from 'react';
import { Box } from '@mui/material';
import type { RockType } from '@/services/grainAnalysis/types';
import { getClassificationScheme, generateHistogramBins } from '@/services/grainAnalysis/statistics';

interface SizeHistogramProps {
  /** Array of size values in microns */
  values: number[];
  /** Rock type for classification overlay */
  rockType: RockType;
  /** Width of the canvas */
  width?: number;
  /** Height of the canvas */
  height?: number;
  /** Use logarithmic scale for X-axis */
  useLogScale?: boolean;
  /** Show grid lines */
  showGrid?: boolean;
  /** Number of bins */
  binCount?: number;
  /** Optional title */
  title?: string;
}

// Colors for the histogram bars
const BAR_COLOR = 'rgba(66, 133, 244, 0.8)';
const BAR_STROKE_COLOR = 'rgba(25, 118, 210, 1)';
const GRID_COLOR = 'rgba(128, 128, 128, 0.2)';
const AXIS_COLOR = '#666';
const TEXT_COLOR = '#333';

export function SizeHistogram({
  values,
  rockType,
  width = 400,
  height = 250,
  useLogScale = false,
  showGrid = true,
  binCount = 15,
  title,
}: SizeHistogramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Generate histogram bins
  const bins = useMemo(() => {
    return generateHistogramBins(values, binCount, useLogScale);
  }, [values, binCount, useLogScale]);

  // Get classification scheme
  const classification = useMemo(() => {
    return getClassificationScheme(rockType);
  }, [rockType]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set up for high-DPI displays
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Margins for axes
    const margin = { top: 30, right: 20, bottom: 50, left: 60 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;

    if (bins.length === 0) {
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No data to display', width / 2, height / 2);
      return;
    }

    // Calculate scales
    const xMin = bins[0].min;
    const xMax = bins[bins.length - 1].max;
    const yMax = Math.max(...bins.map(b => b.count)) * 1.1;

    // Transform functions
    const xScale = (v: number): number => {
      if (useLogScale && xMin > 0) {
        const logMin = Math.log10(xMin);
        const logMax = Math.log10(xMax);
        return margin.left + ((Math.log10(v) - logMin) / (logMax - logMin)) * plotWidth;
      }
      return margin.left + ((v - xMin) / (xMax - xMin)) * plotWidth;
    };

    const yScale = (v: number): number => {
      return margin.top + plotHeight - (v / yMax) * plotHeight;
    };

    // Draw classification scale background
    ctx.save();
    for (const cls of classification.classes) {
      const clsXMin = Math.max(cls.sizeMinMicrons, xMin);
      const clsXMax = Math.min(cls.sizeMaxMicrons === Infinity ? xMax : cls.sizeMaxMicrons, xMax);

      if (clsXMax <= xMin || clsXMin >= xMax) continue;

      const x1 = xScale(clsXMin);
      const x2 = xScale(clsXMax);

      ctx.fillStyle = cls.color + '40'; // 25% opacity
      ctx.fillRect(x1, margin.top, x2 - x1, plotHeight);

      // Draw label at top
      if (x2 - x1 > 30) {
        ctx.fillStyle = '#666';
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.save();
        ctx.translate((x1 + x2) / 2, margin.top + 10);
        ctx.fillText(cls.name, 0, 0);
        ctx.restore();
      }
    }
    ctx.restore();

    // Draw grid
    if (showGrid) {
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 1;

      // Horizontal grid lines
      const yTicks = 5;
      for (let i = 0; i <= yTicks; i++) {
        const y = yScale((i / yTicks) * yMax);
        ctx.beginPath();
        ctx.moveTo(margin.left, y);
        ctx.lineTo(width - margin.right, y);
        ctx.stroke();
      }
    }

    // Draw histogram bars
    for (const bin of bins) {
      const x1 = xScale(bin.min);
      const x2 = xScale(bin.max);
      const y1 = yScale(bin.count);
      const y2 = yScale(0);
      const barWidth = x2 - x1;
      const barHeight = y2 - y1;

      if (barHeight > 0) {
        ctx.fillStyle = BAR_COLOR;
        ctx.fillRect(x1, y1, barWidth - 1, barHeight);
        ctx.strokeStyle = BAR_STROKE_COLOR;
        ctx.lineWidth = 1;
        ctx.strokeRect(x1, y1, barWidth - 1, barHeight);
      }
    }

    // Draw axes
    ctx.strokeStyle = AXIS_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, height - margin.bottom);
    ctx.lineTo(width - margin.right, height - margin.bottom);
    ctx.stroke();

    // X-axis labels
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';

    // Create tick values
    const tickCount = 6;
    for (let i = 0; i <= tickCount; i++) {
      let tickValue: number;
      if (useLogScale && xMin > 0) {
        const logMin = Math.log10(xMin);
        const logMax = Math.log10(xMax);
        tickValue = Math.pow(10, logMin + (i / tickCount) * (logMax - logMin));
      } else {
        tickValue = xMin + (i / tickCount) * (xMax - xMin);
      }

      const x = xScale(tickValue);

      // Tick mark
      ctx.beginPath();
      ctx.moveTo(x, height - margin.bottom);
      ctx.lineTo(x, height - margin.bottom + 5);
      ctx.stroke();

      // Label
      let label: string;
      if (tickValue >= 1000) {
        label = (tickValue / 1000).toFixed(1) + 'mm';
      } else {
        label = tickValue.toFixed(0) + 'µm';
      }
      ctx.fillText(label, x, height - margin.bottom + 18);
    }

    // X-axis title
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText('Equivalent Diameter', width / 2, height - 5);

    // Y-axis labels
    ctx.textAlign = 'right';
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const value = (i / yTicks) * yMax;
      const y = yScale(value);

      // Tick mark
      ctx.beginPath();
      ctx.moveTo(margin.left - 5, y);
      ctx.lineTo(margin.left, y);
      ctx.stroke();

      // Label
      ctx.fillText(Math.round(value).toString(), margin.left - 8, y + 4);
    }

    // Y-axis title
    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText('Count', 0, 0);
    ctx.restore();

    // Title
    if (title) {
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(title, width / 2, 15);
    }

  }, [bins, classification, width, height, useLogScale, showGrid, title]);

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
