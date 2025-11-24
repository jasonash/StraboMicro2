/**
 * SpotEditingHandles Component
 *
 * Renders vertex and midpoint handles for editing line/polygon geometry.
 * Implements the same editing pattern as the test app:
 * - Vertex circles: Draggable handles at each vertex
 * - Midpoint circles: Semi-transparent handles between vertices that convert to new vertices when dragged
 */

import { Circle } from 'react-konva';
import { useState, useCallback, useEffect } from 'react';
import { useAppStore } from '@/store';
import Konva from 'konva';

interface SpotEditingHandlesProps {
  points: Array<{ X: number; Y: number }>;
  geometryType: string;
  scale: number;
  spotX?: number; // For grouped spots
  spotY?: number; // For grouped spots
  shapeRef?: React.RefObject<Konva.Line>; // Reference to the Line/Polygon shape
}

export const SpotEditingHandles: React.FC<SpotEditingHandlesProps> = ({
  points: initialPoints,
  geometryType,
  scale,
  spotX = 0,
  spotY = 0,
  shapeRef,
}) => {
  const [convertedMidpoints, setConvertedMidpoints] = useState<Set<number>>(new Set());
  const [localPoints, setLocalPoints] = useState(initialPoints);
  const updateEditingGeometry = useAppStore((state) => state.updateEditingGeometry);

  // Sync local points when initial points change (from external updates)
  useEffect(() => {
    setLocalPoints(initialPoints);
  }, [initialPoints]);

  // Update the shape ref when localPoints change (for visual feedback during dragging)
  useEffect(() => {
    if (!shapeRef?.current) return;

    // Convert localPoints to flat array format for Konva
    const flatPoints: number[] = [];
    localPoints.forEach(p => {
      flatPoints.push(p.X, p.Y);
    });

    // Update the shape's points
    shapeRef.current.points(flatPoints);
    shapeRef.current.getLayer()?.batchDraw();
  }, [localPoints, shapeRef]);

  // Handle vertex drag move - update local state only
  const handleVertexDragMove = useCallback((index: number, e: any) => {
    const newX = e.target.x() - spotX;
    const newY = e.target.y() - spotY;

    setLocalPoints(prev => {
      const newPoints = [...prev];
      newPoints[index] = { X: newX, Y: newY };
      return newPoints;
    });
  }, [spotX, spotY]);

  // Handle vertex drag end - update store with final geometry
  const handleVertexDragEnd = useCallback(() => {
    // Update the store with the final positions
    updateEditingGeometry(localPoints);
  }, [localPoints, updateEditingGeometry]);

  // Handle midpoint drag start - convert to vertex immediately
  const handleMidpointDragStart = useCallback((edgeStartIndex: number, e: any) => {
    const midX = e.target.x() - spotX;
    const midY = e.target.y() - spotY;

    setLocalPoints(prev => {
      const newPoints = [...prev];
      // Insert new vertex after the edge start vertex
      newPoints.splice(edgeStartIndex + 1, 0, { X: midX, Y: midY });
      return newPoints;
    });

    // Mark this midpoint as converted
    setConvertedMidpoints(prev => new Set(prev).add(edgeStartIndex));
  }, [spotX, spotY]);

  // Handle midpoint drag move - update the newly created vertex
  const handleMidpointDragMove = useCallback((edgeStartIndex: number, e: any) => {
    const newX = e.target.x() - spotX;
    const newY = e.target.y() - spotY;

    setLocalPoints(prev => {
      const newPoints = [...prev];
      // The new vertex is at edgeStartIndex + 1
      if (edgeStartIndex + 1 < newPoints.length) {
        newPoints[edgeStartIndex + 1] = { X: newX, Y: newY };
      }
      return newPoints;
    });
  }, [spotX, spotY]);

  // Handle midpoint drag end - clear converted state
  const handleMidpointDragEnd = useCallback(() => {
    // Clear converted state so handles can be recreated properly
    setConvertedMidpoints(new Set());
  }, []);

  return (
    <>
      {/* Vertex circles */}
      {localPoints.map((point, index) => (
        <Circle
          key={`vertex-${index}`}
          x={spotX + point.X}
          y={spotY + point.Y}
          radius={6 / scale}
          fill="#ff9900"
          stroke="#ffffff"
          strokeWidth={2 / scale}
          draggable
          onDragMove={(e) => handleVertexDragMove(index, e)}
          onDragEnd={handleVertexDragEnd}
        />
      ))}

      {/* Midpoint circles for adding vertices (not shown for converted midpoints) */}
      {localPoints.map((point, index) => {
        // Skip if this is a converted midpoint
        if (convertedMidpoints.has(index)) return null;

        const nextIndex = (index + 1) % localPoints.length;
        // For lines (not closed), don't add midpoint after last vertex
        if (geometryType === 'line' && nextIndex === 0) return null;

        const nextPoint = localPoints[nextIndex];
        const midX = spotX + (point.X + nextPoint.X) / 2;
        const midY = spotY + (point.Y + nextPoint.Y) / 2;

        return (
          <Circle
            key={`midpoint-${index}`}
            x={midX}
            y={midY}
            radius={4 / scale}
            fill="rgba(255, 153, 0, 0.5)"
            stroke="#ffffff"
            strokeWidth={1 / scale}
            draggable
            onDragStart={(e) => handleMidpointDragStart(index, e)}
            onDragMove={(e) => handleMidpointDragMove(index, e)}
            onDragEnd={handleMidpointDragEnd}
          />
        );
      })}
    </>
  );
};
