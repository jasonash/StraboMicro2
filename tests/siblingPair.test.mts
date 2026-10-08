/**
 * What a linked PPL/XPL pair shows (2026-10-07, display only): both views
 * draw both halves' children and spots, the tree lists a hidden XPL's
 * children under the pair, and image export + composite thumbnails match.
 * Daniel Ortega-Arroyo's RGMC1b_5X_XPL carried five children and a spot that
 * were never shown.
 *
 *   npm run test:sibling-pair
 */

import Module, { createRequire } from 'node:module';
import { hiddenSibling, pairChildren, pairPartner, pairSpots } from '../src/utils/siblingPair.ts';
import type { MicrographMetadata, ProjectMetadata, Spot } from '../src/types/project-types.ts';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}

function spot(id: string): Spot {
  return { id, name: id } as Spot;
}

function micro(id: string, fields: Partial<MicrographMetadata> = {}): MicrographMetadata {
  return { id, name: id, width: 1000, height: 800, scalePixelsPerCentimeter: 1000, ...fields } as MicrographMetadata;
}

/** A reference PPL with its XPL, children on both, spots on both, and an unrelated micrograph */
function fixture(): MicrographMetadata[] {
  return [
    micro('ppl', { siblingImageId: 'xpl', isPrimarySibling: true, spots: [spot('s-ppl')] }),
    micro('xpl', { siblingImageId: 'ppl', isPrimarySibling: false, spots: [spot('s-xpl')], scalePixelsPerCentimeter: 500 }),
    micro('c-ppl', { parentID: 'ppl', offsetInParent: { X: 1, Y: 1 }, scalePixelsPerCentimeter: 4000 }),
    micro('c-xpl', { parentID: 'xpl', offsetInParent: { X: 2, Y: 2 }, scalePixelsPerCentimeter: 4000 }),
    micro('c-xpl-affine', { parentID: 'xpl', placementType: 'affine', scalePixelsPerCentimeter: 100 }),
    micro('c-xpl-hidden', { parentID: 'xpl', offsetInParent: { X: 3, Y: 3 }, isMicroVisible: false }),
    micro('other', {}),
  ];
}

const list = fixture();
const byId = new Map(list.map((m) => [m.id, m]));
const lookup = (id: string) => byId.get(id);
const childrenOf = (parentId: string) => list.filter((m) => m.parentID === parentId && m.isMicroVisible !== false);
const ppl = byId.get('ppl')!;
const xpl = byId.get('xpl')!;

// pairPartner / hiddenSibling
check('partner of the PPL is the XPL', pairPartner(ppl, lookup)?.id === 'xpl');
check('partner of the XPL is the PPL', pairPartner(xpl, lookup)?.id === 'ppl');
check('no partner without a link', pairPartner(byId.get('other')!, lookup) === null);
check('one-way link is not a pair', pairPartner(micro('a', { siblingImageId: 'ppl', isPrimarySibling: true }), lookup) === null);
const twoPrimaries = new Map([
  ['a', micro('a', { siblingImageId: 'b', isPrimarySibling: true })],
  ['b', micro('b', { siblingImageId: 'a', isPrimarySibling: true })],
]);
check('two primaries are not a pair', pairPartner(twoPrimaries.get('a')!, (id) => twoPrimaries.get(id)) === null);
check('self link is not a pair', pairPartner(micro('z', { siblingImageId: 'z', isPrimarySibling: true }), () => undefined) === null);
check('hidden sibling of the PPL is the XPL', hiddenSibling(ppl, lookup)?.id === 'xpl');
check('the XPL has no hidden sibling', hiddenSibling(xpl, lookup) === null);

// pairChildren
const onPpl = pairChildren(ppl, childrenOf, lookup);
check('PPL view: own child first, then the XPL\'s visible children',
  JSON.stringify(onPpl.map((c) => c.child.id)) === JSON.stringify(['c-ppl', 'c-xpl', 'c-xpl-affine']), onPpl.map((c) => c.child.id));
check('PPL view: each child keeps its own parent',
  onPpl.find((c) => c.child.id === 'c-xpl')?.parent.id === 'xpl' && onPpl.find((c) => c.child.id === 'c-ppl')?.parent.id === 'ppl');
const onXpl = pairChildren(xpl, childrenOf, lookup);
check('XPL view: own children, then the PPL\'s (was: the PPL\'s were missing)',
  JSON.stringify(onXpl.map((c) => c.child.id)) === JSON.stringify(['c-xpl', 'c-xpl-affine', 'c-ppl']), onXpl.map((c) => c.child.id));
