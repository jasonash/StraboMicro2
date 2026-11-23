/**
 * Saved Grain Size analyses + the shared analysis run (Claire's issue #64):
 * src/utils/savedGrainAnalyses.ts and src/utils/grainAnalysisRun.ts.
 *
 *   npm run test:saved-grain-analyses
 */

import {
  homeForScope, scopeOfHome, analysisNameProblem, nextAnalysisName, cleanAnalysisName, orderedSpotIds,
  resolveAnalysisSpots, missingSpotsText, analysisUnchanged, mineralChoices, tagChoices, spotMatchesListFilter,
  isSpotListFilterOn, NO_MINERAL, NO_SPOT_LIST_FILTER, MAX_ANALYSIS_NAME,
} from '@/utils/savedGrainAnalyses';
import { micrographsInScope, polygonSpotsOf, runGrainAnalysis, sampleNameOf } from '@/utils/grainAnalysisRun';
import type { MicrographMetadata, ProjectMetadata, SavedGrainAnalysis, Spot } from '@/types/project-types';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A w x h rectangle grain at (x, y) */
function grain(id: string, x: number, y: number, w: number, h: number, extra: Partial<Spot> = {}): Spot {
  return {
    id, name: id, geometryType: 'polygon',
    points: [{ X: x, Y: y }, { X: x + w, Y: y }, { X: x + w, Y: y + h }, { X: x, Y: y + h }],
    ...extra,
  } as Spot;
}
const quartz = { mineralogy: { minerals: [{ name: 'Quartz' }] } } as Partial<Spot>;
const feldspar = { mineralogy: { minerals: [{ name: 'Feldspar' }] } } as Partial<Spot>;

const m1 = {
  id: 'm1', name: 'Thin section', width: 1000, height: 1000, scalePixelsPerCentimeter: 1000,
  spots: [
    grain('a', 10, 10, 100, 20, { ...quartz, tags: ['t1'] }),
    grain('b', 200, 10, 50, 50, { ...feldspar, tags: ['t2'], notes: 'n' }),
    grain('c', 300, 10, 80, 10, { ...quartz }),
    grain('arch', 400, 10, 10, 10, { archived: true }),
    { id: 'pt', name: 'pt', geometryType: 'point', points: [{ X: 1, Y: 1 }] } as Spot,
    grain('d', 500, 10, 30, 30),
  ],
} as MicrographMetadata;
const m2 = {
  id: 'm2', name: 'Other', width: 500, height: 500, scalePixelsPerCentimeter: 1000,
  spots: [grain('e', 10, 10, 40, 40, { ...feldspar })],
} as MicrographMetadata;
const project = {
  id: 'P', name: 'P',
  tags: [{ id: 't1', name: 'D1' }, { id: 't2', name: 'D2' }, { id: 't3', name: 'Unused' }],
  datasets: [{ id: 'd', name: 'd', samples: [{ id: 's', name: 'Sample name', label: 'S-1', micrographs: [m1, m2] }] }],
} as ProjectMetadata;
const lookup = (id: string) => [m1, m2].find((m) => m.id === id);

// --- Homes --------------------------------------------------------------------------
check('current scope lives on the micrograph', same(homeForScope('current', 'm1'), { kind: 'micrograph', micrographId: 'm1' }));
check('all scope lives on the project', same(homeForScope('all', 'm1'), { kind: 'project' }));
check('current scope without a micrograph has no home', homeForScope('current', null) === null);
check('scope of a home', scopeOfHome({ kind: 'project' }) === 'all' && scopeOfHome({ kind: 'micrograph', micrographId: 'm1' }) === 'current');

// --- Names --------------------------------------------------------------------------
const saved: SavedGrainAnalysis[] = [
  { id: 'x', name: 'Analysis 1', spotIds: ['a'], rockType: 'igneous', date: 't' },
  { id: 'y', name: 'Quartz D1', spotIds: ['a', 'c'], rockType: 'metamorphic', date: 't' },
];
check('empty name refused', analysisNameProblem('   ', saved) !== null);
check('taken name refused, any case', analysisNameProblem(' quartz d1 ', saved) !== null);
check('renaming to its own name allowed', analysisNameProblem('Quartz D1', saved, 'y') === null);
check('free name allowed', analysisNameProblem('Feldspar', saved) === null);
check('next default name skips taken ones', nextAnalysisName(saved) === 'Analysis 2', nextAnalysisName(saved));
check('next default name on an empty list', nextAnalysisName(null) === 'Analysis 1');
check('name trimmed and cut', cleanAnalysisName(`  ${'x'.repeat(200)}  `).length === MAX_ANALYSIS_NAME);

