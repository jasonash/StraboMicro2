/**
 * Place automatically on parent (src/services/autoPlace/placementMatch.ts),
 * run with the app's own public/opencv.js.
 *
 *   npm run test:auto-place [-- --only <text>]
 *
 * 1. Matrix math (always).
 * 2. Synthetic details with a known true placement, made from Claire's
 *    Toxaway images: crops turned, resized, sheared, re-lit and blurred, a
 *    large parent (refinement), scale-bar traps, unrelated images.
 * 3. Real Toxaway pairs from the 2026-09-24 experiment (RESULTS.md).
 * 4. Jason's circle drawings (a repeating pattern must not give a confident
 *    wrong answer).
 *
 * 2 and 3 need docs/Data_Import_Agent/ExampleFilesFromClaire/Toxaway (docs/
 * is not in git; TOXAWAY_DIR overrides), 4 needs CIRCLES_DIR or Jason's 8TB
 * drive; missing folders are skipped with a note.
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import sharp from 'sharp';
import {
  findPlacement, memorySource, classify, nearestSimilarity, multiply, invert, apply, footprint, cornerDistance,
  toMat, fromMat, fitSimilarity, residual, settle, implausible,
  type GrayImage, type PlacementResult, type OpenCV,
} from '../src/services/autoPlace/placementMatch.ts';
import { computeAffineMatrix, type AffineMatrix } from '../src/utils/affineTransform.ts';
import { rectangleFields, rectanglePoint, affineFields, toAppPixels, placementUpdates } from '../src/services/autoPlace/placementFields.ts';
import { hasLocation, unplacedChildren, cannotPlaceChildrenReason } from '../src/utils/micrographLocation.ts';
import type { MicrographMetadata, ProjectMetadata } from '../src/types/project-types.ts';

const root = path.resolve(import.meta.dirname, '..');
const TOXAWAY = process.env.TOXAWAY_DIR
  || path.join(root, 'docs/Data_Import_Agent/ExampleFilesFromClaire/Toxaway/Toxaway Images for Strabo Spot');
const CIRCLES = process.env.CIRCLES_DIR || '/Volumes/8TB/Work/StraboMicro/Micro/ThinSections/good/circles';
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}

// The Emscripten module is thenable: always pass it inside a wrapper, never resolve or return it
// from a promise callback (the promise would adopt it and loop forever)
const { cv } = await new Promise<{ cv: OpenCV }>((resolve) => {
  const g = globalThis as Record<string, unknown>;
  g.Module = { onRuntimeInitialized() { resolve({ cv: g.cv }); } };
  g.cv = createRequire(import.meta.url)(path.join(root, 'public/opencv.js'));
});

// ---------------------------------------------------------------- 1. math

{
  const turn = (deg: number, s: number, tx: number, ty: number): AffineMatrix => {
    const r = (deg * Math.PI) / 180;
    return [s * Math.cos(r), -s * Math.sin(r), tx, s * Math.sin(r), s * Math.cos(r), ty];
  };
  const m = turn(30, 0.4, 500, 200);
  const sim = nearestSimilarity(m, 1000, 800);
  check('similarity scale', Math.abs(sim.scale - 0.4) < 1e-9, sim);
  check('similarity rotation', Math.abs(sim.rotation - 30) < 1e-9, sim);
  check('similarity of a similarity is itself', cornerDistance(sim.matrix, m, 1000, 800) < 1e-6);
  check('turn + resize is a rectangle', classify(m, 1000, 800) === 'rectangle');
  const sheared = multiply(m, [1, 0.2, 0, 0, 1, 0]);
  check('shear is affine', classify(sheared, 1000, 800) === 'affine');
  const stretched = multiply(m, [1.1, 0, 0, 0, 1, 0]);
  check('unequal stretch is affine', classify(stretched, 1000, 800) === 'affine');
  const tiny = multiply(m, [1.001, 0.0005, 0, 0, 1, 0]);
  check('tiny distortion is still a rectangle', classify(tiny, 1000, 800) === 'rectangle');
  check('invert', cornerDistance(multiply(invert(sheared), sheared), [1, 0, 0, 0, 1, 0], 1000, 800) < 1e-6);
  const p = apply(multiply(m, sheared), 10, 20);
  const q = apply(m, ...apply(sheared, 10, 20));
  check('multiply is "a after b"', Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-9);

  // Point pairs through a known placement, with a little noise
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) - 0.5;
  const pairsOf = (t: AffineMatrix, noise: number) => {
    const src: number[] = [];
    const dst: number[] = [];
    for (let i = 0; i < 60; i++) {
      const x = (i * 37) % 1000;
      const y = (i * 53) % 800;
      const [u, v] = apply(t, x, y);
      src.push(x, y);
      dst.push(u + rand() * noise, v + rand() * noise);
    }
    return { src, dst };
  };
  const exact = pairsOf(m, 0);
  check('fitSimilarity recovers a similarity', cornerDistance(fitSimilarity(exact.src, exact.dst), m, 1000, 800) < 1e-6);
  check('residual of the true placement is 0', residual(m, exact.src, exact.dst) < 1e-9);
  // A noisy similarity whose affine fit picked up a little shear: settles as a rectangle
  const noisy = pairsOf(m, 2);
  const wobbly = multiply(m, [1.01, 0.02, 0, 0, 0.99, 0]);
  check('noise-only shear settles as a rectangle', settle({ matrix: wobbly, n: 60, ...noisy }, 1000, 800).kind === 'rectangle');
  // A real shear stays affine, with its own matrix
  const real = pairsOf(sheared, 2);
  const settled = settle({ matrix: sheared, n: 60, ...real }, 1000, 800);
  check('the wobble is past the corner rule (so the residual rule decides)', classify(wobbly, 1000, 800) === 'affine');
  // Plausibility: a mirrored fit and a label-only match are refused
  const pairs = { src: [10, 10, 20, 10, 10, 20], dst: [10, 10, 20, 10, 10, 20], graphic: [1, 1, 1] };
  const mirrored = implausible({ m: [-0.5, 0, 800, 0, 0.5, 100], inlier: new Uint8Array([1, 1, 1]), n: 3 }, [-0.5, 0, 800, 0, 0.5, 100], pairs, 1000, 800, 2000, 1500);
  check('mirrored fit refused', mirrored === 'mirrored or flat', mirrored);
  const label = implausible({ m: [1, 0, 0, 0, 1, 0], inlier: new Uint8Array([1, 1, 1]), n: 3 }, [1, 0, 0, 0, 1, 0], pairs, 1000, 800, 2000, 1500);
  check('label-only match refused', label === 'label-only match', label);
  // Saved fields: a rectangle drawn the renderer's way lands where the matrix says
  for (const [deg, sc] of [[0, 0.5], [30, 0.25], [-100, 2], [180, 0.125]]) {
    const t = turn(deg, sc, 700, 300);
    const r = rectangleFields(t, 1000, 800);
    const worst = Math.max(...[[0, 0], [1000, 0], [1000, 800], [0, 800], [313, 471]].map(([x, y]) => {
      const a = rectanglePoint(r, 1000, 800, x, y);
      const b = apply(t, x, y);
      return Math.hypot(a[0] - b[0], a[1] - b[1]);
    }));
    check(`rectangle fields reproduce a ${deg} deg turn`, worst < 1e-6, { worst, r });
    check(`rectangle scale ${sc}, rotation ${deg}`, Math.abs(r.scale - sc) < 1e-9 && Math.abs(((r.rotation - deg + 540) % 360) - 180) < 1e-9, r);
  }
  // Affine fields: 3-Point Registration's own math recovers the matrix from the control points
  const af = affineFields(sheared, 1000, 800);
  const back = computeAffineMatrix(af.controlPoints);
  check('affine control points give back the matrix', back.every((v, i) => Math.abs(v - sheared[i]) < 1e-6), back);
  const fp = footprint(sheared, 1000, 800);
  check('affine bounds offset is the footprint minimum', Math.abs(af.boundsOffset.x - Math.min(...fp.map((c) => c[0]))) < 1e-9 && Math.abs(af.boundsOffset.y - Math.min(...fp.map((c) => c[1]))) < 1e-9);
  // File pixels -> app pixels: a detail stored at half its file size, a parent stored at twice
  const inFile = turn(10, 0.3, 50, 60);
  const inApp = toAppPixels(inFile, { width: 2000, height: 1600 }, { width: 1000, height: 800 }, { width: 500, height: 400 }, { width: 1000, height: 800 });
  const fileP = apply(inFile, 400, 300);
  const appP = apply(inApp, 200, 150);
  check('toAppPixels', Math.hypot(appP[0] - fileP[0] * 2, appP[1] - fileP[1] * 2) < 1e-9, { fileP, appP });
  check('real shear settles as affine', settled.kind === 'affine' && settled.matrix === sheared, settled.kind);
}

// ---------------------------------------------------------------- 1b. saving and unplaced children

{
  // A rectangle outcome: the child's scale is the parent's divided by parent px per child px; other methods cleared
  const rect = placementUpdates({ kind: 'rectangle', offsetX: 12, offsetY: 34, rotation: -90, scale: 0.25 }, 40000, undefined, 0.8);
  check('rectangle save: offset, rotation, opacity', rect.offsetInParent?.X === 12 && rect.offsetInParent?.Y === 34 && rect.rotation === -90 && rect.opacity === 0.8, rect);
  check('rectangle save: scale = parent / scale', rect.scalePixelsPerCentimeter === 160000, rect.scalePixelsPerCentimeter);
  check('rectangle save clears affine + point', 'placementType' in rect && rect.placementType === undefined && 'affineMatrix' in rect && 'affineTileHash' in rect && 'pointInParent' in rect && rect.pointInParent === undefined);
  // An affine outcome keeps the child's own scale as the placeholder, else the parent's
  const sheared: AffineMatrix = [0.3, 0.06, 100, 0, 0.33, 50];
  const affine = { kind: 'affine' as const, ...affineFields(sheared, 1000, 800), tileHash: 'hash1' };
  const a1 = placementUpdates(affine, 40000, 55555, 1);
  check('affine save: matrix, tiles, placeholder scale', a1.placementType === 'affine' && a1.affineMatrix === sheared && a1.affineTileHash === 'hash1' && a1.scalePixelsPerCentimeter === 55555, a1);
  check('affine save clears rectangle', 'offsetInParent' in a1 && a1.offsetInParent === undefined && 'rotation' in a1 && 'scaleX' in a1);
  check('affine save without a child scale takes the parent\'s', placementUpdates(affine, 40000, null, 1).scalePixelsPerCentimeter === 40000);

  const m = (id: string, extra: Partial<MicrographMetadata> = {}): MicrographMetadata => ({ id, name: id, ...extra } as MicrographMetadata);
  check('no location', !hasLocation(m('a', { parentID: 'p' })));
  check('rectangle / point / legacy xOffset / affine count as a location',
    hasLocation(m('a', { offsetInParent: { X: 0, Y: 0 } })) && hasLocation(m('a', { pointInParent: { X: 1, Y: 1 } }))
    && hasLocation(m('a', { xOffset: 0 })) && hasLocation(m('a', { placementType: 'affine' })));
  const project = {
    id: 'proj', name: 'p',
    datasets: [{ id: 'd', name: 'd', samples: [
      { id: 's1', name: 's1', micrographs: [
        m('p', { scalePixelsPerCentimeter: 40000, imagePath: 'p' }),
        m('c1', { parentID: 'p' }),
        m('c2', { parentID: 'p', offsetInParent: { X: 1, Y: 2 } }),
        m('c3', { parentID: 'p', isPrimarySibling: false }),
        m('g1', { parentID: 'c1' }),
      ] },
      { id: 's2', name: 's2', micrographs: [m('c4', { parentID: 'p', isPrimarySibling: true })] },
    ] }],
  } as unknown as ProjectMetadata;
  const ids = unplacedChildren(project, 'p').map((c) => c.id);
  check('unplaced children: direct, unplaced, not hidden siblings, in order', JSON.stringify(ids) === JSON.stringify(['c1', 'c4']), ids);
  check('no project: none', unplacedChildren(null, 'p').length === 0);
  check('parent with a scale can place its children', cannotPlaceChildrenReason(m('p', { scalePixelsPerCentimeter: 1, imagePath: 'p' })) === null);
  check('parent without a scale cannot', cannotPlaceChildrenReason(m('p', { imagePath: 'p' })) !== null);
  check('unplaced associated parent cannot', cannotPlaceChildrenReason(m('c1', { parentID: 'p', scalePixelsPerCentimeter: 1, imagePath: 'c1' })) !== null);
}

// ---------------------------------------------------------------- helpers

async function readGray(file: string): Promise<GrayImage> {
  const { data, info } = await sharp(file).greyscale().extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
}

/** detail pixel -> world pixel: turn, resize (1/mag), shear, then place its top-left corner area at (x, y) */
function placement(x: number, y: number, deg: number, mag: number, shearX = 0, stretchX = 1): AffineMatrix {
  const r = (deg * Math.PI) / 180;
  const rot: AffineMatrix = [Math.cos(r), -Math.sin(r), 0, Math.sin(r), Math.cos(r), 0];
  const lin = multiply(rot, multiply([stretchX, shearX, 0, 0, 1, 0], [1 / mag, 0, 0, 0, 1 / mag, 0]));
  return [lin[0], lin[1], x, lin[3], lin[4], y];
}

