/**
 * SpotRenderer Component
 *
 * Renders individual spots (point/line/polygon annotations) on the Konva canvas.
 * Handles visual representation including colors, labels, opacity, and selection states.
 */

import { useState } from 'react';
import { Circle, Line, Group, Text } from 'react-konva';
import { Spot } from '@/types/project-types';

interface SpotRendererProps {
  spot: Spot;
  scale: number; // Current zoom level for size scaling
  isSelected?: boolean;
  onClick?: (spot: Spot) => void;
  onContextMenu?: (spot: Spot, x: number, y: number) => void;
}

export const SpotRenderer: React.FC<SpotRendererProps> = ({
  spot,
  scale,
  isSelected = false,
  onClick,
  onContextMenu,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  if (!spot.geometryType && !spot.geometry) return null;

  const geometryType = spot.geometryType || spot.geometry?.type;
  const color = spot.color || '#00ff00';
  const labelColor = spot.labelColor || '#ffffff';
  const showLabel = spot.showLabel ?? true;
  const opacity = (spot.opacity ?? 50) / 100; // Convert 0-100 to 0-1

  const strokeColor = isHovered ? '#ffff00' : color;
  const strokeWidth = isHovered ? 4 / scale : 3 / scale;

  const handleClick = () => {
    onClick?.(spot);
  };

  const handleContextMenu = (e: any) => {
    e.evt.preventDefault();
    e.cancelBubble = true;
    onContextMenu?.(spot, e.evt.clientX, e.evt.clientY);
  };

  const handleMouseEnter = (e: any) => {
    setIsHovered(true);
    const container = e.target.getStage()?.container();
    if (container) {
      container.style.cursor = 'pointer';
    }
  };

  const handleMouseLeave = (e: any) => {
    setIsHovered(false);
    const container = e.target.getStage()?.container();
    if (container) {
      container.style.cursor = 'default';
    }
  };

  // Point rendering
  if (geometryType === 'point' || geometryType === 'Point') {
    // Handle both modern geometry format and legacy points format
    const x = Array.isArray(spot.geometry?.coordinates)
      ? (spot.geometry.coordinates as number[])[0]
      : spot.points?.[0]?.X ?? spot.points?.[0]?.x ?? 0;
    const y = Array.isArray(spot.geometry?.coordinates)
      ? (spot.geometry.coordinates as number[])[1]
      : spot.points?.[0]?.Y ?? spot.points?.[0]?.y ?? 0;

    return (
      <Group
        name={`spot-${spot.id}`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Selection indicator */}
        {isSelected && (
          <Circle
            key="selection"
            x={x}
            y={y}
            radius={12 / scale}
            stroke="#ffff00"
            strokeWidth={3 / scale}
            dash={[5, 5]}
            listening={false}
          />
        )}

        {/* Solid circle with white outline */}
        <Circle
          key="point"
          x={x}
          y={y}
          radius={6 / scale}
          fill={color}
          stroke="#ffffff"
          strokeWidth={2 / scale}
        />

        {/* Label */}
        {showLabel && (
          <Text
            key="label"
            x={x + 12 / scale}
            y={y - 8 / scale}
            text={spot.name}
            fontSize={12 / scale}
            fill={labelColor}
            stroke="#000000"
            strokeWidth={0.5 / scale}
            listening={false}
          />
        )}
      </Group>
    );
  }

  // Line rendering
  if (geometryType === 'line' || geometryType === 'LineString') {
    // Handle both modern geometry format and legacy points format
    const coords: number[][] = Array.isArray(spot.geometry?.coordinates)
      ? (spot.geometry.coordinates as number[][])
      : spot.points?.map((p) => [p.X ?? p.x ?? 0, p.Y ?? p.y ?? 0]) || [];

    const points: number[] = coords.flat();

    if (points.length < 4) return null; // Need at least 2 points

    return (
      <Group
        name={`spot-${spot.id}`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Selection indicator */}
        {isSelected && (
          <Line
            key="selection"
            points={points}
            stroke="#ffff00"
            strokeWidth={5 / scale}
            dash={[5, 5]}
            listening={false}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {/* Line */}
        <Line
          key="line"
          points={points}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          listening={true}
          lineCap="round"
          lineJoin="round"
          hitStrokeWidth={10 / scale} // Wider hit area for easier clicking
        />

        {/* Label at first point */}
        {showLabel && coords[0] && (
          <Text
            key="label"
            x={coords[0][0]}
            y={coords[0][1] - 12 / scale}
            text={spot.name}
            fontSize={12 / scale}
            fill={labelColor}
            stroke="#000000"
            strokeWidth={0.5 / scale}
            listening={false}
          />
        )}
      </Group>
    );
  }

  // Polygon rendering
  if (geometryType === 'polygon' || geometryType === 'Polygon') {
    // Handle both modern geometry format (coordinates is array of rings) and legacy points format
    const coords: number[][] = Array.isArray(spot.geometry?.coordinates)
      ? ((spot.geometry.coordinates as number[][][])[0] || [])
      : spot.points?.map((p) => [p.X ?? p.x ?? 0, p.Y ?? p.y ?? 0]) || [];

    const points: number[] = coords.flat();

    if (points.length < 6) return null; // Need at least 3 points

    return (
      <Group
        name={`spot-${spot.id}`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Selection indicator */}
        {isSelected && (
          <Line
            key="selection"
            points={points}
            stroke="#ffff00"
            strokeWidth={5 / scale}
            dash={[5, 5]}
            closed={true}
            listening={false}
          />
        )}

        {/* Polygon */}
        <Line
          key="polygon"
          points={points}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          fill={color}
          opacity={opacity}
          closed={true}
          listening={true}
        />

        {/* Label at first point */}
        {showLabel && coords[0] && (
          <Text
            key="label"
            x={coords[0][0]}
            y={coords[0][1] - 12 / scale}
            text={spot.name}
            fontSize={12 / scale}
            fill={labelColor}
            stroke="#000000"
            strokeWidth={0.5 / scale}
            listening={false}
          />
        )}
      </Group>
    );
  }

  return null;
};
