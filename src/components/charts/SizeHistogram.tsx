/**
 * Size Histogram Component
 *
 * Canvas-based histogram for grain size distribution with optional
 * rock-type classification scale overlay.
 */

import { useEffect, useRef, useMemo } from 'react';
import { Box, useTheme } from '@mui/material';
import type { RockType } from '@/services/grainAnalysis/types';
import { getClassificationScheme, generateHistogramBins } from '@/services/grainAnalysis/statistics';
import { drawSizeHistogram } from './drawHistogram';

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
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  // Theme-aware colors
  const textColor = isDarkMode ? '#fff' : '#333';
  const axisColor = isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)';
  const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)';

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

    drawSizeHistogram(ctx, { width, height, bins, classification, useLogScale, showGrid, title, colors: { textColor, axisColor, gridColor } });
  }, [bins, classification, width, height, useLogScale, showGrid, title, textColor, axisColor, gridColor]);

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
