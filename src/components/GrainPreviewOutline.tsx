/**
 * Grain Spot: the outline of the grain under the mouse, on the drawing layer
 * (image coordinates). Dashed orange when the grain runs off the screen, so a
 * click would only say so. Its own component so a moving preview does not
 * redraw the whole viewer.
 */

import { Line } from 'react-konva';
import { useGrainSpotStore } from '@/services/grainSpot/grainSpotEngine';

export function GrainPreviewOutline({ zoom }: { zoom: number }) {
  const preview = useGrainSpotStore((s) => s.preview);
  if (!preview) return null;
  return (
    <Line
      name="grain-preview"
      points={preview.ring.flat()}
      closed
      stroke={preview.offScreen ? '#ffa726' : '#00e5ff'}
      strokeWidth={2 / zoom}
      dash={preview.offScreen ? [8 / zoom, 6 / zoom] : undefined}
      fill={preview.offScreen ? undefined : 'rgba(0, 229, 255, 0.15)'}
      listening={false}
    />
  );
}
