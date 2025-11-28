/**
 * useLineDrawing Hook
 *
 * Handles line drawing interaction logic.
 * Similar to polygon drawing but for open polylines:
 * - Click to add points
 * - Preview line shows current segment while drawing
 * - Double-click to finish (500ms threshold)
 * - Stroke width scales with zoom
 */

import { useRef, useCallback } from 'react';
import Konva from 'konva';

interface LineDrawingState {
  currentLine: Konva.Line | null;
  previewLine: Konva.Line | null;
  currentPoints: number[];
  lastClickTime: number;
}

interface UseLineDrawingOptions {
  layer: Konva.Layer | null;
  scale: number;
  onComplete: (points: number[]) => void;
}

const DOUBLE_CLICK_THRESHOLD = 500; // 500ms threshold for double-click

export const useLineDrawing = ({ layer, scale, onComplete }: UseLineDrawingOptions) => {
  const stateRef = useRef<LineDrawingState>({
    currentLine: null,
    previewLine: null,
    currentPoints: [],
    lastClickTime: 0,
  });

  /**
   * Handle click to add point or finish line
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
        state.currentLine &&
        state.currentPoints.length >= 4 // At least 2 points (4 coordinates)
      ) {
        console.log('Double-click detected - finishing line');

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

      // Add point to current line
      state.currentPoints.push(imageX, imageY);

      if (!state.currentLine) {
        // Create new line
        const line = new Konva.Line({
          points: state.currentPoints.slice(),
          stroke: '#cc3333',
          strokeWidth: 2 / scale,
          listening: false,
          lineCap: 'round',
          lineJoin: 'round',
          name: 'drawing-line', // Add unique name
        });
        state.currentLine = line;
        layer.add(line);

        // Create preview line (shows next segment while drawing)
        const previewLine = new Konva.Line({
          points: [],
          stroke: '#cc3333',
          strokeWidth: 2 / scale,
          dash: [10, 5],
          listening: false,
          lineCap: 'round',
          lineJoin: 'round',
          name: 'drawing-preview', // Add unique name
        });
        state.previewLine = previewLine;
        layer.add(previewLine);
      } else {
        // Update existing line
        state.currentLine.points(state.currentPoints.slice());
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
      if (!state.currentLine || !state.previewLine || state.currentPoints.length === 0) {
        return;
      }

      // Get last point
      const lastX = state.currentPoints[state.currentPoints.length - 2];
      const lastY = state.currentPoints[state.currentPoints.length - 1];

      // Preview line from last point to current mouse position
      const previewPoints = [lastX, lastY, imageX, imageY];

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
      if (state.currentLine) {
        state.currentLine.strokeWidth(2 / newScale);
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

    if (state.currentLine) {
      state.currentLine.destroy();
      state.currentLine = null;
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
    return stateRef.current.currentLine !== null;
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
