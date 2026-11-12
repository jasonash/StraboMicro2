/**
 * Image stitcher, phase 2 (docs/image-stitcher-design.md): the engine inside the real app,
 * without its wizard (which does not exist yet). Overlapping tiles cut from a made-up thin
 * section at known positions are prepared by the main process (preview copies), fitted together
 * by the renderer's worker pool (OpenCV.js in Web Workers) and built into a mosaic file by the
 * main process. Needs no server work: one copy, not logged in.
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { test, expect } from '../lib/test';
import { ACCOUNTS } from '../lib/copy';
import { accuracy, cutTiles, makeScene } from '../../stitchFixtures.mts';

test('stitch engine in the app: preview copies, workers, mosaic file', async ({ launch, runDir }) => {
  test.setTimeout(5 * 60_000);
  const TW = 2000;
  const TH = 1500;
  const scene = makeScene(5800, 3600, 7);
  const tiles = cutTiles(scene, { cols: 3, rows: 2, tileWidth: TW, tileHeight: TH, overlap: 0.15, jitter: 0.03, turn: 2, seed: 9 });
  const dir = path.join(runDir, 'tiles');
  fs.mkdirSync(dir, { recursive: true });
  const paths: string[] = [];
  for (const t of tiles) {
    const p = path.join(dir, `${t.id}.jpg`);
    await sharp(Buffer.from(t.image.data.buffer, t.image.data.byteOffset, t.image.data.length), { raw: { width: TW, height: TH, channels: 1 } }).jpeg({ quality: 92 }).toFile(p);
    paths.push(p);
  }
  // One file that is not an image, in the middle of the list
  const broken = path.join(dir, 'broken.jpg');
  fs.writeFileSync(broken, 'this is not an image');
  const chosen = [...paths.slice(0, 3), broken, ...paths.slice(3)];
  const out = path.join(runDir, 'mosaic.jpg');

  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  const notFound: string[] = [];
  ana.page.on('response', (r) => { if (r.status() === 404 && r.url().includes('localhost')) notFound.push(r.url()); });
  await ana.caption('prepares 6 tiles, fits them together in workers, builds the mosaic');
  const result = await ana.page.evaluate(async ({ chosen, out }) => {
    const app = await window.__e2e!.stitch();
    const session = app.newSession();
    const prepared = await app.prepareImages(session, chosen);
    const images = prepared.flatMap((p) => (p.ok ? [p.image] : []));
    const refused = prepared.flatMap((p) => (p.ok ? [] : [p.error]));
    const stages: string[] = [];
    const started = performance.now();
    const run = await app.fitImagesTogether(images, { onProgress: (p) => { if (!stages.includes(p.stage)) stages.push(p.stage); } });
    const fit = await run.done;
    const fitMs = Math.round(performance.now() - started);
    run.close();
    if (!fit.layout) return { error: 'no layout' };
    const rows: number[] = [];
    const buildStarted = performance.now();
    const built = await app.buildGroup(session, images, fit.layout, fit.layout.groups[0], { fill: [255, 0, 255] }, (done) => rows.push(done));
    const buildMs = Math.round(performance.now() - buildStarted);
    const saved = await window.api!.stitch.saveAs(session, out, 'jpeg');
    const previewPath = images[0].previewPath;
    await window.api!.stitch.cleanup(session);
    return {
      prepared: images.map((i) => ({ path: i.path, width: i.width, height: i.height, previewWidth: i.previewWidth, thumbnail: i.thumbnail.slice(0, 23) })),
      refused, stages, fitMs, buildMs, layout: fit.layout, graphics: fit.graphics, ranHardPass: fit.ranHardPass,
      built: { success: built.success, error: built.error, width: built.width, height: built.height, path: built.path },
      frame: built.frame && { fullWidth: built.frame.fullWidth, fullHeight: built.frame.fullHeight, scale: built.frame.scale },
      rows: rows.length, lastRow: rows[rows.length - 1], saved, previewPath,
    };
  }, { chosen, out });

  expect(result.error).toBeUndefined();
  console.log(`[e2e] stitch in the app: fit ${result.fitMs} ms, build ${result.buildMs} ms, stages ${result.stages?.join(' > ')}`);

  // Preview copies: six good images at full size, the broken file refused with a plain reason
  expect(result.prepared).toHaveLength(6);
  expect(result.prepared!.every((p) => p.width === TW && p.height === TH && p.previewWidth === TW && p.thumbnail === 'data:image/jpeg;base64,')).toBe(true);
  expect(result.prepared!.map((p) => p.path)).toEqual(paths);
  expect(result.refused).toHaveLength(1);
  expect(result.refused![0]).toContain('broken.jpg');

  // Fitted in workers: one group, within a pixel or two of the truth
  const layout = result.layout!;
  expect(layout.groups.map((g) => g.tiles.length)).toEqual([6]);
  expect(result.stages).toEqual(['features', 'pairs', 'layout']);
  expect(result.ranHardPass).toBe(false);
  const acc = accuracy(layout, 0, tiles.map((t) => t.truth));
  console.log(`[e2e] neighbours ${acc.median.toFixed(2)} / ${acc.max.toFixed(2)} px`);
  expect(acc.max).toBeLessThan(2.5);

  // Built by the main process: the size the layout says, saved as a JPEG that shows the scene
  expect(result.built!.success).toBe(true);
  expect(result.frame!.scale).toBe(1);
  expect(Math.abs(result.built!.width! - (TW * 0.85 * 2 + TW))).toBeLessThan(250);
  expect(result.lastRow).toBe(result.built!.height);
  expect(result.saved!.success).toBe(true);
  const meta = await sharp(out).metadata();
  expect([meta.width, meta.height]).toEqual([result.built!.width, result.built!.height]);
  // The middle of the mosaic is rock, not fill (magenta); a corner outside every turned tile may be fill
  const middle = await sharp(out).extract({ left: Math.round(meta.width! / 2) - 50, top: Math.round(meta.height! / 2) - 50, width: 100, height: 100 }).raw().toBuffer();
  let gray = 0;
  for (let i = 0; i < middle.length; i += 3) if (Math.abs(middle[i] - middle[i + 1]) < 12 && Math.abs(middle[i] - middle[i + 2]) < 12) gray++;
  expect(gray).toBeGreaterThan(9900);

  // Cleanup removed the session's scratch folder (preview copies and the built TIFF)
  expect(fs.existsSync(result.previewPath!)).toBe(false);
  expect(fs.existsSync(result.built!.path!)).toBe(false);
  // Nothing the stitcher asked the app for was missing (worker script, OpenCV), and it logged no errors
  expect(notFound).toEqual([]);
  expect(ana.consoleErrors.filter((l) => /stitch|worker|opencv/i.test(l))).toEqual([]);
});

/**
 * Time and memory of the automatic pass in the real app, for the limits of design decision 18.
 * Not a check; run on request:  E2E_STITCH_BENCH=1 npm run e2e -- 41-
 */
