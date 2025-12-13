/**
 * PointCountRenderer Component
 *
 * Renders Point Count session points on the Konva canvas.
 * Separate from SpotRenderer - these are temporary statistical sampling points,
 * not permanent features of interest.
 *
 * Visual features:
 * - Unclassified points: White fill with dark outline (visible on any background)
 * - Classified points: Filled with mineral color
 * - Current point: Gold crosshair highlight, larger size
 */

import { useMemo, useCallback, memo } from 'react';
import { Circle, Line, Group, Ring } from 'react-konva';
import { useAppStore } from '@/store';
import { PointCountPoint, getMineralColor } from '@/types/point-count-types';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Base point radius in pixels (before zoom scaling) */
const POINT_RADIUS = 6;

/** Current point is larger for visibility */
const CURRENT_POINT_RADIUS = 8;

/** Crosshair line length for current point */
const CROSSHAIR_LENGTH = 20;

/** Stroke width for point outlines */
const STROKE_WIDTH = 2;

/** Fill color for unclassified points - light gray, visible on most backgrounds */
const UNCLASSIFIED_FILL = '#CCCCCC';

/** Color for current point highlight */
const CURRENT_POINT_HIGHLIGHT = '#FFD700'; // Gold

// ============================================================================
// TYPES
// ============================================================================

interface PointCountRendererProps {
  /** Current zoom level for size scaling */
  scale: number;
  /** Callback when a point is clicked */
  onPointClick?: (pointIndex: number) => void;
}

// ============================================================================
// SINGLE POINT COMPONENT
// ============================================================================

interface PointProps {
  point: PointCountPoint;
  index: number;
  scale: number;
  isCurrent: boolean;
  onClick?: (index: number) => void;
}

const Point = memo(function Point({ point, index, scale, isCurrent, onClick }: PointProps) {
  const isClassified = !!point.mineral;
  const mineralColor = point.mineral ? getMineralColor(point.mineral) : UNCLASSIFIED_FILL;

  // Scale-adjusted sizes
  const radius = (isCurrent ? CURRENT_POINT_RADIUS : POINT_RADIUS) / scale;
  const strokeWidth = STROKE_WIDTH / scale; // Used for crosshair
  const crosshairLength = CROSSHAIR_LENGTH / scale;

  return (
    <Group>
      {/* Current point crosshair */}
      {isCurrent && (
        <>
          {/* Horizontal line */}
          <Line
            points={[
              point.x - crosshairLength,
              point.y,
              point.x - radius - strokeWidth,
              point.y,
            ]}
            stroke={CURRENT_POINT_HIGHLIGHT}
            strokeWidth={strokeWidth}
            listening={false}
          />
          <Line
            points={[
              point.x + radius + strokeWidth,
              point.y,
              point.x + crosshairLength,
              point.y,
            ]}
            stroke={CURRENT_POINT_HIGHLIGHT}
            strokeWidth={strokeWidth}
            listening={false}
          />
          {/* Vertical line */}
          <Line
            points={[
              point.x,
              point.y - crosshairLength,
              point.x,
              point.y - radius - strokeWidth,
            ]}
            stroke={CURRENT_POINT_HIGHLIGHT}
            strokeWidth={strokeWidth}
            listening={false}
          />
          <Line
            points={[
              point.x,
              point.y + radius + strokeWidth,
              point.x,
              point.y + crosshairLength,
            ]}
            stroke={CURRENT_POINT_HIGHLIGHT}
            strokeWidth={strokeWidth}
            listening={false}
          />
        </>
      )}

      {/* The point itself - simple filled circles for performance (no strokes) */}
      <Circle
        x={point.x}
        y={point.y}
        radius={radius}
        fill={isClassified ? mineralColor : UNCLASSIFIED_FILL}
        opacity={0.9}
        onClick={() => onClick?.(index)}
        onTap={() => onClick?.(index)}
      />

      {/* Current point outer ring highlight */}
      {isCurrent && (
        <Ring
          x={point.x}
          y={point.y}
          innerRadius={radius + strokeWidth}
          outerRadius={radius + strokeWidth * 2}
          fill={CURRENT_POINT_HIGHLIGHT}
          opacity={0.6}
          listening={false}
        />
      )}
    </Group>
  );
});

// ============================================================================
// MAIN RENDERER COMPONENT
// ============================================================================

export function PointCountRenderer({ scale, onPointClick }: PointCountRendererProps) {
  // Get point count state from store
  const pointCountMode = useAppStore((s) => s.pointCountMode);
  const activeSession = useAppStore((s) => s.activePointCountSession);
  const currentPointIndex = useAppStore((s) => s.currentPointIndex);
  const setCurrentPointIndex = useAppStore((s) => s.setCurrentPointIndex);

  // Handle point click - select the point and call callback
  // NOTE: All hooks must be called before any early returns
  const handlePointClick = useCallback((index: number) => {
    setCurrentPointIndex(index);
    onPointClick?.(index);
  }, [setCurrentPointIndex, onPointClick]);

  // Don't render if not in point count mode or no session
  if (!pointCountMode || !activeSession) {
    return null;
  }

  const points = activeSession.points;

  return (
    <Group name="point-count-layer">
      {/* Render all points */}
      {points.map((point, index) => (
        <Point
          key={point.id}
          point={point}
          index={index}
          scale={scale}
          isCurrent={index === currentPointIndex}
          onClick={handlePointClick}
        />
      ))}
    </Group>
  );
}

// ============================================================================
// VIEWPORT CULLED VERSION (for performance with large point counts)
// ============================================================================

interface ViewportCulledPointCountRendererProps extends PointCountRendererProps {
  /** Viewport bounds in image coordinates */
  viewportBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Padding around viewport for smooth scrolling */
  padding?: number;
}

export function ViewportCulledPointCountRenderer({
  scale,
  viewportBounds,
  padding = 50,
  onPointClick,
}: ViewportCulledPointCountRendererProps) {
  // Get point count state from store
  const pointCountMode = useAppStore((s) => s.pointCountMode);
  const activeSession = useAppStore((s) => s.activePointCountSession);
  const currentPointIndex = useAppStore((s) => s.currentPointIndex);
  const setCurrentPointIndex = useAppStore((s) => s.setCurrentPointIndex);

  // Filter points to only those visible in viewport (with padding)
  const visiblePoints = useMemo(() => {
    if (!activeSession) return [];

    const left = viewportBounds.x - padding;
    const right = viewportBounds.x + viewportBounds.width + padding;
    const top = viewportBounds.y - padding;
    const bottom = viewportBounds.y + viewportBounds.height + padding;

    return activeSession.points
      .map((point, index) => ({ point, index }))
      .filter(({ point }) =>
        point.x >= left &&
        point.x <= right &&
        point.y >= top &&
        point.y <= bottom
      );
  }, [activeSession, viewportBounds, padding]);

  // Handle point click
  // NOTE: All hooks must be called before any early returns
  const handlePointClick = useCallback((index: number) => {
    setCurrentPointIndex(index);
    onPointClick?.(index);
  }, [setCurrentPointIndex, onPointClick]);

  // Don't render if not in point count mode or no session
  if (!pointCountMode || !activeSession) {
    return null;
  }

  return (
    <Group name="point-count-layer">
      {/* Render only visible points */}
      {visiblePoints.map(({ point, index }) => (
        <Point
          key={point.id}
          point={point}
          index={index}
          scale={scale}
          isCurrent={index === currentPointIndex}
          onClick={handlePointClick}
        />
      ))}
    </Group>
  );
}
