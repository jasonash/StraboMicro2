/**
 * Image stitcher: the canvas of the review screen. Draws shrunken copies of the tiles where
 * the layout puts them, in the pixel frame of the mosaic as it will be saved; pan by dragging,
 * zoom with the wheel. Empty areas show a checkered pattern.
 *
 * The tiles are drawn one over the other here; the built mosaic blends them where they overlap.
 *
 * Design: docs/image-stitcher-design.md (decisions 9, 13, 14)
 */

import React, { useEffect, useRef, useState } from 'react';
import { Group, Image as KonvaImage, Layer, Line, Rect, Stage } from 'react-konva';
import type Konva from 'konva';
import { Box, Button, FormControlLabel, Stack, Switch } from '@mui/material';
import { useElementSize } from '@/hooks/useElementSize';
import { wheelZoomDirection } from '@/utils/wheelZoom';
import type { MosaicFrame } from '@/services/stitch/stitchLayout';
import { canvasPreviewSide, previewUrl, type PreparedImage } from '@/services/stitch/stitchApp';

interface StitchReviewCanvasProps {
  session: string;
  /** Tile n of the layout is images[n] */
  images: PreparedImage[];
  /** The mosaic of the tiles shown (those left out are not in it); null when there is nothing to show */
  frame: MosaicFrame | null;
  selected: number | null;
  onSelect: (tile: number | null) => void;
  /** The part that will be saved when cropping is on (saved mosaic pixels) */
  crop: { left: number; top: number; width: number; height: number } | null;
}

const OUTLINE = '#4fc3f7';
const OUTLINE_SELECTED = '#ffb300';
const ZOOM_STEP = 1.15;

/** A small light and dark gray check, for areas no tile covers (as a data URL: Konva patterns take an image) */
function checkerUrl(): string {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#9e9e9e';
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#757575';
    g.fillRect(0, 0, 8, 8);
    g.fillRect(8, 8, 8, 8);
  }
  return c.toDataURL();
}