test('stitch bench: 48 images, and 12 images with a small overlap', async ({ launch, runDir }) => {
  test.skip(process.env.E2E_STITCH_BENCH !== '1', 'bench only on request');
  test.setTimeout(20 * 60_000);
  const TW = 2000;
  const TH = 1500;
  const scene = makeScene(14400, 9000, 3);
  const sets = [
    { name: '48 images, 15% overlap', tiles: cutTiles(scene, { cols: 8, rows: 6, tileWidth: TW, tileHeight: TH, overlap: 0.15, jitter: 0.03, seed: 5 }) },
    { name: '12 images, 7% overlap (harder pass)', tiles: cutTiles(scene, { cols: 4, rows: 3, tileWidth: TW, tileHeight: TH, overlap: 0.07, jitter: 0.01, seed: 6 }) },
  ];
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  for (const [k, set] of sets.entries()) {
    const dir = path.join(runDir, `bench-${k}`);
    fs.mkdirSync(dir, { recursive: true });
    const paths: string[] = [];
    for (const t of set.tiles) {
      const p = path.join(dir, `${t.id}.jpg`);
      await sharp(Buffer.from(t.image.data.buffer, t.image.data.byteOffset, t.image.data.length), { raw: { width: TW, height: TH, channels: 1 } }).jpeg({ quality: 92 }).toFile(p);
      paths.push(p);
    }
    // Memory of every process of the app, sampled while it works
    let peak = 0;
    let sampling = true;
    const sampler = (async () => {
      while (sampling) {
        const kb = await ana.app.evaluate(({ app }) => app.getAppMetrics().reduce((sum, m) => sum + m.memory.workingSetSize, 0)).catch(() => 0);
        peak = Math.max(peak, kb);
        await new Promise((r) => setTimeout(r, 250));
      }
    })();
    const before = await ana.app.evaluate(({ app }) => app.getAppMetrics().reduce((sum, m) => sum + m.memory.workingSetSize, 0));
    const r = await ana.page.evaluate(async ({ paths }) => {
      const app = await window.__e2e!.stitch();
      const session = app.newSession();
      const t0 = performance.now();
      const prepared = await app.prepareImages(session, paths);
      const images = prepared.flatMap((p) => (p.ok ? [p.image] : []));
      const t1 = performance.now();
      const marks: Record<string, number> = {};
      const run = await app.fitImagesTogether(images, { onProgress: (p) => { marks[p.stage] ??= Math.round(performance.now() - t1); } });
      const fit = await run.done;
      const t2 = performance.now();
      run.close();
      const built = fit.layout ? await app.buildGroup(session, images, fit.layout, fit.layout.groups[0]) : null;
      const t3 = performance.now();
      await window.api!.stitch.cleanup(session);
      const machine = await window.api!.stitch.machine();
      return { prepareMs: Math.round(t1 - t0), fitMs: Math.round(t2 - t1), buildMs: Math.round(t3 - t2), groups: fit.layout?.groups.map((g) => g.tiles.length), marks, size: built && [built.width, built.height], machine };
    }, { paths });
    sampling = false;
    await sampler;
    console.log(`[e2e bench] ${set.name}: reading ${(r.prepareMs / 1000).toFixed(1)} s, fitting ${(r.fitMs / 1000).toFixed(1)} s, building ${(r.buildMs / 1000).toFixed(1)} s (${r.size?.join(' x ')}); groups ${JSON.stringify(r.groups)}; app memory ${Math.round(before / 1024)} MB before, ${Math.round(peak / 1024)} MB at most; ${r.machine.processors} processors, ${Math.round(r.machine.memoryGb)} GB; stages at ${JSON.stringify(r.marks)}`);
    expect(r.groups).toEqual([set.tiles.length]);
  }
});
