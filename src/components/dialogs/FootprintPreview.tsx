/**
 * The parent's thumbnail with the outlines of placed images on it (automatic placement: the
 * affine result in AutoPlacementPanel, every found child in PlaceChildrenDialog).
 */

import React, { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { useAppStore } from '@/store';
import { findMicrographById } from '@/store/helpers';
import type { AffineMatrix } from '@/utils/affineTransform';

export interface Footprint {
  /** Image px -> parent px, in the app's stored sizes */
  matrix: AffineMatrix;
  width: number;
  height: number;
  /** Drawn on top, in the strong color; the others are drawn faint */
  highlighted?: boolean;
  /** Called when the outline is clicked */
  onClick?: () => void;
}

const FootprintPreview: React.FC<{
  parentPath: string;
  parentMicrographId: string;
  footprints: Footprint[];
  maxWidth?: number;
}> = ({ parentPath, parentMicrographId, footprints, maxWidth }) => {
  const [thumbnail, setThumbnail] = useState<{ url: string; width: number; height: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const tiles = await window.api?.loadImageWithTiles(parentPath);
      if (!tiles) return;
      const url = await window.api?.loadThumbnail(tiles.hash);
      if (!cancelled && url) setThumbnail({ url, width: tiles.metadata.width, height: tiles.metadata.height });
    })().catch((error: unknown) => console.warn('[FootprintPreview] parent thumbnail not loaded', error));
    return () => {
      cancelled = true;
    };
  }, [parentPath]);

  const parent = findMicrographById(useAppStore.getState().project, parentMicrographId);
  const parentWidth = parent?.imageWidth || parent?.width || thumbnail?.width || 1;
  const parentHeight = parent?.imageHeight || parent?.height || thumbnail?.height || 1;
  if (!thumbnail) return <Box sx={{ height: 300 }} />;
  const stroke = Math.max(parentWidth, parentHeight) / 300;
  // Highlighted last, so it is drawn on top
  const ordered = [...footprints].sort((a, b) => Number(!!a.highlighted) - Number(!!b.highlighted));
  return (
    <Box sx={{ position: 'relative', maxWidth, width: '100%', alignSelf: 'center' }}>
      <img src={thumbnail.url} alt="Parent micrograph" style={{ display: 'block', width: '100%', height: 'auto' }} />
      <svg
        viewBox={`0 0 ${parentWidth} ${parentHeight}`}
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        {ordered.map((f, i) => {
          const m = f.matrix;
          const corners = [
            [0, 0],
            [f.width, 0],
            [f.width, f.height],
            [0, f.height],
          ].map(([x, y]) => [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]]);
          const strong = f.highlighted || footprints.length === 1;
          return (
            <polygon
              key={i}
              points={corners.map((c) => c.join(',')).join(' ')}
              fill={strong ? 'rgba(0, 200, 255, 0.2)' : 'rgba(255, 255, 255, 0.08)'}
              stroke={strong ? '#00c8ff' : 'rgba(255, 255, 255, 0.7)'}
              strokeWidth={strong ? stroke : stroke * 0.6}
              style={f.onClick ? { cursor: 'pointer' } : undefined}
              onClick={f.onClick}
            />
          );
        })}
      </svg>
    </Box>
  );
};

export default FootprintPreview;
