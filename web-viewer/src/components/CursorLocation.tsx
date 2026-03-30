/**
 * CursorLocation — Mouse position display in real-world coordinates
 */

interface CursorLocationProps {
  x: number | null;
  y: number | null;
  scalePixelsPerCentimeter: number | null | undefined;
}

export function CursorLocation({ x, y, scalePixelsPerCentimeter }: CursorLocationProps) {
  if (x === null || y === null) return null;

  let label: string;
  if (scalePixelsPerCentimeter && scalePixelsPerCentimeter > 0) {
    const xUm = (x / scalePixelsPerCentimeter) * 10000;
    const yUm = (y / scalePixelsPerCentimeter) * 10000;
    label = xUm > 10000 || yUm > 10000
      ? `${(xUm / 1000).toFixed(1)}, ${(yUm / 1000).toFixed(1)} mm`
      : `${xUm.toFixed(0)}, ${yUm.toFixed(0)} \u00B5m`;
  } else {
    label = `${Math.round(x)}, ${Math.round(y)} px`;
  }

  return (
    <div style={{
      position: 'absolute',
      bottom: 12,
      right: 12,
      fontSize: 11,
      color: '#b0b0b0',
      textShadow: '0 1px 3px rgba(0,0,0,0.8)',
      pointerEvents: 'none',
    }}>
      {label}
    </div>
  );
}
