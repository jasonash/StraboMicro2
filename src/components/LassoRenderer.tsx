/**
 * LassoRenderer Component
 *
 * Renders a lasso selection polygon on the Konva canvas.
 * Reusable component that can be used in different contexts:
 * - Point Count mode for selecting multiple points
 * - CV Spots for selecting generated candidates
 *
 * Visual style:
 * - Dashed line for the lasso boundary
 * - Semi-transparent fill to show selected area
 * - Line closes back to start point
 */

import { memo } from 'react';
import { Line } from 'react-konva';
import type { Point2D } from '@/hooks/useLasso';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Lasso line color */
const LASSO_STROKE_COLOR = '#2196F3'; // Blue

/** Lasso fill color (semi-transparent) */
const LASSO_FILL_COLOR = 'rgba(33, 150, 243, 0.15)'; // Light blue with transparency

/** Lasso line width (in screen pixels, will be scaled) */
const LASSO_STROKE_WIDTH = 2;

/** Dash pattern for lasso line */
const LASSO_DASH = [8, 4];

// ============================================================================
// COMPONENT
// ============================================================================

interface LassoRendererProps {
  /** Array of points defining the lasso polygon */
  points: Point2D[];
  /** Current zoom scale (for consistent line width) */
  scale: number;
  /** Whether to close the polygon (connect last point to first) */
  closed?: boolean;
  /** Custom stroke color */
  strokeColor?: string;
  /** Custom fill color */
  fillColor?: string;
}

export const LassoRenderer = memo(function LassoRenderer({
  points,
  scale,
  closed = true,
  strokeColor = LASSO_STROKE_COLOR,
  fillColor = LASSO_FILL_COLOR,
}: LassoRendererProps) {
  // Don't render if not enough points
  if (points.length < 2) {
    return null;
  }

  // Convert Point2D array to flat array for Konva Line
  const flatPoints = points.flatMap((p) => [p.x, p.y]);

  // Scale-adjusted stroke width
  const strokeWidth = LASSO_STROKE_WIDTH / scale;
  const dash = LASSO_DASH.map((d) => d / scale);

  return (
    <Line
      points={flatPoints}
      stroke={strokeColor}
      strokeWidth={strokeWidth}
      dash={dash}
      fill={closed ? fillColor : undefined}
      closed={closed}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
});

export default LassoRenderer;