export const StitchReviewCanvas: React.FC<StitchReviewCanvasProps> = ({ session, images, frame, selected, onSelect, crop }) => {
  const [containerRef, size, isMeasured] = useElementSize<HTMLDivElement>({ width: 600, height: 400 });
  const [pictures, setPictures] = useState<Record<number, HTMLImageElement>>({});
  const [showOutlines, setShowOutlines] = useState(true);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const fitted = useRef<string>('');
  const [checker, setChecker] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const picture = new window.Image();
    picture.onload = () => setChecker(picture);
    picture.src = checkerUrl();
  }, []);

  // The shrunken copies, loaded once per session; freed when the canvas goes away
  useEffect(() => {
    let alive = true;
    const urls: string[] = [];
    const side = canvasPreviewSide(images.length);
    setPictures({});
    const load = async () => {
      for (let tile = 0; tile < images.length; tile++) {
        if (!alive) return;
        try {
          const url = await previewUrl(session, images[tile], side);
          urls.push(url);
          const picture = new window.Image();
          picture.src = url;
          await picture.decode();
          if (!alive) return;
          setPictures((old) => ({ ...old, [tile]: picture }));
        } catch (error) {
          console.error('[Stitch] Could not load the preview of', images[tile].path, error);
        }
      }
    };
    void load();
    return () => {
      alive = false;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [session, images]);

  const fit = () => {
    if (!frame) return;
    const margin = 24;
    const zoom = Math.min((size.width - 2 * margin) / frame.width, (size.height - 2 * margin) / frame.height);
    setView({ zoom, x: (size.width - frame.width * zoom) / 2, y: (size.height - frame.height * zoom) / 2 });
  };

  // Fit once the size is known, and again when the mosaic's size changes (a tile left out or put back)
  useEffect(() => {
    if (!isMeasured || !frame) return;
    const key = `${frame.width}x${frame.height}`;
    if (fitted.current === key) return;
    fitted.current = key;
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMeasured, frame?.width, frame?.height, size.width, size.height]);

  const handleWheel = (event: Konva.KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault();
    const direction = wheelZoomDirection(event.evt);
    if (direction === 0) return;
    const pointer = event.target.getStage()?.getPointerPosition();
    if (!pointer) return;
    setView((old) => {
      const zoom = Math.max(0.005, Math.min(8, direction > 0 ? old.zoom * ZOOM_STEP : old.zoom / ZOOM_STEP));
      // The point under the cursor stays put
      const wx = (pointer.x - old.x) / old.zoom;
      const wy = (pointer.y - old.y) / old.zoom;
      return { zoom, x: pointer.x - wx * zoom, y: pointer.y - wy * zoom };
    });
  };

  const tiles = frame ? Object.keys(frame.toMosaic).map(Number) : [];
  // The selected tile is drawn last, so its whole outline shows
  const order = [...tiles.filter((t) => t !== selected), ...tiles.filter((t) => t === selected)];

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', minHeight: 300, bgcolor: 'action.hover', borderRadius: 1, overflow: 'hidden' }}>
      <Box
        ref={containerRef}
        data-testid="stitch-canvas"
        data-tiles-drawn={tiles.filter((t) => pictures[t]).length}
        sx={{ position: 'absolute', inset: 0, cursor: 'grab' }}
      >
        <Stage
          width={size.width}
          height={size.height}
          x={view.x}
          y={view.y}
          scaleX={view.zoom}
          scaleY={view.zoom}
          draggable
          onDragEnd={(event) => {
            const stage = event.target.getStage();
            if (stage && event.target === stage) setView((old) => ({ ...old, x: stage.x(), y: stage.y() }));
          }}
          onWheel={handleWheel}
          onClick={(event) => {
            if (event.target === event.target.getStage()) onSelect(null);
          }}
        >
          <Layer>
            {frame && checker && (
              <Rect
                x={0}
                y={0}
                width={frame.width}
                height={frame.height}
                fillPatternImage={checker}
                fillPatternScaleX={1 / view.zoom}
                fillPatternScaleY={1 / view.zoom}
                onClick={() => onSelect(null)}
              />
            )}
            {frame && order.map((tile) => {
              const picture = pictures[tile];
              const m = frame.toMosaic[tile];
              const image = images[tile];
              if (!picture || !m || !image) return null;
              // Tile pixel -> mosaic pixel is a move, turn and resize; the copy is smaller than the tile
              const scale = Math.hypot(m[0], m[3]);
              return (
                <KonvaImage
                  key={tile}
                  image={picture}
                  x={m[2]}
                  y={m[5]}
                  rotation={(Math.atan2(m[3], m[0]) * 180) / Math.PI}
                  scaleX={(scale * image.width) / picture.naturalWidth}
                  scaleY={(scale * image.height) / picture.naturalHeight}
                  onClick={() => onSelect(tile)}
                />
              );
            })}
            {frame && (
              <Group listening={false}>
                {order.map((tile) => {
                  const m = frame.toMosaic[tile];
                  const image = images[tile];
                  if (!m || !image || (!showOutlines && tile !== selected)) return null;
                  const corners = [[0, 0], [image.width, 0], [image.width, image.height], [0, image.height]]
                    .flatMap(([x, y]) => [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]]);
                  return (
                    <Line
                      key={tile}
                      points={corners}
                      closed
                      stroke={tile === selected ? OUTLINE_SELECTED : OUTLINE}
                      strokeWidth={tile === selected ? 3 : 1.5}
                      strokeScaleEnabled={false}
                    />
                  );
                })}
                {crop && (
                  <Rect
                    x={crop.left}
                    y={crop.top}
                    width={crop.width}
                    height={crop.height}
                    stroke="#ffffff"
                    strokeWidth={2}
                    dash={[8, 6]}
                    strokeScaleEnabled={false}
                    shadowColor="#000000"
                    shadowBlur={2}
                  />
                )}
              </Group>
            )}
          </Layer>
        </Stage>
      </Box>
      <Stack direction="row" spacing={1} sx={{ position: 'absolute', left: 8, bottom: 8, alignItems: 'center', bgcolor: 'background.paper', borderRadius: 1, px: 1, py: 0.25, opacity: 0.92 }}>
        <Button size="small" onClick={fit}>Fit</Button>
        <FormControlLabel
          control={<Switch size="small" checked={showOutlines} onChange={(event) => setShowOutlines(event.target.checked)} />}
          label="Outlines"
          sx={{ mr: 0 }}
        />
      </Stack>
    </Box>
  );
};
