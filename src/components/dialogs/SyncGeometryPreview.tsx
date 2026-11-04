/**
 * One side of a geometry conflict in the sync decisions dialog (spec v3
 * §4.6): a spot's shape, or a micrograph's outline on its parent, drawn over
 * the micrograph it sits on. Both columns crop the same area of the image
 * (src/utils/geometryPreview.ts), so a difference shows as a shift.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useAppStore } from '@/store';
import { placementOutline, previewCrop, shapePoints, type PreviewPoint } from '@/utils/geometryPreview';

const WIDTH = 240;
const HEIGHT = 160;

interface LoadedImage {
  img: HTMLImageElement;
  /** Full-resolution size (the space the shapes are in) */
  width: number;
  height: number;
}

/** One load per image while the app runs (both columns and every item share it). */
const images = new Map<string, Promise<LoadedImage | null>>();

function loadImage(projectId: string, micrographId: string, imagePath: string): Promise<LoadedImage | null> {
  const cacheKey = `${projectId}/${imagePath}`;
  const cached = images.get(cacheKey);
  if (cached) return cached;
  const api = window.api;
  const loading = (async () => {
    if (!api) return null;
    const folders = await api.getProjectFolderPaths(projectId);
    const result = await api.loadImageWithTiles(`${folders.images}/${imagePath}`);
    const url = await api.loadMedium(result.hash);
    const img = new Image();
    img.src = url;
    const ok = await new Promise<boolean>((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
    });
    return ok ? { img, width: result.metadata.width, height: result.metadata.height } : null;
  })().catch((err: unknown) => {
    console.warn(`[Sync] No preview image for micrograph ${micrographId}:`, err);
    return null;
  });
  images.set(cacheKey, loading);
  // A failed load may succeed later (the original was still downloading)
  void loading.then((r) => {
    if (!r && images.get(cacheKey) === loading) images.delete(cacheKey);
  });
  return loading;
}

/** What a side draws: points and whether the outline closes. */
function sideGeometry(preview: SyncGeometryPreview, side: 'mine' | 'theirs'): { points: PreviewPoint[]; kind: 'point' | 'line' | 'polygon' } {
  if (preview.group === 'shape') return shapePoints(side === 'mine' ? preview.mine : preview.theirs);
  return {
    points: placementOutline(side === 'mine' ? preview.mine : preview.theirs, preview.parentScalePixelsPerCentimeter),
    kind: 'polygon',
  };
}

export default function SyncGeometryPreview({ preview, side }: { preview: SyncGeometryPreview; side: 'mine' | 'theirs' }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const projectId = useAppStore((s) => s.project?.id ?? null);
  const imagePath = useAppStore((s) => s.micrographIndex.get(preview.micrographId)?.imagePath ?? null);
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!projectId || !imagePath) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    void loadImage(projectId, preview.micrographId, imagePath).then((r) => {
      if (cancelled) return;
      setImage(r);
      setFailed(!r);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, imagePath, preview.micrographId]);

  const own = useMemo(() => sideGeometry(preview, side), [preview, side]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !image) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // The same crop for both sides
    const crop = previewCrop(
      [sideGeometry(preview, 'mine').points, sideGeometry(preview, 'theirs').points],
      { width: image.width, height: image.height },
      WIDTH / HEIGHT,
    );
    const k = WIDTH / crop.width;
    // The loaded image is a downsampled copy: map full-resolution pixels onto it
    const sx = image.img.naturalWidth / image.width;
    const sy = image.img.naturalHeight / image.height;
    ctx.drawImage(image.img, crop.x * sx, crop.y * sy, crop.width * sx, crop.height * sy, 0, 0, WIDTH, HEIGHT);

    const pts = own.points.map((p) => ({ x: (p.x - crop.x) * k, y: (p.y - crop.y) * k }));
    if (pts.length === 0) return;
    const path = new Path2D();
    if (own.kind === 'point') {
      path.arc(pts[0].x, pts[0].y, 6, 0, Math.PI * 2);
    } else {
      path.moveTo(pts[0].x, pts[0].y);
      for (const p of pts.slice(1)) path.lineTo(p.x, p.y);
      if (own.kind === 'polygon') path.closePath();
    }
    if (own.kind !== 'line') {
      ctx.fillStyle = 'rgba(255, 212, 0, 0.25)';
      ctx.fill(path);
    }
    // Dark under bright, so the outline shows on light and dark images
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 4;
    ctx.stroke(path);
    ctx.strokeStyle = '#ffd400';
    ctx.lineWidth = 2;
    ctx.stroke(path);
  }, [image, preview, own]);

  const empty = own.points.length === 0;
  return (
    <Box sx={{ mt: 0.5 }}>
      {image ? (
        <canvas
          ref={canvasRef}
          style={{ width: WIDTH, height: HEIGHT, display: 'block', borderRadius: 4 }}
          aria-label={`${side === 'mine' ? 'Your' : 'Their'} ${preview.group === 'shape' ? 'shape' : 'placement'}`}
        />
      ) : (
        <Box sx={{ width: WIDTH, height: HEIGHT, bgcolor: 'action.hover', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="caption" color="text.secondary">{failed ? 'No image to show' : 'Loading...'}</Typography>
        </Box>
      )}
      {empty && image && (
        <Typography variant="caption" color="text.secondary">
          {preview.group === 'shape' ? 'No shape' : 'Not placed'}
        </Typography>
      )}
    </Box>
  );
}
