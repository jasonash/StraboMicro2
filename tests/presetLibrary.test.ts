/**
 * Moving Quick Spot Presets (src/utils/presetLibrary.ts): copies get new ids,
 * same names follow the choice, tags stay behind leaving a project, the file
 * round trip and refusals, keys per project.
 *
 *   npm run test:preset-library
 */

import {
  bindPresetKey,
  buildPresetFile,
  keysAfterCopy,
  keysForOpenedProject,
  keysOfPresets,
  parsePresetFile,
  planPresetCopy,
  presetNameConflicts,
  withoutPresetKey,
} from '@/utils/presetLibrary';
import type { QuickApplyPreset } from '@/types/preset-types';

let failures = 0;
let passes = 0;
function eq(label: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        got ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
  }
}
function throwsWith(label: string, fn: () => unknown, part: string) {
  try {
    fn();
    eq(label, 'no error', part);
  } catch (error) {
    eq(label, error instanceof Error && error.message.includes(part), true);
  }
}

const NOW = '2026-10-31T00:00:00Z';
function ids() {
  let n = 0;
  return () => `new-${++n}`;
}
function preset(id: string, name: string, data: QuickApplyPreset['data'] = {}): QuickApplyPreset {
  return { id, name, createdAt: 'old', modifiedAt: 'old', data };
}

// New ids, deep copies
const ol = preset('g1', 'Olivine', { mineralogy: { minerals: [{ name: 'olivine' }] } });
let plan = planPresetCopy([ol], [], 'project', 'skip', NOW, ids());
eq('copy gets a new id', plan.add[0].id, 'new-1');
eq('copy gets new times', [plan.add[0].createdAt, plan.add[0].modifiedAt], [NOW, NOW]);
eq('target map', plan.targetIds, { g1: 'new-1' });
eq('copy keeps its data', plan.add[0].data, ol.data);
eq('copy is deep', plan.add[0].data.mineralogy === ol.data.mineralogy, false);

// Same names
const inProject = preset('p1', ' olivine ', { color: 'red' });
eq('conflicts ignore case and spaces', presetNameConflicts([ol, preset('g2', 'Quartz')], [inProject]), ['Olivine']);
plan = planPresetCopy([ol], [inProject], 'project', 'skip', NOW, ids());
eq('skip adds nothing', [plan.add.length, plan.replace.length, plan.skipped], [0, 0, ['Olivine']]);
eq('skip still maps to the one there', plan.targetIds, { g1: 'p1' });
plan = planPresetCopy([ol], [inProject], 'project', 'replace', NOW, ids());
eq('replace keeps id + createdAt', [plan.replace[0].id, plan.replace[0].createdAt, plan.replace[0].modifiedAt], ['p1', 'old', NOW]);
eq('replace takes the new data', plan.replace[0].data, ol.data);
plan = planPresetCopy([preset('a', 'X', { opacity: 1 }), preset('b', 'x', { opacity: 2 })], [], 'global', 'replace', NOW, ids());
eq('two sources, one name, replace: one preset, the later', [plan.add.length, plan.add[0].data.opacity], [1, 2]);
eq('both map to it', plan.targetIds, { a: plan.add[0].id, b: plan.add[0].id });
plan = planPresetCopy([preset('a', 'X', { opacity: 1 }), preset('b', 'x', { opacity: 2 })], [], 'global', 'skip', NOW, ids());
eq('two sources, one name, skip: the first', [plan.add.length, plan.add[0].data.opacity, plan.skipped], [1, 1, ['x']]);

// Tags
const tagged = preset('p2', 'Garnet', { color: 'red', tags: ['t1'] });
plan = planPresetCopy([tagged], [], 'global', 'skip', NOW, ids());
eq('to Global: tags stay behind', [plan.add[0].data.tags, plan.tagsDropped], [undefined, 1]);
eq('source keeps its tags', tagged.data.tags, ['t1']);
plan = planPresetCopy([tagged], [], 'project', 'skip', NOW, ids());
eq('to a project: tags kept', [plan.add[0].data.tags, plan.tagsDropped], [['t1'], 0]);

// File
const named: QuickApplyPreset = { ...tagged, description: 'desc', spotNamePattern: 'Grt-{n}' };
const text = buildPresetFile([named, ol], NOW);
const raw = JSON.parse(text);
eq('file carries no ids', raw.presets[0].id, undefined);
eq('file carries no tags', raw.presets[0].data.tags, undefined);
const back = parsePresetFile(text, NOW);
eq('round trip', back.map((p) => [p.name, p.description, p.spotNamePattern, p.data]), [
  ['Garnet', 'desc', 'Grt-{n}', { color: 'red' }],
  ['Olivine', undefined, undefined, ol.data],
]);
const file = (presets: unknown, extra: object = {}) =>
  JSON.stringify({ format: 'strabomicro-quick-spot-presets', version: 1, presets, ...extra });
throwsWith('not JSON', () => parsePresetFile('{nope', NOW), 'could not be read');
throwsWith('another kind of JSON', () => parsePresetFile('{"a":1}', NOW), 'not a StraboMicro');
throwsWith('newer version', () => parsePresetFile(file([], { version: 2 }), NOW), 'newer version');
throwsWith('no presets', () => parsePresetFile(file([]), NOW), 'no presets');
throwsWith('only unusable presets', () => parsePresetFile(file([{ name: '  ' }, 5]), NOW), 'no presets');
eq('hand-edited: unknown and wrong-kind fields left out', parsePresetFile(file([{
  name: 'A',
  data: { color: 5, opacity: 'x', labelColor: 'blue', mineralogy: 'olivine', veinInfo: [], grainInfo: {}, tags: ['t'], other: 1 },
}]), NOW)[0].data, { labelColor: 'blue', grainInfo: {} });

// Keys
eq('binding frees the old key', bindPresetKey({ 1: 'a' }, '2', 'a'), { 2: 'a' });
eq('binding takes over the key', bindPresetKey({ 1: 'a' }, '1', 'b'), { 1: 'b' });
eq('null clears', bindPresetKey({ 1: 'a' }, '1', null), {});
eq('without preset', withoutPresetKey({ 1: 'a', 2: 'b' }, 'a'), { 2: 'b' });
eq('keys of presets', keysOfPresets({ 1: 'a', 2: 'b' }, [{ id: 'b' }]), { 2: 'b' });
eq('opened: remembered wins', keysForOpenedProject({ 3: 'c' }, { 1: 'g' }, { 2: 'p' }, [{ id: 'p' }]), { 3: 'c' });
eq('opened: remembered empty stays empty', keysForOpenedProject({}, { 1: 'g' }, {}, []), {});
eq('opened first time: global keys', keysForOpenedProject(undefined, { 1: 'g' }, { 2: 'other' }, []), { 1: 'g' });
eq('opened first time: own older keys win', keysForOpenedProject(undefined, { 1: 'g' }, { 1: 'p' }, [{ id: 'p' }]), { 1: 'p' });
eq('copy takes the key', keysAfterCopy({ 1: 'g1', 2: 'g2' }, { g1: 'c1' }), { 1: 'c1', 2: 'g2' });
eq('skipped copy: key moves to the one there', keysAfterCopy({ 1: 'g1' }, { g1: 'p1' }), { 1: 'p1' });
eq('from a file: ids match nothing', keysAfterCopy({ 1: 'g1' }, { 'file-0': 'c' }), { 1: 'g1' });

console.log(`preset library: ${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
