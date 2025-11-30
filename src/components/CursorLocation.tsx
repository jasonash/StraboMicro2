import React from 'react';
import { useAppStore } from '@/store';
import { getEffectiveTheme } from '@/hooks/useTheme';

interface CursorLocationProps {
  x: number | null;
  y: number | null;
  scalePixelsPerCentimeter: number | null;
}

/**
 * CursorLocation Component
 *
 * Displays the current mouse cursor position in real-world coordinates
 * at the bottom center of the canvas. Shows X and Y coordinates in
 * adaptive units (cm, mm, or µm) matching the ruler scale.
 *
 * Format: "X: 3.012 mm x Y: 5.905 mm"
 */
const CursorLocation: React.FC<CursorLocationProps> = ({
  x,
  y,
  scalePixelsPerCentimeter,
}) => {
  const theme = useAppStore((state) => state.theme);
  const effectiveTheme = getEffectiveTheme(theme);
  const isDark = effectiveTheme === 'dark';

  // If no position or scale data, don't show anything
  if (x === null || y === null || !scalePixelsPerCentimeter) {
    return null;
  }

  // Convert pixel coordinates to centimeters
  const xInCm = x / scalePixelsPerCentimeter;
  const yInCm = y / scalePixelsPerCentimeter;

  // Determine which unit to use (same logic as rulers)
  let xValue: number;
  let yValue: number;
  let unit: string;
  let decimals: number;

  // Convert to mm first
  const xInMm = xInCm * 10;
  const yInMm = yInCm * 10;

  if (Math.abs(xInCm) >= 0.2 || Math.abs(yInCm) >= 0.2) {
    // Use cm for larger values
    xValue = xInCm;
    yValue = yInCm;
    unit = 'cm';
    decimals = 3;
  } else if (Math.abs(xInMm) >= 0.2 || Math.abs(yInMm) >= 0.2) {
    // Use mm for medium values
    xValue = xInMm;
    yValue = yInMm;
    unit = 'mm';
    decimals = 3;
  } else {
    // Use µm for small values
    xValue = xInMm * 100; // Convert mm to µm (1mm = 1000µm, but we show as 100µm)
    yValue = yInMm * 100;
    unit = 'µm';
    decimals = 1;
  }

  // Theme colors
  const bgColor = isDark ? 'rgba(37, 37, 37, 0.9)' : 'rgba(245, 245, 240, 0.9)';
  const textColor = isDark ? '#e0e0e0' : '#333333';
  const borderColor = isDark ? '#404040' : '#d0d0c8';

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 10,
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: bgColor,
        color: textColor,
        padding: '6px 16px',
        borderRadius: 4,
        fontSize: '13px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontWeight: 500,
        border: `1px solid ${borderColor}`,
        zIndex: 1000,
        pointerEvents: 'none', // Don't block mouse events
        userSelect: 'none',
        boxShadow: isDark
          ? '0 2px 8px rgba(0, 0, 0, 0.5)'
          : '0 2px 8px rgba(0, 0, 0, 0.15)',
      }}
    >
      X: {xValue.toFixed(decimals)} {unit} × Y: {yValue.toFixed(decimals)} {unit}
    </div>
  );
};

export default CursorLocation;
