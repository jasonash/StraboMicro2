/**
 * ScaleBar — HTML overlay showing current scale reference
 *
 * Displays a horizontal bar with a real-world measurement label.
 * Adapts the bar length and unit based on the current zoom level.
 */

import { useMemo } from 'react';
import { colors, fonts } from '../styles/theme';

interface ScaleBarProps {
  /** Pixels per centimeter at 1x zoom */
  scalePixelsPerCentimeter: number | null | undefined;
  /** Current zoom level */
  zoom: number;
}

/**
 * Choose a "nice" scale bar length that fits well on screen.
 * Returns { value, unit, pixels } where pixels is the bar width at current zoom.
 */
function computeScaleBar(pixelsPerCm: number, zoom: number) {
  // Real-world size of one screen pixel at current zoom
  const cmPerScreenPixel = 1 / (pixelsPerCm * zoom);

  // Target bar width in screen pixels (80-200px range)
  const targetBarPx = 120;
  const targetRealCm = targetBarPx * cmPerScreenPixel;

  // Convert to microns for small scales
  const targetRealUm = targetRealCm * 10000;

  // Nice round numbers to choose from
  const niceValues = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];

  // Find the nice value closest to target (in microns)
  let bestValue = niceValues[0];
  let bestDiff = Math.abs(niceValues[0] - targetRealUm);
  for (const v of niceValues) {
    const diff = Math.abs(v - targetRealUm);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestValue = v;
    }
  }

  // Convert to display
  let value: number;
  let unit: string;
  if (bestValue >= 10000) {
    value = bestValue / 10000;
    unit = 'cm';
  } else if (bestValue >= 1000) {
    value = bestValue / 1000;
    unit = 'mm';
  } else {
    value = bestValue;
    unit = '\u00B5m'; // µm
  }

  // Calculate bar width in screen pixels
  const realCm = bestValue / 10000;
  const barPx = realCm * pixelsPerCm * zoom;

  return { value, unit, pixels: Math.round(barPx) };
}

export function ScaleBar({ scalePixelsPerCentimeter, zoom }: ScaleBarProps) {
  const bar = useMemo(() => {
    if (!scalePixelsPerCentimeter || scalePixelsPerCentimeter <= 0) return null;
    return computeScaleBar(scalePixelsPerCentimeter, zoom);
  }, [scalePixelsPerCentimeter, zoom]);

  if (!bar) return null;

  return (
    <div style={{
      position: 'absolute',
      bottom: '12px',
      left: '12px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      pointerEvents: 'none',
    }}>
      <span style={{
        fontSize: fonts.sizeSm,
        color: colors.textPrimary,
        textShadow: '0 1px 3px rgba(0,0,0,0.8)',
        marginBottom: '2px',
      }}>
        {bar.value} {bar.unit}
      </span>
      <div style={{
        width: `${bar.pixels}px`,
        height: '3px',
        backgroundColor: colors.textPrimary,
        boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
        borderRadius: '1px',
      }} />
    </div>
  );
}
