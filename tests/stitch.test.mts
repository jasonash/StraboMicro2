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
  fitGroupToTarget, groupOfTile, groupsOf, joinGroups, mosaicFrame, mosaicPixelsPerUnit, otherMagnifications, placeGroup,
  rateSeams, separateTile, sizeAndTurn, solveLayout, solveLinear, thinPairs, POINTS_KEPT,
  type Overlap, type StitchLayout, type StitchTile,
} from '../src/services/stitch/stitchLayout.ts';
import { hasGraphics, matchPair, snapGroup, tileFeatures, type TileFeatures } from '../src/services/stitch/stitchMatch.ts';
import { hardPairs, quickPairs, stitchTiles, unplacedTiles, type StitchProgress } from '../src/services/stitch/stitch.ts';
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
  }
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
