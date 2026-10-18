/**
 * Grain Spot in the viewer (docs/click-a-grain-design.md): while the tool is
 * active, hands the view on screen to the model after every pan or zoom
 * (once things are still for a moment), and turns a click into a grain
 * outline in image coordinates.
 *
 * What the model sees is the image layer as drawn (reference image, tiles,
 * associated images), cropped to the part of the image on screen, at screen
 * resolution: zooming in on fine grains is how the user picks the scale.
 */

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type Konva from 'konva';
import {
  start, prepareView, outlineAt, releaseView, isLoaded, useGrainSpotStore,
} from '@/services/grainSpot/grainSpotEngine';
import type { Point } from '@/utils/grainOutline';

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
}

export interface GrainClickResult {
  /** Closed ring in image coordinates (first point not repeated) */
  ring: Array<[number, number]>;
  touchesEdge: boolean;
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
    const info = { viewId, left, top, scale: width / (right - left), zoom: z, position: { ...p } };
    viewRef.current = info;
    return info;
  }, [stageRef]);

  // Load the model when the tool is picked; forget the view when it is put down
  useEffect(() => {
    if (!active) return;
    void start();
    return () => {
      viewRef.current = null;
      releaseView();
    };
  }, [active]);

  // Analyze the view once it has been still for a moment
  useEffect(() => {
    if (!active || !loaded) return;
    const timer = setTimeout(capture, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [active, loaded, capture, zoom, position.x, position.y, stageSize.width, stageSize.height, imageWidth, imageHeight, contentKey]);

  /**
   * The grain at this screen (stage) point, or null when nothing is there.
   * A click right after a pan or zoom analyzes the new view first.
   */
  const outlineAtScreen = useCallback(async (screenX: number, screenY: number): Promise<GrainClickResult | null> => {
    let view = viewRef.current;
    const { zoom: z, position: p } = latest.current;
    if (!view || view.zoom !== z || view.position.x !== p.x || view.position.y !== p.y) view = capture();
    if (!view) return null;
    const click: Point = [(screenX - view.left) * view.scale, (screenY - view.top) * view.scale];
    const found = await outlineAt(view.viewId, click);
    if (!found) return null;
    const v = view;
    const ring = found.points.map(([vx, vy]): [number, number] => {
      const sx = v.left + vx / v.scale;
      const sy = v.top + vy / v.scale;
      return [(sx - v.position.x) / v.zoom, (sy - v.position.y) / v.zoom];
    });
    return { ring, touchesEdge: found.touchesEdge };
  }, [capture]);

  return { outlineAtScreen };
}
