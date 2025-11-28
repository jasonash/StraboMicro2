/**
 * usePolygonDrawing Hook
 *
 * Handles polygon drawing interaction logic.
 * Based on ElectronTest implementation with the following features:
 * - Click to add vertices
 * - Preview line shows closed polygon shape while drawing
 * - Double-click to finish (500ms threshold)
 * - Stroke width scales with zoom
 */

import { useRef, useCallback } from 'react';
import Konva from 'konva';

interface PolygonDrawingState {
  currentPolygon: Konva.Line | null;
  previewLine: Konva.Line | null;
  currentPoints: number[];
  lastClickTime: number;
}

interface UsePolygonDrawingOptions {
  layer: Konva.Layer | null;
  scale: number;
  onComplete: (points: number[]) => void;
}

const DOUBLE_CLICK_THRESHOLD = 500; // 500ms threshold for double-click

export const usePolygonDrawing = ({ layer, scale, onComplete }: UsePolygonDrawingOptions) => {
  const stateRef = useRef<PolygonDrawingState>({
    currentPolygon: null,
    previewLine: null,
    currentPoints: [],
    lastClickTime: 0,
  });

  /**
   * Handle click to add vertex or finish polygon
   */
  const handleClick = useCallback(
    (imageX: number, imageY: number) => {
      if (!layer) return;

      const state = stateRef.current;
      const currentTime = Date.now();
      const timeSinceLastClick = currentTime - state.lastClickTime;

      // Check for double-click to finish
      if (
        timeSinceLastClick < DOUBLE_CLICK_THRESHOLD &&
        state.currentPolygon &&
        state.currentPoints.length >= 6 // At least 3 points (6 coordinates)
      ) {
        console.log('Double-click detected - finishing polygon');

        // Close the polygon
        state.currentPolygon.closed(true);

        // Get final points
        const finalPoints = [...state.currentPoints];

        // Cleanup
        cleanup();

        // Call completion callback
        onComplete(finalPoints);

        state.lastClickTime = 0; // Reset to prevent triple-click issues
        return;
      }

      state.lastClickTime = currentTime;

      // Add point to current polygon
      state.currentPoints.push(imageX, imageY);

      if (!state.currentPolygon) {
        // Create new polygon
        const polygon = new Konva.Line({
          points: state.currentPoints.slice(),
          stroke: '#cc3333',
          strokeWidth: 2 / scale,
          fill: 'rgba(204, 51, 51, 0.2)',
          closed: false,
          listening: false,
          name: 'drawing-polygon', // Add unique name
        });
        state.currentPolygon = polygon;
        layer.add(polygon);

        // Create preview line (shows complete polygon shape while drawing)
        const previewLine = new Konva.Line({
          points: [],
          stroke: '#cc3333',
          strokeWidth: 2 / scale,
          dash: [10, 5],
          fill: 'rgba(204, 51, 51, 0.1)',
          closed: true,
          listening: false,
          name: 'drawing-polygon-preview', // Add unique name
        });
        state.previewLine = previewLine;
        layer.add(previewLine);
      } else {
        // Update existing polygon
        state.currentPolygon.points(state.currentPoints.slice());
      }

      layer.batchDraw();
    },
    [layer, scale, onComplete]
  );

  /**
   * Handle mouse move to update preview line
   */
  const handleMouseMove = useCallback(
    (imageX: number, imageY: number) => {
      if (!layer) return;

      const state = stateRef.current;
      if (!state.currentPolygon || !state.previewLine || state.currentPoints.length === 0) {
        return;
      }

      // Create preview points: all existing points + current mouse position + back to first point
      const previewPoints = [
        ...state.currentPoints,
        imageX,
        imageY,
        state.currentPoints[0],
        state.currentPoints[1], // Close to first point
      ];

      state.previewLine.points(previewPoints);
      layer.batchDraw();
    },
    [layer]
  );

  /**
   * Update stroke width when zoom changes
   */
  const updateStrokeWidth = useCallback(
    (newScale: number) => {
      const state = stateRef.current;
      if (state.currentPolygon) {
        state.currentPolygon.strokeWidth(2 / newScale);
      }
      if (state.previewLine) {
        state.previewLine.strokeWidth(2 / newScale);
      }
      layer?.batchDraw();
    },
    [layer]
  );

  /**
   * Clean up drawing shapes
   */
  const cleanup = useCallback(() => {
    const state = stateRef.current;

    if (state.currentPolygon) {
      state.currentPolygon.destroy();
      state.currentPolygon = null;
    }

    if (state.previewLine) {
      state.previewLine.destroy();
      state.previewLine = null;
    }

    state.currentPoints = [];
    layer?.batchDraw();
  }, [layer]);

  /**
   * Cancel drawing
   */
  const cancel = useCallback(() => {
    cleanup();
  }, [cleanup]);

  /**
   * Check if currently drawing
   */
  const isDrawing = useCallback(() => {
    return stateRef.current.currentPolygon !== null;
  }, []);

  return {
    handleClick,
    handleMouseMove,
    updateStrokeWidth,
    cleanup,
    cancel,
    isDrawing,
  };
};
