/**
 * Grain Spot in the viewer (docs/click-a-grain-design.md): while the tool is
 * active, hands the view on screen to the model after every pan or zoom
 * (once things are still for a moment), and turns a click into a grain
 * outline in image coordinates.
 *
 * What the model sees is the image layer as drawn (reference image, tiles,
 * associated images), cropped to the part of the image on screen, at screen
 * resolution: zooming in on fine grains is how the user picks the scale.
 *
 * While the mouse moves, the grain under it is outlined as a preview
 * (useGrainSpotStore preview). Only the newest mouse position counts: one
 * outline is asked for at a time, and when it comes back the latest position
 * is next. The preview never analyzes a view itself; after a pan or zoom it
 * waits for the new view.
 */

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type Konva from 'konva';
import {
  start, prepareView, outlineAt, releaseView, isLoaded, setPreview, useGrainSpotStore,
} from '@/services/grainSpot/grainSpotEngine';
import { runsOffScreen, type Point, type Sides } from '@/utils/grainOutline';

/** Longest side of the pixels handed to the model (its input is 1024) */
const MAX_VIEW = 1024;
/** Quiet time after a pan, zoom or tile load before the view is analyzed */
const SETTLE_MS = 350;

interface ViewInfo {
  viewId: number;
  /** Screen (stage) position of the view's top-left corner */
  left: number;
  top: number;
  /** View pixels per screen pixel */
  scale: number;
  zoom: number;
  position: { x: number; y: number };
  /** Sides where the screen cut the image (elsewhere the view ends where the image does) */
  cutByScreen: Sides;
}

export interface GrainClickResult {
  /** Closed ring in image coordinates (first point not repeated) */
  ring: Array<[number, number]>;
  /** The grain reaches a side of the screen, so part of it is probably off screen */
  offScreen: boolean;
}

interface Options {
  active: boolean;
  stageRef: RefObject<Konva.Stage | null>;
  zoom: number;
  position: { x: number; y: number };
  stageSize: { width: number; height: number };
  imageWidth: number;
  imageHeight: number;
  /** Changes when what is drawn changes (tiles loaded, image switched, overlays) */
  contentKey: string;
}

