/**
 * Manual figures for Advanced Tools (section 7): point count, grain detection,
 * Quick Edit, presets, grain size analysis, Image Comparator, StraboTools.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { test, expect } from '../e2e/lib/test';
import { ACCOUNTS } from '../e2e/lib/copy';
import { TOXAWAY, openDemo, setWindowSize, settle, shot, view } from './lib';

const REF = '160327-5 xz Reference Photomicrograph';

test('tools', async ({ launch }) => {
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  // FastSAM model from the author's computer, so Grain Detection offers the AI method
  const model = path.join(os.homedir(), 'Library/Application Support/strabomicro2/models/FastSAM-x.onnx');
  if (fs.existsSync(model)) {
    fs.mkdirSync(path.join(ana.dir, 'userData', 'models'), { recursive: true });
    fs.copyFileSync(model, path.join(ana.dir, 'userData', 'models', 'FastSAM-x.onnx'));
  }
  await setWindowSize(ana, 1600, 1200);
  await openDemo(ana, TOXAWAY);
  await view(ana, REF);
  await ana.state((e) => e.app.getState().setSpotLabelMode('none'));
  await settle(ana, 2000);

  // ---- Grain Size Analysis (the grains of the reference are polygons)
  await ana.menu('Tools', 'Grain Size Analysis...');
  let dlg = ana.page.getByRole('dialog').last();
  await expect(dlg).toBeVisible();
  await ana.page.waitForTimeout(2000);
  await shot(ana, 'grain-size-analysis', dlg);
  // The two charts are canvases: the size histogram, then the rose diagram
  await shot(ana, 'grain-size-histogram', dlg.locator('canvas').nth(0), 6);
  await shot(ana, 'grain-orientation-rose', dlg.locator('canvas').nth(1), 6);
  await ana.page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();

  // ---- Grain Detection (OpenCV, then FastSAM when the model is there)
  await ana.menu('Tools', 'Grain Detection...');
  dlg = ana.page.getByRole('dialog').last();
  await expect(dlg).toBeVisible();
  await dlg.getByRole('button', { name: 'OpenCV' }).click();
  await expect(dlg.getByText(/grains detected/)).toBeVisible({ timeout: 120_000 });
  await ana.page.waitForTimeout(1500);
  await shot(ana, 'grain-detection-opencv-params', dlg);
  const fastsam = dlg.getByRole('button', { name: /FastSAM/ });
  if (await fastsam.isEnabled()) {
    await fastsam.click();
    await expect(dlg.getByText('Detecting grains...')).toBeVisible({ timeout: 30_000 }).catch(() => undefined);
    await expect(dlg.getByText('Detecting grains...')).toHaveCount(0, { timeout: 600_000 });
    await ana.page.waitForTimeout(1500);
    await shot(ana, 'FastSAMGrainDetection', dlg);
  }
  await ana.page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();

  // ---- Point Count (the reference has a session)
  await ana.menu('Tools', 'Point Count...');
  dlg = ana.page.getByRole('dialog').last();
  await expect(dlg).toBeVisible();
  await dlg.getByRole('button', { name: 'Continue' }).click();
  await expect(dlg).toBeHidden();
  await settle(ana, 2500);
  await shot(ana, 'point-count-interface');
  await ana.page.getByRole('button', { name: 'Configure Shortcuts' }).click();
  dlg = ana.page.getByRole('dialog', { name: /Configure Quick Classify Shortcuts/ });
  await expect(dlg).toBeVisible();
  await ana.page.waitForTimeout(500);
  await shot(ana, 'point-count-shortcuts', dlg);
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  await ana.page.keyboard.press('Escape');
  await settle(ana, 1000);

  // ---- Quick Spot Presets (two presets made through the store)
  await ana.state(new Function('e', `
    const s = e.app.getState();
    const now = new Date().toISOString();
    const mk = (id, name, description, color, mineral, spotNamePattern) => ({ id, name, description, spotNamePattern, createdAt: now, modifiedAt: now,
      data: { color, opacity: 0.5, mineralogy: { minerals: [{ name: mineral }] } } });
    s.createPreset(mk('p-grt', 'Garnet porphyroblast', 'Garnet with inclusion trails', '#d9534f', 'Garnet', 'Grt-{n}'), 'global');
    s.createPreset(mk('p-qtz', 'Quartz, recrystallized', 'Dynamically recrystallized quartz', '#5bc0de', 'Quartz', 'Qtz-{n}'), 'global');
    s.createPreset(mk('p-pl', 'Plagioclase', '', '#f0ad4e', 'Plagioclase', 'Pl-{n}'), 'global');
    s.createPreset(mk('p-bt', 'Biotite', 'Biotite in the foliation', '#8a6d3b', 'Biotite', 'Bt-{n}'), 'project');
    s.setPresetKeyBinding('1', 'p-grt'); s.setPresetKeyBinding('2', 'p-qtz'); s.setPresetKeyBinding('3', 'p-pl');
  `) as never);
  await ana.menu('Spot', 'Quick Spot Presets...');
  dlg = ana.page.getByRole('dialog').last();
  await expect(dlg).toBeVisible();
  await ana.page.waitForTimeout(800);
  await shot(ana, 'quick-apply-presets', dlg);
  await ana.page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();

  // ---- Quick Edit
  await ana.menu('Spot', 'Quick Edit Spots...');
  dlg = ana.page.getByRole('dialog').last();
  await expect(dlg).toBeVisible();
  await dlg.getByRole('button', { name: 'Start' }).click();
  await expect(dlg).toBeHidden();
  await settle(ana, 2000);
  await ana.page.keyboard.press('q');
  await ana.page.keyboard.press('q');
  await ana.page.keyboard.press('b');
  await settle(ana, 1500);
  await shot(ana, 'quick-edit-mode');
  await ana.page.keyboard.press('Escape');
  await ana.page.keyboard.press('Escape');
  await settle(ana, 800);

  // ---- Image Comparator (four images)
  await ana.menu('Tools', 'Image Comparator...');
  dlg = ana.page.getByRole('dialog').last();
  await expect(dlg).toBeVisible();
  // The layout toggle's buttons have no names: 2 images, then 4 images
  await dlg.getByRole('group').first().getByRole('button').nth(1).click();
  await expect(dlg.getByRole('combobox')).toHaveCount(4);
  const pickers = dlg.getByRole('combobox');
  const names = [REF, '160327-5 Grt1-ca-ka(sp1)_color_Ca_enhanced', '160327-5 Grt1-fe-ka(sp3)_color', '160327-5 Grt1-mg-ka(sp2)_color'];
  for (let i = 0; i < 4; i++) {
    await pickers.nth(i).click();
    await ana.page.getByRole('option', { name: new RegExp(names[i].replace(/[()]/g, '.')) }).first().click();
    await ana.page.waitForTimeout(500);
  }
  await ana.page.waitForTimeout(3000);
  await shot(ana, 'image-comparator');
  await ana.page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();

  // ---- StraboTools: the four tabs
  await ana.menu('Tools', 'StraboTools...');
  dlg = ana.page.getByRole('dialog').last();
  await expect(dlg).toBeVisible();
  await dlg.getByRole('combobox').first().click();
  await ana.page.getByRole('option', { name: /160327-5 xz Reference/ }).first().click();
  await ana.page.waitForTimeout(4000);
  for (const [tab, file] of [['Edge Fabric', 'strabotools_edgeFabric'], ['Color Index', 'strabotools_colorIndex'],
    ['Edge Detect', 'strabotools_edgeDetect'], ['Mode', 'strabotools_edge']] as const) {
    await dlg.getByRole('tab', { name: tab }).click();
    await ana.page.waitForTimeout(4000);
    await shot(ana, file);
  }
  await ana.page.keyboard.press('Escape');
});
