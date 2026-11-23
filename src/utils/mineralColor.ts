/**
 * A mineral's color for View Spots by Mineral Color: the project's color,
 * else this computer's Global color, else the built-in default, else gray.
 * Names match without regard to case. Shared by the spot renderer, the
 * Mineralogy/Lithology dialog swatches and the right pane (Claire, 2026-11-23).
 *
 *   npm run test:mineral-color
 */

import type { MineralColorEntry } from '../types/mineral-color-types';
import { DEFAULT_MINERAL_COLORS, NO_MINERAL_COLOR } from '../constants/mineralColorDefaults';

export type MineralColorSource = 'project' | 'global' | 'default' | 'none';

export interface ResolvedMineralColor {
  color: string;
  source: MineralColorSource;
}

function findEntry(entries: MineralColorEntry[] | null | undefined, nameLower: string): MineralColorEntry | undefined {
  return entries?.find((e) => e.mineral.toLowerCase() === nameLower);
}

export function resolveMineralColor(
  mineral: string | null | undefined,
  projectColors: MineralColorEntry[] | null | undefined,
  globalColors: MineralColorEntry[] | null | undefined,
): ResolvedMineralColor {
  const name = mineral?.trim().toLowerCase();
  if (!name) return { color: NO_MINERAL_COLOR, source: 'none' };
  const project = findEntry(projectColors, name);
  if (project) return { color: project.color, source: 'project' };
  const global = findEntry(globalColors, name);
  if (global) return { color: global.color, source: 'global' };
  const builtIn = findEntry(DEFAULT_MINERAL_COLORS, name);
  if (builtIn) return { color: builtIn.color, source: 'default' };
  return { color: NO_MINERAL_COLOR, source: 'none' };
}

/**
 * The project's colors with this mineral set to color: an entry with the
 * same name (any case) is changed in place, else one is added at the end.
 */
export function withMineralColor(
  entries: MineralColorEntry[] | null | undefined,
  mineral: string,
  color: string,
): MineralColorEntry[] {
  const list = entries ?? [];
  const nameLower = mineral.trim().toLowerCase();
  if (list.some((e) => e.mineral.toLowerCase() === nameLower)) {
    return list.map((e) => (e.mineral.toLowerCase() === nameLower ? { ...e, color } : e));
  }
  return [...list, { mineral: mineral.trim(), color }];
}

/** The project's colors with every change in changes (mineral name -> color) applied */
export function withMineralColors(
  entries: MineralColorEntry[] | null | undefined,
  changes: Record<string, string>,
): MineralColorEntry[] {
  let list = entries ?? [];
  for (const [mineral, color] of Object.entries(changes)) list = withMineralColor(list, mineral, color);
  return list;
}
