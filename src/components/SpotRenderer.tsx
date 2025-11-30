/**
 * SpotRenderer Component
 *
 * Renders individual spots (point/line/polygon annotations) on the Konva canvas.
 * Handles visual representation including colors, labels, opacity, and selection states.
 */

import { useState, useEffect } from 'react';
import { Circle, Line, Group, Text, Rect } from 'react-konva';
import { Spot } from '@/types/project-types';
import { useAppStore } from '@/store';

/**
 * Convert legacy color format (0xRRGGBBAA) to web format (#RRGGBB)
 */
function convertLegacyColor(color: string): string {
  if (!color) return '#00ff00';

  // If it's already in web format, return as-is
  if (color.startsWith('#')) return color;

  // Convert 0xRRGGBBAA to #RRGGBB
  if (color.startsWith('0x')) {
    const hex = color.slice(2); // Remove '0x'
    const rgb = hex.slice(0, 6); // Take first 6 chars (ignore alpha)
    return '#' + rgb;
  }

  return color; // Return as-is if unknown format
}

interface SpotRendererProps {
  spot: Spot;
  scale: number; // Current zoom level for size scaling
  isSelected?: boolean;
  onClick?: (spot: Spot) => void;
  onContextMenu?: (spot: Spot, x: number, y: number) => void;
  renderLabelsOnly?: boolean; // If true, only render labels (for layering)
}

