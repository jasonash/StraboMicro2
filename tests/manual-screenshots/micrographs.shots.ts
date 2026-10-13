/**
 * Manual figures for projects, samples, micrographs, spots and sketches
 * (sections 3, 5, 8).
 */

import fs from 'fs';
import path from 'path';
import { test, expect } from '../e2e/lib/test';
import { ACCOUNTS, type Copy } from '../e2e/lib/copy';
import { addSpot } from '../e2e/lib/actions';
import { TOXAWAY, micrographId, openDemo, renameSpots, setWindowSize, settle, shot, shotRect, view } from './lib';

const REF = '160327-5 xz Reference Photomicrograph';
const FE_MAP = '160327-5 Grt1-fe-ka(sp3)_color';
const MF = 'mf2-7 (2.5x)';

function treeRow(copy: Copy, rowText: string) {
  return copy.page.getByText(rowText, { exact: true }).locator('xpath=../..');
}

/** The viewer's canvas area (between the panels) */
async function viewerBox(copy: Copy) {
  const tabs = copy.page.getByRole('tablist');
  const l = await tabs.first().boundingBox();
  const r = await tabs.last().boundingBox();
  if (!l || !r) throw new Error('no panels');
  return { x: l.x + l.width, y: l.y, width: r.x - (l.x + l.width), height: 0 };
}

