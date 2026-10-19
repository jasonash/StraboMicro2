/**
 * Real scales for affine-placed micrographs (src/utils/affineScale.ts): the matrix's
 * enlargement, the real scale through a chain, the repair of projects saved with a stand-in
 * scale (micrographs placed on them keep their size), and the cascade when a scale changes.
 *
 *   npm run test:affine-scale
 */

import { affineMatrixScale, affineRealScale, cascadeScale, realScaleOf, repairAffineScales, setScaleWithCascade } from '../src/utils/affineScale.ts';
import type { AffineMatrix } from '../src/utils/affineTransform.ts';
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
const near = (a: number | null | undefined, b: number) => a != null && Math.abs(a - b) <= 1e-9 * Math.abs(b);

/** Turn by deg and resize by s, then move */
function turn(deg: number, s: number, tx = 10, ty = 20): AffineMatrix {
  const r = (deg * Math.PI) / 180;
  return [s * Math.cos(r), -s * Math.sin(r), tx, s * Math.sin(r), s * Math.cos(r), ty];
}

// ---------------------------------------------------------------- the matrix's enlargement
check('similarity: its size', near(affineMatrixScale(turn(30, 0.25)), 0.25));
check('mirror counts as its size', near(affineMatrixScale([-0.5, 0, 0, 0, 0.5, 0]), 0.5));
const skew: AffineMatrix = [0.3, 0.06, 100, 0, 0.33, 50];
check('skew: square root of the area factor', near(affineMatrixScale(skew), Math.sqrt(0.3 * 0.33)));
check('real scale = parent / enlargement', near(affineRealScale(40000, turn(-70, 0.5)), 80000));
check('no parent scale: none', affineRealScale(null, turn(0, 0.5)) === null && affineRealScale(0, turn(0, 0.5)) === null);
check('flat matrix: none', affineRealScale(40000, [0, 0, 1, 0, 0, 1]) === null);

// ---------------------------------------------------------------- a project saved with stand-ins
//
// P reference 40000 px/cm
// ├─ A affine x0.5 (stand-in 100, as the New Micrograph wizard saved it)
// │  ├─ R rectangle, drawn 2x smaller per pixel than A: stored 100 / 2 = 50
// │  │  └─ RR rectangle on R, drawn at R/RR = 4: stored 12.5
// │  ├─ Q point, its own measured scale 12345
// │  │  └─ QQ rectangle on Q: 6000 (follows Q, which does not change)
// │  ├─ U batch imported, no location, no scale
// │  └─ B affine x0.25 on A (stand-in = A's stored 100, as Edit Location saved it)
// │     └─ G rectangle on B, drawn at B/G = 4: stored 25
// └─ C affine x2 (stand-in = P's 40000) on P directly

function micro(id: string, extra: Partial<MicrographMetadata>): MicrographMetadata {
  return { id, name: id, imageWidth: 1000, imageHeight: 800, ...extra } as MicrographMetadata;
}
function build(): ProjectMetadata {
  return {
    id: 'proj', name: 'p',
    datasets: [{ id: 'd', name: 'd', samples: [{ id: 's', name: 's', micrographs: [
      // Children listed before their parents on purpose: the order must not matter
      micro('G', { parentID: 'B', offsetInParent: { X: 1, Y: 1 }, scalePixelsPerCentimeter: 25 }),
      micro('B', { parentID: 'A', placementType: 'affine', affineMatrix: turn(10, 0.25), scalePixelsPerCentimeter: 100 }),
      micro('RR', { parentID: 'R', offsetInParent: { X: 3, Y: 3 }, scalePixelsPerCentimeter: 12.5 }),
      micro('R', { parentID: 'A', offsetInParent: { X: 5, Y: 6 }, rotation: 12, scalePixelsPerCentimeter: 50 }),
      micro('Q', { parentID: 'A', pointInParent: { X: 7, Y: 8 }, scalePixelsPerCentimeter: 12345 }),
      micro('QQ', { parentID: 'Q', offsetInParent: { X: 0, Y: 0 }, scalePixelsPerCentimeter: 6000 }),
      micro('U', { parentID: 'A' }),
      micro('A', { parentID: 'P', placementType: 'affine', affineMatrix: turn(-30, 0.5), scalePixelsPerCentimeter: 100 }),
      micro('C', { parentID: 'P', placementType: 'affine', affineMatrix: turn(0, 2), scalePixelsPerCentimeter: 40000 }),
      micro('P', { scalePixelsPerCentimeter: 40000 }),
    ] }] }],
  } as unknown as ProjectMetadata;
}
const scales = (p: ProjectMetadata) => Object.fromEntries(
  (p.datasets?.[0]?.samples?.[0]?.micrographs ?? []).map((m) => [m.id, m.scalePixelsPerCentimeter ?? null]));
