/**
 * Custom mineral names (src/utils/customMinerals.ts; Peter, 2026-10-29): a
 * name that is not in the mineral database is saved like any other, the
 * project's custom names are found wherever minerals are stored, and the
 * picker offers 'Use "..."' only for text that matches nothing offered.
 *
 *   npm run test:custom-minerals
 */

import {
  matchCustomNames,
  normalizeMineralName,
  projectMineralNames,
  typedNameToOffer,
} from '../src/utils/customMinerals.ts';

let failures = 0;
let passes = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        got      ${JSON.stringify(actual)}\n        expected ${JSON.stringify(expected)}`);
  }
}

eq('normalize trims and joins spaces', normalizeMineralName('  lithic   fragments \n'), 'lithic fragments');

const project = {
  mineralColors: [{ mineral: 'Glass', color: '#00ffff' }],
  datasets: [{
    samples: [{
      micrographs: [{
        mineralogy: { minerals: [{ name: 'Quartz', percentage: 40 }, { name: 'lithic fragments' }] },
        fabricInfo: { fabrics: [{ fabricGrainShapeInfo: { phases: ['Biotite', 'Lithic Fragments'] } }] },
        spots: [
          { veinInfo: { veins: [{ phases: ['calcite', ' chert '] }] } },
          { intraGrainInfo: { grains: [{ mineral: 'Garnet' }] } },
          { mineralogy: { minerals: [{ name: '' }, { name: null }] } },
        ],
      }],
    }],
  }],
};
eq('names from mineralogy, phases, intra-grain and colors; first spelling wins',
  projectMineralNames(project).sort((a, b) => a.localeCompare(b)),
  ['Biotite', 'calcite', 'chert', 'Garnet', 'Glass', 'lithic fragments', 'Quartz']);
eq('no project', projectMineralNames(null), []);

const known = new Set(['quartz', 'biotite', 'calcite', 'garnet']);
const isKnown = (n: string) => known.has(n.toLowerCase());
const names = projectMineralNames(project);
eq('custom names only, nothing typed', matchCustomNames('', names, isKnown).sort((a, b) => a.localeCompare(b)), ['chert', 'Glass', 'lithic fragments']);
eq('typed: starts-with first, then contains', matchCustomNames('l', ['glass', 'lithic fragments'], () => false), ['lithic fragments', 'glass']);
eq('typed, case and spaces ignored', matchCustomNames('  LITH ', names, isKnown), ['lithic fragments']);

eq('offer typed text that matches nothing', typedNameToOffer('volcanic  glass ', ['Glass']), 'volcanic glass');
eq('no offer for a name already offered (any case)', typedNameToOffer('lithic FRAGMENTS', ['lithic fragments']), null);
eq('no offer for a database mineral', typedNameToOffer('quartz', ['Quartz', 'Quartzine']), null);
eq('no offer for blank text', typedNameToOffer('   ', []), null);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
