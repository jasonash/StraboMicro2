/**
 * Helpers for the manual's screenshots: a fixed window size, demo projects
 * opened from .smz files, and captures of the window or one element.
 */

import fs from 'fs';
import path from 'path';
import { expect, type Locator } from '@playwright/test';
import type { Copy } from '../e2e/lib/copy';

export const FIGURES = process.env.MANUAL_FIGURES
  || path.resolve(__dirname, '../../docs/OverleafManual/StraboMicro2Manual/Figures');

/** Demo projects (.smz) and their ids; MANUAL_DEMO points at the folder holding them */
export const DEMO_DIR = process.env.MANUAL_DEMO || '';
export const FELDSPAR = { id: '5a0872f6-fb4e-4c92-b729-23297e4140ec', name: 'Feldspar Testing' };
export const TOXAWAY = { id: '17375760696454', name: 'Toxaway Dome Samples' };

/** Size the main window's content (CSS pixels) */
export async function setWindowSize(copy: Copy, width: number, height: number): Promise<void> {
  await copy.app.evaluate(({ BrowserWindow }, [w, h]) => {
    const win = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().startsWith('http://localhost:5173') && !x.webContents.getURL().includes('chat.html'));
    win?.setContentSize(w, h);
  }, [width, height] as const);
  await expect.poll(() => copy.page.evaluate(() => [window.innerWidth, window.innerHeight].join('x'))).toBe(`${width}x${height}`);
}

/** Open a demo project from its .smz (Open Local Project), named as the manual shows it */
export async function openDemo(copy: Copy, demo: { id: string; name: string }): Promise<void> {
  const smz = path.join(DEMO_DIR, `${demo.id}.smz`);
  if (!fs.existsSync(smz)) throw new Error(`demo project missing: ${smz} (set MANUAL_DEMO)`);
  await copy.answerDialog({ kind: 'open', filePaths: [smz] });
  await copy.menu('File', 'Open Local Project (.smz)');
  const dialog = copy.page.getByRole('dialog', { name: 'Open Project' });
  await dialog.getByRole('button', { name: /^(Import|Replace & Import)$/ }).click();
  await dialog.getByRole('button', { name: 'Open Project' }).click({ timeout: 5 * 60_000 });
  // The first open makes every micrograph's tiles ("Preparing Project Images")
  await expect.poll(() => copy.state((e) => e.app.getState().project?.id ?? null), { timeout: 15 * 60_000 }).toBe(demo.id);
  await expect(copy.page.getByText('Preparing Project Images')).toHaveCount(0, { timeout: 15 * 60_000 });
  // The demo copies are named "... (copy)" on the author's computer
  await copy.state(new Function('e', `e.app.setState((s) => ({ project: { ...s.project, name: ${JSON.stringify(demo.name)} } }));`) as never);
}

/** Let images, tiles and animations settle */
export async function settle(copy: Copy, ms = 1500): Promise<void> {
  await expect(copy.page.getByText('Loading image...')).toHaveCount(0, { timeout: 120_000 });
  await copy.page.waitForTimeout(ms);
}

/** Save a capture of the whole window, or of one element (with padding) */
export async function shot(copy: Copy, name: string, target?: Locator, pad = 0): Promise<string> {
  const file = path.join(FIGURES, `${name}.png`);
  if (!target) {
    await copy.page.screenshot({ path: file });
  } else {
    await target.scrollIntoViewIfNeeded().catch(() => undefined);
    await copy.page.waitForTimeout(300);
    const box = await target.boundingBox();
    if (!box) throw new Error(`${name}: element not visible`);
    const vw = await copy.page.evaluate(() => [window.innerWidth, window.innerHeight]);
    const x = Math.max(0, box.x - pad);
    const y = Math.max(0, box.y - pad);
    await copy.page.screenshot({
      path: file,
      clip: { x, y, width: Math.min(vw[0] - x, box.width + 2 * pad), height: Math.min(vw[1] - y, box.height + 2 * pad) },
    });
  }
  return file;
}

/** A micrograph's id by its name */
export async function micrographId(copy: Copy, name: string): Promise<string> {
  const id = await copy.state(new Function('e', `
    for (const m of e.app.getState().micrographIndex.values()) if (m.name === ${JSON.stringify(name)}) return m.id;
    return null;`) as never) as string | null;
  if (!id) throw new Error(`no micrograph named ${name}`);
  return id;
}

/** Show a micrograph in the viewer and wait for it */
export async function view(copy: Copy, name: string): Promise<string> {
  const id = await micrographId(copy, name);
  await copy.state(new Function('e', `return e.app.getState().selectMicrograph(${JSON.stringify(id)})`) as never);
  await settle(copy);
  return id;
}

/** The bounding box of the union of elements */
export async function unionBox(...targets: Locator[]) {
  const boxes = await Promise.all(targets.map((t) => t.boundingBox()));
  const b = boxes.filter((x): x is NonNullable<typeof x> => Boolean(x));
  const x = Math.min(...b.map((r) => r.x));
  const y = Math.min(...b.map((r) => r.y));
  return { x, y, width: Math.max(...b.map((r) => r.x + r.width)) - x, height: Math.max(...b.map((r) => r.y + r.height)) - y };
}

/** Save a capture of a rectangle of the window */
export async function shotRect(copy: Copy, name: string, r: { x: number; y: number; width: number; height: number }): Promise<string> {
  const file = path.join(FIGURES, `${name}.png`);
  await copy.page.screenshot({ path: file, clip: r });
  return file;
}

/** Rename spots of a micrograph (demo copies carry test names); a name mapped to null deletes the spot */
export async function renameSpots(copy: Copy, micrographName: string, names: Record<string, string | null>): Promise<void> {
  const id = await micrographId(copy, micrographName);
  await copy.state(new Function('e', `
    const s = e.app.getState();
    const m = s.micrographIndex.get(${JSON.stringify(id)});
    const names = ${JSON.stringify(names)};
    for (const spot of [...(m.spots || [])]) {
      if (!(spot.name in names)) continue;
      if (names[spot.name] === null) s.deleteSpot(spot.id);
      else s.updateSpotData(spot.id, { name: names[spot.name] });
    }`) as never);
}