const byIdOf = (p: ProjectMetadata) => new Map((p.datasets?.[0]?.samples?.[0]?.micrographs ?? []).map((m) => [m.id, m]));

{
  const before = build();
  const idx = byIdOf(before);
  // The viewer's value before any repair: worked out from the chain
  check('real scale through the chain: A', near(realScaleOf(idx.get('A')!, (id) => idx.get(id)), 80000));
  check('real scale through the chain: B on A', near(realScaleOf(idx.get('B')!, (id) => idx.get(id)), 320000));
  check('a reference: its stored scale', realScaleOf(idx.get('P')!, (id) => idx.get(id)) === 40000);

  const p = build();
  const repaired = repairAffineScales(p);
  const s = scales(p);
  check('A gets its real scale', near(s.A, 80000), s);
  check('B gets its real scale (from A\'s real one)', near(s.B, 320000), s);
  check('C gets its real scale', near(s.C, 20000), s);
  check('R keeps its size on A: A / R still 2, so R = 40000', near(s.R, 40000) && near((s.A as number) / (s.R as number), 2), s);
  check('RR keeps its size on R: R / RR still 4', near((s.R as number) / (s.RR as number), 4), s);
  check('G keeps its size on B: B / G still 4', near((s.B as number) / (s.G as number), 4), s);
  check('Q (point) keeps its measured scale', s.Q === 12345, s);
  check('QQ on Q is left alone', s.QQ === 6000, s);
  check('U (no location) gets no scale', s.U === null, s);
  check('P (reference) unchanged', s.P === 40000, s);
  check('repair names the affine micrographs it changed', JSON.stringify([...repaired].sort()) === JSON.stringify(['A', 'B', 'C']), repaired);
  const idx2 = byIdOf(p);
  check('after the repair, stored = real for every affine one',
    ['A', 'B', 'C'].every((id) => near(idx2.get(id)!.scalePixelsPerCentimeter, realScaleOf(idx2.get(id)!, (x) => idx2.get(x)) as number)));
  const again = repairAffineScales(p);
  check('running it again changes nothing', again.length === 0 && JSON.stringify(scales(p)) === JSON.stringify(s), again);

  // The reference's scale changes (Edit Micrograph Metadata): everything follows, points keep theirs
  setScaleWithCascade(p, 'P', 20000);
  const t = scales(p);
  check('cascade: A real from P\'s new scale', near(t.A, 40000), t);
  check('cascade: B real from A\'s new scale', near(t.B, 160000), t);
  check('cascade: R, RR, G halve with their parents', near(t.R, 20000) && near(t.RR, (t.R as number) / 4) && near(t.G, (t.B as number) / 4), t);
  check('cascade: point and what is on it untouched', t.Q === 12345 && t.QQ === 6000 && t.U === null, t);
  check('cascade: no repair needed afterwards', repairAffineScales(p).length === 0);

  // A micrograph's first scale: nothing was placed relative to one, nothing else changes
  const q = build();
  const pRef = byIdOf(q).get('P')!;
  delete pRef.scalePixelsPerCentimeter;
  setScaleWithCascade(q, 'P', 30000);
  check('a first scale does not cascade', scales(q).R === 50 && scales(q).A === 100, scales(q));
  check('ratio 1 changes nothing', cascadeScale(build(), 'P', 1).length === 0);
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
