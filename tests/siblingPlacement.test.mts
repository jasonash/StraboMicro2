/**
 * PPL/XPL sibling placement (src/utils/siblingPlacement.ts): linking places
 * the XPL where its PPL is, and loading repairs pairs linked before that
 * (2026-10-06, Daniel Ortega-Arroyo: an XPL placed on its own PPL reference,
 * then linked, lost its location, was hidden in the tree and stopped the
 * upload as "missing location").
 *
 *   npm run test:sibling-placement
 */

import { applySiblingLink, repairSiblingPlacements, siblingPlacementMatches } from '../src/utils/siblingPlacement.ts';
import type { MicrographMetadata, ProjectMetadata } from '../src/types/project-types.ts';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}

/** The upload/export check (IncompleteMicrographsDialog findIncompleteMicrographs) for one micrograph */
function needsLocation(m: MicrographMetadata): boolean {
  const hasLocation = m.offsetInParent || m.pointInParent || m.xOffset !== undefined || m.placementType === 'affine';
  return !!m.parentID && !hasLocation;
}

function micro(id: string, fields: Partial<MicrographMetadata> = {}): MicrographMetadata {
  return { id, name: id, imageType: 'Plane Polarized Light', width: 1600, height: 1200, scalePixelsPerCentimeter: 40000, ...fields } as MicrographMetadata;
}

function project(micrographs: MicrographMetadata[]): ProjectMetadata {
  return { id: 'p', name: 'p', datasets: [{ id: 'd', name: 'd', samples: [{ id: 's', name: 's', micrographs }] }] } as unknown as ProjectMetadata;
}

const AFFINE = {
  placementType: 'affine' as const, affineMatrix: [0.25, 0, 400, 0, 0.25, 300] as [number, number, number, number, number, number],
  affineBoundsOffset: { x: 400, y: 300 }, affineTransformedWidth: 400, affineTransformedHeight: 300,
  controlPoints: [{ source: [0, 0] as [number, number], target: [400, 300] as [number, number] }],
};

// --- Linking ---

{
  // Daniel's path: the XPL was placed on its own PPL reference, then linked
  const ppl = micro('ppl');
  const xpl = micro('xpl', { imageType: 'Cross Polarized Light', parentID: 'ppl', offsetInParent: { X: 0, Y: 0 }, rotation: 0 });
  applySiblingLink(ppl, xpl);
  check('XPL on its PPL reference: becomes a reference too', (xpl.parentID ?? null) === null, xpl.parentID);
  check('XPL on its PPL reference: nothing missing', !needsLocation(xpl));
  check('XPL on its PPL reference: link both ways', ppl.siblingImageId === 'xpl' && xpl.siblingImageId === 'ppl' && ppl.isPrimarySibling === true && xpl.isPrimarySibling === false);
  check('XPL on its PPL reference: placement matches', siblingPlacementMatches(ppl, xpl));
}

{
  // A PPL placed by affine on the overview, the XPL a separate reference
  const ppl = micro('ppl', { parentID: 'overview', affineTileHash: 'ppl', ...AFFINE });
  const xpl = micro('xpl', { imageType: 'Cross Polarized Light' });
  applySiblingLink(ppl, xpl);
  check('affine PPL: XPL on the same parent', xpl.parentID === 'overview', xpl.parentID);
  check('affine PPL: XPL affine with the same matrix', xpl.placementType === 'affine' && JSON.stringify(xpl.affineMatrix) === JSON.stringify(ppl.affineMatrix));
  check('affine PPL: XPL has its own tile key', xpl.affineTileHash === 'xpl', xpl.affineTileHash);
  check('affine PPL: PPL keeps its tile key', ppl.affineTileHash === 'ppl', ppl.affineTileHash);
  check('affine PPL: control points copied, not shared', JSON.stringify(xpl.controlPoints) === JSON.stringify(ppl.controlPoints) && xpl.controlPoints !== ppl.controlPoints);
  check('affine PPL: nothing missing', !needsLocation(xpl));
}

{
  // An offset-placed XPL takes an affine-placed... and back: an affine XPL linked to an offset PPL drops affine
  const ppl = micro('ppl', { parentID: 'overview', offsetInParent: { X: 10, Y: 20 }, rotation: 15, scaleX: 1, scaleY: 1 });
  const xpl = micro('xpl', { imageType: 'Cross Polarized Light', parentID: 'other', affineTileHash: 'xpl', ...AFFINE });
  applySiblingLink(ppl, xpl);
  check('offset PPL: XPL rectangle where the PPL is', xpl.parentID === 'overview' && xpl.offsetInParent?.X === 10 && xpl.rotation === 15);
  check('offset PPL: XPL no longer affine', (xpl.placementType ?? null) === null && (xpl.affineMatrix ?? null) === null && (xpl.affineTileHash ?? null) === null);
  check('offset PPL: offset copied, not shared', xpl.offsetInParent !== ppl.offsetInParent);
}

{
  // The PPL had been placed on the XPL: neither may become its own parent
  const xpl = micro('xpl', { imageType: 'Cross Polarized Light', parentID: 'overview', offsetInParent: { X: 5, Y: 6 } });
  const ppl = micro('ppl', { parentID: 'xpl', offsetInParent: { X: 0, Y: 0 } });
  applySiblingLink(ppl, xpl);
  check('PPL on its XPL: no self parent', ppl.parentID !== 'ppl' && xpl.parentID !== 'xpl', [ppl.parentID, xpl.parentID]);
  check('PPL on its XPL: both where the XPL was', ppl.parentID === 'overview' && xpl.parentID === 'overview' && xpl.offsetInParent?.X === 5);
}

