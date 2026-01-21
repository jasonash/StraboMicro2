/**
 * SpotRenderer Component
 *
 * Renders individual spots (point/line/polygon annotations) on the Konva canvas.
 * Handles visual representation including colors, labels, opacity, and selection states.
 */

import { useState, useEffect, useMemo } from 'react';
import { Circle, Line, Group, Text, Rect, Arc } from 'react-konva';
import { Spot } from '@/types/project-types';
import { useAppStore } from '@/store';
import type { QuickApplyPreset } from '@/types/preset-types';

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
  onClick?: (spot: Spot, event: any) => void;
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
  const activeTool = useAppStore((state) => state.activeTool);

  // Quick Edit mode state
  const quickEditMode = useAppStore((state) => state.quickEditMode);
  const quickEditSpotIds = useAppStore((state) => state.quickEditSpotIds);
  const quickEditCurrentIndex = useAppStore((state) => state.quickEditCurrentIndex);

  // Split mode state
  const splitModeSpotId = useAppStore((state) => state.splitModeSpotId);

  // Quick Spot Presets - get applied preset data for pie chart indicator
  const globalPresets = useAppStore((state) => state.globalPresets);
  const projectPresets = useAppStore((state) => state.project?.presets);

  // Get the colors of applied presets for pie chart indicator
  const appliedPresetColors = useMemo(() => {
    if (!spot.appliedPresetIds || spot.appliedPresetIds.length === 0) {
      return [];
    }

    // Build a map of all presets (global + project)
    const presetMap = new Map<string, QuickApplyPreset>();
    for (const preset of globalPresets) {
      presetMap.set(preset.id, preset);
    }
    for (const preset of projectPresets || []) {
      presetMap.set(preset.id, preset);
    }

    // Get colors for each applied preset ID
    const colors: string[] = [];
    for (const presetId of spot.appliedPresetIds) {
      const preset = presetMap.get(presetId);
      if (preset) {
        colors.push(preset.color);
      }
    }
    return colors;
  }, [spot.appliedPresetIds, globalPresets, projectPresets]);

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
  const baseColor = convertLegacyColor(spot.color || '#00ff00');
  const labelColor = convertLegacyColor(spot.labelColor || '#ffffff');
  const showLabel = spot.showLabel ?? true;
  const baseOpacity = (spot.opacity ?? 50) / 100; // Convert 0-100 to 0-1

  // Check if spot has mineralogy classification
  const isClassified = !!(spot.mineralogy?.minerals?.[0]?.name);

  // Quick Edit mode visual states
  const isInQuickEditSession = quickEditMode && quickEditSpotIds.includes(spot.id);
  const isCurrentQuickEditSpot = quickEditMode && quickEditSpotIds[quickEditCurrentIndex] === spot.id;

  // Determine colors based on mode
  let color = baseColor;
  let opacity = baseOpacity;
  let fillOpacity = baseOpacity;

  if (quickEditMode) {
    if (isInQuickEditSession) {
      // In Quick Edit session - use outline style
      fillOpacity = 0; // No fill

      if (isClassified) {
        // Classified spots get bright green outline
        color = '#00ff00'; // Lime green (bright)
      } else {
        // Unclassified spots get cyan outline (visible on both light and dark backgrounds)
        color = '#00ffff'; // Cyan
      }

      if (isCurrentQuickEditSpot) {
        // Current spot gets gold highlight
        color = '#ffd700'; // Gold
      }
    } else {
      // Spots not in Quick Edit session - dim them
      opacity = 0.2;
      fillOpacity = 0.1;
    }
  }

  // Don't show hover effect when spot is selected
  const strokeColor = (isHovered && !isSelected) ? '#ffff00' : color;
  const strokeWidth = isCurrentQuickEditSpot
    ? 5 / scale  // Thicker for current Quick Edit spot
    : (isHovered && !isSelected) ? 4 / scale : 3 / scale;

  const handleClick = (e: any) => {
    onClick?.(spot, e);
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
    // Don't change cursor if a drawing/measure tool or split mode is active
    if (activeTool || splitModeSpotId) return;
    const container = e.target.getStage()?.container();
    if (container) {
      container.style.cursor = 'pointer';
    }
  };

  const handleMouseLeave = (e: any) => {
    setIsHovered(false);
    // Don't change cursor if a drawing/measure tool or split mode is active
    if (activeTool || splitModeSpotId) return;
    const container = e.target.getStage()?.container();
    if (container) {
      container.style.cursor = 'default';
    }
  };

  /**
   * Render a small pie chart indicator showing applied preset colors.
   * @param centerX - X coordinate for the pie chart center
   * @param centerY - Y coordinate for the pie chart center
   * @param offset - Offset from the spot position (optional)
   */
  const renderPresetIndicator = (centerX: number, centerY: number, offset: { x: number; y: number } = { x: 0, y: 0 }) => {
    if (appliedPresetColors.length === 0) return null;

    const indicatorRadius = 8 / scale;
    const x = centerX + offset.x / scale;
    const y = centerY + offset.y / scale;

    // If only one preset, render a solid circle
    if (appliedPresetColors.length === 1) {
      return (
        <Circle
          key="preset-indicator"
          x={x}
          y={y}
          radius={indicatorRadius}
          fill={appliedPresetColors[0]}
          stroke="#ffffff"
          strokeWidth={1.5 / scale}
          listening={false}
        />
      );
    }

    // Multiple presets - render pie chart
    const anglePerPreset = 360 / appliedPresetColors.length;
    return (
      <Group key="preset-indicator">
        {/* White background circle */}
        <Circle
          x={x}
          y={y}
          radius={indicatorRadius}
          fill="#ffffff"
          listening={false}
        />
        {/* Pie slices */}
        {appliedPresetColors.map((color, index) => (
          <Arc
            key={`slice-${index}`}
            x={x}
            y={y}
            innerRadius={0}
            outerRadius={indicatorRadius}
            angle={anglePerPreset}
            rotation={index * anglePerPreset - 90} // Start from top
            fill={color}
            listening={false}
          />
        ))}
        {/* White border */}
        <Circle
          x={x}
          y={y}
          radius={indicatorRadius}
          stroke="#ffffff"
          strokeWidth={1.5 / scale}
          listening={false}
        />
      </Group>
    );
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

        {/* Circle: always filled with spot color */}
        {/* In Quick Edit mode: different colors based on state */}
        <Circle
          key="point"
          x={x}
          y={y}
          radius={(isCurrentQuickEditSpot ? 8 : 6) / scale}
          fill={quickEditMode ? (fillOpacity === 0 ? 'transparent' : color) : color}
          opacity={quickEditMode ? opacity : baseOpacity}
          stroke={quickEditMode ? strokeColor : '#ffffff'}
          strokeWidth={(isCurrentQuickEditSpot ? 3 : 2) / scale}
        />

        {/* Applied preset indicator (pie chart) - only show in Quick Edit mode */}
        {quickEditMode && renderPresetIndicator(x, y, { x: 12, y: -12 })}
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

        {/* Line: solid if classified, dashed if unclassified */}
        <Line
          key="line"
          points={points}
          stroke={isSelected ? 'transparent' : strokeColor}
          strokeWidth={isSelected ? 0 : strokeWidth}
          dash={isClassified ? undefined : [8 / scale, 4 / scale]}
          opacity={opacity}
          listening={true}
          lineCap="round"
          lineJoin="round"
          hitStrokeWidth={10 / scale} // Wider hit area for easier clicking
        />

        {/* Applied preset indicator (pie chart) at line start - only show in Quick Edit mode */}
        {quickEditMode && coords[0] && renderPresetIndicator(coords[0][0], coords[0][1], { x: 12, y: -12 })}
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

        {/* Polygon: solid fill if classified, faded with dashed stroke if unclassified */}
        {/* In Quick Edit mode: no fill, outline only */}
        <Line
          key="polygon"
          points={points}
          stroke={isSelected ? 'transparent' : strokeColor}
          strokeWidth={isSelected ? 0 : strokeWidth}
          dash={quickEditMode ? undefined : (isClassified ? undefined : [8 / scale, 4 / scale])}
          fill={fillOpacity === 0 ? 'transparent' : color}
          opacity={opacity}
          closed={true}
          listening={true}
        />

        {/* Applied preset indicator (pie chart) - position at polygon centroid - only show in Quick Edit mode */}
        {quickEditMode && coords.length > 0 && (() => {
          // Calculate centroid of polygon
          const xs = coords.map(c => c[0]);
          const ys = coords.map(c => c[1]);
          const centroidX = xs.reduce((a, b) => a + b, 0) / xs.length;
          const centroidY = ys.reduce((a, b) => a + b, 0) / ys.length;
          return renderPresetIndicator(centroidX, centroidY, { x: 0, y: 0 });
        })()}
      </Group>
    );
  }

  return null;
};