// --- Spots --------------------------------------------------------------------------
const items1 = polygonSpotsOf([m1]);
check('polygon spots: archived and points left out, tree order', same(items1.map((i) => i.spot.id), ['a', 'b', 'c', 'd']));
check('ordered ids follow the list, not click order', same(orderedSpotIds(items1, new Set(['d', 'a'])), ['a', 'd']));
const r = resolveAnalysisSpots({ spotIds: ['a', 'gone', 'arch', 'c', 'a'] }, items1);
check('resolve: present spots kept, gone and archived counted once each', same(r.items.map((i) => i.spot.id), ['a', 'c']) && r.missing === 2, r);
check('missing text: none', missingSpotsText(0) === '');
check('missing text: one', missingSpotsText(1).startsWith('1 spot saved'));
check('missing text: several', missingSpotsText(3).startsWith('3 spots saved'));
check('unchanged: same set, other order', analysisUnchanged(saved[1], ['c', 'a'], 'metamorphic'));
check('changed: rock type', !analysisUnchanged(saved[1], ['a', 'c'], 'igneous'));
check('changed: spots', !analysisUnchanged(saved[1], ['a'], 'metamorphic'));

// --- Filters ------------------------------------------------------------------------
check('mineral choices sorted, no-mineral last', same(mineralChoices(items1), ['Feldspar', 'Quartz', NO_MINERAL]), mineralChoices(items1));
check('tag choices: only used tags, project order', same(tagChoices(project, items1).map((t) => t.id), ['t1', 't2']));
const match = (f: Parameters<typeof spotMatchesListFilter>[2]) => items1.filter((i) => spotMatchesListFilter(project, i.spot, f)).map((i) => i.spot.id);
check('no filter matches all', same(match(NO_SPOT_LIST_FILTER), ['a', 'b', 'c', 'd']) && !isSpotListFilterOn(NO_SPOT_LIST_FILTER));
check('mineral filter', same(match({ minerals: ['Quartz'], tagIds: [], sections: [] }), ['a', 'c']));
check('no-mineral filter', same(match({ minerals: [NO_MINERAL], tagIds: [], sections: [] }), ['d']));
check('tag filter (any of)', same(match({ minerals: [], tagIds: ['t1', 't2'], sections: [] }), ['a', 'b']));
check('has-data filter', same(match({ minerals: [], tagIds: [], sections: ['notes'] }), ['b']));
check('filters combine (and)', same(match({ minerals: ['Quartz'], tagIds: ['t1'], sections: [] }), ['a']));

// --- The run ------------------------------------------------------------------------
check('scope current = that micrograph', same(micrographsInScope(project, 'current', m1).map((m) => m.id), ['m1']));
check('scope all = every micrograph', same(micrographsInScope(project, 'all', m1).map((m) => m.id), ['m1', 'm2']));
check('sample name: label first', sampleNameOf(project, 'm2') === 'S-1');
const one = runGrainAnalysis(project, [m1], resolveAnalysisSpots({ spotIds: ['a', 'c'] }, items1).items, lookup, 'current', 'igneous');
check('run: counts the chosen spots only', one.results?.sizeStats.count === 2 && one.measured === 2, one.results?.sizeStats);
check('run: rock type passed through', one.results?.rockType === 'igneous', one.results?.rockType);
// 1000 px/cm = 10 um/px; m1 is 1000 x 1000 px = 1e8 um2; a = 100x20 px = 2e5 um2, c = 80x10 = 8e4
check('run: coverage against the micrograph', Math.abs((one.results?.totalAreaPercent ?? 0) - 0.28) < 1e-6, one.results?.totalAreaPercent);
const all = runGrainAnalysis(project, micrographsInScope(project, 'all', null), polygonSpotsOf([m1, m2]), lookup, 'all', 'sedimentary');
check('run all: every polygon in both micrographs', all.results?.sizeStats.count === 5 && all.frames.length === 2, all.frames);
const none = runGrainAnalysis(project, [m1], [], lookup, 'current', 'sedimentary');
check('run: no spots = no results', none.results === null && none.measured === 0);

console.log(failures === 0 ? `\nALL PASSED (${passes} checks)` : `\n${failures} FAILED, ${passes} passed`);
process.exit(failures === 0 ? 0 : 1);
