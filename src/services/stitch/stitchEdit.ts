/**
 * Image stitcher: the layout as the user changes it on the review screen. Pure, no images.
 *
 * An edit (StitchEdit) is the layout plus what the user did to it: tiles left out, tiles placed
 * by hand, tiles that are no longer where the automatic pass put them, and pieces (several tiles
 * placed by hand as one group, which keep moving together). Every change returns a new edit, so
 * undo is a list of edits.
 *
 * The mosaic is the layout's first group (the "main" group). Its frame never changes: tiles the
 * user did not touch keep their placements, so "Reset to automatic" can put a tile back.
 *
 * Design: docs/image-stitcher-design.md (decisions 10, 11, 12, 14)
 */

import type { AffineMatrix } from '@/utils/affineTransform';
import { apply, invert, multiply } from '../autoPlace/placementMatch.ts';
import {
  groupOfTile, groupToMosaic, joinGroups, moveTiles, rateSeams, sizeAndTurn,
  type MosaicFrame, type Overlap, type StitchGroup, type StitchLayout,
} from './stitchLayout.ts';

export interface StitchEdit {
  layout: StitchLayout;
  /** Tiles of the mosaic that will not be built into it */
  leftOut: ReadonlySet<number>;
  /** Tiles put where they are by hand, with no exact fit found */
  byHand: ReadonlySet<number>;
  /** Tiles that are not where the automatic pass put them (those placed by hand among them) */
  changed: ReadonlySet<number>;
  /** Groups of tiles placed by hand as one piece: they move together */
  pieces: ReadonlyArray<ReadonlyArray<number>>;
}

export type TileStatus = 'good' | 'weak' | 'hand';

export function startEdit(layout: StitchLayout): StitchEdit {
  return { layout, leftOut: new Set(), byHand: new Set(), changed: new Set(), pieces: [] };
}

/** The group that becomes the mosaic */
export function mainGroup(edit: StitchEdit): StitchGroup {
  return edit.layout.groups[0];
}

/** The groups that are not part of the mosaic (shown as "Not placed") */
export function otherGroups(edit: StitchEdit): StitchGroup[] {
  return edit.layout.groups.slice(1);
}

/** The tiles that move with a tile: its piece, or itself */
export function pieceOf(edit: StitchEdit, tile: number): number[] {
  const piece = edit.pieces.find((p) => p.includes(tile));
  return piece ? [...piece] : [tile];
}

const withAll = (set: ReadonlySet<number>, tiles: number[]) => new Set([...set, ...tiles]);
const without = (set: ReadonlySet<number>, tiles: number[]) => new Set([...set].filter((t) => !tiles.includes(t)));

/** The layout with the group that holds a tile first (it stays the mosaic whatever its size) */
function mainFirst(layout: StitchLayout, tile: number): StitchLayout {
  const main = groupOfTile(layout, tile);
  return { ...layout, groups: [main, ...layout.groups.filter((g) => g !== main)] };
}

/** Pieces after some tiles stopped being part of one: a piece needs two tiles */
function piecesWithout(pieces: StitchEdit['pieces'], tiles: number[]): number[][] {
  return pieces.map((p) => p.filter((t) => !tiles.includes(t))).filter((p) => p.length > 1);
}

/** What a move in saved mosaic pixels is in the frame of the main group */
export function deltaInGroup(edit: StitchEdit, frame: MosaicFrame, deltaInMosaic: AffineMatrix): AffineMatrix | null {
  const toMosaic = groupToMosaic(mainGroup(edit), frame);
  if (!toMosaic) return null;
  return multiply(invert(toMosaic), multiply(deltaInMosaic, toMosaic));
}

/**
 * The two sides of a snap for tiles of the mosaic moved by hand: the moved tiles as they lie,
 * and every other tile of the mosaic that is not left out (null: there is nothing to snap to).
 */
export function snapSides(edit: StitchEdit, tiles: number[]): { moved: StitchGroup; target: StitchGroup } | null {
  const main = mainGroup(edit);
  const moving = tiles.filter((t) => main.placements[t] !== undefined);
  const rest = main.tiles.filter((t) => !moving.includes(t) && !edit.leftOut.has(t));
  if (moving.length === 0 || rest.length === 0) return null;
  const side = (list: number[]): StitchGroup => ({ tiles: list, placements: Object.fromEntries(list.map((t) => [t, main.placements[t]])) });
  return { moved: side(moving), target: side(rest) };
}

/**
 * Tiles of the mosaic moved (delta in the main group's frame). snapped: the overlaps a snap
 * found, when delta is its exact fit; null when the tiles stay where the user put them.
 */
