/**
 * A mineral's color (src/utils/mineralColor.ts): project > Global > built-in
 * default > gray, any case; setting a project color changes the entry with
 * the same name (any case) or adds one.
 *
 *   npm run test:mineral-color
 */

import { resolveMineralColor, withMineralColor, withMineralColors } from '@/utils/mineralColor';
import { NO_MINERAL_COLOR } from '@/constants/mineralColorDefaults';

let failures = 0;
let passes = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        got      ${a}\n        expected ${e}`);
  }
}

const project = [{ mineral: 'Garnet', color: '#aa0000' }];
const global = [{ mineral: 'garnet', color: '#00aa00' }, { mineral: 'Zircon', color: '#0000aa' }];

eq('project wins', resolveMineralColor('Garnet', project, global), { color: '#aa0000', source: 'project' });
eq('project, other case', resolveMineralColor('GARNET', project, global), { color: '#aa0000', source: 'project' });
eq('global when no project entry', resolveMineralColor('zircon', project, global), { color: '#0000aa', source: 'global' });
eq('built-in default (Quartz)', resolveMineralColor('quartz', null, []), { color: '#e8e8e8', source: 'default' });
eq('unknown mineral: gray', resolveMineralColor('Unobtainium', project, global), { color: NO_MINERAL_COLOR, source: 'none' });
eq('no name: gray', resolveMineralColor(undefined, project, global), { color: NO_MINERAL_COLOR, source: 'none' });
eq('blank name: gray', resolveMineralColor('  ', project, global), { color: NO_MINERAL_COLOR, source: 'none' });
eq('null lists, built-in still found', resolveMineralColor('Zircon', null, undefined), { color: '#ff69b4', source: 'default' });

eq('set: changes the entry in place, keeps its name', withMineralColor(project, 'garnet', '#123456'), [{ mineral: 'Garnet', color: '#123456' }]);
eq('set: adds a new one at the end', withMineralColor(project, ' Zircon ', '#654321'),
  [{ mineral: 'Garnet', color: '#aa0000' }, { mineral: 'Zircon', color: '#654321' }]);
eq('set: from no project colors', withMineralColor(null, 'Quartz', '#ffffff'), [{ mineral: 'Quartz', color: '#ffffff' }]);
eq('set: input not changed', project, [{ mineral: 'Garnet', color: '#aa0000' }]);
eq('several at once', withMineralColors(project, { Garnet: '#111111', Biotite: '#222222' }),
  [{ mineral: 'Garnet', color: '#111111' }, { mineral: 'Biotite', color: '#222222' }]);
eq('no changes', withMineralColors(undefined, {}), []);

console.log(`mineralColor: ${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
