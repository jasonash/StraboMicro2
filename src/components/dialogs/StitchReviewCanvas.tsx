/**
 * Image stitcher: the canvas of the review screen. Draws shrunken copies of the tiles where
 * the layout puts them, in the pixel frame of the mosaic as it will be saved; pan by dragging,
 * zoom with the wheel. Empty areas show a checkered pattern.
 *
 * Changing by hand: a click selects a tile; the selected tile (with the tiles of its piece) can
 * be dragged, turned by the handle above it and nudged with the arrow keys. Dragging anything
 * else pans. An image or group dragged in from the list is dropped where the pointer is. The
 * canvas only reports what the user did (onMove, onDropGroup); the review screen changes the
 * layout, and the new frame arrives here.
 *
 * The tiles are drawn one over the other here; the built mosaic blends them where they overlap.
 *
 * Design: docs/image-stitcher-design.md (decisions 9, 10, 12, 13, 14)
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Group, Image as KonvaImage, Layer, Line, Rect, Stage, Transformer } from 'react-konva';
import type Konva from 'konva';
import { Box, Button, FormControlLabel, Slider, Stack, Switch, Typography } from '@mui/material';
import type { AffineMatrix } from '@/utils/affineTransform';
import { useElementSize } from '@/hooks/useElementSize';
import { wheelZoomDirection } from '@/utils/wheelZoom';
import type { MosaicFrame } from '@/services/stitch/stitchLayout';
import type { TileStatus } from '@/services/stitch/stitchEdit';
import { canvasPreviewSide, previewUrl, SHARP_PREVIEW_SIDE, type PreparedImage } from '@/services/stitch/stitchApp';

/** What is dragged from the list of images onto the canvas (the number of one tile of the group) */
export const STITCH_DRAG_TYPE = 'application/x-strabo-stitch-tile';

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
  /** Per tile: rectangles around burned-in graphics (a scale bar, a label), full-size pixels; drawn dashed */
  graphicAreas?: Array<Array<{ x: number; y: number; width: number; height: number }> | undefined>;
  /** Per tile shown: placed by hand, held weakly, or fine (outline colors) */
  statuses?: Record<number, TileStatus>;
  /** The tiles that move with the selected tile (itself among them) */
  piece?: number[];
  /** No changes just now (a snap is being looked for) */
  busy?: boolean;
  /** The user moved tiles: delta in saved mosaic pixels. A drag or turn asks for a snap; a nudge does not. */
  onMove?: (tiles: number[], delta: AffineMatrix, how: 'drag' | 'nudge') => void;
  /** An image or group from the list was dropped at a point (saved mosaic pixels) */
  onDropGroup?: (tile: number, point: { x: number; y: number }) => void;
  /** Called with a function that answers the middle of the view (saved mosaic pixels) */
  viewCenterRef?: React.MutableRefObject<(() => { x: number; y: number }) | null>;
}

const OUTLINE: Record<TileStatus, string> = { good: '#4fc3f7', weak: '#ffb300', hand: '#ce93d8' };
const OUTLINE_SELECTED = '#ffffff';
const ZOOM_STEP = 1.15;
/** Sharper copies kept at once (each is up to 2048 px on its long side) */
const SHARP_AT_ONCE = 12;

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

const cornersOf = (m: AffineMatrix, width: number, height: number): number[] =>
  [[0, 0], [width, 0], [width, height], [0, height]].flatMap(([x, y]) => [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]]);

