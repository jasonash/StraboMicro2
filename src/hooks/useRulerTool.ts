/**
 * useRulerTool Hook
 *
 * Handles ruler/measurement tool interaction.
 * - Click and drag to draw a measurement line
 * - Displays real-world distance based on scale calibration
 * - Tool stays active for multiple measurements
 * - Each new measurement replaces the previous
 */

import { useRef, useCallback, useState, useMemo } from 'react';
import Konva from 'konva';

interface RulerState {
  isDrawing: boolean;
  startPoint: { x: number; y: number } | null;
  endPoint: { x: number; y: number } | null;
  rulerLine: Konva.Line | null;
  measurementText: Konva.Text | null;
  measurementBg: Konva.Rect | null;
}

interface UseRulerToolOptions {
  layer: Konva.Layer | null;
  scale: number;
  scalePixelsPerCentimeter: number | null;
}

interface RulerMeasurement {
  startPoint: { x: number; y: number };
  endPoint: { x: number; y: number };
  lengthPixels: number;
  formatted: string;
}

// Unit conversion constants
const CM_TO_UM = 10000;
const CM_TO_MM = 10;

/**
 * Format a length measurement with appropriate units
 */
function formatLength(lengthCm: number): string {
  const lengthMm = lengthCm * CM_TO_MM;
  const lengthUm = lengthCm * CM_TO_UM;

  if (lengthCm >= 1) {
    return `${lengthCm.toFixed(3)} cm`;
  } else if (lengthMm >= 1) {
    return `${lengthMm.toFixed(3)} mm`;
  } else {
    return `${lengthUm.toFixed(3)} μm`;
  }
}

/**
 * Calculate distance between two points
 */
function calculateDistance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

export const useRulerTool = ({ layer, scale, scalePixelsPerCentimeter }: UseRulerToolOptions) => {
  const stateRef = useRef<RulerState>({
    isDrawing: false,
    startPoint: null,
    endPoint: null,
    rulerLine: null,
    measurementText: null,
    measurementBg: null,
  });

  const [currentMeasurement, setCurrentMeasurement] = useState<RulerMeasurement | null>(null);

  /**
   * Clear existing ruler graphics
   */
  const clearRuler = useCallback(() => {
    const state = stateRef.current;
    if (state.rulerLine) {
      state.rulerLine.destroy();
      state.rulerLine = null;
    }
    if (state.measurementText) {
      state.measurementText.destroy();
      state.measurementText = null;
    }
    if (state.measurementBg) {
      state.measurementBg.destroy();
      state.measurementBg = null;
    }
    layer?.batchDraw();
  }, [layer]);

  /**
   * Start drawing ruler on mouse down
   */
  const handleMouseDown = useCallback(
    (imageX: number, imageY: number) => {
      if (!layer) return;

      // Clear any existing ruler
      clearRuler();

      const state = stateRef.current;
      state.isDrawing = true;
      state.startPoint = { x: imageX, y: imageY };
      state.endPoint = { x: imageX, y: imageY };

      // Create ruler line with endpoints
      const line = new Konva.Line({
        points: [imageX, imageY, imageX, imageY],
        stroke: '#ffcc00',
        strokeWidth: 2 / scale,
        lineCap: 'round',
        dash: [8 / scale, 4 / scale],
      });

      state.rulerLine = line;
      layer.add(line);
      layer.batchDraw();
    },
    [layer, scale, clearRuler]
  );

  /**
   * Update ruler on mouse move
   */
  const handleMouseMove = useCallback(
    (imageX: number, imageY: number) => {
      const state = stateRef.current;
      if (!state.isDrawing || !state.startPoint || !state.rulerLine || !layer) return;

      state.endPoint = { x: imageX, y: imageY };

      // Update line
      state.rulerLine.points([
        state.startPoint.x,
        state.startPoint.y,
        imageX,
        imageY,
      ]);

      // Calculate and display measurement
      const lengthPixels = calculateDistance(
        state.startPoint.x,
        state.startPoint.y,
        imageX,
        imageY
      );

      let formattedLength = `${lengthPixels.toFixed(1)} px`;
      if (scalePixelsPerCentimeter) {
        const lengthCm = lengthPixels / scalePixelsPerCentimeter;
        formattedLength = formatLength(lengthCm);
      }

      // Position text at midpoint of line
      const midX = (state.startPoint.x + imageX) / 2;
      const midY = (state.startPoint.y + imageY) / 2;

      // Remove old text and background
      if (state.measurementText) {
        state.measurementText.destroy();
      }
      if (state.measurementBg) {
        state.measurementBg.destroy();
      }

      // Create background for text
      const fontSize = 14 / scale;
      const padding = 4 / scale;
      const textWidth = formattedLength.length * fontSize * 0.6;
      const textHeight = fontSize + padding * 2;

      const bg = new Konva.Rect({
        x: midX - textWidth / 2 - padding,
        y: midY - textHeight / 2,
        width: textWidth + padding * 2,
        height: textHeight,
        fill: 'rgba(0, 0, 0, 0.75)',
        cornerRadius: 3 / scale,
      });

      const text = new Konva.Text({
        x: midX - textWidth / 2,
        y: midY - fontSize / 2,
        text: formattedLength,
        fontSize: fontSize,
        fill: '#ffcc00',
        fontFamily: 'Roboto, sans-serif',
        fontStyle: 'bold',
      });

      state.measurementBg = bg;
      state.measurementText = text;
      layer.add(bg);
      layer.add(text);
      layer.batchDraw();
    },
    [layer, scale, scalePixelsPerCentimeter]
  );

  /**
   * Finish ruler on mouse up
   */
  const handleMouseUp = useCallback(() => {
    const state = stateRef.current;
    if (!state.isDrawing || !state.startPoint || !state.endPoint) return;

    state.isDrawing = false;

    // Calculate final measurement
    const lengthPixels = calculateDistance(
      state.startPoint.x,
      state.startPoint.y,
      state.endPoint.x,
      state.endPoint.y
    );

    let formattedLength = `${lengthPixels.toFixed(1)} px`;
    if (scalePixelsPerCentimeter) {
      const lengthCm = lengthPixels / scalePixelsPerCentimeter;
      formattedLength = formatLength(lengthCm);
    }

    setCurrentMeasurement({
      startPoint: state.startPoint,
      endPoint: state.endPoint,
      lengthPixels,
      formatted: formattedLength,
    });
  }, [scalePixelsPerCentimeter]);

  /**
   * Update stroke width when zoom changes
   */
  const updateStrokeWidth = useCallback(
    (newScale: number) => {
      const state = stateRef.current;
      if (state.rulerLine) {
        state.rulerLine.strokeWidth(2 / newScale);
        state.rulerLine.dash([8 / newScale, 4 / newScale]);
      }
      // Text scaling is handled during draw
      layer?.batchDraw();
    },
    [layer]
  );

  /**
   * Clear the ruler and reset state
   */
  const reset = useCallback(() => {
    clearRuler();
    const state = stateRef.current;
    state.isDrawing = false;
    state.startPoint = null;
    state.endPoint = null;
    setCurrentMeasurement(null);
  }, [clearRuler]);

  return useMemo(
    () => ({
      handleMouseDown,
      handleMouseMove,
      handleMouseUp,
      updateStrokeWidth,
      reset,
      currentMeasurement,
      isDrawing: stateRef.current.isDrawing,
    }),
    [handleMouseDown, handleMouseMove, handleMouseUp, updateStrokeWidth, reset, currentMeasurement]
  );
};
