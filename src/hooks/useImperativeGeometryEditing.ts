/**
 * useImperativeGeometryEditing Hook
 *
 * Handles geometry editing using pure imperative Konva API (no React components).
 * Based on the test app's approach to avoid React/Konva rendering conflicts.
 *
 * When editing:
 * 1. Original React-rendered spot is hidden
 * 2. Temporary polygon and handles are created imperatively on overlay layer
 * 3. All updates happen via direct Konva manipulation (no React re-renders)
 * 4. On save/cancel, imperative elements are destroyed and React spot is shown again
 */

import { useCallback, useRef } from 'react';
import Konva from 'konva';
import { useAppStore } from '@/store';
import { Spot } from '@/types/project-types';

interface GeometryEditingRefs {
  layerRef: React.RefObject<any>;
  stageRef: React.RefObject<any>;
}

export const useImperativeGeometryEditing = (refs: GeometryEditingRefs) => {
  // Refs for imperative Konva elements
  const editingPolygonRef = useRef<Konva.Line | null>(null);
  const vertexCirclesRef = useRef<Konva.Circle[]>([]);
  const midpointCirclesRef = useRef<Konva.Circle[]>([]);
  const originalGeometryRef = useRef<Array<{ X: number; Y: number }> | null>(null);
  const editingSpotIdRef = useRef<string | null>(null);

  // Store actions
  const startEditingSpot = useAppStore((state) => state.startEditingSpot);
  const updateEditingGeometry = useAppStore((state) => state.updateEditingGeometry);
  const saveEditingGeometry = useAppStore((state) => state.saveEditingGeometry);
  const cancelEditingGeometry = useAppStore((state) => state.cancelEditingGeometry);

  /**
   * Update vertex and midpoint handles
   */
  const updateEditHandles = useCallback((polygon: Konva.Line, geometryType: string) => {
    const overlayLayer = refs.layerRef.current;
    const stage = refs.stageRef.current?.getStage?.();
    if (!overlayLayer || !stage) return;

    // Clear existing handles
    vertexCirclesRef.current.forEach(circle => {
      circle.off('dragmove');
      circle.off('dragend');
      circle.destroy();
    });
    midpointCirclesRef.current.forEach(circle => {
      circle.off('dragstart');
      circle.off('dragmove');
      circle.off('dragend');
      circle.destroy();
    });

    const points = polygon.points();
    const polygonX = polygon.x();
    const polygonY = polygon.y();
    const scale = stage.scaleX();

    // Create draggable vertex circles
    const vertexCircles: Konva.Circle[] = [];
    for (let i = 0; i < points.length; i += 2) {
      const circle = new Konva.Circle({
        x: polygonX + points[i],
        y: polygonY + points[i + 1],
        radius: 6 / scale,
        fill: '#ff9900',
        stroke: '#ffffff',
        strokeWidth: 2 / scale,
        draggable: true,
        listening: true,
      });

      circle.setAttr('vertexIndex', i);

      // Prevent stage dragging during vertex drag
      circle.on('dragstart', (e) => {
        e.cancelBubble = true;
      });

      // Update polygon on vertex drag
      circle.on('dragmove', (e) => {
        e.cancelBubble = true;
        const vertexIndex = circle.getAttr('vertexIndex');
        const newPoints = polygon.points().slice();
        newPoints[vertexIndex] = circle.x() - polygon.x();
        newPoints[vertexIndex + 1] = circle.y() - polygon.y();
        polygon.points(newPoints);

        // Update adjacent midpoint circles
        const numPoints = newPoints.length;

        // Update midpoint before this vertex
        const prevVertexIndex = vertexIndex === 0 ? numPoints - 2 : vertexIndex - 2;
        const midpointBefore = midpointCirclesRef.current.find(
          mc => mc.getAttr('edgeStartIndex') === prevVertexIndex && !mc.getAttr('isConverted')
        );
        if (midpointBefore) {
          const midX = polygon.x() + (newPoints[prevVertexIndex] + newPoints[vertexIndex]) / 2;
          const midY = polygon.y() + (newPoints[prevVertexIndex + 1] + newPoints[vertexIndex + 1]) / 2;
          midpointBefore.x(midX);
          midpointBefore.y(midY);
        }

        // Update midpoint after this vertex
        const midpointAfter = midpointCirclesRef.current.find(
          mc => mc.getAttr('edgeStartIndex') === vertexIndex && !mc.getAttr('isConverted')
        );
        if (midpointAfter) {
          const nextVertexIndex = (vertexIndex + 2) % numPoints;
          const midX = polygon.x() + (newPoints[vertexIndex] + newPoints[nextVertexIndex]) / 2;
          const midY = polygon.y() + (newPoints[vertexIndex + 1] + newPoints[nextVertexIndex + 1]) / 2;
          midpointAfter.x(midX);
          midpointAfter.y(midY);
        }

        overlayLayer?.batchDraw();
      });

      // Recreate handles after drag end
      circle.on('dragend', (e) => {
        e.cancelBubble = true;
        updateEditHandles(polygon, geometryType);
      });

      vertexCircles.push(circle);
      overlayLayer.add(circle);
    }

    // Create midpoint circles for adding vertices
    const midpointCircles: Konva.Circle[] = [];
    for (let i = 0; i < points.length; i += 2) {
      const nextIndex = (i + 2) % points.length;

      // For lines (not closed), don't add midpoint after last vertex
      if (geometryType === 'line' && nextIndex === 0) continue;

      const midX = polygonX + (points[i] + points[nextIndex]) / 2;
      const midY = polygonY + (points[i + 1] + points[nextIndex + 1]) / 2;

      const midCircle = new Konva.Circle({
        x: midX,
        y: midY,
        radius: 4 / scale,
        fill: 'rgba(255, 153, 0, 0.5)',
        stroke: '#ffffff',
        strokeWidth: 1 / scale,
        draggable: true,
        listening: true,
      });

      midCircle.setAttr('edgeStartIndex', i);
      midCircle.setAttr('isConverted', false);

      // Convert midpoint to vertex on drag start
      midCircle.on('dragstart', (e) => {
        e.cancelBubble = true;
        const edgeStartIndex = midCircle.getAttr('edgeStartIndex');
        const newPoints = polygon.points().slice();

        // Insert new vertex at midpoint position
        const newX = midCircle.x() - polygon.x();
        const newY = midCircle.y() - polygon.y();
        newPoints.splice(edgeStartIndex + 2, 0, newX, newY);

        polygon.points(newPoints);

        // Mark as converted and update appearance
        midCircle.setAttr('isConverted', true);
        midCircle.setAttr('vertexIndex', edgeStartIndex + 2);
        midCircle.fill('#ff9900');
        midCircle.opacity(1);
        midCircle.radius(6 / stage.scaleX());
        midCircle.strokeWidth(2 / stage.scaleX());
      });

      // Update polygon as new vertex is dragged
      midCircle.on('dragmove', (e) => {
        e.cancelBubble = true;
        if (midCircle.getAttr('isConverted')) {
          const vertexIndex = midCircle.getAttr('vertexIndex');
          const newPoints = polygon.points().slice();
          newPoints[vertexIndex] = midCircle.x() - polygon.x();
          newPoints[vertexIndex + 1] = midCircle.y() - polygon.y();
          polygon.points(newPoints);
          overlayLayer?.batchDraw();
        }
      });

      // Recreate handles when drag ends
      midCircle.on('dragend', (e) => {
        e.cancelBubble = true;
        if (midCircle.getAttr('isConverted')) {
          updateEditHandles(polygon, geometryType);
        }
      });

      midpointCircles.push(midCircle);
      overlayLayer.add(midCircle);
    }

    vertexCirclesRef.current = vertexCircles;
    midpointCirclesRef.current = midpointCircles;
    overlayLayer.batchDraw();
  }, [refs]);

  /**
   * Enter edit mode for a spot
   */
  const enterEditMode = useCallback((spot: Spot) => {
    const overlayLayer = refs.layerRef.current;
    const stage = refs.stageRef.current?.getStage?.();
    if (!overlayLayer || !stage) {
      console.error('Cannot enter edit mode: overlay layer or stage not ready');
      return;
    }

    console.log('Entering imperative edit mode for spot:', spot.name);

    // Store original geometry for cancel
    const geometry = spot.points?.map((p) => ({ X: p.X ?? p.x ?? 0, Y: p.Y ?? p.y ?? 0 })) || [];
    originalGeometryRef.current = [...geometry];
    editingSpotIdRef.current = spot.id;

    // Initialize editing state in store
    startEditingSpot(spot.id, geometry);

    // Determine geometry type
    const geometryType = spot.geometryType || spot.geometry?.type || 'polygon';
    const isPoint = geometryType === 'point' || geometryType === 'Point';
    const isClosed = geometryType === 'polygon' || geometryType === 'Polygon';

    const scale = stage.scaleX();

    // Handle point editing differently - just a draggable circle
    if (isPoint && geometry.length > 0) {
      const point = geometry[0];
      const circle = new Konva.Circle({
        x: point.X,
        y: point.Y,
        radius: 6 / scale, // Same size as vertex handles
        fill: '#ff9900', // Orange to indicate editing
        stroke: '#ffffff',
        strokeWidth: 2 / scale,
        draggable: true,
        listening: true,
      });

      // Prevent stage dragging
      circle.on('dragstart', (e) => {
        e.cancelBubble = true;
      });

      circle.on('dragmove', (e) => {
        e.cancelBubble = true;
      });

      circle.on('dragend', (e) => {
        e.cancelBubble = true;
      });

      editingPolygonRef.current = circle as any; // Store as polygon ref for cleanup
      overlayLayer.add(circle);
      overlayLayer.batchDraw();
      return; // Don't create handles for points
    }

    // Convert geometry to flat points array for lines/polygons
    const points: number[] = [];
    geometry.forEach(p => {
      points.push(p.X, p.Y);
    });

    // Create the temporary editing polygon/line imperatively
    const polygon = new Konva.Line({
      points: points,
      stroke: '#ff9900', // Orange to indicate editing
      strokeWidth: 3 / scale,
      fill: isClosed ? spot.color || '#00ff00' : undefined,
      opacity: isClosed ? ((spot.opacity ?? 50) / 100) : undefined,
      closed: isClosed,
      listening: true,
      draggable: true, // Allow dragging the whole shape
    });

    // Make polygon draggable to move entire shape
    polygon.on('dragstart', (e) => {
      e.cancelBubble = true;
    });

    polygon.on('dragmove', (e) => {
      e.cancelBubble = true;
      updateEditHandles(polygon, geometryType);
    });

    polygon.on('dragend', (e) => {
      e.cancelBubble = true;
    });

    editingPolygonRef.current = polygon;
    overlayLayer.add(polygon);

    // Create editing handles for lines/polygons
    updateEditHandles(polygon, geometryType);

    // Note: The React-rendered spot should be hidden via the `isEditing` prop in SpotRenderer
  }, [refs, startEditingSpot, updateEditHandles]);

  /**
   * Clean up all imperative editing elements
   */
  const cleanupEditMode = useCallback(() => {
    // Destroy polygon
    if (editingPolygonRef.current) {
      editingPolygonRef.current.off('dragmove');
      editingPolygonRef.current.destroy();
      editingPolygonRef.current = null;
    }

    // Destroy vertex circles
    vertexCirclesRef.current.forEach(circle => {
      circle.off('dragmove');
      circle.off('dragend');
      circle.destroy();
    });
    vertexCirclesRef.current = [];

    // Destroy midpoint circles
    midpointCirclesRef.current.forEach(circle => {
      circle.off('dragstart');
      circle.off('dragmove');
      circle.off('dragend');
      circle.destroy();
    });
    midpointCirclesRef.current = [];

    // Clear refs
    originalGeometryRef.current = null;
    editingSpotIdRef.current = null;

    // Redraw overlay
    refs.layerRef.current?.batchDraw();

    console.log('Imperative edit mode cleaned up');
  }, [refs]);

  /**
   * Save editing changes
   */
  const saveEdits = useCallback(() => {
    if (!editingPolygonRef.current || !editingSpotIdRef.current) return;

    console.log('Saving imperative edits');

    const shape = editingPolygonRef.current;
    let newGeometry: Array<{ X: number; Y: number }> = [];

    // Check if it's a Circle (point) or Line (polygon/line)
    if (shape instanceof Konva.Circle) {
      // For points, just get the circle's position
      newGeometry = [{
        X: shape.x(),
        Y: shape.y(),
      }];
    } else {
      // For polygons/lines, get points from the Line shape
      const points = shape.points();
      const shapeX = shape.x();
      const shapeY = shape.y();

      // Convert to geometry format
      for (let i = 0; i < points.length; i += 2) {
        newGeometry.push({
          X: points[i] + shapeX,
          Y: points[i + 1] + shapeY,
        });
      }
    }

    // Update the editing geometry in store
    updateEditingGeometry(newGeometry);

    // Save to spot (this will update the React spot)
    saveEditingGeometry();

    // Clean up imperative elements
    cleanupEditMode();
  }, [updateEditingGeometry, saveEditingGeometry, cleanupEditMode]);

  /**
   * Cancel editing changes
   */
  const cancelEdits = useCallback(() => {
    console.log('Canceling imperative edits');

    // Just clean up without saving
    cancelEditingGeometry();
    cleanupEditMode();
  }, [cancelEditingGeometry, cleanupEditMode]);

  /**
   * Update handle sizes when zoom changes
   */
  const updateHandleSizes = useCallback((newScale: number) => {
    if (!editingPolygonRef.current) return;

    const shape = editingPolygonRef.current;

    // Check if it's a Circle (point) or Line (polygon/line)
    if (shape instanceof Konva.Circle) {
      // For points, update the circle's size (same as vertex handles)
      shape.radius(6 / newScale);
      shape.strokeWidth(2 / newScale);
    } else {
      // For polygons/lines, update stroke width
      shape.strokeWidth(3 / newScale);

      // Update vertex circles
      vertexCirclesRef.current.forEach(circle => {
        circle.radius(6 / newScale);
        circle.strokeWidth(2 / newScale);
      });

      // Update midpoint circles
      midpointCirclesRef.current.forEach(circle => {
        if (circle.getAttr('isConverted')) {
          circle.radius(6 / newScale);
          circle.strokeWidth(2 / newScale);
        } else {
          circle.radius(4 / newScale);
          circle.strokeWidth(1 / newScale);
        }
      });
    }

    refs.layerRef.current?.batchDraw();
  }, [refs]);

  return {
    enterEditMode,
    saveEdits,
    cancelEdits,
    cleanupEditMode,
    updateHandleSizes,
    isEditing: () => editingSpotIdRef.current !== null,
    getEditingSpotId: () => editingSpotIdRef.current,
  };
};
