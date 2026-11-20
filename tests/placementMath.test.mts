/**
 * Placement math of the rectangle and point placement screens
 * (src/utils/placementMath.ts) and the PPL/XPL backdrop choice
 * (src/utils/placementBackdrop.ts).
 *
 * The screens draw the parent as a smaller copy: the 512 px thumbnail until
 * 2.0.61, now the 2048 px medium copy. What is saved must be the same whatever
 * size that copy is, must land where the viewer draws it, and must come back
 * unchanged when a placement is edited again.
 *
 *   npm run test:placement-math
 */

import {
  displayRatio, displayToSaved, savedToDisplay, displayPointToSaved, savedPointToDisplay,
  childPixelsPerCm, overlayScaleOnDisplay, savedScaleOnParent, MIN_OVERLAY_SCALE,
  type DisplayTransform, type SavedPlacement,
} from '../src/utils/placementMath.ts';
import { placementBackdrop, showSecondaryAfterPick } from '../src/utils/placementBackdrop.ts';
import type { MicrographMetadata } from '../src/types/project-types.ts';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
const samePlacement = (a: SavedPlacement, b: SavedPlacement, eps = 1e-9) =>
  near(a.offsetX, b.offsetX, eps) && near(a.offsetY, b.offsetY, eps) && near(a.rotation, b.rotation, eps)
  && near(a.scaleX, b.scaleX, eps) && near(a.scaleY, b.scaleY, eps);

// A 4000 x 3000 parent (Caroline's thin sections are camera images of this order) shown as the
// old 512 px thumbnail and as the new 2048 px medium copy; a 1280 x 960 BSE child
const PARENT_W = 4000;
const THUMB = displayRatio(PARENT_W, 512);
const MEDIUM = displayRatio(PARENT_W, 2048);
const child = { width: 1280, height: 960 };

// ---------------------------------------------------------------- ratio

check('ratio = original / displayed', near(THUMB, 7.8125) && near(MEDIUM, 1.953125));
check('ratio 1 when a size is unknown', displayRatio(null, 512) === 1 && displayRatio(4000, 0) === 1 && displayRatio(undefined, undefined) === 1);

// ---------------------------------------------------------------- round trips

const placements: SavedPlacement[] = [
  { offsetX: 1200, offsetY: 800, rotation: 0, scaleX: 0.25, scaleY: 0.25 },
  { offsetX: 37.5, offsetY: 2950.25, rotation: 35, scaleX: 0.047, scaleY: 0.047 },
  { offsetX: -100, offsetY: -60, rotation: -90, scaleX: 2.5, scaleY: 2.5 },
  { offsetX: 3000, offsetY: 10, rotation: 170, scaleX: 0.0123, scaleY: 0.0123 },
];
for (const p of placements) {
  for (const [name, r] of [['thumbnail', THUMB], ['medium', MEDIUM], ['full size', 1]] as const) {
    const back = displayToSaved(savedToDisplay(p, child, r), child, r);
    check(`saved -> display -> saved is exact (${name}, rotation ${p.rotation})`, samePlacement(back, p), { p, back });
  }
}

// ---------------------------------------------------------------- independent of the copy's size

// The same overlay (same place on the rock) drawn over a thumbnail and over the medium copy
// saves the same numbers
for (const p of placements) {
  const onThumb = savedToDisplay(p, child, THUMB);
  const onMedium = savedToDisplay(p, child, MEDIUM);
  check(`medium copy draws it 4x larger than the thumbnail (rotation ${p.rotation})`,
    near(onMedium.scaleX, onThumb.scaleX * 4) && near(onMedium.x, onThumb.x * 4) && near(onMedium.y, onThumb.y * 4));
  check(`same save from either copy (rotation ${p.rotation})`,
    samePlacement(displayToSaved(onThumb, child, THUMB), displayToSaved(onMedium, child, MEDIUM)));
}

// A drag of 10 screen px at zoom z moves the overlay 10 / z display px = 10 / z * ratio original px
{
  const p = placements[1];
  for (const [name, r] of [['thumbnail', THUMB], ['medium', MEDIUM]] as const) {
    const zoom = 0.75;
    const t = savedToDisplay(p, child, r);
    const dragged = displayToSaved({ ...t, x: t.x + 10 / zoom, y: t.y - 4 / zoom }, child, r);
    check(`drag moves the saved offset by screen px / zoom * ratio (${name})`,
      near(dragged.offsetX - p.offsetX, (10 / zoom) * r) && near(dragged.offsetY - p.offsetY, (-4 / zoom) * r)
      && near(dragged.scaleX, p.scaleX) && near(dragged.rotation, p.rotation), dragged);
  }
}

// A resize about the center (Stretch and Drag) keeps the center; the saved top-left follows
{
  const t: DisplayTransform = { x: 500, y: 400, rotation: 20, scaleX: 0.1, scaleY: 0.1 };
  const bigger = displayToSaved({ ...t, scaleX: 0.2, scaleY: 0.2 }, child, MEDIUM);
  const center = { x: bigger.offsetX + (child.width * bigger.scaleX) / 2, y: bigger.offsetY + (child.height * bigger.scaleY) / 2 };
  check('resize keeps the center', near(center.x, 500 * MEDIUM) && near(center.y, 400 * MEDIUM), center);
}

