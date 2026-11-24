/**
 * Manual figures for 2.0.61-2.0.64, on the Concord Gabbro PPL/XPL pair from
 * the Grain Spot demo images (Wikimedia Commons, "Concord Gabbro PPL.jpg" and
 * "Concord Gabbro XPL.jpg" by Bwooddell, CC BY-SA 4.0; credited in the captions):
 *
 *  - placement-ppl-xpl: Edit Micrograph Location of a PPL detail on the pair,
 *    with the XPL shown behind it (section 5)
 *  - grain-size-analysis (+ grain-size-histogram, grain-orientation-rose):
 *    a saved analysis with the Mineral filter on (section 7)
 *  - grain-analysis-saved: saved analyses in the right pane (section 7)
 *  - mineralogy-colors: the Minerals list with color swatches (section 6)
 *
 * Grains are outlined with Grain Spot (model from the e2e cache, or
 * MANUAL_GRAIN_MODEL); the minerals given to them are for illustration.
 *
 *   npm run manual:screenshots -- release2064
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { test, expect } from '../e2e/lib/test';
import { ACCOUNTS } from '../e2e/lib/copy';
import { makeProject } from '../e2e/lib/fixtures';
import { openSmz, viewMicrograph } from '../e2e/lib/actions';
import { setWindowSize, settle, shot, shotRect, unionBox } from './lib';

const IMAGES = process.env.MANUAL_GABBRO_DIR || path.join(os.homedir(), 'Desktop', 'GrainSpotDemoImages');
const PPL = path.join(IMAGES, '03-color-gabbro-Concord-PPL.jpg');
const XPL = path.join(IMAGES, '03-color-gabbro-Concord-XPL.jpg');
const MODEL = process.env.MANUAL_GRAIN_MODEL || path.join(os.homedir(), '.cache', 'strabomicro-e2e', 'sam2.1-hiera-tiny-fp32');

/** Parent size in the project (the 3024 x 4032 originals scaled down) */
const W = 1800;
const H = 2400;
const SCALE = 3000; // parent px/cm: about 6 mm across, a real gabbro grain size
/** The detail: a rectangle of the parent (parent px), cut from the full-resolution PPL */
const DETAIL = { x: 760, y: 1040, w: 380, h: 285 };
const FULL = 3024 / W; // original px per parent px

const MINERALS = ['Plagioclase', 'Plagioclase', 'Clinopyroxene', 'Plagioclase', 'Olivine', 'Clinopyroxene'];

