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
import { generateRoseSectors } from '@/services/grainAnalysis/statistics';
import { drawRoseDiagram, roseCaption, roseCircularStats } from './drawRose';

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
  const circularStats = useMemo(() => roseCircularStats(orientations), [orientations]);

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

    drawRoseDiagram(ctx, { size, sectors, orientationCount: orientations.length, circularStats, showMean, title, colors: { textColor, gridColor, haloColor } });
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
          {roseCaption(frameDescription, showMean).map((paragraph, i) => (
            <span key={i}>
              {i > 0 && <><br /><br /></>}
              {paragraph}
            </span>
          ))}
        </Typography>
      )}
    </Box>
  );
}
