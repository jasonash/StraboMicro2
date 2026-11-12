/**
 * Image stitcher: the worker pool (src/services/stitch/stitchPool.ts) with real workers
 * (worker_threads, tests/stitchNodeWorker.mts; each loads the app's public/opencv.js).
 *
 *   npm run test:stitch-pool            the checks
 *   npm run test:stitch-pool -- --bench time and memory with 1, 2, 4 and 6 workers (no checks)
 */

import { Worker } from 'worker_threads';
import sharp from 'sharp';
import type { GrayImage } from '../src/services/autoPlace/placementMatch.ts';
import { separateTile, groupOfTile, type StitchLayout } from '../src/services/stitch/stitchLayout.ts';
import { HARD_FEATURES_AT_ONCE, startStitch, workerCount, type PoolDeps, type StitchWorkerLike } from '../src/services/stitch/stitchPool.ts';
import { estimateSeconds, ESTIMATE_FROM, MAX_IMAGES, type StitchProgress } from '../src/services/stitch/stitch.ts';
import type { FromStitchWorker, ToStitchWorker } from '../src/services/stitch/stitchJobs.ts';
import { accuracy, cutTiles, makeScene, type CutTile } from './stitchFixtures.mts';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}

const live = new Set<Worker>();
/** Index (in order of creation within a run) of the workers given harder features jobs */
let made = 0;
const hardMakers = new Set<number>();
/** What the pool posted, for the checks */
const posted: ToStitchWorker[] = [];
let hardFeaturesNow = 0;
let hardFeaturesMost = 0;

function nodeWorker(): StitchWorkerLike {
  const worker = new Worker(new URL('./stitchNodeWorker.mts', import.meta.url));
  live.add(worker);
  const index = made++;
  const hardJobs = new Set<number>();
  const like: StitchWorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage(message) {
      posted.push(message);
      if (message.type === 'job' && message.job.kind === 'features' && message.job.level === 'hard') {
        hardJobs.add(message.id);
        hardMakers.add(index);
        hardFeaturesMost = Math.max(hardFeaturesMost, ++hardFeaturesNow);
      }
      worker.postMessage(message);
    },
    terminate() {
      live.delete(worker);
      hardFeaturesNow -= hardJobs.size;
      hardJobs.clear();
      void worker.terminate();
    },
  };
  worker.on('message', (message: FromStitchWorker) => {
    if ((message.type === 'done' || message.type === 'error') && hardJobs.delete(message.id)) hardFeaturesNow--;
    like.onmessage?.(message);
  });
  worker.on('error', (error) => like.onerror?.(error.message));
  return like;
}

/** The whole tile, shrunk: what the app's main process answers from the preview copy */
function readerOf(tiles: CutTile[]) {
  return async (tile: number, maxSide: number): Promise<GrayImage> => {
    const { image } = tiles[tile];
    const f = Math.min(1, maxSide / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * f));
    const height = Math.max(1, Math.round(image.height * f));
    const { data, info } = await sharp(Buffer.from(image.data.buffer, image.data.byteOffset, image.data.length), { raw: { width: image.width, height: image.height, channels: 1 } })
      .resize(width, height, { fit: 'fill', kernel: 'cubic' }).raw().toBuffer({ resolveWithObject: true });
    const gray = new Uint8Array(info.width * info.height);
    for (let i = 0; i < gray.length; i++) gray[i] = data[i * info.channels];
    return { data: gray, width: info.width, height: info.height };
  };
}

const depsOf = (tiles: CutTile[], workers: number): PoolDeps => ({ createWorker: nodeWorker, read: readerOf(tiles), workers, opencvScript: null });
const sizesOf = (tiles: CutTile[]) => tiles.map((t) => ({ id: t.id, width: t.image.width, height: t.image.height }));
const shape = (layout: StitchLayout | null) => JSON.stringify(layout?.groups.map((g) => g.tiles.length));

const TW = 2000;
const TH = 1500;