export const StitchReviewCanvas: React.FC<StitchReviewCanvasProps> = ({
  session, images, frame, selected, onSelect, crop, graphicAreas, statuses = {}, piece, busy = false, onMove, onDropGroup, viewCenterRef,
}) => {
  const [containerRef, size, isMeasured] = useElementSize<HTMLDivElement>({ width: 600, height: 400 });
  const [pictures, setPictures] = useState<Record<number, HTMLImageElement>>({});
  /** Sharper copies of the tiles looked at closely */
  const [sharp, setSharp] = useState<Record<number, HTMLImageElement>>({});
  const sharpUrls = useRef<Map<number, string>>(new Map());
  const sharpLoading = useRef<Set<number>>(new Set());
  const [showOutlines, setShowOutlines] = useState(true);
  const [seeThrough, setSeeThrough] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const hasFitted = useRef(false);
  const [checker, setChecker] = useState<HTMLImageElement | null>(null);
  const unitRef = useRef<Konva.Group | null>(null);
  const handleRef = useRef<Konva.Transformer | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const canChange = !!onMove && !busy;
  const setBox = useCallback((element: HTMLDivElement | null) => {
    boxRef.current = element;
    containerRef(element);
  }, [containerRef]);

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
    const sharpNow = sharpUrls.current;
    return () => {
      alive = false;
      for (const url of urls) URL.revokeObjectURL(url);
      for (const url of sharpNow.values()) URL.revokeObjectURL(url);
      sharpNow.clear();
      sharpLoading.current.clear();
      setSharp({});
    };
  }, [session, images]);

  const fit = () => {
    if (!frame) return;
    const margin = 24;
    const zoom = Math.min((size.width - 2 * margin) / frame.width, (size.height - 2 * margin) / frame.height);
    setView({ zoom, x: (size.width - frame.width * zoom) / 2, y: (size.height - frame.height * zoom) / 2 });
  };

  // Fit once, when the size and the mosaic are known
  useEffect(() => {
    if (!isMeasured || !frame || hasFitted.current) return;
    hasFitted.current = true;
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMeasured, frame]);

  // A new frame (a tile moved, left out, put back): the mosaic's corner and size may have
  // changed, so the view follows a tile that stayed, and nothing jumps on screen. The dragged
  // tiles were moved on the canvas itself; they are now drawn from the new frame.
  const lastFrame = useRef<MosaicFrame | null>(null);
  const movedLast = useRef<number[]>([]);
  useLayoutEffect(() => {
    const before = lastFrame.current;
    lastFrame.current = frame;
    const unit = unitRef.current;
    if (unit) {
      unit.position({ x: 0, y: 0 });
      unit.rotation(0);
      unit.scale({ x: 1, y: 1 });
    }
    if (!before || !frame || before === frame) return;
    const common = Object.keys(frame.toMosaic).map(Number).filter((t) => before.toMosaic[t]);
    const steady = common.find((t) => !movedLast.current.includes(t)) ?? common[0];
    if (steady === undefined) return;
    const a = before.toMosaic[steady];
    const b = frame.toMosaic[steady];
    const ratio = Math.hypot(b[0], b[3]) / Math.hypot(a[0], a[3]);
    setView((old) => {
      const zoom = old.zoom / ratio;
      return { zoom, x: old.x + old.zoom * a[2] - zoom * b[2], y: old.y + old.zoom * a[5] - zoom * b[5] };
    });
  }, [frame]);

  if (viewCenterRef) {
    viewCenterRef.current = () => ({ x: (size.width / 2 - view.x) / view.zoom, y: (size.height / 2 - view.y) / view.zoom });
  }

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
  // The selected tile and its piece move together and are drawn last
  const unit = selected !== null && tiles.includes(selected) ? (piece && piece.includes(selected) ? piece.filter((t) => tiles.includes(t)) : [selected]) : [];
  const others = tiles.filter((t) => !unit.includes(t));

  // Where the middle of the selected tile is on the canvas element (for tests that drag it)
  let selectedAt = '';
  if (frame && selected !== null && unit.includes(selected) && images[selected]) {
    const m = frame.toMosaic[selected];
    const cx = images[selected].width / 2;
    const cy = images[selected].height / 2;
    selectedAt = `${Math.round((m[0] * cx + m[1] * cy + m[2]) * view.zoom + view.x)},${Math.round((m[3] * cx + m[4] * cy + m[5]) * view.zoom + view.y)}`;
  }

  // Sharper copies for tiles in view that are drawn larger than their shrunken copy
  useEffect(() => {
    if (!frame) return undefined;
    const timer = window.setTimeout(() => {
      const wantedNow: number[] = [];
      for (const [key, m] of Object.entries(frame.toMosaic)) {
        const tile = Number(key);
        const image = images[tile];
        const picture = pictures[tile];
        if (!image || !picture) continue;
        if (Math.max(picture.naturalWidth, picture.naturalHeight) >= Math.min(SHARP_PREVIEW_SIDE, Math.max(image.previewWidth, image.previewHeight))) continue;
        const onScreen = Math.hypot(m[0], m[3]) * Math.max(image.width, image.height) * view.zoom;
        if (onScreen < Math.max(picture.naturalWidth, picture.naturalHeight) * 1.3) continue;
        const c = cornersOf(m, image.width, image.height);
        const xs = [c[0], c[2], c[4], c[6]].map((x) => x * view.zoom + view.x);
        const ys = [c[1], c[3], c[5], c[7]].map((y) => y * view.zoom + view.y);
        if (Math.max(...xs) < 0 || Math.max(...ys) < 0 || Math.min(...xs) > size.width || Math.min(...ys) > size.height) continue;
        wantedNow.push(tile);
      }
      // Those no longer looked at make room
      const held = [...sharpUrls.current.keys()];
      const spare = held.filter((t) => !wantedNow.includes(t));
      const toLoad = wantedNow.filter((t) => !sharpUrls.current.has(t) && !sharpLoading.current.has(t)).slice(0, SHARP_AT_ONCE);
      const over = held.length + toLoad.length - SHARP_AT_ONCE;
      if (over > 0) {
        const gone = spare.slice(0, over);
        for (const t of gone) {
          const url = sharpUrls.current.get(t);
          if (url) URL.revokeObjectURL(url);
          sharpUrls.current.delete(t);
        }
        if (gone.length) setSharp((old) => Object.fromEntries(Object.entries(old).filter(([t]) => !gone.includes(Number(t)))));
      }
      for (const tile of toLoad) {
        if (sharpUrls.current.size + sharpLoading.current.size >= SHARP_AT_ONCE) break;
        sharpLoading.current.add(tile);
        const urls = sharpUrls.current;
        const loading = sharpLoading.current;
        previewUrl(session, images[tile], SHARP_PREVIEW_SIDE).then(async (url) => {
          const picture = new window.Image();
          picture.src = url;
          await picture.decode();
          if (!loading.has(tile)) {
            // The canvas moved on to another session meanwhile
            URL.revokeObjectURL(url);
            return;
          }
          loading.delete(tile);
          urls.set(tile, url);
          setSharp((old) => ({ ...old, [tile]: picture }));
        }).catch((error: unknown) => {
          loading.delete(tile);
          console.error('[Stitch] Could not load a sharper copy of', images[tile].path, error);
        });
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [frame, view, size.width, size.height, pictures, images, session]);

  // The turn handle sits on the selected tile (and its piece)
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    handle.nodes(unitRef.current && unit.length > 0 && canChange ? [unitRef.current] : []);
    handle.getLayer()?.batchDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit.join(), canChange, frame, pictures]);

  /** The selected tiles were dragged or turned on the canvas: report by how much */
  const reportMove = () => {
    const node = unitRef.current;
    if (!node || !onMove || unit.length === 0) return;
    const t = node.getTransform().getMatrix();
    const delta: AffineMatrix = [t[0], t[2], t[4], t[1], t[3], t[5]];
    if (Math.abs(delta[2]) < 1e-6 && Math.abs(delta[5]) < 1e-6 && Math.abs(delta[1]) < 1e-9) return;
    movedLast.current = unit;
    onMove(unit, delta, 'drag');
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!step || !canChange || !onMove || unit.length === 0) return;
    event.preventDefault();
    // One pixel on screen (ten with Shift): zoom in for a finer step
    const by = (event.shiftKey ? 10 : 1) / view.zoom;
    movedLast.current = unit;
    onMove(unit, [1, 0, step[0] * by, 0, 1, step[1] * by], 'nudge');
  };

  const handleDrop = (event: React.DragEvent) => {
    const data = event.dataTransfer.getData(STITCH_DRAG_TYPE);
    if (!data || !onDropGroup || !frame) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    onDropGroup(Number(data), { x: (event.clientX - rect.left - view.x) / view.zoom, y: (event.clientY - rect.top - view.y) / view.zoom });
  };

  const tileImage = (tile: number) => {
    if (!frame) return null;
    const picture = sharp[tile] ?? pictures[tile];
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
        onClick={() => {
          boxRef.current?.focus();
          // Not while a moved tile waits for its snap: it is still drawn where it was dropped
          if (!busy) onSelect(tile);
        }}
      />
    );
  };

  const outline = (tile: number, isSelected: boolean) => {
    if (!frame) return null;
    const m = frame.toMosaic[tile];
    const image = images[tile];
    if (!m || !image || (!showOutlines && !isSelected)) return null;
    return (
      <React.Fragment key={tile}>
        <Line
          points={cornersOf(m, image.width, image.height)}
          closed
          listening={false}
          stroke={isSelected ? OUTLINE_SELECTED : OUTLINE[statuses[tile] ?? 'good']}
          strokeWidth={isSelected ? 3 : statuses[tile] && statuses[tile] !== 'good' ? 2.5 : 1.5}
          strokeScaleEnabled={false}
          shadowColor="#000000"
          shadowBlur={isSelected ? 2 : 0}
        />
        {showOutlines && (graphicAreas?.[tile] ?? []).map((area, k) => (
          <Line
            key={k}
            points={[[area.x, area.y], [area.x + area.width, area.y], [area.x + area.width, area.y + area.height], [area.x, area.y + area.height]]
              .flatMap(([x, y]) => [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]])}
            closed
            listening={false}
            stroke="#ffee58"
            strokeWidth={1.5}
            dash={[6, 4]}
            strokeScaleEnabled={false}
          />
        ))}
      </React.Fragment>
    );
  };

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', minHeight: 300, bgcolor: 'action.hover', borderRadius: 1, overflow: 'hidden' }}>
      <Box
        ref={setBox}
        data-testid="stitch-canvas"
        data-tiles-drawn={tiles.filter((t) => pictures[t]).length}
        data-sharp={Object.keys(sharp).length}
        data-selected-at={selectedAt}
        data-zoom={view.zoom}
        data-graphics={frame && graphicAreas ? tiles.reduce((sum, t) => sum + (graphicAreas[t]?.length ?? 0), 0) : 0}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onDragOver={(event) => {
          if (onDropGroup && event.dataTransfer.types.includes(STITCH_DRAG_TYPE)) event.preventDefault();
        }}
        onDrop={handleDrop}
        sx={{ position: 'absolute', inset: 0, cursor: 'grab', outline: 'none' }}
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
            boxRef.current?.focus();
            if (event.target === event.target.getStage() && !busy) onSelect(null);
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
                onClick={() => { if (!busy) onSelect(null); }}
              />
            )}
            {others.map(tileImage)}
            <Group listening={false}>{others.map((tile) => outline(tile, false))}</Group>
            <Group
              ref={unitRef}
              draggable={canChange && unit.length > 0}
              opacity={unit.length === 0 ? 1 : dragging ? Math.min(0.6, 1 - seeThrough) : 1 - seeThrough}
              onDragStart={() => setDragging(true)}
              onDragEnd={(event) => {
                // Not the pan of the whole canvas
                event.cancelBubble = true;
                setDragging(false);
                reportMove();
              }}
              onTransformStart={() => setDragging(true)}
              onTransformEnd={() => {
                setDragging(false);
                reportMove();
              }}
            >
              {unit.map(tileImage)}
              {unit.map((tile) => outline(tile, true))}
            </Group>
            <Transformer
              ref={handleRef}
              resizeEnabled={false}
              rotateEnabled
              rotateAnchorOffset={28}
              borderEnabled={false}
              anchorSize={12}
              anchorStroke="#000000"
              anchorFill="#ffffff"
              anchorCornerRadius={6}
              rotationSnaps={[]}
            />
            {frame && crop && (
              <Rect
                x={crop.left}
                y={crop.top}
                width={crop.width}
                height={crop.height}
                listening={false}
                stroke="#ffffff"
                strokeWidth={2}
                dash={[8, 6]}
                strokeScaleEnabled={false}
                shadowColor="#000000"
                shadowBlur={2}
              />
            )}
          </Layer>
        </Stage>
      </Box>
      <Stack direction="row" spacing={1.5} sx={{ position: 'absolute', left: 8, bottom: 8, alignItems: 'center', bgcolor: 'background.paper', borderRadius: 1, px: 1, py: 0.25, opacity: 0.92 }}>
        <Button size="small" onClick={fit}>Fit</Button>
        <FormControlLabel
          control={<Switch size="small" checked={showOutlines} onChange={(event) => setShowOutlines(event.target.checked)} />}
          label="Outlines"
          sx={{ mr: 0 }}
        />
        {unit.length > 0 && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography variant="body2">See through</Typography>
            <Slider
              size="small"
              min={0}
              max={0.8}
              step={0.05}
              value={seeThrough}
              onChange={(_event, value) => setSeeThrough(Array.isArray(value) ? value[0] : value)}
              aria-label="See through the selected image"
              sx={{ width: 100 }}
            />
          </Stack>
        )}
      </Stack>
    </Box>
  );
};