/** Renders a w x h detail from world through m (detail px -> world px) */
function renderDetail(world: GrayImage, m: AffineMatrix, w: number, h: number): GrayImage {
  const src = toMat(cv, world);
  const M = cv.matFromArray(2, 3, cv.CV_64F, m);
  const out = new cv.Mat();
  cv.warpAffine(src, out, M, new cv.Size(w, h), cv.INTER_LINEAR | cv.WARP_INVERSE_MAP, cv.BORDER_REFLECT);
  const result = fromMat(out);
  [src, M, out].forEach((x) => x.delete());
  return result;
}

function resize(img: GrayImage, f: number): GrayImage {
  const src = toMat(cv, img);
  const out = new cv.Mat();
  cv.resize(src, out, new cv.Size(Math.round(img.width * f), Math.round(img.height * f)), 0, 0, f < 1 ? cv.INTER_AREA : cv.INTER_CUBIC);
  const result = fromMat(out);
  src.delete();
  out.delete();
  return result;
}

/** Contrast/brightness change, blur and noise (a different camera or lamp) */
function relight(img: GrayImage, gain: number, offset: number, blur: number, noise: number): GrayImage {
  const src = toMat(cv, img);
  const out = new cv.Mat();
  src.convertTo(out, -1, gain, offset);
  if (blur > 0) cv.GaussianBlur(out, out, new cv.Size(0, 0), blur);
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < out.data.length; i++) {
    out.data[i] = Math.max(0, Math.min(255, out.data[i] + (rand() + rand() + rand() - 1.5) * noise * 2));
  }
  const result = fromMat(out);
  src.delete();
  out.delete();
  return result;
}