// ---------------------------------------------------------------- lands where the viewer draws it

/**
 * Corners as the placement canvas draws them: a Konva group at (x, y) with offset = half the
 * child, turned by rotation and scaled, in display px, then times the ratio
 */
function canvasCorners(t: DisplayTransform, r: number): Array<[number, number]> {
  const a = (t.rotation * Math.PI) / 180;
  return ([[0, 0], [child.width, 0], [child.width, child.height], [0, child.height]] as const).map(([u, v]) => {
    const lx = (u - child.width / 2) * t.scaleX;
    const ly = (v - child.height / 2) * t.scaleY;
    return [(t.x + lx * Math.cos(a) - ly * Math.sin(a)) * r, (t.y + lx * Math.sin(a) + ly * Math.cos(a)) * r];
  });
}

/**
 * Corners as the viewer draws a saved rectangle (AssociatedImageRenderer): size = child size x
 * parent/child px per cm, center = offsetInParent + half the size, turned about the center
 */
function viewerCorners(p: SavedPlacement, childPxPerCm: number, parentPxPerCm: number): Array<[number, number]> {
  const k = parentPxPerCm / childPxPerCm;
  const w = child.width * k;
  const h = child.height * k;
  const cx = p.offsetX + w / 2;
  const cy = p.offsetY + h / 2;
  const a = (p.rotation * Math.PI) / 180;
  return ([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as const)
    .map(([x, y]) => [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)]);
}

for (const [name, r] of [['thumbnail', THUMB], ['medium', MEDIUM]] as const) {
  const t: DisplayTransform = { x: 812.3, y: 401.7, rotation: 33, scaleX: 0.06, scaleY: 0.06 };
  const saved = displayToSaved(t, child, r);
  // Edit Micrograph Location / New Micrograph store the child's px/cm as parent's / scale
  const parentPxPerCm = 10000;
  const childPxPerCm = parentPxPerCm / saved.scaleX;
  const a = canvasCorners(t, r);
  const b = viewerCorners(saved, childPxPerCm, parentPxPerCm);
  const worst = Math.max(...a.map(([x, y], i) => Math.hypot(x - b[i][0], y - b[i][1])));
  check(`what the canvas showed is where the viewer draws it (${name})`, worst < 1e-6, { worst });
}

// ---------------------------------------------------------------- editing a saved placement again

{
  // Saved by an earlier session: child at 213000 px/cm on a 10000 px/cm parent (a BSE image)
  const parentPxPerCm = 10000;
  const childPxPerCm = 213000;
  const scale = savedScaleOnParent(childPxPerCm, parentPxPerCm);
  check('saved scale on parent = parent / child px per cm', near(scale, parentPxPerCm / childPxPerCm));
  check('missing scales count as 100 px/cm, as in the viewer', near(savedScaleOnParent(null, 5000), 50) && near(savedScaleOnParent(400, undefined), 0.25));
  // Edit Micrograph Location: shown with that scale, saved with childPxPerCm = parent / scale
  const p = { offsetX: 1500, offsetY: 900, rotation: 12, scaleX: scale, scaleY: scale };
  const again = displayToSaved(savedToDisplay(p, child, MEDIUM), child, MEDIUM);
  check('reopened and saved untouched: same child px per cm', near(parentPxPerCm / again.scaleX, childPxPerCm), parentPxPerCm / again.scaleX);
  check('reopened and saved untouched: same place', samePlacement(again, p));
  // The bug this replaces: the reopened overlay started at scale 1 whatever was saved
  check('(scale 1 would have saved the parent\'s px per cm as the child\'s)', !near(parentPxPerCm / 1, childPxPerCm));
}

// ---------------------------------------------------------------- scale from units

check('px per cm: 500 px per 100 um', near(childPixelsPerCm(500, 100, 'μm') ?? 0, 50000));
check('px per cm: mm, cm, m, inches', near(childPixelsPerCm(10, 1, 'mm') ?? 0, 100) && near(childPixelsPerCm(10, 1, 'cm') ?? 0, 10)
  && near(childPixelsPerCm(10, 1, 'm') ?? 0, 0.1) && near(childPixelsPerCm(10, 1, 'inches') ?? 0, 3.93701));
check('px per cm: unusable input -> null', childPixelsPerCm(0, 1, 'μm') === null && childPixelsPerCm(5, 0, 'μm') === null && childPixelsPerCm(NaN, 1, 'μm') === null);

// The saved scale (display scale x ratio) is parent / child px per cm, whatever the copy's size
for (const shown of [512, 1024, 2048, 4000]) {
  const s = overlayScaleOnDisplay({ childPxPerCm: 50000, parentScale: 10000, parentDisplayedWidth: shown, parentOriginalWidth: PARENT_W });
  check(`scale from units saves parent/child px per cm (${shown} px copy)`, !!s && near(s.scale * displayRatio(PARENT_W, shown), 0.2), s);
}