export function useGrainSpotTool({ active, stageRef, zoom, position, stageSize, imageWidth, imageHeight, contentKey }: Options) {
  const viewRef = useRef<ViewInfo | null>(null);
  const loaded = useGrainSpotStore((s) => s.modelLoaded);
  const latest = useRef({ zoom, position, stageSize, imageWidth, imageHeight });
  latest.current = { zoom, position, stageSize, imageWidth, imageHeight };
  /** Preview: the newest mouse position (null: none wanted), whether one is being outlined, and a counter that drops stale answers */
  const hoverPos = useRef<{ x: number; y: number } | null>(null);
  const hoverBusy = useRef(false);
  const hoverGeneration = useRef(0);

  /** Hand the current view to the model; null when there is no image on screen */
  const capture = useCallback((): ViewInfo | null => {
    const stage = stageRef.current;
    const layer = stage?.findOne('.image-layer') as Konva.Layer | undefined;
    if (!stage || !layer || !isLoaded()) return null;
    const { zoom: z, position: p, stageSize: s, imageWidth: iw, imageHeight: ih } = latest.current;
    // The part of the image on screen, in stage pixels
    const left = Math.max(0, Math.floor(p.x));
    const top = Math.max(0, Math.floor(p.y));
    const right = Math.min(s.width, Math.ceil(p.x + iw * z));
    const bottom = Math.min(s.height, Math.ceil(p.y + ih * z));
    if (right - left < 16 || bottom - top < 16) return null;
    const source = layer.getNativeCanvasElement();
    const ratio = layer.getCanvas().getPixelRatio();
    const sw = (right - left) * ratio;
    const sh = (bottom - top) * ratio;
    const fit = Math.min(1, MAX_VIEW / Math.max(sw, sh));
    const width = Math.max(1, Math.round(sw * fit));
    const height = Math.max(1, Math.round(sh * fit));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(source, left * ratio, top * ratio, sw, sh, 0, 0, width, height);
    const pixels = ctx.getImageData(0, 0, width, height);
    const viewId = prepareView({ rgba: pixels.data, width, height });
    const cutByScreen = { top: p.y < 0, right: p.x + iw * z > s.width, bottom: p.y + ih * z > s.height, left: p.x < 0 };
    const info = { viewId, left, top, scale: width / (right - left), zoom: z, position: { ...p }, cutByScreen };
    viewRef.current = info;
    return info;
  }, [stageRef]);

  // Load the model when the tool is picked; forget the view when it is put down
  useEffect(() => {
    if (!active) return;
    void start();
    return () => {
      viewRef.current = null;
      hoverPos.current = null;
      hoverGeneration.current++;
      releaseView();
    };
  }, [active]);

  /** The grain at this screen (stage) point in this view, or null when nothing is there */
  const outlineInView = useCallback(async (view: ViewInfo, screenX: number, screenY: number): Promise<GrainClickResult | null> => {
    const click: Point = [(screenX - view.left) * view.scale, (screenY - view.top) * view.scale];
    const found = await outlineAt(view.viewId, click);
    if (!found) return null;
    const ring = found.points.map(([vx, vy]): [number, number] => {
      const sx = view.left + vx / view.scale;
      const sy = view.top + vy / view.scale;
      return [(sx - view.position.x) / view.zoom, (sy - view.position.y) / view.zoom];
    });
    return { ring, offScreen: runsOffScreen(found.edges, view.cutByScreen) };
  }, []);

  /** Is this the view on screen now (no pan or zoom since it was taken)? */
  const isCurrent = (view: ViewInfo | null): view is ViewInfo => {
    const { zoom: z, position: p } = latest.current;
    return view !== null && view.zoom === z && view.position.x === p.x && view.position.y === p.y;
  };

  /**
   * The grain at this screen (stage) point, or null when nothing is there.
   * A click right after a pan or zoom analyzes the new view first.
   */
  const outlineAtScreen = useCallback(async (screenX: number, screenY: number): Promise<GrainClickResult | null> => {
    const view = isCurrent(viewRef.current) ? viewRef.current : capture();
    if (!view) return null;
    return outlineInView(view, screenX, screenY);
  }, [capture, outlineInView]);

  /** Outline the grain at the newest mouse position, then the next newest, until the mouse rests */
  const runHover = useCallback(async () => {
    if (hoverBusy.current) return;
    hoverBusy.current = true;
    try {
      for (;;) {
        const pos = hoverPos.current;
        const view = viewRef.current;
        if (!pos || !isCurrent(view)) return;
        const generation = hoverGeneration.current;
        const found = await outlineInView(view, pos.x, pos.y).catch(() => null);
        // Moved on meanwhile (pan, zoom, preview put away): drop it
        if (generation !== hoverGeneration.current || !isCurrent(view)) continue;
        setPreview(found ? { ring: found.ring, offScreen: found.offScreen } : null);
        if (hoverPos.current === pos) return;
      }
    } finally {
      hoverBusy.current = false;
    }
  }, [outlineInView]);

  /** The mouse is at this screen (stage) point: preview the grain under it */
  const hoverAtScreen = useCallback((screenX: number, screenY: number) => {
    hoverPos.current = { x: screenX, y: screenY };
    void runHover();
  }, [runHover]);

  /** No preview (mouse left, over a spot, or panning) */
  const clearHover = useCallback(() => {
    hoverPos.current = null;
    hoverGeneration.current++;
    setPreview(null);
  }, []);

  // Analyze the view once it has been still for a moment; the preview of the
  // old view goes at once and comes back for the resting mouse in the new one
  useEffect(() => {
    if (!active || !loaded) return;
    hoverGeneration.current++;
    setPreview(null);
    const timer = setTimeout(() => {
      if (capture()) void runHover();
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [active, loaded, capture, runHover, zoom, position.x, position.y, stageSize.width, stageSize.height, imageWidth, imageHeight, contentKey]);

  return { outlineAtScreen, hoverAtScreen, clearHover };
}