export const SpotRenderer: React.FC<SpotRendererProps> = ({
  spot,
  scale,
  isSelected = false,
  onClick,
  onContextMenu,
  renderLabelsOnly = false,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const editingSpotId = useAppStore((state) => state.editingSpotId);

  // Clear hover state when spot becomes selected
  // IMPORTANT: This must be BEFORE any conditional returns (React hooks rules)
  useEffect(() => {
    if (isSelected) {
      setIsHovered(false);
    }
  }, [isSelected]);

  const isEditing = editingSpotId === spot.id;

  // Hide the React-rendered spot when in imperative edit mode
  // The imperative editing hook will render the spot on the overlay layer instead
  if (isEditing) return null;

  if (!spot.geometryType && !spot.geometry) return null;

  const geometryType = spot.geometryType || spot.geometry?.type;
  const color = convertLegacyColor(spot.color || '#00ff00');
  const labelColor = convertLegacyColor(spot.labelColor || '#ffffff');
  const showLabel = spot.showLabel ?? true;
  const opacity = (spot.opacity ?? 50) / 100; // Convert 0-100 to 0-1

  // Don't show hover effect when spot is selected
  const strokeColor = (isHovered && !isSelected) ? '#ffff00' : color;
  const strokeWidth = (isHovered && !isSelected) ? 4 / scale : 3 / scale;

  const handleClick = () => {
    onClick?.(spot);
  };

  const handleContextMenu = (e: any) => {
    e.evt.preventDefault();
    e.cancelBubble = true;
    onContextMenu?.(spot, e.evt.clientX, e.evt.clientY);
  };

  const handleMouseEnter = (e: any) => {
    // Don't set hover state when spot is selected
    if (!isSelected) {
      setIsHovered(true);
    }
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
      : spot.points?.[0]?.X ?? 0;
    const y = Array.isArray(spot.geometry?.coordinates)
      ? (spot.geometry.coordinates as number[])[1]
      : spot.points?.[0]?.Y ?? 0;

    // If rendering labels only, skip the shape
    if (renderLabelsOnly) {
      return showLabel ? (
        <Group name={`spot-${spot.id}-label`}>
          {/* Label background box */}
          <Rect
            key="label-bg"
            x={x + 8 / scale}
            y={y + 8 / scale}
            width={(spot.name.length * 8.5 + 8) / scale}
            height={22 / scale}
            fill="#000000"
            opacity={0.7}
            cornerRadius={3 / scale}
            listening={false}
          />
          {/* Label text */}
          <Text
            key="label"
            x={x + 12 / scale}
            y={y + 11 / scale}
            text={spot.name}
            fontSize={16 / scale}
            fontStyle="bold"
            fill={labelColor}
            listening={false}
          />
        </Group>
      ) : null;
    }

    // Rendering shapes only (skip labels)
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
            stroke="#ff0000"
            strokeWidth={3 / scale}
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
      </Group>
    );
  }

  // Line rendering
  if (geometryType === 'line' || geometryType === 'LineString') {
    // Handle both modern geometry format and legacy points format
    const coords: number[][] = Array.isArray(spot.geometry?.coordinates)
      ? (spot.geometry.coordinates as number[][])
      : spot.points?.map((p) => [p.X ?? 0, p.Y ?? 0]) || [];

    const points: number[] = coords.flat();

    if (points.length < 4) return null; // Need at least 2 points

    // If rendering labels only, skip the shape
    if (renderLabelsOnly) {
      return showLabel && coords[0] ? (
        <Group name={`spot-${spot.id}-label`}>
          {/* Label background box */}
          <Rect
            key="label-bg"
            x={coords[0][0] + 8 / scale}
            y={coords[0][1] + 8 / scale}
            width={(spot.name.length * 8.5 + 8) / scale}
            height={22 / scale}
            fill="#000000"
            opacity={0.7}
            cornerRadius={3 / scale}
            listening={false}
          />
          {/* Label text */}
          <Text
            key="label"
            x={coords[0][0] + 12 / scale}
            y={coords[0][1] + 11 / scale}
            text={spot.name}
            fontSize={16 / scale}
            fontStyle="bold"
            fill={labelColor}
            listening={false}
          />
        </Group>
      ) : null;
    }

    // Rendering shapes only (skip labels)
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
            stroke="#ff0000"
            strokeWidth={5 / scale}
            listening={false}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {/* Line */}
        <Line
          key="line"
          points={points}
          stroke={isSelected ? 'transparent' : strokeColor}
          strokeWidth={isSelected ? 0 : strokeWidth}
          listening={true}
          lineCap="round"
          lineJoin="round"
          hitStrokeWidth={10 / scale} // Wider hit area for easier clicking
        />
      </Group>
    );
  }

  // Polygon rendering
  if (geometryType === 'polygon' || geometryType === 'Polygon') {
    // Handle both modern geometry format (coordinates is array of rings) and legacy points format
    const coords: number[][] = Array.isArray(spot.geometry?.coordinates)
      ? ((spot.geometry.coordinates as number[][][])[0] || [])
      : spot.points?.map((p) => [p.X ?? 0, p.Y ?? 0]) || [];

    const points: number[] = coords.flat();

    if (points.length < 6) return null; // Need at least 3 points

    // If rendering labels only, skip the shape
    if (renderLabelsOnly) {
      return showLabel && coords[0] ? (
        <Group name={`spot-${spot.id}-label`}>
          {/* Label background box */}
          <Rect
            key="label-bg"
            x={coords[0][0] + 8 / scale}
            y={coords[0][1] + 8 / scale}
            width={(spot.name.length * 8.5 + 8) / scale}
            height={22 / scale}
            fill="#000000"
            opacity={0.7}
            cornerRadius={3 / scale}
            listening={false}
          />
          {/* Label text */}
          <Text
            key="label"
            x={coords[0][0] + 12 / scale}
            y={coords[0][1] + 11 / scale}
            text={spot.name}
            fontSize={16 / scale}
            fontStyle="bold"
            fill={labelColor}
            listening={false}
          />
        </Group>
      ) : null;
    }

    // Rendering shapes only (skip labels)
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
            stroke="#ff0000"
            strokeWidth={5 / scale}
            closed={true}
            listening={false}
          />
        )}

        {/* Polygon */}
        <Line
          key="polygon"
          points={points}
          stroke={isSelected ? 'transparent' : strokeColor}
          strokeWidth={isSelected ? 0 : strokeWidth}
          fill={color}
          opacity={opacity}
          closed={true}
          listening={true}
        />
      </Group>
    );
  }

  return null;
};