// A small-area BSE: 1280 px over 60 um = 213333 px/cm on a 10000 px/cm parent -> 0.0469.
// On the old 512 px thumbnail that is 0.006 display px per child px: the old limit (0.01)
// saved 0.078, 1.7x too large. Now nothing is clamped
{
  const childPx = childPixelsPerCm(1280, 60, 'μm') ?? 0;
  for (const shown of [512, 2048]) {
    const s = overlayScaleOnDisplay({ childPxPerCm: childPx, parentScale: 10000, parentDisplayedWidth: shown, parentOriginalWidth: PARENT_W });
    const saved = (s?.scale ?? 0) * displayRatio(PARENT_W, shown);
    check(`small-area BSE keeps its true scale (${shown} px copy)`, !!s && !s.clamped && near(saved, 10000 / childPx), { saved, s });
  }
  check('the old 0.01 limit would have clamped it on the thumbnail', (10000 * (512 / PARENT_W)) / childPx < 0.01);
}
{
  const s = overlayScaleOnDisplay({ childPxPerCm: 1e12, parentScale: 1, parentDisplayedWidth: 512, parentOriginalWidth: PARENT_W });
  check('absurd input is still clamped (and says so)', !!s && s.clamped && s.scale === MIN_OVERLAY_SCALE, s);
}
check('scale from units: missing input -> null',
  overlayScaleOnDisplay({ childPxPerCm: null, parentScale: 1, parentDisplayedWidth: 512, parentOriginalWidth: 4000 }) === null
  && overlayScaleOnDisplay({ childPxPerCm: 5, parentScale: null, parentDisplayedWidth: 512, parentOriginalWidth: 4000 }) === null
  && overlayScaleOnDisplay({ childPxPerCm: 5, parentScale: 1, parentDisplayedWidth: 0, parentOriginalWidth: 4000 }) === null);

// ---------------------------------------------------------------- points

for (const [name, r] of [['thumbnail', THUMB], ['medium', MEDIUM]] as const) {
  const d = savedPointToDisplay(1234.5, 678.25, r);
  const back = displayPointToSaved(d.x, d.y, r);
  check(`point round trip (${name})`, near(back.x, 1234.5) && near(back.y, 678.25), back);
}
{
  // A click at the same place on the rock through either copy saves the same point
  const onThumb = displayPointToSaved(256, 192, THUMB);
  const onMedium = displayPointToSaved(1024, 768, MEDIUM);
  check('point: same click through either copy, same save (the middle)', near(onThumb.x, 2000) && near(onMedium.x, 2000) && near(onThumb.y, 1500) && near(onMedium.y, 1500));
}

// ---------------------------------------------------------------- PPL/XPL backdrop

{
  const m = (id: string, extra: Partial<MicrographMetadata>): MicrographMetadata => ({ id, name: id, ...extra } as MicrographMetadata);
  const ppl = m('ppl', { siblingImageId: 'xpl', isPrimarySibling: true });
  const xpl = m('xpl', { siblingImageId: 'ppl', isPrimarySibling: false });
  const all = new Map([[ppl.id, ppl], [xpl.id, xpl]]);
  const lookup = (id: string) => all.get(id);

  const plain = placementBackdrop(ppl, lookup, false);
  check('PPL parent: partner is the XPL, PPL shown', plain.partner?.id === 'xpl' && !plain.showingPartner && plain.parentLabel === 'PPL' && plain.partnerLabel === 'XPL');
  check('PPL parent, "show XPL" remembered: XPL shown', placementBackdrop(ppl, lookup, true).showingPartner);
  check('picking XPL on a PPL parent remembers "show XPL"', showSecondaryAfterPick(plain, true) === true && showSecondaryAfterPick(plain, false) === false);

  // Older projects have children on the XPL itself (Daniel's RGMC1b): its partner is the PPL
  const onXpl = placementBackdrop(xpl, lookup, false);
  check('XPL parent: partner is the PPL; "show XPL" off means the PPL is shown', onXpl.partner?.id === 'ppl' && onXpl.showingPartner && onXpl.parentLabel === 'XPL' && onXpl.partnerLabel === 'PPL');
  check('XPL parent, "show XPL" on: its own image', !placementBackdrop(xpl, lookup, true).showingPartner);
  check('picking XPL on an XPL parent remembers "show XPL"', showSecondaryAfterPick(onXpl, false) === true);

  const single = m('one', {});
  check('no pair: no partner, never showing one', placementBackdrop(single, lookup, true).partner === null && !placementBackdrop(single, lookup, true).showingPartner);
  const halfLinked = m('half', { siblingImageId: 'ppl', isPrimarySibling: true });
  check('a link that is not returned is not a pair', placementBackdrop(halfLinked, lookup, true).partner === null);
}

console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nALL PASSED (${passes} checks)`);
process.exit(failures ? 1 : 0);