/** A burned-in scale bar and label, bottom left, same pixel size whatever the image */
function stampBar(img: GrayImage): GrayImage {
  const mat = toMat(cv, img);
  const y = img.height - 90;
  cv.rectangle(mat, new cv.Point(20, y - 60), new cv.Point(360, img.height - 20), new cv.Scalar(255), -1);
  cv.rectangle(mat, new cv.Point(40, y), new cv.Point(340, y + 22), new cv.Scalar(0), -1);
  cv.putText(mat, '500 um', new cv.Point(110, y - 14), cv.FONT_HERSHEY_SIMPLEX, 1.4, new cv.Scalar(0), 4);
  const result = fromMat(mat);
  mat.delete();
  return result;
}

function describe(r: PlacementResult): string {
  const sim = r.matrix ? nearestSimilarity(r.matrix, 1, 1) : null;
  return `${r.status.padEnd(9)} ${String(r.kind ?? '-').padEnd(9)} inliers ${String(r.inliers).padStart(4)} runner-up ${String(r.runnerUp).padStart(3)}`
    + (sim ? ` scale ${sim.scale.toFixed(3)} rot ${sim.rotation.toFixed(1)}` : '')
    + ` ${(r.ms / 1000).toFixed(1)} s  ${r.reason}`;
}

