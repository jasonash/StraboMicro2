/**
 * Grain orientations in a shared frame (src/utils/grainFrames.ts, referenceFrameOf in
 * src/utils/parentSpots.ts). With All micrographs, a grain on an associated micrograph placed
 * rotated (or by 3-point registration) on its parent is measured in the reference micrograph's
 * frame. Placement rotation is clockwise on screen (Konva), so a horizontal grain on a child
 * rotated +30 degrees lies at 150 degrees (counterclockwise) on the reference.
 *
 *   npm run test:grain-frames
 */

import { grainMetricsInFrames } from '@/utils/grainFrames';
import { referenceFrameOf } from '@/utils/parentSpots';
import type { MicrographMetadata, Spot } from '@/types/project-types';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}
/** Axial angles: 179.9 and 0.1 are the same direction */
const axialDiff = (a: number, b: number) => Math.abs((((a - b) % 180) + 270) % 180 - 90);
const near = (label: string, actual: number | undefined, expected: number, tol = 0.2) =>
  check(label, actual !== undefined && axialDiff(actual, expected) <= tol, { actual, expected });

/** A thin 200 x 20 grain at screenAngle degrees counterclockwise from horizontal, centered at (cx, cy) */
function grain(id: string, screenAngle: number, cx = 500, cy = 400): Spot {
  const a = (screenAngle * Math.PI) / 180;
  const ux = Math.cos(a), uy = -Math.sin(a), vx = -uy, vy = ux;
  const points = ([[-100, -10], [100, -10], [100, 10], [-100, 10]] as const).map(([s, t]) => ({ X: cx + s * ux + t * vx, Y: cy + s * uy + t * vy }));
  return { id, name: id, geometryType: 'polygon', points } as Spot;
}

function micro(id: string, extra: Partial<MicrographMetadata> = {}): MicrographMetadata {
  return { id, name: id, imageWidth: 1000, imageHeight: 800, width: 1000, height: 800, scalePixelsPerCentimeter: 1000, ...extra } as MicrographMetadata;
}

const ref = micro('REF');
const rot30 = micro('ROT30', { parentID: 'REF', offsetInParent: { X: 100, Y: 100 }, rotation: 30, scalePixelsPerCentimeter: 4000, isPrimarySibling: true, siblingImageId: 'ROT30-XPL' } as Partial<MicrographMetadata>);
const rot967 = micro('ROT96', { parentID: 'REF', offsetInParent: { X: 300, Y: 200 }, rotation: 96.6131384417 });
const nested = micro('NESTED', { parentID: 'ROT30', offsetInParent: { X: 10, Y: 10 }, rotation: 20 });
const pointPlaced = micro('POINT', { parentID: 'REF', pointInParent: { X: 5, Y: 5 } });
const xpl = micro('ROT30-XPL', { parentID: 'REF', isPrimarySibling: false, siblingImageId: 'ROT30' } as Partial<MicrographMetadata>);
// 3-point registration: a pure 45 degree clockwise rotation (plus shift) as the matrix
const c45 = Math.SQRT1_2;
const affine = micro('AFF', { parentID: 'REF', placementType: 'affine', affineMatrix: [c45, -c45, 50, c45, c45, 60] });
// Mirror-image affine (left-right flip): a "/" grain becomes "\"
const mirror = micro('MIR', { parentID: 'REF', placementType: 'affine', affineMatrix: [-1, 0, 900, 0, 1, 0] });
const otherRef = micro('REF2');

const all = [ref, rot30, rot967, nested, pointPlaced, xpl, affine, mirror, otherRef];
const byId = new Map(all.map((m) => [m.id, m]));
const lookup = (id: string) => byId.get(id);

// ---- frames ----
check('reference is its own frame', referenceFrameOf(ref, lookup).rootId === 'REF');
check('rotated child -> REF', referenceFrameOf(rot30, lookup).rootId === 'REF');
check('grandchild -> REF', referenceFrameOf(nested, lookup).rootId === 'REF');
check('point-placed child stays its own frame', referenceFrameOf(pointPlaced, lookup).rootId === 'POINT');

// ---- orientations ----
const run = (m: MicrographMetadata, angle: number, useRef = true) =>
  grainMetricsInFrames([{ spot: grain('g', angle), micrograph: m }], lookup, useRef).metrics[0];

near('grain on the reference keeps its angle', run(ref, 40).orientationDegrees, 40);
near('horizontal grain on a child rotated +30 (clockwise) = 150 on REF', run(rot30, 0).orientationDegrees, 150);
near('60 deg grain on a child rotated +30 = 30 on REF', run(rot30, 60).orientationDegrees, 30);
near("Peter's child rotated 96.6: a vertical grain = 173.4 on REF", run(rot967, 90).orientationDegrees, 90 - 96.6131384417);
near('grandchild: rotations add (+20 then +30): horizontal = 130', run(nested, 0).orientationDegrees, 130);
near('point-placed child: own frame', run(pointPlaced, 25).orientationDegrees, 25);
near('XPL sibling uses its PPL placement (+30)', run(xpl, 0).orientationDegrees, 150);
near('3-point matrix rotating 45 clockwise: horizontal = 135', run(affine, 0).orientationDegrees, 135);
near('mirrored 3-point placement: 30 becomes 150', run(mirror, 30).orientationDegrees, 150);
near('Current micrograph scope: child keeps its own frame', run(rot30, 0, false).orientationDegrees, 0);

// ---- size and shape stay as measured on the own image ----
const own = run(rot30, 0, false), inRef = run(rot30, 0, true);
check('size unchanged by the frame', Math.abs(own.areaMicrons2 - inRef.areaMicrons2) < 1e-9 && Math.abs(own.majorAxisMicrons - inRef.majorAxisMicrons) < 1e-9);
check('aspect ratio unchanged by the frame', Math.abs(own.aspectRatio - inRef.aspectRatio) < 1e-9);

// ---- frame names and counts ----
const mixed = grainMetricsInFrames(
  [
    { spot: grain('a', 0), micrograph: ref },
    { spot: grain('b', 0), micrograph: rot30 },
    { spot: grain('c', 0), micrograph: otherRef },
  ],
  lookup,
  true
);
check('two frames reported', mixed.frames.length === 2, mixed.frames);
check('REF frame holds 2 grains', mixed.frames.find((f) => f.id === 'REF')?.grains === 2, mixed.frames);
check('orientationFrame names the reference', mixed.metrics[1].orientationFrame === 'REF', mixed.metrics[1].orientationFrame);
const current = grainMetricsInFrames([{ spot: grain('b', 0), micrograph: rot30 }], lookup, false);
check('Current scope names the own micrograph', current.metrics[0].orientationFrame === 'ROT30' && current.frames.length === 1);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