if (process.argv.includes('--bench')) {
  const scene = makeScene(14400, 9000, 3);
  const many = cutTiles(scene, { cols: 8, rows: 6, tileWidth: TW, tileHeight: TH, overlap: 0.15, jitter: 0.03, seed: 5 });
  const low = cutTiles(scene, { cols: 4, rows: 3, tileWidth: TW, tileHeight: TH, overlap: 0.07, jitter: 0.01, seed: 6 });
  for (const [name, tiles, counts] of [['48 tiles, 15% overlap', many, [1, 2, 4, 6]], ['12 tiles, 7% overlap (harder pass)', low, [1, 4, 6]]] as const) {
    for (const n of counts) {
      let peak = 0;
      const timer = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 50);
      const marks: Record<string, number> = {};
      const started = Date.now();
      const run = startStitch(sizesOf(tiles), depsOf(tiles, n), { onProgress: (p) => { marks[p.stage] ??= Date.now() - started; } });
      const result = await run.done;
      const took = Date.now() - started;
      clearInterval(timer);
      run.close();
      console.log(`${name}, ${n} worker(s): ${(took / 1000).toFixed(1)} s, peak memory ${Math.round(peak / 1048576)} MB, groups ${shape(result.layout)}, stages at ${JSON.stringify(marks)}`);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  process.exit(0);
}

const scene = makeScene(7600, 5600, 1);

console.log('1. worker counts');
check('workerCount leaves two processors free, at most six workers, at least one',
  JSON.stringify([1, 2, 3, 4, 8, 14, 32].map((p) => workerCount(p))) === '[1,1,1,2,6,6,6]', [1, 2, 3, 4, 8, 14, 32].map((p) => workerCount(p)));
check('workerCount: one worker per 2 GB of memory', JSON.stringify([2, 4, 8, 16, 64].map((gb) => workerCount(14, gb))) === '[1,2,4,6,6]', [2, 4, 8, 16, 64].map((gb) => workerCount(14, gb)));
check('estimateSeconds: grows with the pairs, divides by the workers', Math.round(estimateSeconds(100, 4)) === 317 && estimateSeconds(100, 1) === 4 * estimateSeconds(100, 4) && ESTIMATE_FROM === 60 && MAX_IMAGES === 200, estimateSeconds(100, 4));

console.log('2. regular grid, three workers');
const grid = cutTiles(scene, { cols: 3, rows: 3, tileWidth: TW, tileHeight: TH, overlap: 0.15, jitter: 0.03, seed: 21, bar: true });
let gridLayout: StitchLayout | null = null;
{
  const stages: StitchProgress[] = [];
  posted.length = 0;
  const run = startStitch(sizesOf(grid), depsOf(grid, 3), { onProgress: (p) => stages.push(p) });
  const result = await run.done;
  gridLayout = result.layout;
  check('a layout with all nine in one group', shape(result.layout) === '[9]', shape(result.layout));
  if (result.layout) {
    const acc = accuracy(result.layout, 0, grid.map((t) => t.truth));
    console.log(`    neighbours ${acc.median.toFixed(2)} / ${acc.max.toFixed(2)} px`);
    check('neighbours agree within 2.5 pixels', acc.max < 2.5, acc);
    check('overlaps are in a fixed order', result.layout.overlaps.every((o, k, all) => k === 0 || all[k - 1].a < o.a || (all[k - 1].a === o.a && all[k - 1].b < o.b)));
  }
  check('no harder pass', !result.ranHardPass);
  check('the burned-in bars were seen on every tile', result.graphics.length === 9 && result.graphics.every(Boolean), result.graphics);
  const last = (stage: string) => stages.filter((s) => s.stage === stage).pop();
  check('progress: every tile and every pair counted', last('features')?.done === 9 && last('pairs')?.done === 36 && last('pairs')?.total === 36, [last('features'), last('pairs')]);
  check('progress: counts only go up within a stage', stages.every((s, k) => k === 0 || stages[k - 1].stage !== s.stage || stages[k - 1].done <= s.done));
  check('progress: overlaps found so far is reported', (last('pairs')?.overlaps ?? 0) >= 12, last('pairs'));
  const jobs = posted.filter((m) => m.type === 'job');
  check('each job was given once', jobs.length === 9 + 36, jobs.length);
  check('every worker was sent every tile\'s features', posted.filter((m) => m.type === 'store').length === 9 * 3);

  // A snap through the pool: one tile taken out and dropped back a little off
  if (result.layout) {
    const tile = result.layout.groups[0].tiles[4];
    const exact = result.layout.groups[0].placements[tile];
    const apart = separateTile(result.layout, tile);
    const moved = groupOfTile(apart, tile);
    const target = apart.groups[0];
    const rough: [number, number, number, number, number, number] = [exact[0], exact[1], exact[2] + 90, exact[3], exact[4], exact[5] - 70];
    const snap = await run.snap(apart, moved, target, rough);
    check('snap through the pool finds the tile\'s place again', !!snap && Math.hypot(snap.groupToTarget[2] - exact[2], snap.groupToTarget[5] - exact[5]) < 2, snap?.groupToTarget);
  }
  run.close();
  check('close ends the workers', live.size === 0, live.size);
}

console.log('3. the same images with one worker give the same layout');
{
  const run = startStitch(sizesOf(grid), depsOf(grid, 1));
  const result = await run.done;
  run.close();
  const same = !!result.layout && !!gridLayout && JSON.stringify(result.layout.groups) === JSON.stringify(gridLayout.groups);
  check('identical groups and placements', same);
}

console.log('4. 7% overlap: harder pass, skip, cancel');
const low = cutTiles(scene, { cols: 3, rows: 3, tileWidth: TW, tileHeight: TH, overlap: 0.07, jitter: 0.01, seed: 45 });
let quickShape = '';
{
  const quick = startStitch(sizesOf(low), depsOf(low, 4), { hardPass: false });
  const q = await quick.done;
  quick.close();
  quickShape = shape(q.layout);
  check('fixture: the quick pass alone leaves tiles unplaced', !!q.layout && q.layout.groups.length > 1, quickShape);

  hardFeaturesMost = 0;
  made = 0;
  hardMakers.clear();
  const stages: StitchProgress[] = [];
  const run = startStitch(sizesOf(low), depsOf(low, 4), { onProgress: (p) => stages.push(p) });
  const result = await run.done;
  run.close();
  check('with the harder pass all nine are placed', shape(result.layout) === '[9]' && result.ranHardPass, shape(result.layout));
  if (result.layout) check('neighbours agree within 2.5 pixels', accuracy(result.layout, 0, low.map((t) => t.truth)).max < 2.5);
  check(`never more than ${HARD_FEATURES_AT_ONCE} harder features at once`, hardFeaturesMost === HARD_FEATURES_AT_ONCE, hardFeaturesMost);
  check('only the first two workers make harder features', JSON.stringify([...hardMakers].sort()) === '[0,1]', [...hardMakers]);
  const order = stages.map((s) => s.stage).filter((s, k, all) => k === 0 || all[k - 1] !== s);
  check('stages in order', JSON.stringify(order) === JSON.stringify(['features', 'pairs', 'layout', 'hard-features', 'hard-pairs', 'layout']), order);
  check('harder stages say how many images they look at', stages.filter((s) => s.stage.startsWith('hard')).every((s) => (s.unplaced ?? 0) > 0));
}
{
  // Skip as soon as the harder pass starts
  let skipped = false;
  const run = startStitch(sizesOf(low), depsOf(low, 4), {
    onProgress: (p) => {
      if (p.stage === 'hard-features' && !skipped) {
        skipped = true;
        run.skipHard();
      }
    },
  });
  const started = Date.now();
  const result = await run.done;
  check('skip: the quick layout, at once', skipped && shape(result.layout) === quickShape && !result.ranHardPass, shape(result.layout));
  check('skip: the workers are still there for snaps', live.size === 4, live.size);
  run.close();
  void started;
}
{
  let cancelledAt = -1;
  const run = startStitch(sizesOf(low), depsOf(low, 4), {
    onProgress: (p) => {
      if (p.stage === 'pairs' && p.done >= 5 && cancelledAt < 0) {
        cancelledAt = p.done;
        run.cancel();
      }
    },
  });
  const result = await run.done;
  check('cancel: no layout', cancelledAt >= 5 && result.layout === null, cancelledAt);
  check('cancel ends the workers', live.size === 0, live.size);
  let refused = false;
  await run.snap({ tiles: [], overlaps: [], groups: [], dropped: [] }, { tiles: [], placements: {} }, { tiles: [], placements: {} }, [1, 0, 0, 0, 1, 0]).catch(() => { refused = true; });
  check('after cancel a snap is refused', refused);
}

console.log('5. failures');
{
  // An image that cannot be read
  const run = startStitch(sizesOf(grid), { ...depsOf(grid, 2), read: async (tile) => { if (tile === 3) throw new Error('could not be read'); return readerOf(grid)(tile, 256); } });
  let message = '';
  await run.done.catch((error: Error) => { message = error.message; });
  run.close();
  check('an unreadable image fails the run with its reason', message.includes('could not be read'), message);
}
{
  // A worker that dies
  let count = 0;
  const run = startStitch(sizesOf(grid), {
    ...depsOf(grid, 2),
    createWorker: () => {
      const w = nodeWorker();
      if (count++ === 1) setTimeout(() => w.onerror?.('worker died'), 300);
      return w;
    },
  });
  let message = '';
  await run.done.catch((error: Error) => { message = error.message; });
  check('a worker that dies fails the run', message === 'worker died', message);
  check('and the other workers are ended', live.size === 0, live.size);
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