/** Largest corner error against the truth, as a share of the footprint diagonal */
function error(r: PlacementResult, truth: AffineMatrix, w: number, h: number): number {
  if (!r.matrix) return Infinity;
  const c = footprint(truth, w, h);
  return cornerDistance(r.matrix, truth, w, h) / Math.hypot(c[2][0] - c[0][0], c[2][1] - c[0][1]);
}

interface Case {
  name: string;
  detail: GrayImage;
  parent: GrayImage;
  /** detail px -> parent px; null for a pair that must not match */
  truth: AffineMatrix | null;
  kind?: 'rectangle' | 'affine';
  /** statuses accepted (default placed) */
  accept?: string[];
  /** report only, never fail */
  info?: boolean;
  /** text the reason must contain */
  reason?: string;
}

async function runCase(c: Case) {
  if (only && !c.name.includes(only)) return;
  const r = await findPlacement(cv, memorySource(cv, c.detail), memorySource(cv, c.parent));
  const w = c.detail.width;
  const h = c.detail.height;
  const err = c.truth ? error(r, c.truth, w, h) : NaN;
  console.log(`  ${c.name.padEnd(46)} ${describe(r)}${c.truth ? `  error ${(err * 100).toFixed(2)} %` : ''}`);
  if (c.info) return;
  if (!c.truth) {
    check(`${c.name}: no match`, r.status === 'none', describe(r));
    return;
  }
  const accept = c.accept ?? ['placed'];
  check(`${c.name}: status ${accept.join('/')}`, accept.includes(r.status), describe(r));
  // 0.5 % of the footprint diagonal, i.e. 5 px on a 1000 px wide footprint
  if (r.status !== 'none' && r.status !== 'ambiguous') check(`${c.name}: position`, err < 0.005, { error: err });
  if (c.kind && r.status !== 'none') check(`${c.name}: kind ${c.kind}`, r.kind === c.kind, r.kind);
  if (c.reason) check(`${c.name}: reason has "${c.reason}"`, r.reason.includes(c.reason), r.reason);
}

