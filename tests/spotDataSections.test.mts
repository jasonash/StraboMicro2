/**
 * Spot data sections + spot filter (src/utils/spotDataSections.ts; View >
 * Filter Spots..., Angus 2026-10-28): "has data" looks inside for real
 * values (an empty list or blank text is no data), every Add Data section is
 * listed, choices combine with AND, Dim/Hide only for spots that do not match.
 *
 *   npm run test:spot-data-sections
 */

import {
  NO_SPOT_FILTER,
  SPOT_DATA_SECTIONS,
  describeSpotFilter,
  hasContent,
  isSpotFilterOn,
  sectionHasData,
  spotFilterLook,
  spotMatchesFilter,
  type SpotFilter,
} from '../src/utils/spotDataSections.ts';
import type { Spot } from '../src/types/project-types.ts';

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

// hasContent
eq('null', hasContent(null), false);
eq('undefined', hasContent(undefined), false);
eq('blank text', hasContent('   '), false);
eq('text', hasContent('x'), true);
eq('zero', hasContent(0), true);
eq('NaN', hasContent(NaN), false);
eq('false', hasContent(false), true);
eq('empty list', hasContent([]), false);
eq('list of nulls', hasContent([null, '']), false);
eq('object of nulls and empty lists', hasContent({ minerals: [], notes: null, method: '' }), false);
eq('nested value', hasContent({ a: { b: [{ c: 'x' }] } }), true);

// Sections: the Add Data list in order, plus Custom User Data
eq('section labels', SPOT_DATA_SECTIONS.map((s) => s.label), [
  'Mineralogy/Lithology', 'Grain Size/Shape/SPO', 'Fabrics', 'Clastic Deformation Bands',
  'Grain Boundaries / Contacts', 'Intragranular Structures', 'Veins', 'Pseudotachylyte', 'Folds',
  'Faults and Shear Zones', 'Extinction Microstructures', 'Fractures', 'Notes', 'Associated Files',
  'Links', 'Custom User Data',
]);
eq('section ids unique', new Set(SPOT_DATA_SECTIONS.map((s) => s.id)).size, SPOT_DATA_SECTIONS.length);

const blank = {} as Spot;
for (const s of SPOT_DATA_SECTIONS) eq(`empty spot has no ${s.label}`, s.has(blank), false);

const spot = (fields: Partial<Spot>) => fields as Spot;
const quartz = spot({ mineralogy: { minerals: [{ name: 'Quartz', operator: 'eq', percentage: 100 }] } });
eq('mineral = Mineralogy', sectionHasData('mineralogy', quartz), true);
eq('lithology only = Mineralogy', sectionHasData('mineralogy', spot({ lithologyInfo: { lithologies: [{ level1: 'Igneous' }] } })), true);
eq('emptied mineral list = no Mineralogy', sectionHasData('mineralogy', spot({ mineralogy: { minerals: [], mineralogyMethod: null } })), false);
eq('method only = Mineralogy', sectionHasData('mineralogy', spot({ mineralogy: { minerals: [], mineralogyMethod: 'Visual' } })), true);
eq('grain shape = Grain', sectionHasData('grain', spot({ grainInfo: { grainShapeInfo: [{ phases: ['Quartz'], shape: 'euhedral' }] } as Spot['grainInfo'] })), true);
eq('fabric list = Fabrics', sectionHasData('fabric', spot({ fabricInfo: { fabrics: [{ fabricLabel: 'S1' }] } as Spot['fabricInfo'] })), true);
eq('empty fabric list = no Fabrics', sectionHasData('fabric', spot({ fabricInfo: { fabrics: [] } as Spot['fabricInfo'] })), false);
eq('vein = Veins', sectionHasData('vein', spot({ veinInfo: { veins: [{ mineralogy: 'Calcite' }] } as Spot['veinInfo'] })), true);
eq('blank notes = no Notes', sectionHasData('notes', spot({ notes: '  \n' })), false);
eq('notes', sectionHasData('notes', spot({ notes: 'zoned' })), true);
eq('link', sectionHasData('links', spot({ links: [{ label: 'Paper', url: 'https://doi.org/1' }] })), true);
eq('empty links', sectionHasData('links', spot({ links: [] })), false);
eq('file', sectionHasData('files', spot({ associatedFiles: [{ fileName: 'a.csv' }] as Spot['associatedFiles'] })), true);
eq('custom value', sectionHasData('customUserData', spot({ customUserData: { 'Mg#': '0.82' } })), true);
eq('custom blank value', sectionHasData('customUserData', spot({ customUserData: { 'Mg#': '' } })), false);
eq('no data object', sectionHasData('links', null), false);

// Filter
const linked = spot({ links: [{ label: 'L', url: 'https://x.org' }] });
const both = spot({ ...quartz, links: linked.links });
const none = spot({});

eq('no filter is off', isSpotFilterOn(NO_SPOT_FILTER), false);
eq('no filter matches all', [linked, both, none].map((s) => spotMatchesFilter(s, NO_SPOT_FILTER)), [true, true, true]);
eq('no filter: normal look', spotFilterLook(none, NO_SPOT_FILTER), 'normal');

const noLinks: SpotFilter = { sections: { links: 'without' }, others: 'dim' };
eq('no links: on', isSpotFilterOn(noLinks), true);
eq('no links: matches', [linked, both, none].map((s) => spotMatchesFilter(s, noLinks)), [false, false, true]);
eq('no links: looks', [linked, none].map((s) => spotFilterLook(s, noLinks)), ['dim', 'normal']);
eq('hide others', spotFilterLook(linked, { ...noLinks, others: 'hide' }), 'hidden');

const mineralNoLinks: SpotFilter = { sections: { mineralogy: 'has', links: 'without' }, others: 'dim' };
eq('AND: both must hold', [quartz, both, none].map((s) => spotMatchesFilter(s, mineralNoLinks)), [true, false, false]);
eq('describe', describeSpotFilter(mineralNoLinks), 'has Mineralogy/Lithology, no Links');

const unknown = { sections: { tags: 'has' }, others: 'dim' } as unknown as SpotFilter;
eq('unknown section ignored', spotMatchesFilter(none, unknown), true);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
