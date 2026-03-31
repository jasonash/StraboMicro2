/**
 * SpotRenderer — Read-only spot annotation renderer
 *
 * Adapted from the desktop app's SpotRenderer.tsx.
 * Renders points, lines, and polygons on a Konva canvas.
 * No editing capabilities, no Zustand store dependency.
 */

import { useMemo, useCallback } from 'react';
import { Circle, Line, Group, Text, Rect } from 'react-konva';
import type { Spot, SimpleCoord } from '../types/project-types';

interface SpotRendererProps {
  spot: Spot;
  scale: number;
  isSelected?: boolean;
  onClick?: (spot: Spot) => void;
}

/**
 * Convert legacy 0xRRGGBBAA color to web #RRGGBB
 */
function convertLegacyColor(color: string | null | undefined): string {
  if (!color) return '#808080';
  if (color.startsWith('#')) return color;
  if (color.startsWith('0x') && color.length >= 8) {
    return '#' + color.substring(2, 8);
  }
  return '#808080';
}

/**
 * Get spot coordinates as flat array [x1, y1, x2, y2, ...]
 */
function getPointsFlat(spot: Spot): number[] {
  // Modern GeoJSON geometry
  if (spot.geometry?.coordinates) {
    const coords = spot.geometry.coordinates;
    if (spot.geometry.type === 'Point') {
      return coords as number[];
    }
    if (spot.geometry.type === 'LineString') {
      return (coords as number[][]).flat();
    }
    if (spot.geometry.type === 'Polygon') {
      return ((coords as number[][][])[0] || []).flat();
    }
  }

  // Legacy points array
  if (spot.points && spot.points.length > 0) {
    return spot.points.flatMap((p: SimpleCoord) => [p.X ?? p.x ?? 0, p.Y ?? p.y ?? 0]);
  }

  return [];
}

/**
 * Get geometry type from spot
 */
function getGeometryType(spot: Spot): string | null {
  if (spot.geometry?.type) {
    switch (spot.geometry.type) {
      case 'Point': return 'point';
      case 'LineString': return 'line';
      case 'Polygon': return 'polygon';
    }
  }
  return spot.geometryType || null;
}

export function SpotRenderer({ spot, scale, isSelected, onClick }: SpotRendererProps) {
  const fillColor = convertLegacyColor(spot.color);
  const geometryType = getGeometryType(spot);
  const pointsFlat = useMemo(() => getPointsFlat(spot), [spot]);

  const handleClick = useCallback(() => {
    onClick?.(spot);
  }, [onClick, spot]);

  if (pointsFlat.length === 0 || !geometryType) return null;

  const strokeWidth = Math.max(1, 2 / scale);
  const hitStrokeWidth = Math.max(10, 20 / scale);

  // Fill opacity from spot data (0-100 → 0-1)
  const fillOpacity = spot.opacity != null ? spot.opacity / 100 : 0.3;

  // ============================================================================
  // POINT
  // ============================================================================

  if (geometryType === 'point') {
    const x = pointsFlat[0];
    const y = pointsFlat[1];
    const radius = Math.max(4, 6 / scale);

    return (
      <Group
        onClick={handleClick}
        onTap={handleClick}
      >
        {/* Selection ring */}
        {isSelected && (
          <Circle
            x={x}
            y={y}
            radius={radius + 4 / scale}
            stroke="#ff0000"
            strokeWidth={2 / scale}
          />
        )}
        {/* Point circle */}
        <Circle
          x={x}
          y={y}
          radius={radius}
          fill={fillColor}
          stroke={isSelected ? '#ffff00' : '#ffffff'}
          strokeWidth={strokeWidth}
          hitStrokeWidth={hitStrokeWidth}
        />
        {/* Label */}
        {spot.name && (
          <SpotLabel
            x={x + 12 / scale}
            y={y - 12 / scale}
            text={spot.name}
            scale={scale}
          />
        )}
      </Group>
    );
  }

  // ============================================================================
  // LINE
  // ============================================================================

  if (geometryType === 'line') {
    // Center of bounding box for label
    const xs = pointsFlat.filter((_, i) => i % 2 === 0);
    const ys = pointsFlat.filter((_, i) => i % 2 === 1);
    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;

    return (
      <Group
        onClick={handleClick}
        onTap={handleClick}
      >
        {isSelected && (
          <Line
            points={pointsFlat}
            stroke="#ff0000"
            strokeWidth={4 / scale}
            lineCap="round"
            lineJoin="round"
          />
        )}
        <Line
          points={pointsFlat}
          stroke={isSelected ? '#ffff00' : fillColor}
          strokeWidth={Math.max(2, 3 / scale)}
          lineCap="round"
          lineJoin="round"
          hitStrokeWidth={hitStrokeWidth}
        />
        {spot.name && (
          <SpotLabel
            x={centerX + 12 / scale}
            y={centerY - 12 / scale}
            text={spot.name}
            scale={scale}
          />
        )}
      </Group>
    );
  }

  // ============================================================================
  // POLYGON
  // ============================================================================

  if (geometryType === 'polygon') {
    const xs = pointsFlat.filter((_, i) => i % 2 === 0);
    const ys = pointsFlat.filter((_, i) => i % 2 === 1);
    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;

    return (
      <Group
        onClick={handleClick}
        onTap={handleClick}
      >
        {isSelected && (
          <Line
            points={pointsFlat}
            closed
            stroke="#ff0000"
            strokeWidth={4 / scale}
          />
        )}
        <Line
          points={pointsFlat}
          closed
          fill={fillColor}
          opacity={fillOpacity}
          stroke={isSelected ? '#ffff00' : fillColor}
          strokeWidth={strokeWidth}
          hitStrokeWidth={hitStrokeWidth}
        />
        {spot.name && (
          <SpotLabel
            x={centerX}
            y={centerY - 12 / scale}
            text={spot.name}
            scale={scale}
          />
        )}
      </Group>
    );
  }

  return null;
}

// ============================================================================
// SPOT LABEL
// ============================================================================

function SpotLabel({ x, y, text, scale }: { x: number; y: number; text: string; scale: number }) {
  const fontSize = Math.max(10, 14 / scale);
  const padding = 2 / scale;

  return (
    <Group x={x} y={y}>
      <Rect
        x={-padding}
        y={-padding}
        width={text.length * fontSize * 0.6 + padding * 2}
        height={fontSize + padding * 2}
        fill="rgba(0,0,0,0.6)"
        cornerRadius={2 / scale}
      />
      <Text
        text={text}
        fontSize={fontSize}
        fill="#ffffff"
        fontFamily="sans-serif"
      />
    </Group>
  );
}