test('micrographs', async ({ launch, runDir }) => {
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await setWindowSize(ana, 1600, 1000);
  await openDemo(ana, TOXAWAY);
  await ana.state((e) => e.app.getState().setSpotLabelMode('none'));
  // Demo tidy-up in this copy only: realistic names for test spots
  await renameSpots(ana, 'mf2-1 (20x)', { '1': 'Bt-1', '2': 'Bt-2', '3': 'Ms-1', '5': 'Qtz-1' });
  await renameSpots(ana, 'mf2-3 (20x)', { dfads: 'Fracture 1', adff: 'Fracture 2', jjj: 'Inclusion 1' });
  await renameSpots(ana, 'mf2-6 (20x)', { one: 'Grain A', two: 'Grain B' });

  // A real micrograph image to add, from the demo project
  const projectDir = path.join(ana.dir, 'Documents', 'StraboMicro2Data', TOXAWAY.id);
  const refId = await micrographId(ana, REF);
  const image = path.join(runDir, 'TD-01.jpg');
  fs.copyFileSync(path.join(projectDir, 'images', refId), image);

  // ---- New Sample
  await treeRow(ana, 'Toxaway Dome').locator('button:has([data-testid="AddIcon"])').first().click();
  await ana.page.getByRole('menuitem', { name: 'Add New Sample' }).click();
  let dlg = ana.page.getByRole('dialog').last();
  await expect(dlg).toBeVisible();
  await dlg.getByLabel(/^Sample ID/).fill('TD-01');
  await ana.page.waitForTimeout(500);
  await shot(ana, 'sample-info-modal', dlg);
  await dlg.getByRole('button', { name: 'Create Sample' }).click();
  await expect(dlg).toBeHidden();

  // ---- New Reference Micrograph wizard
  await treeRow(ana, 'TD-01').locator('button:has([data-testid="AddIcon"])').first().click();
  await ana.page.getByRole('menuitem', { name: 'Add New Reference Micrograph' }).click();
  dlg = ana.page.getByRole('dialog', { name: 'New Reference Micrograph' });
  const next = dlg.getByRole('button', { name: 'Next' });
  const pick = async (combo: string, option: string) => {
    await dlg.getByRole('combobox', { name: new RegExp(`^${combo}`) }).click();
    await ana.page.getByRole('option', { name: option, exact: true }).click();
  };
  await ana.answerDialog({ kind: 'open', filePaths: [image] });
  await dlg.getByRole('button', { name: 'Browse...' }).click();
  await expect(next).toBeEnabled({ timeout: 60_000 });
  await next.click(); // Load
  await ana.page.waitForTimeout(800);
  await shot(ana, 'image-rotation-step', dlg);
  await next.click(); // Rotation
  await pick('Instrument Type', 'Optical Microscopy');
  await pick('Image Type', 'Plane Polarized Light');
  await ana.page.waitForTimeout(500);
  await shot(ana, 'link-xpl-ppl', dlg);
  // Find Instrument in Database
  await dlg.getByRole('button', { name: 'Find Instrument in Database' }).click();
  const inst = ana.page.getByRole('dialog', { name: 'Find Instrument in Database' });
  await expect(inst).toBeVisible();
  await ana.page.waitForTimeout(2500);
  await shot(ana, 'select-instrument-placeholder', inst);
  await ana.page.keyboard.press('Escape');
  await expect(inst).toBeHidden();
  await next.click(); // Instrument & Image Information
  await next.click(); // Instrument Data
  await dlg.getByLabel(/^Name/).fill('TD-01 overview PPL');
  await next.click(); // Metadata
  await dlg.getByText('Trend and Plunge of Edges/Strike and Dip of Surface', { exact: false }).first().click();
  await ana.page.waitForTimeout(800);
  await shot(ana, 'TP-SD', dlg);
  await dlg.getByText('Fabric Reference Frame', { exact: false }).first().click();
  await ana.page.waitForTimeout(800);
  await shot(ana, 'fabric-ref-frame', dlg);
  await dlg.getByText('Unoriented Thin Section', { exact: false }).first().click();
  await next.click(); // Orientation
  await dlg.getByText('Pixel Conversion Factor', { exact: true }).click();
  await next.click(); // Scale
  await dlg.getByLabel(/^Number of Pixels/).fill('400');
  await dlg.getByLabel(/^Physical Length/).fill('1000'); // um: 400 px = 1 mm
  await dlg.getByRole('button', { name: 'Finish' }).click();
  await expect(dlg).toBeHidden({ timeout: 120_000 });
  await settle(ana, 1500);

  // ---- PPL/XPL pair: Add Corresponding XPL Image
  await treeRow(ana, 'TD-01 overview PPL (Reference)').or(treeRow(ana, 'TD-01 overview PPL')).first()
    .locator('button:has([data-testid="AddIcon"])').first().click();
  await ana.page.getByRole('menuitem', { name: 'Add Corresponding XPL Image' }).click();
  dlg = ana.page.getByRole('dialog', { name: 'Add Corresponding XPL Image' });
  await ana.answerDialog({ kind: 'open', filePaths: [image] });
  await dlg.getByRole('button', { name: 'Select XPL Image...' }).click();
  const add = dlg.getByRole('button', { name: 'Add XPL Image' });
  await expect(add).toBeEnabled({ timeout: 60_000 });
  await add.click();
  await expect(dlg).toBeHidden({ timeout: 120_000 });
  await settle(ana, 1500);
  const chip = ana.page.getByText('PPL/XPL', { exact: true }).first();
  const row = chip.locator('xpath=../../..');
  await shot(ana, 'icon-xpl-ppl', row, 4);

  // ---- 3-Point Registration on an element map placed on the reference
  await view(ana, REF);
  await treeRow(ana, REF + ' (Reference)').locator('button:has([data-testid="ExpandMoreIcon"]), button:has([data-testid="ChevronRightIcon"])').first().click().catch(() => undefined);
  await settle(ana, 800);
  await treeRow(ana, FE_MAP).locator('button:has([data-testid="MoreVertIcon"])').first().click();
  await ana.page.getByRole('menuitem', { name: 'Edit Micrograph Location' }).click();
  dlg = ana.page.getByRole('dialog').last();
  await expect(dlg).toBeVisible();
  await dlg.getByText('3-Point Registration', { exact: true }).click();
  await dlg.getByRole('button', { name: 'Next' }).click();
  await dlg.getByRole('button', { name: /Start 3-Point Registration|Edit Registration/ }).click();
  const reg = ana.page.getByRole('dialog').last();
  await ana.page.waitForTimeout(4000);
  const stages = reg.locator('.konvajs-content');
  const base = await stages.nth(0).boundingBox();
  const over = await stages.nth(1).boundingBox();
  if (base && over) {
    for (const [fx, fy] of [[0.3, 0.3], [0.7, 0.35], [0.5, 0.75]]) {
      await ana.page.mouse.click(base.x + base.width * fx, base.y + base.height * fy);
      await ana.page.waitForTimeout(300);
      await ana.page.mouse.click(over.x + over.width * fx, over.y + over.height * fy);
      await ana.page.waitForTimeout(300);
    }
  }
  await ana.page.waitForTimeout(1500);
  await shot(ana, '3-point-registration');
  await reg.getByRole('button', { name: 'Cancel' }).click();
  await ana.page.waitForTimeout(500);
  await ana.page.keyboard.press('Escape');
  await expect(ana.page.getByRole('dialog')).toHaveCount(0, { timeout: 10_000 }).catch(async () => {
    await ana.page.getByRole('button', { name: 'Cancel' }).last().click().catch(() => undefined);
  });

  // ---- Spots on the reference
  await view(ana, REF);
  const vb = await viewerBox(ana);
  const cx = vb.x + vb.width * 0.45;
  const cy = 450;
  // A point spot: the New Spot dialog
  await ana.page.keyboard.press('p');
  await ana.page.mouse.click(cx, cy);
  dlg = ana.page.getByRole('dialog').last();
  await expect(dlg).toBeVisible();
  await dlg.getByLabel(/^Name/).fill('Garnet 1');
  await ana.page.waitForTimeout(400);
  await shot(ana, 'add-spot', dlg);
  await dlg.getByRole('button', { name: 'Create Spot' }).click();
  await expect(dlg).toBeHidden();
  // A line spot: its length in Spot Metadata
  await ana.page.keyboard.press('l');
  await ana.page.mouse.click(cx - 200, cy + 150);
  await ana.page.waitForTimeout(250);
  await ana.page.mouse.click(cx - 50, cy + 100);
  await ana.page.waitForTimeout(250);
  await ana.page.mouse.click(cx + 120, cy + 160);
  await ana.page.mouse.dblclick(cx + 120, cy + 160);
  dlg = ana.page.getByRole('dialog').last();
  await expect(dlg).toBeVisible();
  await dlg.getByLabel(/^Name/).fill('Transect 1');
  await dlg.getByRole('button', { name: 'Create Spot' }).click();
  await expect(dlg).toBeHidden();
  await ana.page.keyboard.press('v');
  await settle(ana, 800);
  const expandSpotMetadata = async () => {
    await ana.page.getByText('Spot Metadata', { exact: true }).first().click();
    await ana.page.waitForTimeout(600);
  };
  await expandSpotMetadata();
  const rt = await ana.page.getByRole('tablist').last().boundingBox();
  if (!rt) throw new Error('no right panel');
  await shotRect(ana, 'spot-measurements', { x: rt.x, y: rt.y, width: 1600 - rt.x, height: 1000 - rt.y });
  // A polygon spot (a grain): area and perimeter
  const grain = await ana.state(new Function('e', `
    const m = e.app.getState().micrographIndex.get(${JSON.stringify(refId)});
    return (m.spots || []).find((s) => s.name === 'Grain 5')?.id ?? null;`) as never) as string | null;
  if (grain) {
    await ana.state(new Function('e', `return e.app.getState().selectActiveSpot(${JSON.stringify(grain)})`) as never);
    await settle(ana, 800);
    if (!(await ana.page.getByText(/^Area/).first().isVisible().catch(() => false))) await expandSpotMetadata();
    await shotRect(ana, 'spot-metadata-panel', { x: rt.x, y: rt.y, width: 1600 - rt.x, height: 1000 - rt.y });
    await shotRect(ana, 'spot-metadata-panel-full', { x: rt.x, y: rt.y, width: 1600 - rt.x, height: 1000 - rt.y });
  }
  // Several spots: Edit Selected Spots
  await ana.state(new Function('e', `
    const s = e.app.getState();
    const m = s.micrographIndex.get(${JSON.stringify(refId)});
    s.clearSpotSelection();
    for (const name of ['Grain 1', 'Grain 2', 'Grain 3']) { const sp = (m.spots || []).find((x) => x.name === name); if (sp) s.selectSpot(sp.id, true); }`) as never);
  await ana.menu('Spot', 'Edit Selected Spots...');
  dlg = ana.page.getByRole('dialog').last();
  await expect(dlg).toBeVisible();
  await ana.page.waitForTimeout(500);
  await shot(ana, 'batch-edit-panel', dlg);
  await ana.page.keyboard.press('Escape');
  await ana.state((e) => e.app.getState().clearSpotSelection());

  // ---- Auto spot mode and sketches on the new TD-01 reference (a clean image)
  await ana.state((e) => e.app.getState().selectActiveSpot(null));
  await ana.state((e) => e.app.getState().clearSpotSelection());
  await view(ana, 'TD-01 overview PPL');

  // Auto spot mode
  await ana.page.locator('.drawing-toolbar button').nth(3).click();
  await ana.page.keyboard.press('p');
  await ana.state((e) => e.app.getState().setSpotLabelMode('original'));
  for (const [dx, dy] of [[-150, -100], [0, -60], [140, -120]]) {
    await ana.page.mouse.click(cx + dx, cy + dy);
    await ana.page.waitForTimeout(400);
  }
  await ana.page.mouse.move(cx + 60, cy + 40);
  await settle(ana, 1000);
  await shotRect(ana, 'auto-spot-mode', { x: vb.x, y: vb.y, width: vb.width, height: 1000 - vb.y - 180 });
  await ana.page.keyboard.press('Escape');
  await ana.page.locator('.drawing-toolbar button').nth(3).click();
  await ana.state((e) => e.app.getState().setSpotLabelMode('none'));

  // ---- Sketches: a layer with strokes and a label (no spot selected, so the Sketches tab shows)
  await ana.state((e) => e.app.getState().selectActiveSpot(null));
  await ana.state((e) => e.app.getState().clearSpotSelection());
  await settle(ana, 500);
  await ana.page.locator('.drawing-toolbar button').nth(5).click();
  await settle(ana, 800);
  await ana.state((e) => { const s = e.app.getState(); s.setSketchStrokeColor('#ffd400'); s.setSketchStrokeWidth(8); s.setSketchFontSize(72); });
  const stroke = async (pts: Array<[number, number]>) => {
    await ana.page.mouse.move(pts[0][0], pts[0][1]);
    await ana.page.mouse.down();
    for (const [x, y] of pts.slice(1)) await ana.page.mouse.move(x, y, { steps: 8 });
    await ana.page.mouse.up();
  };
  await stroke([[cx - 220, cy - 160], [cx - 120, cy - 200], [cx, cy - 170], [cx + 80, cy - 90], [cx + 40, cy]]);
  await ana.page.keyboard.press('2');
  await stroke([[cx - 250, cy + 120], [cx + 250, cy + 140]]);
  await ana.page.keyboard.press('4');
  await ana.page.mouse.click(cx + 120, cy - 220);
  await ana.page.keyboard.type('Garnet-rich layer');
  await ana.page.keyboard.press('Enter');
  await ana.page.keyboard.press('1');
  await settle(ana, 800);
  console.log('SKETCH', JSON.stringify(await ana.state(new Function('e', `
    const s = e.app.getState(); const m = s.micrographIndex.get(s.activeMicrographId);
    return { active: s.activeMicrographId, mode: s.sketchModeActive, layer: s.activeSketchLayerId, layers: (m.sketchLayers || []).map((l) => ({ n: l.name, strokes: (l.strokes || []).length, texts: (l.texts || []).length })) };`) as never)));
  const sketchBar = ana.page.locator('.sketch-toolbar').first();
  if (await sketchBar.count()) await shot(ana, 'sketch-tools', sketchBar, 4);
  else console.log('no .sketch-toolbar');
  await shot(ana, 'color-width-controls', sketchBar, 4).catch(() => undefined);
  await shotRect(ana, 'sketches-panel', { x: rt.x, y: rt.y, width: 1600 - rt.x, height: 520 });
  await shot(ana, 'sketch-mode-window');
  await ana.page.keyboard.press('Escape');
  await settle(ana, 500);

  // ---- Export Micrograph (with sketch layers) and Export Images (the button is on the Micrograph tab)
  await ana.page.getByRole('tab', { name: 'Micrograph' }).click();
  await ana.page.waitForTimeout(500);
  await ana.page.getByRole('button', { name: /^Export Micrograph/ }).first().click();
  dlg = ana.page.getByRole('dialog').last();
  await expect(dlg).toBeVisible();
  await ana.page.waitForTimeout(800);
  await shot(ana, 'export-sketches-dialog', dlg);
  await ana.page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  await ana.menu('File', 'Export Images...');
  dlg = ana.page.getByRole('dialog').last();
  await expect(dlg).toBeVisible();
  await ana.page.waitForTimeout(800);
  await shot(ana, 'export-images-dialog', dlg);
  await ana.page.keyboard.press('Escape');

  // ---- Version History: a few saves and a named version
  // Saves from the menu (typed accelerators do not reach the native menu), each after a change
  for (const [i, name] of ['Garnet 2', 'Garnet 3', 'Garnet 4'].entries()) {
    await addSpot(ana, refId, name);
    await ana.menu('File', 'Save Project');
    await ana.page.waitForTimeout(1500 + i * 100);
  }
  await ana.menu('File', 'View Version History...');
  dlg = ana.page.getByRole('dialog').last();
  await expect(dlg).toBeVisible();
  await dlg.getByRole('button', { name: 'Create Named Version' }).click();
  const named = ana.page.getByRole('dialog', { name: 'Create Named Version' });
  await named.getByLabel(/^Version Name/).fill('Before grain analysis');
  await named.getByRole('button', { name: 'Create' }).click();
  await ana.page.waitForTimeout(1500);
  const items = dlg.locator('li, [role="button"]').filter({ hasText: /Auto-save|Before grain analysis/ });
  await items.nth(2).click().catch(() => undefined);
  await ana.page.waitForTimeout(1500);
  await shot(ana, 'version-history-dialog', dlg);
  await ana.page.keyboard.press('Escape');

  // ---- Eye button of an associated micrograph in the tree
  const eye = ana.page.locator('button:has([data-testid="VisibilityIcon"])').first();
  if (await eye.count()) await shot(ana, 'eye-button', eye, 2);
});