const S = (k: number): AffineMatrix => [k, 0, 0, 0, k, 0];

// ---------------------------------------------------------------- 2. synthetic

const toxA = path.join(TOXAWAY, '160326-4/Photomicrographs/160326-4_ppl_full.tif');
const toxB = path.join(TOXAWAY, '160328-4/Photomicrographs/160328-4_ppl_merge.tif');
const toxC = path.join(TOXAWAY, '160327-5/Photomicrographs/160327-5_xpl_full.tif');

if (!fs.existsSync(toxA) || !fs.existsSync(toxB) || !fs.existsSync(toxC)) {
  console.log(`SKIPPED synthetic + Toxaway cases: no images in ${TOXAWAY}`);
} else {
  console.log('Synthetic details (true placement known):');
  const A = await readGray(toxA);
  const B = await readGray(toxB);
  const C = await readGray(toxC);
  // Parent = world at half size, so a detail cut from the world at full size has real extra detail
  const parentA = resize(A, 0.5);
  const parentB = resize(B, 0.5);

  const cases: Array<{ name: string; m: AffineMatrix; w: number; h: number; kind?: 'rectangle' | 'affine'; accept?: string[]; info?: boolean; light?: [number, number, number, number] }> = [
    { name: 'crop, 2x finer', m: placement(900, 300, 0, 1), w: 900, h: 640, kind: 'rectangle' },
    { name: 'turned 30, 2x finer', m: placement(1100, 250, 30, 1), w: 900, h: 640, kind: 'rectangle' },
    { name: 'turned -100, 4x finer', m: placement(1500, 900, -100, 2), w: 1200, h: 900, kind: 'rectangle' },
    { name: 'turned 180, 8x finer', m: placement(600, 400, 180, 4), w: 1600, h: 1200, kind: 'rectangle', accept: ['placed', 'low'] },
    { name: 'mild shear + stretch (affine)', m: placement(800, 200, 12, 1, 0.15, 1.12), w: 900, h: 700, kind: 'affine' },
    { name: 'strong shear 0.5', m: placement(900, 150, 5, 1, 0.5, 1), w: 900, h: 700, kind: 'affine', accept: ['placed', 'low'] },
    { name: 'relit: brighter, blurred, noisy', m: placement(400, 200, 15, 1.5), w: 1000, h: 750, kind: 'rectangle', light: [1.3, 25, 1.2, 6] },
    { name: 'relit: darker, low contrast', m: placement(1300, 700, -40, 1), w: 800, h: 600, kind: 'rectangle', light: [0.6, -10, 0, 3] },
    { name: 'small detail 300 px', m: placement(1700, 500, 0, 1), w: 300, h: 225, kind: 'rectangle', accept: ['low'] },
  ];
  for (const c of cases) {
    let detail = renderDetail(A, c.m, c.w, c.h);
    if (c.light) detail = relight(detail, ...c.light);
    await runCase({ name: c.name, detail, parent: parentA, truth: multiply(S(0.5), c.m), kind: c.kind, accept: c.accept, info: c.info });
  }

  // Same detail on world B too (a different rock: the PPL mosaic)
  await runCase({ name: 'mosaic B: turned 60, 3x finer', detail: renderDetail(B, placement(700, 500, 60, 1.5), 900, 700), parent: parentB, truth: multiply(S(0.5), placement(700, 500, 60, 1.5)), kind: 'rectangle' });

  // Large parent: world 3x enlarged, so the match runs on a shrunk parent and is refined on a crop
  {
    const big = resize(A, 3);
    const m = placement(3000, 1200, 20, 1);
    await runCase({ name: 'large parent (7300 px), refined', detail: renderDetail(big, m, 1400, 1000), parent: big, truth: m, kind: 'rectangle', reason: 'refined' });
  }

  // Unrelated images must not match
  await runCase({ name: 'unrelated: B detail on A', detail: renderDetail(B, placement(500, 300, 10, 1), 900, 700), parent: parentA, truth: null });
  await runCase({ name: 'unrelated: XPL C detail on A', detail: renderDetail(C, placement(500, 300, 0, 1), 900, 700), parent: parentA, truth: null });
  // Scale-bar trap: the same bar burned into an unrelated detail and the parent
  await runCase({ name: 'scale-bar trap: same bar, unrelated', detail: stampBar(renderDetail(B, placement(500, 300, 0, 1), 1000, 750)), parent: stampBar(parentA), truth: null });
  // A small unrelated detail where the bar fills much of the image (only the graphics filter stops it)
  await runCase({ name: 'scale-bar trap: small detail', detail: stampBar(renderDetail(B, placement(500, 300, 0, 1), 420, 260)), parent: stampBar(parentA), truth: null });
  // Two places that each fit half the detail (like repeating fabric): copy 1 keeps the left half
  // sharp, copy 2 the right half, on an unrelated rock background -> ambiguous, not placed
  {
    const region = renderDetail(A, placement(800, 300, 0, 1), 500, 360);
    const blurHalf = (img: GrayImage, keepLeft: boolean): GrayImage => {
      const mat = toMat(cv, img);
      const blurred = new cv.Mat();
      cv.GaussianBlur(mat, blurred, new cv.Size(0, 0), 12);
      const out: GrayImage = { data: new Uint8Array(img.data), width: img.width, height: img.height };
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          if ((x < img.width / 2) !== keepLeft) out.data[y * img.width + x] = blurred.data[y * img.width + x];
        }
      }
      mat.delete();
      blurred.delete();
      return out;
    };
    const parent = renderDetail(C, placement(200, 100, 0, 1), 1600, 1000);
    const paste = (img: GrayImage, x0: number, y0: number) => {
      for (let y = 0; y < img.height; y++) parent.data.set(img.data.subarray(y * img.width, (y + 1) * img.width), (y0 + y) * parent.width + x0);
    };
    paste(blurHalf(region, true), 100, 100);
    paste(blurHalf(region, false), 900, 500);
    const m = placement(100, 100, 0, 1);
    await runCase({ name: 'two half-copies: ambiguous', detail: region, parent, truth: m, accept: ['ambiguous'], info: false });
  }
  // Real pair with bars on both: must still place by the rock, not by the bars
  {
    const m = placement(1000, 400, 0, 1);
    await runCase({ name: 'bars on both, real pair', detail: stampBar(renderDetail(A, m, 1000, 750)), parent: stampBar(parentA), truth: multiply(S(0.5), m), kind: 'rectangle' });
  }

  // ---------------------------------------------------------------- 3. real Toxaway pairs
  console.log('Real Toxaway pairs (2026-09-24 experiment):');
  const dir = path.join(TOXAWAY, '160328-4/Photomicrographs');
  const real: Array<{ d: string; p: string; scale?: number; rot?: number; accept: string[] }> = [  // all real placements are rectangles
    { d: '160328-4-XZA_pplgar1.tif', p: '160328-4_ppl_merge.tif', scale: 0.186, rot: 6.5, accept: ['placed'] },
    { d: '160328-4-XZA_pplgar2.tif', p: '160328-4_ppl_merge.tif', scale: 0.235, rot: 4.0, accept: ['placed'] },
    { d: '160328-4XZA_BLG in pl_subgrain in pl - Copy.tif', p: '160328-4_xpl_merge.tif', scale: 0.216, rot: -1.9, accept: ['low'] },
    { d: '160328-4XZB_folds_PPL - Copy.tif', p: '160328-4_ppl_merge.tif', accept: ['none'] },
    { d: '160328-4XZB_S-C-C_ fabric - Copy.tif', p: '160328-4_xpl_merge.tif', accept: ['none'] },
  ];
  for (const t of real) {
    const name = `${t.d.slice(0, 30)} > ${t.p.slice(9, 17)}`;
    if (only && !name.includes(only)) continue;
    const r = await findPlacement(cv, memorySource(cv, await readGray(path.join(dir, t.d))), memorySource(cv, await readGray(path.join(dir, t.p))));
    console.log(`  ${name.padEnd(46)} ${describe(r)}`);
    check(`${name}: status ${t.accept.join('/')}`, t.accept.includes(r.status), describe(r));
    if (t.scale !== undefined && t.rot !== undefined && r.matrix) {
      const sim = nearestSimilarity(r.matrix, 1, 1);
      check(`${name}: scale ~${t.scale}`, Math.abs(sim.scale / t.scale - 1) < 0.03, sim.scale);
      check(`${name}: rotation ~${t.rot}`, Math.abs(sim.rotation - t.rot) < 1, sim.rotation);
      check(`${name}: rectangle`, r.kind === 'rectangle', r.kind);
    }
  }
  const crossSample = path.join(TOXAWAY, '160326-4/Photomicrographs/160326-4_XZ_BLG in pl_GBM in qtz - Copy.tif');
  if (!only || 'other sample'.includes(only)) {
    const r = await findPlacement(cv, memorySource(cv, await readGray(crossSample)), memorySource(cv, await readGray(path.join(dir, '160328-4_xpl_merge.tif'))));
    console.log(`  ${'160326-4 detail > 160328-4 xpl (other sample)'.padEnd(46)} ${describe(r)}`);
    check('other sample: no match', r.status === 'none', describe(r));
  }
}