test('2.0.61-2.0.64 figures', async ({ launch, runDir }) => {
  for (const f of [PPL, XPL]) if (!fs.existsSync(f)) throw new Error(`image missing: ${f} (set MANUAL_GABBRO_DIR)`);
  if (!fs.existsSync(MODEL)) throw new Error(`Grain Spot model missing: ${MODEL} (run e2e 19 once, or set MANUAL_GRAIN_MODEL)`);

  const ppl = await sharp(PPL).rotate().resize(W, H).jpeg({ quality: 90 }).toBuffer();
  const xpl = await sharp(XPL).rotate().resize(W, H).jpeg({ quality: 90 }).toBuffer();
  const detailW = Math.round(DETAIL.w * FULL);
  const detailH = Math.round(DETAIL.h * FULL);
  const detail = await sharp(PPL).rotate()
    .extract({ left: Math.round(DETAIL.x * FULL), top: Math.round(DETAIL.y * FULL), width: detailW, height: detailH })
    .jpeg({ quality: 92 }).toBuffer();

  const overviewId = randomUUID();
  const xplId = randomUUID();
  const detailId = randomUUID();
  const common = {
    opacity: 1, polish: false, description: '', notes: '', spots: [], orientationInfo: { orientationMethod: 'unoriented' },
    associatedFiles: [], links: [], isMicroVisible: true, isExpanded: false, isSpotExpanded: false, isFlipped: false, tags: [],
  };
  const p = await makeProject(`${runDir}/fixtures`, 'Concord Gabbro', [], {
    overviewId,
    overview: { name: 'Gabbro PPL', width: W, height: H, imageWidth: W, imageHeight: H, scalePixelsPerCentimeter: SCALE, siblingImageId: xplId, isPrimarySibling: true },
    overviewImage: ppl,
    micrographs: [
      {
        ...common, id: xplId, name: 'Gabbro XPL', imageType: 'Cross Polarized Light', width: W, height: H, imageWidth: W, imageHeight: H,
        scalePixelsPerCentimeter: SCALE, siblingImageId: overviewId, isPrimarySibling: false,
      },
      {
        ...common, id: detailId, name: 'Plagioclase detail', parentID: overviewId, imageType: 'Plane Polarized Light',
        width: detailW, height: detailH, imageWidth: detailW, imageHeight: detailH,
      },
    ],
    images: { [xplId]: xpl, [detailId]: detail },
  });

  const ana = await launch('Ana', ACCOUNTS.ana, { login: false, env: { STRABO_GRAIN_MODEL_DIR: MODEL } });
  await setWindowSize(ana, 1600, 1200);
  await openSmz(ana, p.smzPath, p.id);
  const page = ana.page;

  // ---- placement-ppl-xpl: the detail placed on the PPL, XPL shown behind it
  await page.getByText('Gabbro PPL (Reference)', { exact: true }).locator('xpath=..')
    .locator('[data-testid="ChevronRightIcon"]').first().click();
  await page.getByText('Plagioclase detail', { exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Edit Micrograph Location' });
  await expect(edit).toBeVisible();
  await edit.getByRole('radio', { name: 'Locate as a scaled rectangle' }).check();
  await edit.getByRole('button', { name: 'Next' }).click();
  await edit.getByRole('radio', { name: 'Pixel Conversion Factor' }).check();
  await edit.getByRole('button', { name: 'Next' }).click();
  const canvas = edit.getByTestId('placement-canvas');
  await expect(canvas).toHaveAttribute('data-showing', 'PPL', { timeout: 60_000 });
  await expect(edit.getByLabel('X (px)')).toBeEnabled({ timeout: 30_000 });
  // detail px per cm = parent px/cm * (original px per parent px); 1000 μm = 0.1 cm
  await edit.getByLabel('Number of Pixels').fill(String(Math.round(SCALE * FULL * 0.1)));
  await edit.getByLabel('Physical Length').fill('1000');
  await edit.getByLabel('X (px)').fill(String(DETAIL.x));
  await edit.getByLabel('Y (px)').fill(String(DETAIL.y));
  await edit.getByLabel('Y (px)').press('Enter');
  await edit.getByTestId('placement-backdrop-partner').click();
  await expect(canvas).toHaveAttribute('data-showing', 'XPL');
  // Away from the switch, so its tooltip is not in the figure
  const title = await edit.getByText('Edit Micrograph Location', { exact: true }).boundingBox();
  if (title) await page.mouse.move(title.x + 5, title.y + 5, { steps: 3 });
  await expect(page.locator('.MuiTooltip-popper')).toHaveCount(0);
  await settle(ana, 2500);
  await shot(ana, 'placement-ppl-xpl', edit);
  await edit.getByRole('button', { name: /^(Save|Finish)$/ }).click();
  await expect(edit).toHaveCount(0);

  // ---- Grains on the PPL with Grain Spot in auto spot mode
  await viewMicrograph(ana, overviewId);
  await ana.state((e) => e.app.getState().setSpotLabelMode('none'));
  await settle(ana, 1500);
  await page.getByRole('button', { name: 'Auto spot mode' }).click();
  await page.getByRole('button', { name: 'Grain Spot tool' }).click();
  await expect.poll(() => ana.state((e) => e.grain.getState().phase), { timeout: 120_000 }).toBe('ready');
  const viewer = await page.locator('.tiled-viewer').first().boundingBox();
  if (!viewer) throw new Error('no viewer');
  const spotCount = () => ana.state(new Function('e', `
    const m = e.app.getState().micrographIndex.get(${JSON.stringify(overviewId)});
    return m?.spots?.length ?? 0;`) as never) as Promise<number>;
  // The portrait image fits the viewer's height, centered
  const imgW = viewer.height * (W / H);
  const x0 = viewer.x + (viewer.width - imgW) / 2;
  await page.mouse.move(viewer.x + 10, viewer.y + viewer.height - 10, { steps: 3 });
  // The thin section is a round field of view in the middle of the image: click inside it only
  const cx = 0.5 * W;
  const cy = 0.5 * H;
  const radius = 0.4 * W;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const px = cx - radius + (col + 0.5 + (row % 2) * 0.3) * (2 * radius / 8);
      const py = cy - radius + (row + 0.5) * (2 * radius / 8);
      if (Math.hypot(px - cx, py - cy) > radius * 0.95) continue;
      const before = await spotCount();
      await page.mouse.click(x0 + imgW * (px / W), viewer.y + viewer.height * (py / H));
      await expect.poll(spotCount, { timeout: 10_000 }).toBeGreaterThan(before).catch(() => undefined);
    }
  }
  await page.getByRole('button', { name: 'Auto spot mode' }).click();
  await ana.state((e) => e.app.getState().setActiveTool('select'));
  // Drop outlines that are not one grain (more than 2% of the image), then renumber
  await ana.state(new Function('e', `
    const st = e.app.getState();
    const m = st.micrographIndex.get(${JSON.stringify(overviewId)});
    const area = (spot) => {
      const ring = spot.geometry?.coordinates?.[0] ?? (spot.points || []).map((q) => [q.X, q.Y]);
      let a = 0;
      for (let i = 0; i < ring.length; i++) { const [x1, y1] = ring[i]; const [x2, y2] = ring[(i + 1) % ring.length]; a += x1 * y2 - x2 * y1; }
      return Math.abs(a) / 2;
    };
    for (const spot of [...(m.spots || [])]) if (area(spot) > 0.02 * ${W * H}) st.deleteSpot(spot.id);
    const left = st.micrographIndex.get(${JSON.stringify(overviewId)}).spots || [];
    left.forEach((spot, i) => st.updateSpotData(spot.id, { name: 'Grain ' + (i + 1) }));`) as never);
  const made = await spotCount();
  expect(made).toBeGreaterThan(15);

  // Minerals (for illustration) and two tags
  await ana.state(new Function('e', `
    const st = e.app.getState();
    st.createTag({ id: 'tag-cumulate', name: 'Cumulate texture', tagType: 'other', fillColor: '#2e7d32', lineColor: '#000000', transparency: 100, tagSize: 10, spotIDs: [] });
    st.createTag({ id: 'tag-altered', name: 'Altered rim', tagType: 'other', fillColor: '#aa3333', lineColor: '#000000', transparency: 100, tagSize: 10, spotIDs: [] });
    const minerals = ${JSON.stringify(MINERALS)};
    const m = st.micrographIndex.get(${JSON.stringify(overviewId)});
    (m.spots || []).forEach((spot, i) => {
      const name = minerals[i % minerals.length];
      const amount = i === 0 ? [{ name, operator: 'eq', percentage: 85 }, { name: 'Clinopyroxene', operator: 'lt', percentage: 10 }, { name: 'Magnetite', operator: '', percentage: null }] : [{ name, operator: '', percentage: null }];
      st.updateSpotData(spot.id, {
        mineralogy: { minerals: amount, mineralogyMethod: null, percentageCalculationMethod: null, notes: null },
        tags: i % 3 === 0 ? ['tag-cumulate'] : i % 4 === 1 ? ['tag-altered'] : [],
      });
    });`) as never);
  await settle(ana, 1000);

  // ---- Grain Size Analysis: a saved Plagioclase analysis, Mineral filter on
  await ana.menu('Tools', 'Grain Size Analysis...');
  const dlg = page.getByRole('dialog').filter({ hasText: 'Rock Type' }).last();
  await expect(dlg).toBeVisible();
  await dlg.getByRole('radio', { name: 'Igneous' }).check();

  // Clinopyroxene first, then Plagioclase (the one shown)
  async function saveFor(mineral: string, name: string): Promise<void> {
    await dlg.getByRole('radio', { name: 'Selected spots' }).check();
    const clear = dlg.getByRole('button', { name: 'Clear filters' });
    if (await clear.count()) await clear.click();
    await dlg.getByRole('button', { name: 'Select None', exact: true }).click();
    await dlg.getByTestId('grain-filter-mineral').click();
    await page.getByRole('option', { name: mineral, exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await dlg.getByRole('button', { name: 'Check Shown', exact: true }).click();
    await dlg.getByRole('button', { name: 'Save As...' }).click();
    const prompt = page.getByRole('dialog', { name: 'Save Analysis' });
    await prompt.getByLabel('Name').fill(name);
    await prompt.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(prompt).toHaveCount(0);
    await expect(dlg.getByText(`Grain Size Analysis: ${name}`)).toBeVisible();
  }
  await saveFor('Clinopyroxene', 'Clinopyroxene');
  // Back to a new analysis for the second
  await dlg.getByTestId('grain-analysis-pick').click();
  await page.getByRole('option', { name: 'New analysis (not saved)' }).click();
  await saveFor('Plagioclase', 'Plagioclase');
  await page.waitForTimeout(2000);
  await shot(ana, 'grain-size-analysis', dlg);
  await shot(ana, 'grain-size-histogram', dlg.locator('canvas').nth(0), 6);
  await shot(ana, 'grain-orientation-rose', dlg.locator('canvas').nth(1), 6);
  await dlg.getByRole('button').first().click(); // the close (X) in the title
  await expect(dlg).toHaveCount(0);

  // ---- grain-analysis-saved: the micrograph's saved analyses in the right pane
  await ana.state((e) => e.app.getState().selectActiveSpot(null));
  await settle(ana, 800);
  const sections = page.getByTestId('saved-grain-analysis');
  await expect(sections).toHaveCount(2);
  const plag = sections.filter({ hasText: 'Grain Size: Plagioclase' });
  await plag.getByText('Grain Size: Plagioclase').click();
  await expect(plag.getByRole('button', { name: 'Open Full Analysis...' })).toBeVisible();
  await settle(ana, 800);
  const box = await unionBox(sections.nth(0), sections.nth(1));
  await shotRect(ana, 'grain-analysis-saved', { x: box.x - 8, y: box.y, width: box.width + 16, height: box.height + 8 });

  // ---- mineralogy-colors: the first spot's minerals with their colors
  await ana.state(new Function('e', `
    const m = e.app.getState().micrographIndex.get(${JSON.stringify(overviewId)});
    return e.app.getState().selectActiveSpot(m.spots[0].id);`) as never);
  await expect(page.getByText('Spot Details')).toBeVisible();
  await settle(ana, 800);
  await page.getByPlaceholder('Select or search data type...').click();
  await page.getByRole('option', { name: 'Mineralogy/Lithology', exact: true }).click();
  const min = page.getByRole('dialog').last();
  const note = min.getByText('In View Spots by Mineral Color, a spot takes the color of its first mineral.');
  await expect(note).toBeVisible();
  await settle(ana, 600);
  const minBox = await unionBox(min.getByText('Minerals', { exact: true }), note);
  await shotRect(ana, 'mineralogy-colors', { x: minBox.x - 16, y: minBox.y - 12, width: minBox.width + 32, height: minBox.height + 24 });
  await min.getByRole('button', { name: 'Cancel' }).click();
});