check('no pair: own children only', pairChildren(byId.get('other')!, childrenOf, lookup).length === 0);
// Old broken shape: the XPL is a child of its own PPL
const brokenList = [...list.filter((m) => m.id !== 'xpl'), { ...xpl, parentID: 'ppl' }];
const brokenById = new Map(brokenList.map((m) => [m.id, m]));
const brokenChildren = pairChildren(ppl, (pid) => brokenList.filter((m) => m.parentID === pid), (id) => brokenById.get(id));
check('an XPL that is a child of its PPL is never drawn as an overlay', !brokenChildren.some((c) => c.child.id === 'xpl'));

// pairSpots
check('PPL view: PPL spots then the XPL\'s own', JSON.stringify(pairSpots(ppl, lookup).map((s) => s.id)) === '["s-ppl","s-xpl"]');
check('XPL view: same order (was: the PPL\'s only)', JSON.stringify(pairSpots(xpl, lookup).map((s) => s.id)) === '["s-ppl","s-xpl"]');
check('no pair: own spots', pairSpots(micro('q', { spots: [spot('s-q')] }), lookup).length === 1);

// ---------------------------------------------------------------------------
// electron/imageExport.js: export + composite thumbnails (stand-ins for the
// Electron-only modules, as the server's PDF service shims them)
// ---------------------------------------------------------------------------
const require = createRequire(import.meta.url);
const ModuleAny = Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
const originalLoad = ModuleAny._load;
ModuleAny._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron-log') return { info() {}, warn() {}, error() {} };
  if (request === './tileCache') return {};
  return originalLoad.call(this, request, parent, isMain);
};
const imageExport = require('../electron/imageExport.js') as {
  pairChildrenOf: (p: ProjectMetadata, m: MicrographMetadata, o?: { includeHidden?: boolean }) => MicrographMetadata[];
  getDrawableSpots: (p: ProjectMetadata, m: MicrographMetadata) => Spot[];
  primaryOfSecondary: (p: ProjectMetadata, id: string) => MicrographMetadata | null;
};
ModuleAny._load = originalLoad;

const project = { id: 'p', datasets: [{ id: 'd', samples: [{ id: 's', micrographs: fixture() }] }] } as unknown as ProjectMetadata;
const pplP = project.datasets![0].samples![0].micrographs!.find((m) => m.id === 'ppl')!;
const xplP = project.datasets![0].samples![0].micrographs!.find((m) => m.id === 'xpl')!;

const exported = imageExport.pairChildrenOf(project, pplP);
check('export of the PPL draws the XPL\'s visible children',
  JSON.stringify(exported.map((c) => c.id)) === JSON.stringify(['c-ppl', 'c-xpl', 'c-xpl-affine']), exported.map((c) => c.id));
const cx = exported.find((c) => c.id === 'c-xpl')!;
// PPL 1000 px/cm, XPL 500 px/cm, child 4000 px/cm: on the XPL it is drawn at 500/4000;
// on the PPL the same size needs 1000/childPx = 500/4000, so childPx = 8000
check('an XPL child is sized against the XPL\'s scale', cx.scalePixelsPerCentimeter === 8000, cx.scalePixelsPerCentimeter);
check('the project data is not changed', xplP && project.datasets![0].samples![0].micrographs!.find((m) => m.id === 'c-xpl')!.scalePixelsPerCentimeter === 4000);
check('own children keep their scale', exported.find((c) => c.id === 'c-ppl')!.scalePixelsPerCentimeter === 4000);
const composite = imageExport.pairChildrenOf(project, pplP, { includeHidden: true });
check('composite thumbnails keep hidden children (as before)', composite.some((c) => c.id === 'c-xpl-hidden'));
check('export spots: PPL then XPL', JSON.stringify(imageExport.getDrawableSpots(project, pplP).map((s) => s.id)) === '["s-ppl","s-xpl"]');
check('export spots of the XPL: the same', JSON.stringify(imageExport.getDrawableSpots(project, xplP).map((s) => s.id)) === '["s-ppl","s-xpl"]');
check('primary of the XPL is the PPL (its composite is redrawn too)', imageExport.primaryOfSecondary(project, 'xpl')?.id === 'ppl');
check('the PPL has no primary to redraw', imageExport.primaryOfSecondary(project, 'ppl') === null);
check('a child has no primary to redraw', imageExport.primaryOfSecondary(project, 'c-xpl') === null);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