{
  // An XPL without a scale takes the PPL's, adjusted for a different size; one with a scale keeps it
  const ppl = micro('ppl');
  const half = micro('xpl', { imageType: 'Cross Polarized Light', width: 800, height: 600, scalePixelsPerCentimeter: undefined });
  applySiblingLink(ppl, half);
  check('XPL without a scale: takes the PPL scale for its size', half.scalePixelsPerCentimeter === 20000, half.scalePixelsPerCentimeter);
  const ppl2 = micro('ppl2');
  const own = micro('xpl2', { imageType: 'Cross Polarized Light', scalePixelsPerCentimeter: 12345 });
  applySiblingLink(ppl2, own);
  check('XPL with a scale: keeps it', own.scalePixelsPerCentimeter === 12345, own.scalePixelsPerCentimeter);
}

// --- Repair on load: the shapes the old Link Sibling left ---

{
  const healthyPpl = micro('h-ppl', { siblingImageId: 'h-xpl', isPrimarySibling: true });
  const healthyXpl = micro('h-xpl', { imageType: 'Cross Polarized Light', siblingImageId: 'h-ppl', isPrimarySibling: false });
  // Old link of an XPL placed on its PPL reference: parent kept, location nulled
  const danielPpl = micro('d-ppl', { siblingImageId: 'd-xpl', isPrimarySibling: true });
  const danielXpl = micro('d-xpl', { imageType: 'Cross Polarized Light', parentID: 'd-ppl', offsetInParent: null, pointInParent: null,
    siblingImageId: 'd-ppl', isPrimarySibling: false });
  // Old link of an affine PPL: offset/point nulled, no affine fields
  const affinePpl = micro('a-ppl', { parentID: 'h-ppl', affineTileHash: 'a-ppl', ...AFFINE, siblingImageId: 'a-xpl', isPrimarySibling: true });
  const affineXpl = micro('a-xpl', { imageType: 'Cross Polarized Light', offsetInParent: null, pointInParent: null,
    siblingImageId: 'a-ppl', isPrimarySibling: false });
  // Unlinked after the old link: nothing says where it was
  const unlinked = micro('u-xpl', { imageType: 'Cross Polarized Light', parentID: 'h-ppl', offsetInParent: null, pointInParent: null,
    siblingImageId: null, isPrimarySibling: null });
  // A link to a micrograph that is gone, and a one-way link
  const orphan = micro('o-xpl', { imageType: 'Cross Polarized Light', parentID: 'h-ppl', siblingImageId: 'gone', isPrimarySibling: false });
  const oneWayPpl = micro('w-ppl', { siblingImageId: null, isPrimarySibling: true });
  const oneWayXpl = micro('w-xpl', { imageType: 'Cross Polarized Light', parentID: 'w-ppl', siblingImageId: 'w-ppl', isPrimarySibling: false });

  const p = project([healthyPpl, healthyXpl, danielPpl, danielXpl, affinePpl, affineXpl, unlinked, orphan, oneWayPpl, oneWayXpl]);
  const before = JSON.stringify(p);
  const healthyBefore = JSON.stringify([healthyPpl, healthyXpl]);
  const repaired = repairSiblingPlacements(p);
  check('repair: names the two broken pairs', JSON.stringify(repaired.sort()) === JSON.stringify(['a-xpl', 'd-xpl']), repaired);
  check('repair: Daniel XPL is a reference again', (danielXpl.parentID ?? null) === null && !needsLocation(danielXpl), danielXpl.parentID);
  check('repair: affine XPL placed', affineXpl.parentID === 'h-ppl' && affineXpl.placementType === 'affine' && affineXpl.affineTileHash === 'a-xpl' && !needsLocation(affineXpl));
  check('repair: primaries unchanged', danielPpl.parentID === undefined && affinePpl.affineTileHash === 'a-ppl' && affinePpl.parentID === 'h-ppl');
  check('repair: healthy pair untouched', JSON.stringify([healthyPpl, healthyXpl]) === healthyBefore);
  check('repair: unlinked XPL left alone (still needs a location)', unlinked.parentID === 'h-ppl' && needsLocation(unlinked));
  check('repair: link to a missing micrograph left alone', orphan.parentID === 'h-ppl' && orphan.siblingImageId === 'gone');
  check('repair: one-way link left alone', oneWayXpl.parentID === 'w-ppl');
  check('repair: changed something', JSON.stringify(p) !== before);

  const again = repairSiblingPlacements(p);
  check('repair again: nothing to do', again.length === 0, again);
  const roundTrip = project(JSON.parse(JSON.stringify(p)).datasets[0].samples[0].micrographs);
  check('repair after save and reopen (JSON): nothing to do', repairSiblingPlacements(roundTrip).length === 0);
}

{
  // A project with no siblings at all
  const p = project([micro('a'), micro('b', { parentID: 'a', offsetInParent: { X: 1, Y: 2 } })]);
  const before = JSON.stringify(p);
  check('no siblings: nothing repaired, nothing changed', repairSiblingPlacements(p).length === 0 && JSON.stringify(p) === before);
}

console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nALL PASSED (${passes} checks)`);
process.exit(failures ? 1 : 0);
