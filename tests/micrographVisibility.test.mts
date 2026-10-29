/**
 * View > Micrograph Visibility... rows and buttons (src/utils/micrographVisibility.ts;
 * Jason + Peter, 2026-10-29): every micrograph placed under the one in the
 * viewer, in tree order and indented; a PPL/XPL pair is one row; "Show only
 * this one" keeps the row and its ancestors and hides the rest.
 *
 *   npm run test:micrograph-visibility
 */

import { filterRows, showOnlyUpdates, visibilityFor, visibilityRows } from '../src/utils/micrographVisibility.ts';
import type { ProjectMetadata } from '../src/types/project-types.ts';

let failures = 0;
let passes = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        got      ${JSON.stringify(actual)}\n        expected ${JSON.stringify(expected)}`);
  }
}

const m = (id: string, parentID: string | null, extra: Record<string, unknown> = {}) => ({ id, name: id, parentID, ...extra });
const project = {
  id: 'P',
  datasets: [{ samples: [{ micrographs: [
    m('ref', null),
    m('bse', 'ref'),
    m('al', 'bse', { opacity: 0.5 }),
    m('ca', 'bse', { isMicroVisible: false }),
    m('ppl', 'ref', { siblingImageId: 'xpl', isPrimarySibling: true }),
    m('xpl', 'ref', { siblingImageId: 'ppl', isPrimarySibling: false }),
    m('onXpl', 'xpl'),
    m('other', 'elsewhere'),
  ] }] }],
} as unknown as ProjectMetadata;

const rows = visibilityRows(project, 'ref');
eq('rows in tree order, indented, XPL folded into its PPL', rows.map((r) => [r.id, r.depth]),
  [['bse', 0], ['al', 1], ['ca', 1], ['ppl', 0], ['onXpl', 1]]);
eq('visible and opacity read', rows.map((r) => [r.id, r.visible, r.opacity]).slice(1, 3), [['al', true, 0.5], ['ca', false, 1]]);
eq('PPL row carries its XPL', rows.find((r) => r.id === 'ppl')?.siblingId, 'xpl');
eq('ancestors below the viewer micrograph', rows.find((r) => r.id === 'al')?.ancestorIds, ['bse']);
eq('nothing open: no rows', visibilityRows(project, null), []);
eq('a leaf: no rows', visibilityRows(project, 'al'), []);

eq('filter by name, any case', filterRows(rows, ' A').map((r) => r.id), ['al', 'ca']);
eq('blank filter: all rows', filterRows(rows, '  ').length, rows.length);

eq('hide all: XPL too', [...visibilityFor(rows.filter((r) => r.id === 'ppl'), false)], [['ppl', false], ['xpl', false]]);

const only = showOnlyUpdates(rows, 'al');
eq('show only Al: Al and its parent stay, the rest hide (only changes listed)', [...only].sort(), [['onXpl', false], ['ppl', false], ['xpl', false]]);
eq('show only Ca: Ca shown, Al hidden', [...showOnlyUpdates(rows, 'ca')].filter(([id]) => id === 'ca' || id === 'al'), [['al', false], ['ca', true]]);
eq('unknown row: nothing', showOnlyUpdates(rows, 'nope').size, 0);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
