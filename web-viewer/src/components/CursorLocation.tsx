/**
 * CursorLocation — Mouse position display in real-world coordinates
 */

import { colors, fonts } from '../styles/theme';

interface CursorLocationProps {
  /** X position in image pixels */
  x: number | null;
  /** Y position in image pixels */
  y: number | null;
  /** Pixels per centimeter for unit conversion */
  scalePixelsPerCentimeter: number | null | undefined;
}

export function CursorLocation({ x, y, scalePixelsPerCentimeter }: CursorLocationProps) {
  if (x === null || y === null) return null;

  let label: string;
  if (scalePixelsPerCentimeter && scalePixelsPerCentimeter > 0) {
    // Convert to microns
    const xUm = (x / scalePixelsPerCentimeter) * 10000;
    const yUm = (y / scalePixelsPerCentimeter) * 10000;
    if (xUm > 10000 || yUm > 10000) {
      // Show in mm
      label = `${(xUm / 1000).toFixed(1)}, ${(yUm / 1000).toFixed(1)} mm`;
    } else {
      label = `${xUm.toFixed(0)}, ${yUm.toFixed(0)} \u00B5m`;
    }
  } else {
    label = `${Math.round(x)}, ${Math.round(y)} px`;
  }

  return (
    <div style={{
      position: 'absolute',
      bottom: '12px',
      right: '12px',
      fontSize: fonts.sizeSm,
      color: colors.textMuted,
      textShadow: '0 1px 3px rgba(0,0,0,0.8)',
      pointerEvents: 'none',
    }}>
      {label}
    </div>
  );
}