// ---------------------------------------------------------------- 4. circles

if (!fs.existsSync(path.join(CIRCLES, 'big.jpg'))) {
  console.log(`SKIPPED circle drawings: not found in ${CIRCLES}`);
} else if (!only || 'circles'.includes(only)) {
  console.log('Circle drawings (repeating pattern):');
  const big = await readGray(path.join(CIRCLES, 'big.jpg'));
  for (const f of ['small_exact.jpg', 'small_bigger.jpg', 'small_smaller.jpg']) {
    const d = await readGray(path.join(CIRCLES, f));
    const r = await findPlacement(cv, memorySource(cv, d), memorySource(cv, big));
    console.log(`  ${f.padEnd(46)} ${describe(r)}${r.matrix ? `  top-left ${apply(r.matrix, 0, 0).map(Math.round)}` : ''}`);
    // Each holds the scale bar, which is bottom left on big.jpg: anything confident must be there
    const tl = r.matrix ? apply(r.matrix, 0, 0) : null;
    const bottomLeft = !!tl && tl[0] < 400 && tl[1] > 700;
    check(`${f}: no confident wrong place`, r.status !== 'placed' || bottomLeft, { status: r.status, tl });
  }
  const skew = await findPlacement(cv, memorySource(cv, await readGray(path.join(CIRCLES, 'skew_small_transformed.jpg'))), memorySource(cv, await readGray(path.join(CIRCLES, 'skew_big.jpg'))));
  console.log(`  ${'skew_small_transformed > skew_big (info)'.padEnd(46)} ${describe(skew)}`);
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
