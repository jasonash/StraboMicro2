/**
 * Image stitcher engine (src/services/stitch), run with the app's own public/opencv.js.
 *
 *   npm run test:stitch [-- --only <text>]
 *
 * 1. Layout math (no images).
 * 2. Tiles cut from a made-up thin section at known positions (tests/stitchFixtures.mts):
 *    a regular grid, a hand-held style set (turned, shifted, slightly different sizes),
 *    a small overlap (the harder pass), two rocks in one list, a gap, burned-in scale
 *    bars, a tile at another magnification, snapping tiles dropped by hand, cancel and skip.
 * 3. A real micrograph cut the same way, if ~/Desktop/GrainSpotDemoImages (or STITCH_DEMO_DIR)
 *    is there; skipped with a note otherwise.
 *
 * Pass marks come from the prototype runs of 2026-11-12 (docs/image-stitcher-design.md).
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import sharp from 'sharp';
import { apply, fitSimilarity, invert, memorySource, multiply, type GrayImage, type OpenCV } from '../src/services/autoPlace/placementMatch.ts';
import type { AffineMatrix } from '../src/utils/affineTransform.ts';
import {
  coveredRectangle, fitGroupToTarget, groupOfTile, groupsOf, groupToMosaic, hasEmptyAreas, joinGroups, mosaicFrame, mosaicPixelsPerUnit, otherMagnifications, placeGroup,
  rateSeams, separateTile, sizeAndTurn, solveLayout, solveLinear, thinPairs, POINTS_KEPT,
  type Overlap, type StitchLayout, type StitchTile,
} from '../src/services/stitch/stitchLayout.ts';
import {
  change, deltaInGroup, dropPlacement, leaveOut, mainGroup, moveInMosaic, otherGroups, pieceOf, placeOnMosaic, putBack, redo, resetTile,
  separateGroup, snapSides, startEdit, startHistory, tileStatuses, undo, type EditHistory, type StitchEdit,
} from '../src/services/stitch/stitchEdit.ts';
import { hasGraphics, matchPair, snapGroup, tileFeatures, type TileFeatures } from '../src/services/stitch/stitchMatch.ts';
import { hardPairs, quickPairs, stitchTiles, unplacedTiles, type StitchProgress } from '../src/services/stitch/stitch.ts';
import { mosaicName } from '../src/utils/mosaicName.ts';
import { durationText, estimateText, groupText, overlapsText, placedText, progressLines, sizeText, skippedText, tooManyText } from '../src/utils/stitchText.ts';
import { accuracy, cutTile, cutTiles, makeScene, randomOf, truthOf, type Accuracy, type CutTile } from './stitchFixtures.mts';

const root = path.resolve(import.meta.dirname, '..');
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const wanted = (name: string) => !only || name.includes(only);

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

const turn = (deg: number, s: number, tx: number, ty: number): AffineMatrix => {
  const r = (deg * Math.PI) / 180;
  return [s * Math.cos(r), -s * Math.sin(r), tx, s * Math.sin(r), s * Math.cos(r), ty];
};
const far = (m1: AffineMatrix, m2: AffineMatrix, w: number, h: number) =>
  Math.max(...[[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => {
    const p = apply(m1, x, y);
    const q = apply(m2, x, y);
    return Math.hypot(p[0] - q[0], p[1] - q[1]);
  }));

// ---------------------------------------------------------------- 1. layout math

if (wanted('math')) {
  console.log('1. layout math');
  {
    const src = Array.from({ length: 1000 }, (_, i) => i);
    const t = thinPairs(src, src.map((v) => v + 1));
    check('thinPairs keeps POINTS_KEPT pairs', t.src.length === POINTS_KEPT * 2 && t.dst.length === POINTS_KEPT * 2, t.src.length);
    check('thinPairs keeps pairs together', t.src.every((v, i) => t.dst[i] === v + 1));
    check('thinPairs spreads over the list', t.src[0] === 0 && t.src[t.src.length - 2] >= 990, [t.src[0], t.src[t.src.length - 2]]);
    const few = thinPairs([1, 2, 3, 4], [5, 6, 7, 8]);
    check('thinPairs leaves a short list alone', few.src.length === 4);
  }
  {
    const x = solveLinear(new Float64Array([2, 1, 1, 3]), new Float64Array([5, 10]), 2);
    check('solveLinear', !!x && Math.abs(x[0] - 1) < 1e-12 && Math.abs(x[1] - 3) < 1e-12, x && [...x]);
    check('solveLinear needs a pivot swap', (() => {
      const y = solveLinear(new Float64Array([0, 1, 1, 0]), new Float64Array([2, 3]), 2);
      return !!y && y[0] === 3 && y[1] === 2;
    })());
    check('solveLinear: no single answer is null', solveLinear(new Float64Array([1, 2, 2, 4]), new Float64Array([1, 2]), 2) === null);
  }

  // A 3 x 3 grid of 1000 x 800 tiles with known placements (turned, resized), and the matched
  // points real overlaps would give, with a little noise
  const rand = randomOf(11);
  const W = 1000;
  const H = 800;
  const tiles: StitchTile[] = [];
  const truth: AffineMatrix[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      tiles.push({ id: `t${r}${c}`, width: W, height: H });
      truth.push(turn((rand() - 0.5) * 10, 1 + (rand() - 0.5) * 0.06, c * 850 + rand() * 20, r * 680 + rand() * 20));
    }
  }
  const overlapOf = (a: number, b: number, n: number, noise: number): Overlap | null => {
    // Points of tile a that also lie in tile b
    const src: number[] = [];
    const dst: number[] = [];
    const toB = multiply(invert(truth[b]), truth[a]);
    for (let k = 0; k < 4000 && src.length < n * 2; k++) {
      const x = rand() * W;
      const y = rand() * H;
      const [u, v] = apply(toB, x, y);
      if (u < 0 || v < 0 || u > W || v > H) continue;
      src.push(x, y);
      dst.push(u + (rand() - 0.5) * 2 * noise, v + (rand() - 0.5) * 2 * noise);
    }
    if (src.length < 8) return null;
    return { a, b, inliers: src.length / 2, src, dst, matrix: fitSimilarity(src, dst), rms: noise };
  };
  const overlaps: Overlap[] = [];
  for (const [a, b] of quickPairs(9)) {
    const o = overlapOf(a, b, 80, 0.5);
    if (o) overlaps.push(o);
  }
  check('fixture: the grid has side and corner overlaps', overlaps.length >= 12, overlaps.length);

  const layout = solveLayout(tiles, overlaps);
  check('one group of nine', layout.groups.length === 1 && layout.groups[0].tiles.length === 9, layout.groups.map((g) => g.tiles.length));
  check('nothing dropped', layout.dropped.length === 0);
  {
    // Placements are relative to the anchor: compare after moving the truth into the anchor's frame
    const g = layout.groups[0];
    const anchor = g.tiles[0];
    const worst = Math.max(...g.tiles.map((t) => far(g.placements[t], multiply(invert(truth[anchor]), truth[t]), W, H)));
    check('placements match the truth within half a pixel', worst < 0.5, worst);
    check('the anchor is the identity', far(g.placements[anchor], [1, 0, 0, 0, 1, 0], W, H) === 0);
  }
  {
    // Chained pair matrices drift; the joint solve must not be worse than chaining across the grid
    const g = placeGroup([0, 1, 2, 3, 4, 5, 6, 7, 8], overlaps);
    const anchor = g.tiles[0];
    const worst = Math.max(...g.tiles.map((t) => far(g.placements[t], multiply(invert(truth[anchor]), truth[t]), W, H)));
    check('placeGroup alone gives the same', worst < 0.5, worst);
  }
  {
    // A false overlap between two tiles that do not touch (opposite corners)
    const wrong: Overlap = { a: 0, b: 8, inliers: 16, src: [100, 100, 300, 200, 500, 600, 700, 300], dst: [120, 90, 320, 190, 520, 590, 720, 290], matrix: [1, 0, 20, 0, 1, -10], rms: 0 };
    const withWrong = solveLayout(tiles, [...overlaps, wrong]);
    check('a false overlap is dropped', withWrong.dropped.length === 1 && withWrong.dropped[0] === wrong, withWrong.dropped.length);
    const g = withWrong.groups[0];
    const worst = Math.max(...g.tiles.map((t) => far(g.placements[t], multiply(invert(truth[g.tiles[0]]), truth[t]), W, H)));
    check('and the layout is right without it', withWrong.groups.length === 1 && worst < 0.5, worst);
    // Without the check it would have bent the layout
    const bent = solveLayout(tiles, [...overlaps, wrong], { disagreementShare: 100 });
    const bentBy = Math.max(...bent.groups[0].tiles.map((t) => far(bent.groups[0].placements[t], multiply(invert(truth[bent.groups[0].tiles[0]]), truth[t]), W, H)));
    check('fixture: the false overlap would have bent the layout', bent.dropped.length === 0 && bentBy > 2, bentBy);
  }
  {
    // Middle column missing: two groups of three, and a lone tile
    const sides = overlaps.filter((o) => ![o.a, o.b].some((t) => t % 3 === 1));
    const leftRight = sides.filter((o) => o.a % 3 === o.b % 3);
    const two = solveLayout(tiles.slice(0, 9), leftRight.filter((o) => o.a !== 8 && o.b !== 8));
    const sizes = two.groups.map((g) => g.tiles.length);
    check('groups: sizes, largest first', JSON.stringify(sizes) === JSON.stringify([3, 2, 1, 1, 1, 1]), sizes);
    check('groupsOf agrees', JSON.stringify(groupsOf(4, [{ a: 2, b: 3 } as Overlap]).map((g) => g.length)) === '[2,1,1]');
    check('groupOfTile', groupOfTile(two, 8).tiles.length === 1);
    check('unplacedTiles: all but the largest group', unplacedTiles(two).length === 6);
    check('hardPairs: only pairs in different groups', hardPairs(two).length === 36 - 3 - 1, hardPairs(two).length);
    check('hardPairs: none when all are placed', hardPairs(layout).length === 0);

    // Join the group of two (tiles 2, 5) onto the group of three (0, 3, 6) by hand, then by fit
    const [big, small] = two.groups;
    const exact = multiply(invert(truth[big.tiles[0]]), truth[small.tiles[0]]);
    const joined = joinGroups(two, small, big, exact);
    check('joinGroups: one group of five', joined.groups[0].tiles.length === 5 && joined.groups.length === 5, joined.groups.map((g) => g.tiles.length));
    const jw = Math.max(...joined.groups[0].tiles.map((t) => far(joined.groups[0].placements[t], multiply(invert(truth[big.tiles[0]]), truth[t]), W, H)));
    check('joinGroups: every tile in the target frame', jw < 0.5, jw);
    check('joinGroups leaves the old layout alone', two.groups[0].tiles.length === 3);
    const back = separateTile(joined, small.tiles[1]);
    check('separateTile: the tile stands alone, identity', back.groups.some((g) => g.tiles.length === 1 && g.tiles[0] === small.tiles[1] && far(g.placements[small.tiles[1]], [1, 0, 0, 0, 1, 0], W, H) === 0));
    check('separateTile: its overlaps are gone', back.overlaps.every((o) => o.a !== small.tiles[1] && o.b !== small.tiles[1]));
    const mid = separateTile(solveLayout(tiles, overlaps.filter((o) => Math.abs(o.a - o.b) === 3 && o.a % 3 === 0)), 3);
    check('separateTile: what is left falls apart where the tile held it', JSON.stringify(mid.groups.map((g) => g.tiles.length)) === JSON.stringify([1, 1, 1, 1, 1, 1, 1, 1, 1]), mid.groups.map((g) => g.tiles.length));

    // A fit from points between a moved and a target tile, given in either order
    const bridge = overlapOf(0, 2, 60, 0.3) ?? overlapOf(0, 1, 60, 0.3)!;
    const movedTile = bridge.b;
    const lone = { tiles: [movedTile], placements: { [movedTile]: [1, 0, 0, 0, 1, 0] as AffineMatrix } };
    const target = { tiles: [0], placements: { 0: [1, 0, 0, 0, 1, 0] as AffineMatrix } };
    const fitted = fitGroupToTarget([bridge], lone, target)!;
    check('fitGroupToTarget (moved tile is b)', far(fitted, multiply(invert(truth[0]), truth[movedTile]), W, H) < 0.5, fitted);
    const loneA = { tiles: [0], placements: { 0: [1, 0, 0, 0, 1, 0] as AffineMatrix } };
    const targetB = { tiles: [movedTile], placements: { [movedTile]: [1, 0, 0, 0, 1, 0] as AffineMatrix } };
    const fittedA = fitGroupToTarget([bridge], loneA, targetB)!;
    check('fitGroupToTarget (moved tile is a)', far(fittedA, multiply(invert(truth[movedTile]), truth[0]), W, H) < 0.5, fittedA);
    check('fitGroupToTarget: nothing to fit is null', fitGroupToTarget([], lone, target) === null);
  }
  {
    // The first side overlap made weak; corner overlaps of the fixture have few points anyway
    const weak = overlaps.map((o, k) => (k === 0 ? { ...o, inliers: 20 } : o));
    const rated = rateSeams({ ...layout, overlaps: weak });
    check('fixture: the first overlap is a full side overlap', overlaps[0].inliers === 80, overlaps[0].inliers);
    check('rateSeams: fewer than 30 matched points is weak, 30 or more is good', rated.overlaps[0] === 'weak' && rated.overlaps.every((s, k) => (s === 'weak') === (weak[k].inliers < 30)), rated.overlaps);
    check('rateSeams: a tile with other good overlaps is good', rated.tiles.every((s) => s === 'good'));
    const chain: Overlap[] = [{ ...overlaps[0], a: 0, b: 1, inliers: 45 }, { ...overlaps[0], a: 1, b: 2, inliers: 200 }];
    const r2 = rateSeams({ tiles: tiles.slice(0, 4), overlaps: chain, groups: [], dropped: [] });
    check('rateSeams: one neighbor with a modest match is weak', r2.tiles[0] === 'weak' && r2.tiles[1] === 'good' && r2.tiles[2] === 'good', r2.tiles);
    check('rateSeams: a tile with no overlap is not rated', r2.tiles[3] === 'good');
  }
  {
    const st = sizeAndTurn(turn(30, 0.4, 5, 6));
    check('sizeAndTurn', Math.abs(st.scale - 0.4) < 1e-12 && Math.abs(st.degrees - 30) < 1e-9, st);
    const g = { tiles: [0, 1, 2, 3], placements: { 0: turn(0, 1, 0, 0), 1: turn(0, 1.02, 900, 0), 2: turn(0, 0.5, 400, 300), 3: turn(0, 0.99, 0, 700) } };
    const odd = otherMagnifications(g);
    check('otherMagnifications: the tile placed at half size is 2x', odd.length === 1 && odd[0].tile === 2 && Math.abs(odd[0].factor - 2) < 0.05, odd);
  }
  {
    // Two 1000 x 800 tiles side by side, 850 apart: 1850 x 800 at full size
    const two: StitchLayout = {
      tiles: tiles.slice(0, 2),
      overlaps: [],
      groups: [{ tiles: [0, 1], placements: { 0: turn(0, 1, 0, 0), 1: turn(0, 1, 850, 0) } }],
      dropped: [],
    };
    const whole = mosaicFrame(two, two.groups[0], 10000)!;
    check('mosaicFrame: full size', whole.fullWidth === 1850 && whole.fullHeight === 800 && whole.scale === 1 && whole.width === 1850, whole);
    const capped = mosaicFrame(two, two.groups[0], 925)!;
    check('mosaicFrame: saved size is capped on the long side', capped.width === 925 && capped.height === 400 && capped.scale === 0.5, capped);
    const [x, y] = apply(capped.toMosaic[1], 1000, 800);
    check('mosaicFrame: toMosaic puts the far corner on the edge', Math.abs(x - 925) < 1e-9 && Math.abs(y - 400) < 1e-9, [x, y]);
    const one = mosaicFrame(two, two.groups[0], 10000, new Set([0]))!;
    check('mosaicFrame: a tile left out does not count', one.fullWidth === 1000 && Math.abs(apply(one.toMosaic[1], 0, 0)[0]) < 1e-9 && one.toMosaic[0] === undefined, one);
    check('mosaicFrame: nothing included is null', mosaicFrame(two, two.groups[0], 10000, new Set([0, 1])) === null);
    // The anchor is twice as magnified as the other two: the mosaic takes the usual pixel size
    const oddAnchor: StitchLayout = {
      tiles: [...tiles.slice(0, 3)],
      overlaps: [],
      groups: [{ tiles: [0, 1, 2], placements: { 0: turn(0, 1, 0, 0), 1: turn(0, 2, 1000, 0), 2: turn(0, 2, 3000, 0) } }],
      dropped: [],
    };
    const f = mosaicFrame(oddAnchor, oddAnchor.groups[0], 10000)!;
    check('mosaicFrame: pixel size of the median tile, not the anchor', f.fullWidth === 2500 && Math.abs(sizeAndTurn(f.toMosaic[1]).scale - 1) < 1e-9, f.fullWidth);
    check('mosaicPixelsPerUnit follows the saved share', mosaicPixelsPerUnit(1250, capped) === 625);
    // The same two tiles in the frame of an anchor that was itself turned 10 degrees: the mosaic is level all the same
    const tilted: StitchLayout = {
      ...two,
      groups: [{ tiles: [0, 1], placements: { 0: multiply(turn(10, 1, 300, -50), turn(0, 1, 0, 0)), 1: multiply(turn(10, 1, 300, -50), turn(0, 1, 850, 0)) } }],
    };
    const level = mosaicFrame(tilted, tilted.groups[0], 10000)!;
    check('mosaicFrame: level whatever the anchor\'s turn', level.fullWidth === 1850 && level.fullHeight === 800 && Math.abs(sizeAndTurn(level.toMosaic[0]).degrees) < 1e-9 && far(level.toMosaic[1], whole.toMosaic[1], 1000, 800) < 1e-6, [level.fullWidth, level.fullHeight]);
    // Tiles turned by different amounts: upright on average
    const mixed: StitchLayout = { ...two, groups: [{ tiles: [0, 1], placements: { 0: turn(-4, 1, 0, 0), 1: turn(12, 1, 850, 0) } }] };
    const m = mosaicFrame(mixed, mixed.groups[0], 10000)!;
    check('mosaicFrame: tiles upright on average', Math.abs(sizeAndTurn(m.toMosaic[0]).degrees + 8) < 1e-9 && Math.abs(sizeAndTurn(m.toMosaic[1]).degrees - 8) < 1e-9, [sizeAndTurn(m.toMosaic[0]).degrees, sizeAndTurn(m.toMosaic[1]).degrees]);
  }
}

if (wanted('math')) {
  // The fully covered rectangle: an L of three 1000 x 800 tiles (top left, top right, bottom left)
  const three: StitchLayout = {
    tiles: [0, 1, 2].map((k) => ({ id: `c${k}`, width: 1000, height: 800 })),
    overlaps: [],
    groups: [{ tiles: [0, 1, 2], placements: { 0: turn(0, 1, 0, 0), 1: turn(0, 1, 900, 30), 2: turn(0, 1, 20, 700) } }],
    dropped: [],
  };
  const frame = mosaicFrame(three, three.groups[0], 10000)!;
  check('fixture: the L is 1900 x 1500', frame.width === 1900 && frame.height === 1500, [frame.width, frame.height]);
  check('hasEmptyAreas: the L has an empty corner', hasEmptyAreas(three, frame));
  const rect = coveredRectangle(three, frame)!;
  // The top bar (y 30..800, all 1900 wide) is 1.46 million px; tiles 1 and 2 let it reach a little lower on a narrower strip
  check('coveredRectangle: about the top bar of the L', !!rect && rect.width > 1800 && rect.width * rect.height > 1_400_000 && rect.width * rect.height < 1_500_000 && rect.top >= 30 && rect.top + rect.height <= 830, rect);
  const inside = (x: number, y: number) => [0, 1, 2].some((t) => {
    const [u, v] = apply(invert(frame.toMosaic[t]), x, y);
    return u >= 0 && v >= 0 && u <= 1000 && v <= 800;
  });
  let allCovered = true;
  for (let k = 0; k <= 200; k++) {
    const f = k / 200;
    for (const [x, y] of [[rect.left + f * rect.width, rect.top], [rect.left + f * rect.width, rect.top + rect.height], [rect.left, rect.top + f * rect.height], [rect.left + rect.width, rect.top + f * rect.height]]) {
      if (!inside(x, y)) allCovered = false;
    }
  }
  check('coveredRectangle: every point of its border is on a tile', allCovered);
  // A turned tile alone: covered rectangle well inside, and the frame has empty corners
  const one: StitchLayout = { tiles: [three.tiles[0]], overlaps: [], groups: [{ tiles: [0], placements: { 0: turn(20, 1, 0, 0) } }], dropped: [] };
  const f1 = mosaicFrame(one, one.groups[0], 10000)!;
  const r1 = coveredRectangle(one, f1)!;
  check('coveredRectangle: inside a turned tile', !!r1 && r1.width * r1.height > 0.4 * 800000 && r1.width * r1.height < 800000, r1);
  const flat: StitchLayout = { tiles: [three.tiles[0]], overlaps: [], groups: [{ tiles: [0], placements: { 0: turn(0, 1, 0, 0) } }], dropped: [] };
  const f0 = mosaicFrame(flat, flat.groups[0], 10000)!;
  check('hasEmptyAreas: an upright tile alone has none', !hasEmptyAreas(flat, f0));
  check('saved at half size the rectangle is in saved pixels', (() => {
    const half = mosaicFrame(three, three.groups[0], 950)!;
    const r = coveredRectangle(three, half)!;
    return !!r && Math.abs(r.width - rect.width / 2) < 12 && Math.abs(r.top - rect.top / 2) < 8;
  })());

  check('mosaicName: the shared start without the counter', mosaicName(['/x/y/TS-12_001.tif', '/x/y/TS-12_002.tif', '/x/y/TS-12_010.tif']) === 'TS-12 mosaic', mosaicName(['/x/y/TS-12_001.tif', '/x/y/TS-12_002.tif', '/x/y/TS-12_010.tif']));
  check('mosaicName: Windows paths', mosaicName(['C:\\scans\\Quartzite A (1).jpg', 'C:\\scans\\Quartzite A (2).jpg']) === 'Quartzite A mosaic', mosaicName(['C:\\scans\\Quartzite A (1).jpg', 'C:\\scans\\Quartzite A (2).jpg']));
  check('mosaicName: nothing shared, the folder', mosaicName(['/data/Sample 7/a.tif', '/data/Sample 7/b.tif']) === 'Sample 7 mosaic', mosaicName(['/data/Sample 7/a.tif', '/data/Sample 7/b.tif']));
  check('mosaicName: only a counter shared, the folder', mosaicName(['/data/run3/0001.tif', '/data/run3/0002.tif']) === 'run3 mosaic', mosaicName(['/data/run3/0001.tif', '/data/run3/0002.tif']));
  check('mosaicName: one image keeps its whole name', mosaicName(['/data/run3/TS-12_001.tif']) === 'TS-12_001 mosaic', mosaicName(['/data/run3/TS-12_001.tif']));
  check('mosaicName: nothing at all', mosaicName([]) === 'Mosaic' && mosaicName(['a.tif', 'b.tif']) === 'Mosaic');

  check('placedText', placedText(12, 12) === 'All 12 images placed automatically' && placedText(10, 12) === '10 of 12 images placed automatically' && placedText(2, 2) === 'Both images placed automatically' && placedText(1, 5) === 'The images could not be fitted together automatically', [placedText(12, 12), placedText(10, 12), placedText(1, 5)]);
  check('sizeText: saved smaller', sizeText({ fullWidth: 18400, fullHeight: 14200, width: 10000, height: 7717, scale: 0.5435 }) === 'Full size would be 18,400 x 14,200 px. It will be saved at 10,000 x 7,717 px (54%).', sizeText({ fullWidth: 18400, fullHeight: 14200, width: 10000, height: 7717, scale: 0.5435 }));
  check('sizeText: full size', sizeText({ fullWidth: 5400, fullHeight: 4050, width: 5400, height: 4050, scale: 1 }) === 'The mosaic will be 5,400 x 4,050 px.');
  check('durationText', durationText(20) === 'less than a minute' && durationText(70) === 'about a minute' && durationText(200) === 'about 4 minutes', [durationText(20), durationText(70), durationText(200)]);
  check('estimateText', estimateText(120, 200) === '120 images: this may take about 4 minutes.');
  check('tooManyText', tooManyText(240, 200) === '240 images are more than can be stitched in one go (200 at most). Stitch them in parts.');
  check('skippedText', skippedText(1) === '1 image cannot be used and will be skipped.' && skippedText(2) === '2 images cannot be used and will be skipped.');
  check('overlapsText, groupText', overlapsText(9) === '9 overlaps found so far' && overlapsText(1) === '1 overlap found so far' && groupText(4) === 'Group of 4 that fit each other' && groupText(1) === 'Fits no other image');
  const lines = progressLines({ stage: 'pairs', done: 312, total: 1128 });
  check('progressLines: comparing', JSON.stringify(lines.map((l) => [l.label, l.count, l.state])) === JSON.stringify([['Reading images', '', 'done'], ['Comparing images', '312 of 1,128', 'now'], ['Working out the layout', '', 'waiting']]) && Math.round(lines[1].percent!) === 28, lines);
  const hardLines = progressLines({ stage: 'hard-pairs', done: 2, total: 20, unplaced: 3 });
  check('progressLines: the harder pass adds its line', JSON.stringify(hardLines.map((l) => [l.label, l.state])) === JSON.stringify([['Reading images', 'done'], ['Comparing images', 'done'], ['Looking harder at 3 images', 'now'], ['Working out the layout', 'waiting']]), hardLines);
  const layoutLines = progressLines({ stage: 'layout', done: 0, total: 1 });
  check('progressLines: the layout has no count', layoutLines[2].state === 'now' && layoutLines[2].count === '' && layoutLines[2].percent === null && layoutLines.length === 3, layoutLines);
  check('progressLines: reading', progressLines({ stage: 'reading', done: 3, total: 48 })[0].count === '3 of 48' && progressLines({ stage: 'features', done: 40, total: 48 })[0].state === 'now');
}

// ---------------------------------------------------------------- 1b. changes by hand (stitchEdit.ts)

if (wanted('math') || wanted('edit')) {
  console.log('1b. changes by hand on the review screen');
  // A row of five 1000 x 800 tiles. The automatic pass placed 0, 1, 2 (the mosaic) and found
  // that 3 and 4 fit each other but nothing else.
  const W = 1000;
  const H = 800;
  const tiles: StitchTile[] = [0, 1, 2, 3, 4].map((k) => ({ id: `e${k}`, width: W, height: H }));
  const truth: AffineMatrix[] = tiles.map((_, k) => turn(0, 1, k * 850, 0));
  const overlapOf = (a: number, b: number, inliers = 80): Overlap => {
    const src: number[] = [];
    const dst: number[] = [];
    const toB = multiply(invert(truth[b]), truth[a]);
    for (let k = 0; k < 12; k++) {
      const x = 860 + (k % 4) * 40;
      const y = 100 + Math.floor(k / 4) * 250;
      src.push(x, y);
      dst.push(...apply(toB, x, y));
    }
    return { a, b, inliers, src, dst, matrix: fitSimilarity(src, dst), rms: 0 };
  };
  const automatic = solveLayout(tiles, [overlapOf(0, 1), overlapOf(1, 2), overlapOf(3, 4)]);
  check('fixture: a mosaic of three and a group of two', automatic.groups.map((g) => g.tiles.length).join() === '3,2', automatic.groups.map((g) => g.tiles));
  const start = startEdit(automatic);
  const frame0 = mosaicFrame(automatic, mainGroup(start), 10000)!;
  const placedAt = (e: StitchEdit, t: number) => mainGroup(e).placements[t];
  const same = (m1: AffineMatrix | undefined, m2: AffineMatrix | undefined) => !!m1 && !!m2 && far(m1, m2, W, H) < 1e-6;

  check('statuses: all good at the start', Object.values(tileStatuses(start)).every((x) => x === 'good') && Object.keys(tileStatuses(start)).length === 3);
  check('pieceOf: a tile alone', pieceOf(start, 1).join() === '1');

  // A move on screen becomes a move in the group's frame (here the mosaic is half size)
  const half = mosaicFrame(automatic, mainGroup(start), 1350)!;
  const d = deltaInGroup(start, half, [1, 0, 50, 0, 1, -20])!;
  check('deltaInGroup: 50 px on a half-size mosaic is 100 px of the tiles', Math.abs(d[2] - 50 / half.scale) < 1e-6 && Math.abs(d[5] + 20 / half.scale) < 1e-6 && Math.abs(d[0] - 1) < 1e-9, d);

  // Tile 2 dragged away with no fit: by hand, its overlap gone, the others untouched
  const delta: AffineMatrix = [1, 0, 300, 0, 1, 120];
  const dragged = moveInMosaic(start, [2], delta, null);
  check('by hand: the tile moved by the delta', same(placedAt(dragged, 2), multiply(delta, placedAt(start, 2))));
  check('by hand: the other tiles stay', same(placedAt(dragged, 0), placedAt(start, 0)) && same(placedAt(dragged, 1), placedAt(start, 1)));
  check('by hand: marked, and its overlap with the tile that stayed is gone', dragged.byHand.has(2) && dragged.changed.has(2) && !dragged.layout.overlaps.some((o) => o.a === 2 || o.b === 2));
  check('by hand: status hand', tileStatuses(dragged)[2] === 'hand' && tileStatuses(dragged)[1] === 'good');
  check('by hand: the start is not changed', !start.byHand.has(2) && start.layout.overlaps.length === 3 && same(placedAt(start, 2), automatic.groups[0].placements[2]));
  check('by hand: the mosaic grows', mosaicFrame(dragged.layout, mainGroup(dragged), 10000)!.fullWidth > frame0.fullWidth + 250);

  // The same drag, but a snap found the exact fit: not by hand, new overlap kept
  const snapOverlap = { ...overlapOf(1, 2, 45), hard: true };
  const snappedEdit = moveInMosaic(dragged, [2], invert(delta), [snapOverlap]);
  check('snapped: back in place, not by hand, still changed', same(placedAt(snappedEdit, 2), placedAt(start, 2)) && !snappedEdit.byHand.has(2) && snappedEdit.changed.has(2));
  check('snapped: the overlap the snap found is in the layout', snappedEdit.layout.overlaps.includes(snapOverlap));
  check('snapped: a single neighbor with 45 points is weak', tileStatuses(snappedEdit)[2] === 'weak');

  // Snap sides: the moved tiles against the rest, without tiles left out
  const sides = snapSides(leaveOut(start, 0), [2])!;
  check('snapSides: moved 2, target 1 only (0 is left out)', sides.moved.tiles.join() === '2' && sides.target.tiles.join() === '1');
  check('snapSides: nothing to snap to', snapSides(leaveOut(leaveOut(start, 0), 1), [2]) === null);

  // Leave out and put back
  const out = leaveOut(start, 1);
  check('leave out / put back', out.leftOut.has(1) && !putBack(out, 1).leftOut.has(1) && leaveOut(out, 1) === out && putBack(start, 1) === start);
  check('a tile that is not in the mosaic cannot be left out', leaveOut(start, 3) === start);

  // The group of two dropped on the mosaic by hand: one piece, upright, its middle on the point
  const group = otherGroups(start)[0];
  const point = { x: frame0.width + 400, y: frame0.height / 2 };
  const rough = dropPlacement(start, frame0, group, point)!;
  const placed = placeOnMosaic(start, group, rough, null);
  check('placed by hand: five tiles in the mosaic, no other group', mainGroup(placed).tiles.length === 5 && otherGroups(placed).length === 0);
  check('placed by hand: the mosaic keeps its anchor and its placements', mainGroup(placed).tiles[0] === mainGroup(start).tiles[0] && [0, 1, 2].every((t) => same(placedAt(placed, t), placedAt(start, t))));
  check('placed by hand: one piece, both by hand', pieceOf(placed, 3).join() === '3,4' && pieceOf(placed, 4).join() === '3,4' && placed.byHand.has(3) && placed.byHand.has(4));
  {
    const f = mosaicFrame(placed.layout, mainGroup(placed), 100000)!;
    const g0 = groupToMosaic(mainGroup(start), frame0)!;
    // Middle of the two tiles, in the first frame's pixels
    const corners = [3, 4].flatMap((t) => [[0, 0], [W, H]].map(([x, y]) => apply(multiply(g0, placedAt(placed, t)), x, y)));
    const mx = (Math.min(...corners.map((c) => c[0])) + Math.max(...corners.map((c) => c[0]))) / 2;
    const my = (Math.min(...corners.map((c) => c[1])) + Math.max(...corners.map((c) => c[1]))) / 2;
    check('placed by hand: its middle is on the drop point', Math.abs(mx - point.x) < 1e-6 && Math.abs(my - point.y) < 1e-6, [mx, my, point]);
    check('placed by hand: same size as the other tiles, upright', Math.abs(sizeAndTurn(placedAt(placed, 3)).scale - 1) < 1e-9 && Math.abs(sizeAndTurn(f.toMosaic[3]).degrees) < 1e-6);
    check('placed by hand: the pair keeps its own fit', same(multiply(invert(placedAt(placed, 3)), placedAt(placed, 4)), multiply(invert(truth[3]), truth[4])));
  }
  // The piece moves as one; a snap of one of its tiles ends the piece
  const pieceMoved = moveInMosaic(placed, pieceOf(placed, 4), delta, null);
  check('piece: both tiles moved, their overlap kept', same(placedAt(pieceMoved, 3), multiply(delta, placedAt(placed, 3))) && same(placedAt(pieceMoved, 4), multiply(delta, placedAt(placed, 4)))
    && pieceMoved.layout.overlaps.some((o) => o.a === 3 && o.b === 4));
  const pieceSnapped = moveInMosaic(placed, [3, 4], delta, [{ ...overlapOf(2, 3), hard: true }]);
  check('piece: snapped, no longer a piece or by hand', pieceOf(pieceSnapped, 3).join() === '3' && !pieceSnapped.byHand.has(3) && !pieceSnapped.byHand.has(4));
  // Dropped with a fit found
  const fitted = placeOnMosaic(start, group, rough, [{ ...overlapOf(2, 3), hard: true }]);
  check('placed with a fit: no piece, not by hand, changed', pieceOf(fitted, 3).join() === '3' && !fitted.byHand.has(3) && fitted.changed.has(3) && fitted.changed.has(4));
  check('placing the mosaic on itself changes nothing', placeOnMosaic(start, mainGroup(start), rough, null) === start);

  // Separate: the group of two becomes two single images
  const apart = separateGroup(start, group);
  check('separate: two single images, their overlap gone', otherGroups(apart).map((g) => g.tiles.join()).join('|') === '3|4' && !apart.layout.overlaps.some((o) => o.a === 3));
  check('separate: the mosaic cannot be separated', separateGroup(start, mainGroup(start)) === start);

  // Reset one tile: an automatic tile goes back with its overlap; a tile placed by hand leaves the mosaic
  const back = resetTile(dragged, automatic, 2);
  check('reset: back in its automatic place with its overlap', same(placedAt(back, 2), automatic.groups[0].placements[2]) && !back.byHand.has(2) && !back.changed.has(2)
    && back.layout.overlaps.some((o) => o.a === 1 && o.b === 2));
  check('reset: a tile nobody moved stays as it is', resetTile(dragged, automatic, 1) === dragged);
  const both = moveInMosaic(dragged, [1], delta, null);
  const oneBack = resetTile(both, automatic, 2);
  check('reset: no overlap comes back to a neighbor that is itself moved', !oneBack.layout.overlaps.some((o) => o.a === 2 || o.b === 2));
  const taken = resetTile(placed, automatic, 4);
  check('reset: a tile the automatic pass did not place leaves the mosaic alone', mainGroup(taken).tiles.join() === mainGroup(placed).tiles.filter((t) => t !== 4).join()
    && otherGroups(taken).map((g) => g.tiles.join()).join('|') === '4' && pieceOf(taken, 3).join() === '3' && !taken.byHand.has(4) && taken.byHand.has(3));
  check('reset: the mosaic stays first even when it is the smaller group', mainGroup(taken).tiles.includes(0));

  // Undo and redo; nudges of one tile are one step
  let h: EditHistory = startHistory(start);
  h = change(h, dragged);
  h = change(h, snappedEdit);
  check('history: two steps back, one forward', undo(undo(h)).now === start && redo(undo(h)).now === snappedEdit && undo(h).now === dragged);
  check('history: nothing to undo or redo', undo(startHistory(start)).now === start && redo(h) === h);
  check('history: a new change after undo drops the redo', change(undo(h), out).future.length === 0 && undo(change(undo(h), out)).now === dragged);
  check('history: the same edit is no step', change(h, snappedEdit) === h);
  let n: EditHistory = startHistory(start);
  for (let k = 1; k <= 5; k++) n = change(n, moveInMosaic(n.now, [2], [1, 0, 1, 0, 1, 0], null), 'nudge 2');
  check('history: five nudges of one tile are one step', n.past.length === 1 && undo(n).now === start && Math.abs(placedAt(n.now, 2)[2] - placedAt(start, 2)[2] - 5) < 1e-9);
  n = change(n, moveInMosaic(n.now, [1], [1, 0, 1, 0, 1, 0], null), 'nudge 1');
  check('history: a nudge of another tile is its own step', n.past.length === 2);
}

// ---------------------------------------------------------------- 2. tiles with a known truth

const inputsOf = (tiles: CutTile[]) => tiles.map((t) => ({ id: t.id, source: memorySource(cv, t.image) }));
const fmt = (a: Accuracy) => `neighbours ${a.median.toFixed(2)} / ${a.max.toFixed(2)} px, whole ${a.whole.toFixed(2)} px`;

const TW = 2000;
const TH = 1500;
let scene: GrayImage | null = null;
const sceneA = () => (scene ??= makeScene(7600, 5600, 1));

if (wanted('grid')) {
  console.log('2a. regular grid, 15% overlap');
  const tiles = cutTiles(sceneA(), { cols: 3, rows: 3, tileWidth: TW, tileHeight: TH, overlap: 0.15, jitter: 0.03, seed: 21 });
  const stages: StitchProgress[] = [];
  const started = Date.now();
  const { layout, ranHardPass, features } = await stitchTiles(cv, inputsOf(tiles), { onProgress: (p) => stages.push(p) });
  check('a layout', !!layout);
  if (layout) {
    check('all nine in one group', layout.groups.length === 1 && layout.groups[0].tiles.length === 9, layout.groups.map((g) => g.tiles.length));
    const acc = accuracy(layout, 0, tiles.map((t) => t.truth));
    console.log(`    ${fmt(acc)}; ${layout.overlaps.length} overlaps; ${((Date.now() - started) / 1000).toFixed(1)} s`);
    check('neighbours agree within a pixel (median)', acc.median < 1, acc);
    check('neighbours agree within 2.5 pixels (worst)', acc.max < 2.5, acc);
    check('whole mosaic within 3 pixels', acc.whole < 3, acc);
    check('the 12 side overlaps are all found', tiles.every((a, i) => tiles.every((b, j) => {
      const side = Math.abs((a.cell % 3) - (b.cell % 3)) + Math.abs(Math.floor(a.cell / 3) - Math.floor(b.cell / 3)) === 1;
      return !side || i >= j || layout.overlaps.some((o) => o.a === i && o.b === j);
    })));
    check('no harder pass needed', !ranHardPass && stages.every((s) => !s.stage.startsWith('hard')));
    check('progress: features, pairs, layout in order', stages[0].stage === 'features' && stages[stages.length - 1].stage === 'layout' && stages.some((s) => s.stage === 'pairs' && s.total === 36), stages.length);
    check('seams all good', rateSeams(layout).tiles.every((s) => s === 'good'), rateSeams(layout).tiles);
    check('no other magnification', otherMagnifications(layout.groups[0]).length === 0);
    check('no graphics seen', features.every((f) => !hasGraphics(f)));
    const frame = mosaicFrame(layout, layout.groups[0], 10000)!;
    check('mosaic about 5.4 x 4.1 thousand pixels', Math.abs(frame.fullWidth - 5400) < 200 && Math.abs(frame.fullHeight - 4050) < 200 && frame.scale === 1, frame);
  }
}

if (wanted('hand')) {
  console.log('2b. hand-held style: turned, shifted, sizes differ, 25% overlap');
  const tiles = cutTiles(sceneA(), { cols: 4, rows: 3, tileWidth: TW, tileHeight: TH, overlap: 0.25, jitter: 0.08, turn: 8, zoom: 0.03, gain: 0.08, seed: 33 });
  const { layout } = await stitchTiles(cv, inputsOf(tiles));
  if (layout) {
    check('all twelve in one group', layout.groups.length === 1, layout.groups.map((g) => g.tiles.length));
    const acc = accuracy(layout, 0, tiles.map((t) => t.truth));
    console.log(`    ${fmt(acc)}; ${layout.overlaps.length} overlaps`);
    check('neighbours agree within 1.5 pixels (median)', acc.median < 1.5, acc);
    check('neighbours agree within 3 pixels (worst)', acc.max < 3, acc);
    const turns = layout.groups[0].tiles.map((t) => sizeAndTurn(layout.groups[0].placements[t]).degrees);
    check('the turns were found', Math.max(...turns) - Math.min(...turns) > 5, turns);
    check('5% size differences are not another magnification', otherMagnifications(layout.groups[0]).length === 0);
  } else check('a layout', false);
}

let lowTiles: CutTile[] | null = null;
let lowQuick: StitchLayout | null = null;
let lowHardFeatures: TileFeatures[] = [];

if (wanted('low') || wanted('snap')) {
  console.log('2c. 7% overlap: the harder pass');
  lowTiles = cutTiles(sceneA(), { cols: 3, rows: 3, tileWidth: TW, tileHeight: TH, overlap: 0.07, jitter: 0.01, seed: 45 });
  const quick = await stitchTiles(cv, inputsOf(lowTiles), { hardPass: false });
  lowQuick = quick.layout;
  check('fixture: the quick pass alone leaves tiles unplaced', !!lowQuick && lowQuick.groups.length > 1, lowQuick?.groups.map((g) => g.tiles.length));
  console.log(`    quick pass: groups ${JSON.stringify(lowQuick?.groups.map((g) => g.tiles.length))}`);
  const stages: StitchProgress[] = [];
  const full = await stitchTiles(cv, inputsOf(lowTiles), { onProgress: (p) => stages.push(p) });
  lowHardFeatures = full.features;
  if (full.layout) {
    check('with the harder pass all nine are in one group', full.layout.groups.length === 1, full.layout.groups.map((g) => g.tiles.length));
    const acc = accuracy(full.layout, 0, lowTiles.map((t) => t.truth));
    console.log(`    ${fmt(acc)}; ${full.layout.overlaps.length} overlaps`);
    check('neighbours agree within 2.5 pixels (worst)', acc.max < 2.5, acc);
    check('ranHardPass', full.ranHardPass);
    check('new overlaps are marked hard', full.layout.overlaps.some((o) => o.hard) && full.layout.overlaps.some((o) => !o.hard) === (lowQuick?.overlaps.length !== 0));
    const hard = stages.filter((s) => s.stage === 'hard-pairs');
    check('progress: harder stages say how many tiles they look at', hard.length > 0 && hard[0].unplaced === unplacedTiles(lowQuick!).length && hard[0].total === hardPairs(lowQuick!).length, hard[0]);
    check('the features returned are the detailed ones', full.features.every((f) => f.level === 'hard'));
  } else check('a layout', false);

  // Skip during the harder pass: what the quick pass found
  let calls = 0;
  const skipped = await stitchTiles(cv, inputsOf(lowTiles), { skipHard: () => ++calls > 3 });
  check('skip: the quick layout, not cancelled', !!skipped.layout && !skipped.ranHardPass && JSON.stringify(skipped.layout.groups.map((g) => g.tiles.length)) === JSON.stringify(lowQuick?.groups.map((g) => g.tiles.length)));
  let n = 0;
  const cancelled = await stitchTiles(cv, inputsOf(lowTiles), { cancelled: () => ++n > 5 });
  check('cancel: no layout', cancelled.layout === null && n < 12, n);
}

if (wanted('snap') && lowTiles && lowQuick && lowQuick.groups.length > 1) {
  console.log('2d. snap: a group dropped roughly in place');
  const truth = lowTiles.map((t) => t.truth);
  const [target, moved] = lowQuick.groups;
  // Where the moved group truly belongs in the target's frame, through one tile of each
  const exact = multiply(multiply(target.placements[target.tiles[0]], invert(truth[target.tiles[0]])), multiply(truth[moved.tiles[0]], invert(moved.placements[moved.tiles[0]])));
  // Do the two groups touch at all? (true footprints of any pair overlap)
  const box = (t: number) => {
    const c = [[0, 0], [TW, 0], [TW, TH], [0, TH]].map(([x, y]) => apply(truth[t], x, y));
    return { x0: Math.min(...c.map((p) => p[0])), x1: Math.max(...c.map((p) => p[0])), y0: Math.min(...c.map((p) => p[1])), y1: Math.max(...c.map((p) => p[1])) };
  };
  const touch = moved.tiles.some((m) => target.tiles.some((t) => {
    const a = box(m);
    const b = box(t);
    const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    return w > 40 && h > 40 && Math.max(w, h) > 400;
  }));
  check('fixture: the two largest groups share a side', touch);
  // Dropped 5% of a tile off and 2 degrees turned
  const nudge = turn(2, 1, 0.05 * TW, -0.04 * TH);
  const mc = apply(exact, ...apply(moved.placements[moved.tiles[0]], TW / 2, TH / 2));
  const about: AffineMatrix = multiply([1, 0, mc[0], 0, 1, mc[1]], multiply(nudge, [1, 0, -mc[0], 0, 1, -mc[1]]));
  const rough = multiply(about, exact);
  check('fixture: the drop is visibly off', far(rough, exact, TW, TH) > 60, far(rough, exact, TW, TH));
  const snap = snapGroup(cv, lowQuick, moved, target, rough, lowHardFeatures);
  check('snap finds a fit', !!snap);
  if (snap) {
    const off = Math.max(...moved.tiles.map((t) => far(multiply(snap.groupToTarget, moved.placements[t]), multiply(exact, moved.placements[t]), TW, TH)));
    console.log(`    snapped to within ${off.toFixed(2)} px of the truth, ${snap.overlaps.length} overlap(s), ${snap.overlaps.map((o) => o.inliers).join(' ')} points`);
    check('snapped within 3 pixels of the truth', off < 3, off);
    check('snap overlaps are between the two groups and marked hard', snap.overlaps.every((o) => o.hard && (moved.tiles.includes(o.a) !== moved.tiles.includes(o.b))));
    const joined = joinGroups(lowQuick, moved, target, snap.groupToTarget, snap.overlaps);
    check('joined: one group fewer', joined.groups.length === lowQuick.groups.length - 1 && joined.groups[0].tiles.length === target.tiles.length + moved.tiles.length);
    const acc = accuracy(joined, 0, truth);
    check('joined group agrees within 3 pixels', acc.max < 3, acc);
  }
  // Dropped most of a tile away: nothing to snap to there
  const farOff = multiply([1, 0, 0.7 * TW, 0, 1, 0.7 * TH], exact);
  const wrongPlace = snapGroup(cv, lowQuick, moved, target, farOff, lowHardFeatures);
  check('a drop far from the true place is never pulled back across the canvas', wrongPlace === null, wrongPlace?.overlaps.length);
  // Features missing: nothing to work with
  check('no features, no snap', snapGroup(cv, lowQuick, moved, target, rough, []) === null);
}

if (wanted('rocks')) {
  console.log('2e. two rocks in one list, each with the same burned-in scale bar');
  const other = makeScene(4400, 3400, 2);
  const a = cutTiles(sceneA(), { cols: 2, rows: 2, tileWidth: TW, tileHeight: TH, overlap: 0.15, jitter: 0.02, seed: 51, bar: true, name: 'a' });
  const b = cutTiles(other, { cols: 2, rows: 2, tileWidth: TW, tileHeight: TH, overlap: 0.15, jitter: 0.02, seed: 52, bar: true, name: 'b' });
  const all = [a[0], b[0], a[1], b[1], a[2], b[2], a[3], b[3]];
  const { layout, features } = await stitchTiles(cv, inputsOf(all));
  if (layout) {
    const sizes = layout.groups.map((g) => g.tiles.length);
    check('two groups of four', JSON.stringify(sizes) === '[4,4]', sizes);
    check('no overlap joins the two rocks', layout.overlaps.every((o) => all[o.a].id[0] === all[o.b].id[0]), layout.overlaps.map((o) => all[o.a].id[0] + all[o.b].id[0]));
    check('the bars were seen', features.every((f) => hasGraphics(f)), features.map((f) => f.graphic.reduce((s, v) => s + v, 0)));
    for (const gi of [0, 1]) {
      const acc = accuracy(layout, gi, all.map((t) => t.truth));
      check(`group ${gi + 1}: neighbours agree within 2.5 pixels despite the bars`, acc.max < 2.5, acc);
    }
    // The bars alone: tiles of different rocks, compared without the graphics filter in the way of the test
    const o = matchPair(cv, 0, 1, features[0], features[1], { minInliers: 6 });
    check('two tiles that share only the bar do not overlap, even at a low bar', o === null, o && { inliers: o.inliers, matrix: o.matrix });
  } else check('a layout', false);

  // A gray logo is not seen as graphics; two tiles that share only the logo would land exactly on
  // top of each other with all matched points in one corner: refused as a label-only match
  const look = { vignette: 0.2, gain: 1, noise: 2, bar: 'gray' as const };
  const one = cutTile(sceneA(), truthOf(2000, 1500, 0, 1, TW, TH), TW, TH, look, randomOf(5));
  const two = cutTile(other, truthOf(2200, 1700, 0, 1, TW, TH), TW, TH, look, randomOf(6));
  const f1 = await tileFeatures(cv, memorySource(cv, one), 'hard');
  const f2 = await tileFeatures(cv, memorySource(cv, two), 'hard');
  check('fixture: the gray logo is not seen as graphics', !hasGraphics(f1) && !hasGraphics(f2));
  check('two tiles that share only a gray logo do not overlap', matchPair(cv, 0, 1, f1, f2) === null);
  // The same image twice does overlap, all over
  const twice = matchPair(cv, 0, 1, f1, f1);
  check('the same image added twice overlaps itself exactly', !!twice && twice.inliers > 500 && Math.hypot(twice.matrix[2], twice.matrix[5]) < 1, twice && twice.inliers);
}

if (wanted('gap')) {
  console.log('2f. a missing column: two groups that do not touch');
  const tiles = cutTiles(sceneA(), { cols: 3, rows: 2, tileWidth: TW, tileHeight: TH, overlap: 0.15, jitter: 0.02, seed: 61, drop: [1, 4] });
  const { layout, ranHardPass, features } = await stitchTiles(cv, inputsOf(tiles));
  if (layout) {
    const sizes = layout.groups.map((g) => g.tiles.length);
    check('two groups of two', JSON.stringify(sizes) === '[2,2]', sizes);
    check('the harder pass ran and found nothing false', ranHardPass && layout.overlaps.length === 2, layout.overlaps.length);
    const [target, moved] = layout.groups;
    const truth = tiles.map((t) => t.truth);
    const exact = multiply(multiply(target.placements[target.tiles[0]], invert(truth[target.tiles[0]])), multiply(truth[moved.tiles[0]], invert(moved.placements[moved.tiles[0]])));
    check('dropped in the right place, nothing to snap to: stays by hand', snapGroup(cv, layout, moved, target, exact, features) === null);
    // Placed by hand: joined without overlaps, and the frame holds the gap
    const joined = joinGroups(layout, moved, target, exact);
    const frame = mosaicFrame(joined, joined.groups[0], 10000)!;
    check('placed by hand: mosaic spans the gap', joined.groups.length === 1 && Math.abs(frame.fullWidth - (TW * 0.85 * 2 + TW)) < 150, frame.fullWidth);
  } else check('a layout', false);
}

if (wanted('magnification')) {
  console.log('2g. one image at twice the magnification');
  const tiles = cutTiles(sceneA(), { cols: 2, rows: 2, tileWidth: TW, tileHeight: TH, overlap: 0.2, jitter: 0.02, seed: 71 });
  // The same pixel size of image, showing half as much rock, somewhere in the middle
  const rand = randomOf(72);
  const truth = truthOf(sceneA().width / 2 + 150, sceneA().height / 2 - 100, 0, 2, TW, TH);
  const detail: CutTile = { id: 'detail', truth, cell: -1, image: cutTile(sceneA(), truth, TW, TH, { vignette: 0.2, gain: 1, noise: 2, bar: false }, rand) };
  const all = [...tiles.slice(0, 2), detail, ...tiles.slice(2)];
  const { layout } = await stitchTiles(cv, inputsOf(all));
  if (layout) {
    check('all five in one group', layout.groups.length === 1, layout.groups.map((g) => g.tiles.length));
    const odd = layout.groups.length === 1 ? otherMagnifications(layout.groups[0]) : [];
    check('the detail image is named, at about 2x', odd.length === 1 && odd[0].tile === 2 && Math.abs(odd[0].factor - 2) < 0.1, odd);
    if (layout.groups.length === 1) {
      const acc = accuracy(layout, 0, all.map((t) => t.truth));
      console.log(`    ${fmt(acc)}`);
      check('the detail image sits within 4 pixels', acc.max < 4, acc);
      const frame = mosaicFrame(layout, layout.groups[0], 10000, new Set([2]))!;
      check('left out of the mosaic, the frame is that of the four', Math.abs(frame.fullWidth - (TW * 0.8 + TW)) < 150, frame.fullWidth);
    }
  } else check('a layout', false);
}

// ---------------------------------------------------------------- 3. a real micrograph

if (wanted('real')) {
  const dir = process.env.STITCH_DEMO_DIR || path.join(os.homedir(), 'Desktop/GrainSpotDemoImages');
  const file = path.join(dir, '09-hard-peridotitic-mylonite-XPL.jpg');
  if (!fs.existsSync(file)) console.log(`3. real micrograph: SKIPPED (no ${file})`);
  else {
    console.log('3. a real micrograph (peridotitic mylonite, XPL), enlarged 1.5x, 3 x 3 tiles');
    const meta = await sharp(file).metadata();
    const w = Math.round(meta.width * 1.5);
    const h = Math.round(meta.height * 1.5);
    const raw = await sharp(file).resize(w, h).greyscale().raw().toBuffer({ resolveWithObject: true });
    const real: GrayImage = { data: new Uint8Array(raw.data.buffer, raw.data.byteOffset, w * h), width: w, height: h };
    const tiles = cutTiles(real, { cols: 3, rows: 3, tileWidth: TW, tileHeight: TH, overlap: 0.15, jitter: 0.03, turn: 2, seed: 81 });
    const { layout } = await stitchTiles(cv, inputsOf(tiles));
    if (layout) {
      check('all nine in one group', layout.groups.length === 1, layout.groups.map((g) => g.tiles.length));
      const acc = accuracy(layout, 0, tiles.map((t) => t.truth));
      console.log(`    ${fmt(acc)}; ${layout.overlaps.length} overlaps`);
      check('neighbours agree within 2.5 pixels (worst)', acc.max < 2.5, acc);
    } else check('a layout', false);
  }
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
