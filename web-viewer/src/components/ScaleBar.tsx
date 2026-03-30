/**
 * ScaleBar — HTML overlay showing current scale reference
 */

import { useMemo } from 'react';

interface ScaleBarProps {
  scalePixelsPerCentimeter: number | null | undefined;
  zoom: number;
}

function computeScaleBar(pixelsPerCm: number, zoom: number) {
  const cmPerScreenPixel = 1 / (pixelsPerCm * zoom);
  const targetRealUm = 120 * cmPerScreenPixel * 10000;
  const niceValues = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
  let bestValue = niceValues[0];
  let bestDiff = Math.abs(niceValues[0] - targetRealUm);
  for (const v of niceValues) {
    const diff = Math.abs(v - targetRealUm);
    if (diff < bestDiff) { bestDiff = diff; bestValue = v; }
  }
  let value: number, unit: string;
  if (bestValue >= 10000) { value = bestValue / 10000; unit = 'cm'; }
  else if (bestValue >= 1000) { value = bestValue / 1000; unit = 'mm'; }
  else { value = bestValue; unit = '\u00B5m'; }
  const barPx = Math.round((bestValue / 10000) * pixelsPerCm * zoom);
  return { value, unit, pixels: barPx };
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
      bottom: 12,
      left: 12,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      pointerEvents: 'none',
    }}>
      <span style={{ fontSize: 11, color: '#e0e0e0', textShadow: '0 1px 3px rgba(0,0,0,0.8)', marginBottom: 2 }}>
        {bar.value} {bar.unit}
      </span>
      <div style={{ width: bar.pixels, height: 3, backgroundColor: '#e0e0e0', boxShadow: '0 1px 3px rgba(0,0,0,0.5)', borderRadius: 1 }} />
    </div>
  );
}
