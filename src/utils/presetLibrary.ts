/**
 * Moving Quick Spot Presets between Global, Project and a file (2026-10-31:
 * a new project should not mean typing the presets in again).
 *
 * A copy always gets a new id: dedupeImportedPresets drops a project preset
 * whose id matches a global one, so a copy keeping its id could vanish on
 * .smz import. Tags belong to one project, so they stay behind when a preset
 * leaves it (to Global or to a file).
 */

import type { PresetData, PresetKeyBindings, PresetScope, QuickApplyPreset } from '@/types/preset-types';
import { PRESET_FEATURE_FIELDS } from '@/types/preset-types';

export const PRESET_FILE_FORMAT = 'strabomicro-quick-spot-presets';
export const PRESET_FILE_VERSION = 1;

export type PresetConflictChoice = 'skip' | 'replace';

export interface PresetCopyPlan {
  /** New presets to append to the target */
  add: QuickApplyPreset[];
  /** Same-named presets of the target to overwrite (they keep their id, createdAt) */
  replace: QuickApplyPreset[];
  /** Names left alone because the target has them */
  skipped: string[];
  /** Source preset id -> the target preset now standing for it (also for skipped ones) */
  targetIds: Record<string, string>;
  /** How many presets lost their tags on the way */
  tagsDropped: number;
}

function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Names of the sources the target already has */
export function presetNameConflicts(sources: QuickApplyPreset[], existing: QuickApplyPreset[]): string[] {
  const taken = new Set(existing.map((p) => nameKey(p.name)));
  return sources.filter((p) => taken.has(nameKey(p.name))).map((p) => p.name);
}

function withoutTags(data: PresetData): PresetData {
  const { tags: _tags, ...rest } = data;
  return rest;
}

/** What copying sources into a target comes to. Nothing is changed here. */
export function planPresetCopy(
  sources: QuickApplyPreset[],
  existing: QuickApplyPreset[],
  to: PresetScope,
  choice: PresetConflictChoice,
  now: string,
  newId: () => string
): PresetCopyPlan {
  const plan: PresetCopyPlan = { add: [], replace: [], skipped: [], targetIds: {}, tagsDropped: 0 };
  const existingByName = new Map(existing.map((p) => [nameKey(p.name), p]));
  const addedByName = new Map<string, QuickApplyPreset>();

  for (const source of sources) {
    const key = nameKey(source.name);
    const taken = existingByName.get(key) ?? addedByName.get(key);
    if (taken && choice === 'skip') {
      plan.skipped.push(source.name);
      plan.targetIds[source.id] = taken.id;
      continue;
    }

    const hadTags = to === 'global' && (source.data?.tags?.length ?? 0) > 0;
    if (hadTags) plan.tagsDropped++;
    const data = structuredClone(source.data ?? {});
    const copy: QuickApplyPreset = {
      ...structuredClone(source),
      id: taken?.id ?? newId(),
      createdAt: taken?.createdAt ?? now,
      modifiedAt: now,
      data: to === 'global' ? withoutTags(data) : data,
    };
    plan.targetIds[source.id] = copy.id;

    if (!taken) {
      plan.add.push(copy);
      addedByName.set(key, copy);
    } else if (addedByName.has(key)) {
      // Two sources with one name: the later one wins
      plan.add[plan.add.findIndex((p) => p.id === copy.id)] = copy;
      addedByName.set(key, copy);
    } else {
      const at = plan.replace.findIndex((p) => p.id === copy.id);
      if (at >= 0) plan.replace[at] = copy;
      else plan.replace.push(copy);
    }
  }
  return plan;
}