export function moveInMosaic(edit: StitchEdit, tiles: number[], delta: AffineMatrix, snapped: Overlap[] | null): StitchEdit {
  const main = mainGroup(edit);
  const moving = tiles.filter((t) => main.placements[t] !== undefined);
  if (moving.length === 0) return edit;
  const layout = mainFirst(moveTiles(edit.layout, moving, delta, snapped ?? []), main.tiles[0]);
  return {
    layout,
    leftOut: edit.leftOut,
    byHand: snapped ? without(edit.byHand, moving) : withAll(edit.byHand, moving),
    changed: withAll(edit.changed, moving),
    // An exact fit holds each tile by itself; tiles placed by hand together stay one piece
    pieces: snapped ? piecesWithout(edit.pieces, moving) : edit.pieces,
  };
}

/**
 * Where a group that is not part of the mosaic lands when dropped at a point of the mosaic
 * (saved mosaic pixels): upright, at the size of the other tiles, its middle on the point.
 * Answer: the group's frame -> the main group's frame.
 */
export function dropPlacement(edit: StitchEdit, frame: MosaicFrame, group: StitchGroup, point: { x: number; y: number }): AffineMatrix | null {
  const toMosaic = groupToMosaic(mainGroup(edit), frame);
  if (!toMosaic) return null;
  // The group's size on the mosaic: its median tile as large as the mosaic's median tile
  const median = (g: StitchGroup, list: number[]) => {
    const scales = list.map((t) => sizeAndTurn(g.placements[t]).scale).sort((a, b) => a - b);
    return scales[scales.length >> 1];
  };
  const main = mainGroup(edit);
  const shown = main.tiles.filter((t) => frame.toMosaic[t]);
  const s = (sizeAndTurn(toMosaic).scale * median(main, shown.length ? shown : main.tiles)) / median(group, group.tiles);
  // Upright on average, like the mosaic itself
  let sin = 0;
  let cos = 0;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const t of group.tiles) {
    const rad = (sizeAndTurn(group.placements[t]).degrees * Math.PI) / 180;
    sin += Math.sin(rad);
    cos += Math.cos(rad);
  }
  const level = -Math.atan2(sin, cos);
  const upright: AffineMatrix = [s * Math.cos(level), -s * Math.sin(level), 0, s * Math.sin(level), s * Math.cos(level), 0];
  for (const t of group.tiles) {
    const { width, height } = edit.layout.tiles[t];
    for (const [x, y] of [[0, 0], [width, 0], [width, height], [0, height]]) {
      const [px, py] = apply(multiply(upright, group.placements[t]), x, y);
      x0 = Math.min(x0, px);
      y0 = Math.min(y0, py);
      x1 = Math.max(x1, px);
      y1 = Math.max(y1, py);
    }
  }
  const inMosaic: AffineMatrix = [upright[0], upright[1], point.x - (x0 + x1) / 2, upright[3], upright[4], point.y - (y0 + y1) / 2];
  return multiply(invert(toMosaic), inMosaic);
}

/**
 * A group that was not part of the mosaic placed on it (groupToMain: its frame -> the main
 * group's frame). snapped: the overlaps a snap found, when groupToMain is its exact fit; null
 * when the group stays where it was dropped, as one piece placed by hand.
 */
export function placeOnMosaic(edit: StitchEdit, group: StitchGroup, groupToMain: AffineMatrix, snapped: Overlap[] | null): StitchEdit {
  const main = mainGroup(edit);
  if (group === main || !edit.layout.groups.includes(group)) return edit;
  const layout = mainFirst(joinGroups(edit.layout, group, main, groupToMain, snapped ?? []), main.tiles[0]);
  const tiles = group.tiles;
  return {
    layout,
    leftOut: without(edit.leftOut, tiles),
    byHand: snapped ? without(edit.byHand, tiles) : withAll(edit.byHand, tiles),
    changed: withAll(edit.changed, tiles),
    pieces: !snapped && tiles.length > 1 ? [...piecesWithout(edit.pieces, tiles), [...tiles]] : piecesWithout(edit.pieces, tiles),
  };
}

export function leaveOut(edit: StitchEdit, tile: number): StitchEdit {
  if (edit.leftOut.has(tile) || mainGroup(edit).placements[tile] === undefined) return edit;
  return { ...edit, leftOut: withAll(edit.leftOut, [tile]) };
}

export function putBack(edit: StitchEdit, tile: number): StitchEdit {
  if (!edit.leftOut.has(tile)) return edit;
  return { ...edit, leftOut: without(edit.leftOut, [tile]) };
}

