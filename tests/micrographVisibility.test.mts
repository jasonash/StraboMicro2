/**
 * View > Micrograph Visibility... rows and buttons (src/utils/micrographVisibility.ts;
 * Jason + Peter, 2026-10-29; direct children only, 2026-11-01): exactly what the
 * viewer draws on the micrograph in view; a PPL/XPL pair among them is one row, and
 * a pair in view lists both halves' children from either half; "Show only this one"
 * keeps the row and hides the rest.
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

const placed = { scalePixelsPerCentimeter: 100 };
const m = (id: string, parentID: string | null, extra: Record<string, unknown> = {}) => ({ id, name: id, parentID, ...placed, ...extra });
const project = {
  id: 'P',
  datasets: [{ samples: [{ micrographs: [
    m('ref', null),
    m('bse', 'ref', { opacity: 0.5 }),
    m('nested', 'bse'),
    m('deeper', 'nested'),
    m('hiddenChild', 'ref', { isMicroVisible: false }),
    m('noScale', 'ref', { scalePixelsPerCentimeter: null }),
    m('marker', 'ref', { scalePixelsPerCentimeter: null, pointInParent: { X: 1, Y: 2 } }),
    m('ppl', 'ref', { siblingImageId: 'xpl', isPrimarySibling: true }),
    m('xpl', 'ref', { siblingImageId: 'ppl', isPrimarySibling: false }),
    m('onPpl', 'ppl'),
    m('onXpl', 'xpl'),
    m('noScaleOnXpl', 'xpl', { scalePixelsPerCentimeter: undefined }),
    m('other', 'elsewhere'),
  ] }] }],
} as unknown as ProjectMetadata;

const rows = visibilityRows(project, 'ref');
eq('direct children only, drawn ones only: nested and no scale left out, marker kept, XPL folded into its PPL',
  rows.map((r) => r.id), ['bse', 'hiddenChild', 'marker', 'ppl']);
eq('visible and opacity read', rows.slice(0, 2).map((r) => [r.id, r.visible, r.opacity]), [['bse', true, 0.5], ['hiddenChild', false, 1]]);
eq('PPL row carries its XPL', rows.find((r) => r.id === 'ppl')?.siblingId, 'xpl');
eq('nested micrographs are listed from their parent', visibilityRows(project, 'bse').map((r) => r.id), ['nested']);
eq('viewing the PPL: both halves\' children', visibilityRows(project, 'ppl').map((r) => r.id), ['onPpl', 'onXpl']);
eq('viewing the XPL: both halves\' children', visibilityRows(project, 'xpl').map((r) => r.id), ['onXpl', 'onPpl']);
eq('nothing open: no rows', visibilityRows(project, null), []);
eq('unknown micrograph: no rows', visibilityRows(project, 'nope'), []);
eq('a leaf: no rows', visibilityRows(project, 'deeper'), []);

eq('filter by name, any case', filterRows(rows, ' PL').map((r) => r.id), ['ppl']);
eq('blank filter: all rows', filterRows(rows, '  ').length, rows.length);

eq('hide all: XPL too', [...visibilityFor(rows.filter((r) => r.id === 'ppl'), false)], [['ppl', false], ['xpl', false]]);

const only = showOnlyUpdates(rows, 'bse');
eq('show only bse: the rest hide, XPL too (only changes listed)', [...only].sort(), [['marker', false], ['ppl', false], ['xpl', false]]);
eq('show only a hidden row: it shows, the others hide', [...showOnlyUpdates(rows, 'hiddenChild')].sort(),
  [['bse', false], ['hiddenChild', true], ['marker', false], ['ppl', false], ['xpl', false]]);
eq('unknown row: nothing', showOnlyUpdates(rows, 'nope').size, 0);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