/** The text of a presets file. Ids and tags stay behind (both mean something only here). */
export function buildPresetFile(presets: QuickApplyPreset[], now: string): string {
  return JSON.stringify({
    format: PRESET_FILE_FORMAT,
    version: PRESET_FILE_VERSION,
    exportedAt: now,
    presets: presets.map((p) => ({
      name: p.name,
      ...(p.description ? { description: p.description } : {}),
      ...(p.spotNamePattern ? { spotNamePattern: p.spotNamePattern } : {}),
      data: withoutTags(p.data ?? {}),
    })),
  }, null, 2);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Only the fields a preset can hold, of the right kind; anything else in a hand-edited file is left out */
function readPresetData(raw: unknown): PresetData {
  const data: Record<string, unknown> = {};
  if (!isPlainObject(raw)) return data;
  for (const field of ['color', 'labelColor'] as const) {
    if (typeof raw[field] === 'string') data[field] = raw[field];
  }
  if (typeof raw.opacity === 'number') data.opacity = raw.opacity;
  for (const field of PRESET_FEATURE_FIELDS) {
    if (isPlainObject(raw[field])) data[field] = raw[field];
  }
  return data;
}

/**
 * The presets in a file's text, ready for planPresetCopy (their ids are only
 * placeholders). Throws an Error with a message for the user.
 */
export function parsePresetFile(text: string, now: string): QuickApplyPreset[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('This file could not be read as a presets file.');
  }
  if (!isPlainObject(parsed) || parsed.format !== PRESET_FILE_FORMAT || !Array.isArray(parsed.presets)) {
    throw new Error('This file is not a StraboMicro Quick Spot Presets file.');
  }
  if (typeof parsed.version === 'number' && parsed.version > PRESET_FILE_VERSION) {
    throw new Error('This presets file was made by a newer version of StraboMicro. Please update the app.');
  }

  const presets: QuickApplyPreset[] = [];
  parsed.presets.forEach((raw: unknown, index: number) => {
    if (!isPlainObject(raw) || typeof raw.name !== 'string' || !raw.name.trim()) return;
    presets.push({
      id: `file-${index}`,
      name: raw.name.trim(),
      description: typeof raw.description === 'string' ? raw.description : undefined,
      spotNamePattern: typeof raw.spotNamePattern === 'string' ? raw.spotNamePattern : undefined,
      createdAt: now,
      modifiedAt: now,
      data: readPresetData(raw.data),
    });
  });
  if (presets.length === 0) throw new Error('This file has no presets in it.');
  return presets;
}

/** Key on this preset (a preset holds at most one), any key it held before freed; null clears the key */
export function bindPresetKey(bindings: PresetKeyBindings, key: string, presetId: string | null): PresetKeyBindings {
  const next = { ...bindings };
  if (presetId === null) {
    delete next[key];
    return next;
  }
  for (const [k, id] of Object.entries(next)) {
    if (id === presetId) delete next[k];
  }
  next[key] = presetId;
  return next;
}

export function withoutPresetKey(bindings: PresetKeyBindings, presetId: string): PresetKeyBindings {
  return Object.fromEntries(Object.entries(bindings).filter(([, id]) => id !== presetId));
}

/** Only the keys held by these presets */
export function keysOfPresets(bindings: PresetKeyBindings, presets: Array<{ id: string }>): PresetKeyBindings {
  const ids = new Set(presets.map((p) => p.id));
  return Object.fromEntries(Object.entries(bindings).filter(([, id]) => ids.has(id)));
}

/**
 * Keys when a project opens: what this computer remembers for it, else the
 * keys of global presets, plus keys already on its own presets (bindings made
 * before keys were remembered per project).
 */
export function keysForOpenedProject(
  remembered: PresetKeyBindings | undefined,
  globalKeys: PresetKeyBindings,
  liveKeys: PresetKeyBindings,
  projectPresets: Array<{ id: string }>
): PresetKeyBindings {
  return remembered ?? { ...globalKeys, ...keysOfPresets(liveKeys, projectPresets) };
}

/** Each source's key moves to the copy standing for it */
export function keysAfterCopy(bindings: PresetKeyBindings, targetIds: Record<string, string>): PresetKeyBindings {
  let next = bindings;
  for (const [key, id] of Object.entries(bindings)) {
    const target = targetIds[id];
    if (target) next = bindPresetKey(next, key, target);
  }
  return next;
}