/** A group that is not part of the mosaic broken into single tiles ("Separate") */
export function separateGroup(edit: StitchEdit, group: StitchGroup): StitchEdit {
  const main = mainGroup(edit);
  if (group === main || group.tiles.length < 2 || !edit.layout.groups.includes(group)) return edit;
  const inGroup = new Set(group.tiles);
  const singles: StitchGroup[] = group.tiles.map((t) => ({ tiles: [t], placements: { [t]: [1, 0, 0, 0, 1, 0] } }));
  const at = edit.layout.groups.indexOf(group);
  const groups = [...edit.layout.groups.slice(0, at), ...singles, ...edit.layout.groups.slice(at + 1)];
  return { ...edit, layout: { ...edit.layout, groups, overlaps: edit.layout.overlaps.filter((o) => !inGroup.has(o.a) && !inGroup.has(o.b)) } };
}

/**
 * One tile back to where the automatic pass had it: its automatic place in the mosaic, or, for
 * a tile the automatic pass did not place, out of the mosaic again as a single image.
 */
export function resetTile(edit: StitchEdit, automatic: StitchLayout, tile: number): StitchEdit {
  const main = mainGroup(edit);
  if (main.placements[tile] === undefined || !edit.changed.has(tile)) return edit;
  const others = edit.layout.overlaps.filter((o) => o.a !== tile && o.b !== tile);
  const rest = {
    leftOut: edit.leftOut,
    byHand: without(edit.byHand, [tile]),
    changed: without(edit.changed, [tile]),
    pieces: piecesWithout(edit.pieces, [tile]),
  };
  const was = automatic.groups[0].placements[tile];
  if (was && main.tiles.length > 1) {
    // Its automatic overlaps come back where the tile at the other end is still in its automatic place
    const back = automatic.overlaps.filter((o) => {
      if (o.a !== tile && o.b !== tile) return false;
      const other = o.a === tile ? o.b : o.a;
      return main.placements[other] !== undefined && !edit.changed.has(other);
    });
    const groups = edit.layout.groups.map((g) => (g === main ? { tiles: main.tiles, placements: { ...main.placements, [tile]: was } } : g));
    return { ...rest, layout: { ...edit.layout, groups, overlaps: [...others, ...back] } };
  }
  if (main.tiles.length < 2) return edit;
  const placements = { ...main.placements };
  delete placements[tile];
  const shrunk: StitchGroup = { tiles: main.tiles.filter((t) => t !== tile), placements };
  const alone: StitchGroup = { tiles: [tile], placements: { [tile]: [1, 0, 0, 0, 1, 0] } };
  const groups = [shrunk, ...edit.layout.groups.filter((g) => g !== main), alone];
  return { ...rest, leftOut: without(edit.leftOut, [tile]), layout: { ...edit.layout, groups, overlaps: others } };
}

/** Per tile of the mosaic: placed by hand, held weakly, or fine (decision 14) */
export function tileStatuses(edit: StitchEdit): Record<number, TileStatus> {
  const rated = rateSeams(edit.layout).tiles;
  const out: Record<number, TileStatus> = {};
  for (const t of mainGroup(edit).tiles) out[t] = edit.byHand.has(t) ? 'hand' : rated[t] === 'weak' ? 'weak' : 'good';
  return out;
}

// ---------------------------------------------------------------- undo

export interface EditHistory {
  past: StitchEdit[];
  now: StitchEdit;
  future: StitchEdit[];
  /** What the last change was, when a following change of the same kind should join it (arrow-key nudges of one tile) */
  joins?: string;
}

const HISTORY_LIMIT = 100;

export function startHistory(edit: StitchEdit): EditHistory {
  return { past: [], now: edit, future: [] };
}

/** A change; joins: changes with the same text one after the other are one undo step */
export function change(history: EditHistory, next: StitchEdit, joins?: string): EditHistory {
  if (next === history.now) return history;
  if (joins && history.joins === joins) return { past: history.past, now: next, future: [], joins };
  return { past: [...history.past, history.now].slice(-HISTORY_LIMIT), now: next, future: [], joins };
}

export function undo(history: EditHistory): EditHistory {
  if (history.past.length === 0) return history;
  return { past: history.past.slice(0, -1), now: history.past[history.past.length - 1], future: [history.now, ...history.future] };
}

export function redo(history: EditHistory): EditHistory {
  if (history.future.length === 0) return history;
  return { past: [...history.past, history.now], now: history.future[0], future: history.future.slice(1) };
}
