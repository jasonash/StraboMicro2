/**
 * Building a new spot (src/utils/newSpot.ts), shared by New Spot and auto
 * spot mode (docs/auto-spot-mode-design.md 5.3): legacy geometry, legacy
 * colors, the remembered appearance, preset prefill, preset merge with the
 * appearance winning, appliedPresetIds.
 *
 *   npm run test:new-spot
 */

import {
  buildNewSpot,
  lastUsedSpotTags,
  rememberSpotTags,
  geometryToLegacy,
  lastUsedSpotAppearance,
  rememberSpotAppearance,
  withPresetAppearance,
  withPresetTags,
} from '@/utils/newSpot';
import type { Geometry } from '@/types/project-types';
import { mergePresetIntoSpot } from '@/store/helpers';
import type { PresetData } from '@/types/preset-types';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}
function eq(label: string, got: unknown, want: unknown) {
  check(`${label} = ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want), got);
}

// A Map-backed localStorage for Node
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k) : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};

const point: Geometry = { type: 'Point', coordinates: [10, 20] };
const line: Geometry = { type: 'LineString', coordinates: [[1, 2], [3, 4], [5, 6]] };
const polygon: Geometry = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]] };
const white = { labelColor: '#ffffff', spotColor: '#00ff00', opacity: 50 };

// Geometry
eq('point', geometryToLegacy(point), { geometryType: 'point', points: [{ X: 10, Y: 20 }] });
eq('line', geometryToLegacy(line), { geometryType: 'line', points: [{ X: 1, Y: 2 }, { X: 3, Y: 4 }, { X: 5, Y: 6 }] });
eq('polygon (outer ring)', geometryToLegacy(polygon),
  { geometryType: 'polygon', points: [{ X: 0, Y: 0 }, { X: 10, Y: 0 }, { X: 10, Y: 10 }, { X: 0, Y: 0 }] });

// Remembered appearance
eq('defaults with nothing saved', lastUsedSpotAppearance(), white);
rememberSpotAppearance({ labelColor: '#123456', spotColor: '#ff0000', opacity: 70 });
eq('saved spot color and opacity; label always starts white', lastUsedSpotAppearance(),
  { labelColor: '#ffffff', spotColor: '#ff0000', opacity: 70 });
store.set('spot_opacity', 'junk');
eq('unreadable opacity falls back to 50', lastUsedSpotAppearance().opacity, 50);
store.clear();

// Preset prefill
const olivine: PresetData = { color: '0x336699ff', opacity: 80, labelColor: '0xffff00ff', mineralogy: { minerals: [{ name: 'Olivine' }] } as PresetData['mineralogy'] };
const opacityOnly: PresetData = { opacity: 20 };
const nothing: PresetData = {};
eq('preset sets spot color + opacity, not label', withPresetAppearance(white, [{ data: olivine }]),
  { labelColor: '#ffffff', spotColor: '#336699', opacity: 80 });
eq('later preset wins', withPresetAppearance(white, [{ data: olivine }, { data: opacityOnly }]),
  { labelColor: '#ffffff', spotColor: '#336699', opacity: 20 });
eq('preset without appearance changes nothing', withPresetAppearance(white, [{ data: nothing }]), white);
eq('opacity 0 counts', withPresetAppearance(white, [{ data: { opacity: 0 } }]).opacity, 0);
check('input not changed', JSON.stringify(white) === JSON.stringify({ labelColor: '#ffffff', spotColor: '#00ff00', opacity: 50 }));

// Building
const now = new Date('2026-10-13T13:00:00.000Z');
const a = buildNewSpot({ name: '  Ol-1 ', notes: ' note ', geometry: point, appearance: white, now });
eq('name trimmed', a.name, 'Ol-1');
eq('notes trimmed', a.notes, 'note');
eq('legacy colors', [a.labelColor, a.color], ['0xffffffff', '0x00ff00ff']);
eq('opacity', a.opacity, 50);
eq('date + time', [a.date, a.time], [now.toISOString(), now.toISOString()]);
eq('modifiedTimestamp', a.modifiedTimestamp, now.getTime());
eq('geometry', [a.geometryType, a.points], ['point', [{ X: 10, Y: 20 }]]);
check('id is a uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(a.id), a.id);
check('ids differ', buildNewSpot({ name: 'x', geometry: point, appearance: white }).id !== a.id);
eq('no notes = empty string', buildNewSpot({ name: 'x', geometry: point, appearance: white }).notes, '');
check('no presets: no appliedPresetIds, no mineralogy', a.appliedPresetIds === undefined && a.mineralogy === undefined, a);

const appearance = withPresetAppearance(white, [{ data: olivine }]);
const b = buildNewSpot({ name: 'Ol-2', geometry: polygon, appearance, presets: [{ id: 'p-ol', data: olivine }], now });
eq('preset data merged', b.mineralogy?.minerals?.map((m) => m.name), ['Olivine']);
eq('appliedPresetIds', b.appliedPresetIds, ['p-ol']);
eq('appearance wins over the preset label color', b.labelColor, '0xffffffff');
eq('spot color from the prefill', b.color, '0x336699ff');
eq('opacity from the prefill', b.opacity, 80);

const overridden = { labelColor: '#000000', spotColor: '#abcdef', opacity: 33 };
const c = buildNewSpot({ name: 'Ol-3', geometry: line, appearance: overridden, presets: [{ id: 'p-ol', data: olivine }] });
eq('controls changed after the prefill win', [c.labelColor, c.color, c.opacity], ['0x000000ff', '0xabcdefff', 33]);

const d = buildNewSpot({ name: 'two', geometry: point, appearance: white, presets: [{ id: 'p1', data: olivine }, { id: 'p2', data: olivine }] });
eq('two presets: minerals appended', d.mineralogy?.minerals?.length, 2);
eq('two presets: ids in order', d.appliedPresetIds, ['p1', 'p2']);
check('preset data not shared with the spot', d.mineralogy?.minerals?.[0] !== olivine.mineralogy?.minerals?.[0]);

// Tags (Peter, 2026-10-29)
eq('no tags: no tags field', a.tags, undefined);
const t = buildNewSpot({ name: 'tagged', geometry: point, appearance: white, tagIds: ['t1', 't2', 't1'] });
eq('tag ids on the spot, once each', t.tags, ['t1', 't2']);
eq('empty tag list: no tags field', buildNewSpot({ name: 'x', geometry: point, appearance: white, tagIds: [] }).tags, undefined);
const e = buildNewSpot({ name: 'both', geometry: point, appearance: white, presets: [{ id: 'p-ol', data: olivine }], tagIds: ['t1'] });
eq('tags with a preset', [e.tags, e.appliedPresetIds], [['t1'], ['p-ol']]);

eq('nothing remembered yet', lastUsedSpotTags('proj-a', ['t1']), []);
rememberSpotTags('proj-a', ['t1', 't2']);
eq('last tags of the project', lastUsedSpotTags('proj-a', ['t1', 't2', 't3']), ['t1', 't2']);
eq('a deleted tag is left out', lastUsedSpotTags('proj-a', ['t2']), ['t2']);
eq('another project starts empty', lastUsedSpotTags('proj-b', ['t1', 't2']), []);
eq('no project', lastUsedSpotTags(null, ['t1']), []);
rememberSpotTags('proj-a', []);
eq('cleared tags are remembered as none', lastUsedSpotTags('proj-a', ['t1', 't2']), []);

// Preset tags (project presets)
const tagged: PresetData = { tags: ['t1', 't-gone'] };
eq('preset tags added after current, existing only, once each', withPresetTags(['t2', 't1'], [{ data: tagged }], ['t1', 't2']), ['t2', 't1']);
eq('preset tags into empty', withPresetTags([], [{ data: tagged }, { data: { tags: ['t3'] } }], ['t1', 't3']), ['t1', 't3']);
eq('preset without tags', withPresetTags(['t1'], [{ data: olivine }], ['t1']), ['t1']);
const auto = buildNewSpot({ name: 'auto', geometry: point, appearance: white, presets: [{ id: 'p-t', data: tagged }], existingTagIds: ['t1'] });
eq('auto spot mode (no Tags field): preset tags on the spot, deleted ones left out', auto.tags, ['t1']);
const fromDialog = buildNewSpot({ name: 'dlg', geometry: point, appearance: white, presets: [{ id: 'p-t', data: tagged }], tagIds: ['t2'], existingTagIds: ['t1', 't2'] });
eq("New Spot's Tags field is final (a chip removed stays removed)", fromDialog.tags, ['t2']);
const cleared = buildNewSpot({ name: 'clr', geometry: point, appearance: white, presets: [{ id: 'p-t', data: tagged }], tagIds: [], existingTagIds: ['t1'] });
eq('Tags field cleared: no tags even with a tagged preset', cleared.tags, undefined);

// Quick Edit / Quick Apply (mergePresetIntoSpot): added to the spot's tags, never twice
const has = buildNewSpot({ name: 'has', geometry: point, appearance: white, tagIds: ['t1'] });
mergePresetIntoSpot(has, { tags: ['t1', 't2', 't-gone'] }, new Set(['t1', 't2']));
eq('preset applied: tags added once, deleted ones left out', has.tags, ['t1', 't2']);
const plain = buildNewSpot({ name: 'plain', geometry: point, appearance: white });
mergePresetIntoSpot(plain, olivine, new Set(['t1']));
eq('preset without tags leaves tags alone', plain.tags, undefined);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
