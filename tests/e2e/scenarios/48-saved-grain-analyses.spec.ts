/**
 * Saved Grain Size analyses (Claire's issue #64, 2026-11-23). In Grain Size
 * Analysis: the spot-list filters (Mineral, Tag) narrow the list, Check Shown
 * checks what is shown; Save As... keeps the checked spots and the rock type
 * with the micrograph ("Current micrograph") or the project ("All
 * micrographs"); Save, Rename..., Delete...; each saved analysis is listed in
 * the right pane and opens from there; a deleted spot drops out with a notice;
 * Export PDF writes a PDF; each chart downloads as SVG or PNG. One copy, not synced.
 */

import fs from 'fs';
import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { openSmz, viewMicrograph } from '../lib/actions';

type Saved = { id: string; name: string; spotIds: string[]; rockType: string };

/** Add a w x h rectangle polygon spot, with a mineral and tags */
async function addGrain(copy: Copy, micrographId: string, name: string, x: number, w: number, h: number, mineral: string | null, tags: string[]) {
  const id = `grain-${name}`;
  const now = new Date().toISOString();
  const spot = {
    id, name, labelColor: '0xffffffff', showLabel: true, color: '0x00ff00ff', opacity: 50, date: now, time: now, notes: '',
    modifiedTimestamp: Date.now(), geometryType: 'polygon',
    points: [{ X: x, Y: 100 }, { X: x + w, Y: 100 }, { X: x + w, Y: 100 + h }, { X: x, Y: 100 + h }],
    associatedFiles: [], links: [], tags,
    ...(mineral ? { mineralogy: { minerals: [{ name: mineral }] } } : {}),
  };
  await copy.state(new Function('e', `e.app.getState().addSpot(${JSON.stringify(micrographId)}, ${JSON.stringify(spot)})`) as never);
  return id;
}

function micrographAnalyses(copy: Copy, micrographId: string): Promise<Saved[]> {
  return copy.state(new Function('e', `
    return e.app.getState().micrographIndex.get(${JSON.stringify(micrographId)})?.grainAnalyses ?? [];`) as never) as Promise<Saved[]>;
}

/** Polygon spots (not archived) in the whole project; the fixture brings some of its own */
function polygonCount(copy: Copy): Promise<number> {
  return copy.state(new Function('e', `
    let n = 0;
    for (const m of e.app.getState().micrographIndex.values()) {
      for (const s of m.spots ?? []) if (/polygon/i.test(s.geometryType ?? '') && !s.archived) n++;
    }
    return n;`) as never) as Promise<number>;
}

function projectAnalyses(copy: Copy): Promise<Saved[]> {
  return copy.state(new Function('e', `return e.app.getState().project?.grainAnalyses ?? [];`) as never) as Promise<Saved[]>;
}

const grainDialog = (copy: Copy) => copy.page.getByRole('dialog', { name: /^Grain Size Analysis/ });

async function openGrainDialog(copy: Copy) {
  await copy.page.evaluate(() => window.dispatchEvent(new CustomEvent('open-grain-size-analysis')));
  await expect(grainDialog(copy)).toBeVisible();
}

/** Choose options in one of the spot-list filters, then close its menu */
async function filterBy(copy: Copy, testId: string, options: string[]) {
  await grainDialog(copy).getByTestId(testId).click();
  for (const o of options) await copy.page.getByRole('option', { name: o }).click();
  await copy.page.keyboard.press('Escape');
}

/**
 * Save As... with a name, confirmed with the Save button or the Enter key.
 * Enter once closed the prompt and then "clicked" Save As... again (focus
 * went back to it), so the prompt came back as "Analysis 1" (Claire,
 * 2026-11-23); the prompt must stay closed.
 */
async function saveAs(copy: Copy, name: string, confirm: 'button' | 'enter' = 'button') {
  await grainDialog(copy).getByRole('button', { name: 'Save As...' }).click();
  const prompt = copy.page.getByRole('dialog', { name: 'Save Analysis' });
  await prompt.getByTestId('grain-analysis-name').fill(name);
  if (confirm === 'enter') await prompt.getByTestId('grain-analysis-name').press('Enter');
  else await prompt.getByRole('button', { name: 'Save' }).click();
  await expect(prompt).toHaveCount(0);
  // Long enough for a reopened prompt to show
  await copy.page.waitForTimeout(500);
  await expect(prompt).toHaveCount(0);
}

test('micrograph analyses: filters, Save As, Save, Rename, right pane, PDF, deleted spot, Delete', async ({ launch, project, runDir }) => {
  const p = await project('E2E Saved Grain Analyses');
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await viewMicrograph(ana, p.micrographId);
  await ana.state(new Function('e', `
    const st = e.app.getState();
    st.createTag({ id: 'tag-d1', name: 'D1', tagType: 'other', fillColor: '#aa3333', lineColor: '#000000', transparency: 100, tagSize: 10, spotIDs: [] });
    st.createTag({ id: 'tag-d2', name: 'D2', tagType: 'other', fillColor: '#3333aa', lineColor: '#000000', transparency: 100, tagSize: 10, spotIDs: [] });`) as never);
  const q1 = await addGrain(ana, p.micrographId, 'Q1', 100, 200, 40, 'Quartz', ['tag-d1']);
  const q2 = await addGrain(ana, p.micrographId, 'Q2', 400, 160, 50, 'Quartz', ['tag-d2']);
  const f1 = await addGrain(ana, p.micrographId, 'F1', 700, 90, 80, 'Feldspar', ['tag-d2']);
  await addGrain(ana, p.micrographId, 'U1', 900, 60, 60, null, []);
  const total = await polygonCount(ana);

  await ana.caption('Selected spots: filter by Quartz, Select None then Check Shown = the two quartz grains');
  await openGrainDialog(ana);
  const dlg = grainDialog(ana);
  await dlg.getByLabel('Selected spots').check();
  await dlg.getByRole('button', { name: 'Select None' }).click();
  await filterBy(ana, 'grain-filter-mineral', ['Quartz']);
  await expect(dlg.getByTestId('grain-spot-count')).toHaveText(`0 of ${total} polygon spots checked · 2 shown`);
  await dlg.getByRole('button', { name: 'Check Shown', exact: true }).click();
  await expect(dlg.getByTestId('grain-spot-count')).toHaveText(`2 of ${total} polygon spots checked · 2 shown`);
  await dlg.getByLabel('Metamorphic').check();

  await ana.caption('Save As... "Quartz": kept on the micrograph with its two spots and the rock type');
  await saveAs(ana, 'Quartz');
  await expect.poll(() => micrographAnalyses(ana, p.micrographId)).toMatchObject([
    { name: 'Quartz', spotIds: [q1, q2], rockType: 'metamorphic' },
  ]);
  await expect(dlg.locator('h2').first()).toContainText('Grain Size Analysis: Quartz');

  await ana.caption('a taken name is refused');
  await dlg.getByRole('button', { name: 'Save As...' }).click();
  let prompt = ana.page.getByRole('dialog', { name: 'Save Analysis' });
  await prompt.getByTestId('grain-analysis-name').fill('quartz');
  await expect(prompt.getByText('An analysis with this name is already saved here.')).toBeVisible();
  await expect(prompt.getByRole('button', { name: 'Save' })).toBeDisabled();
  await prompt.getByRole('button', { name: 'Cancel' }).click();

  await ana.caption('a change: Save lights up and saves it');
  await expect(dlg.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await dlg.getByLabel('Igneous').check();
  await expect(dlg.getByText('Changed since it was saved.')).toBeVisible();
  await dlg.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(async () => (await micrographAnalyses(ana, p.micrographId))[0]?.rockType).toBe('igneous');

  await ana.caption('Rename... to "Quartz D1+D2"');
  await dlg.getByRole('button', { name: 'Rename...' }).click();
  prompt = ana.page.getByRole('dialog', { name: 'Rename Analysis' });
  await prompt.getByTestId('grain-analysis-name').fill('Quartz D1+D2');
  await prompt.getByRole('button', { name: 'Rename' }).click();
  await expect.poll(async () => (await micrographAnalyses(ana, p.micrographId))[0]?.name).toBe('Quartz D1+D2');

  await ana.caption('a second one from the working list: tag D2 = Q2 + F1');
  await dlg.getByTestId('grain-analysis-pick').click();
  await ana.page.getByRole('option', { name: 'New analysis (not saved)' }).click();
  await expect(dlg.locator('h2').first()).toHaveText('Grain Size Analysis');
  // The Mineral filter is still on: Clear filters, then start from nothing
  await dlg.getByRole('button', { name: 'Clear filters' }).click();
  await dlg.getByRole('button', { name: 'Select None' }).click();
  await filterBy(ana, 'grain-filter-tag', ['D2']);
  await dlg.getByRole('button', { name: 'Check Shown', exact: true }).click();
  await saveAs(ana, 'D2 grains');
  await expect.poll(async () => (await micrographAnalyses(ana, p.micrographId)).map((a) => [a.name, a.spotIds])).toEqual([
    ['Quartz D1+D2', [q1, q2]],
    ['D2 grains', [q2, f1]],
  ]);

  await ana.caption('Export PDF writes a PDF');
  const pdf = `${runDir}/grain-analysis.pdf`;
  await ana.answerDialog({ kind: 'save', filePath: pdf });
  await dlg.getByRole('button', { name: 'Export PDF' }).click();
  await expect.poll(() => fs.existsSync(pdf) && fs.readFileSync(pdf).subarray(0, 5).toString()).toBe('%PDF-');

  await ana.caption('each chart downloads as SVG or PNG');
  const svgFile = `${runDir}/histogram.svg`;
  await ana.answerDialog({ kind: 'save', filePath: svgFile });
  await dlg.getByTestId('download-histogram').click();
  await ana.page.getByRole('menuitem', { name: /SVG image/ }).click();
  await expect.poll(() => fs.existsSync(svgFile) && fs.readFileSync(svgFile, 'utf8').includes('>Equivalent Diameter</text>')).toBe(true);
  const pngFile = `${runDir}/rose.png`;
  await ana.answerDialog({ kind: 'save', filePath: pngFile });
  await dlg.getByTestId('download-rose').click();
  await ana.page.getByRole('menuitem', { name: /PNG image/ }).click();
  await expect.poll(() => fs.existsSync(pngFile) && fs.readFileSync(pngFile).subarray(1, 4).toString()).toBe('PNG');
  await dlg.getByRole('button', { name: 'Close', exact: true }).click();

  await ana.caption('right pane: one section per saved analysis; Open Full Analysis... opens that one');
  const sections = ana.page.getByTestId('saved-grain-analysis');
  await expect(sections).toHaveCount(2);
  await expect(sections.nth(0)).toContainText('Grain Size: Quartz D1+D2');
  await expect(sections.nth(1)).toContainText('Grain Size: D2 grains');
  await expect(sections.nth(1)).toContainText('2 grains');
  await sections.nth(1).getByRole('button', { name: /Grain Size: D2 grains/ }).click();
  await sections.nth(1).getByRole('button', { name: 'Open Full Analysis...' }).click();
  await expect(dlg.locator('h2').first()).toContainText('Grain Size Analysis: D2 grains');
  await expect(dlg.getByTestId('grain-spot-count')).toHaveText(`2 of ${total} polygon spots checked`);
  await dlg.getByRole('button', { name: 'Close', exact: true }).click();

  await ana.caption('a deleted spot drops out, with a notice');
  await ana.state(new Function('e', `e.app.getState().deleteSpot(${JSON.stringify(f1)})`) as never);
  await expect(sections.nth(1)).toContainText('1 grain');
  await sections.nth(1).getByRole('button', { name: 'Open Full Analysis...' }).click();
  await expect(dlg.getByText('1 spot saved in this analysis no longer exists (deleted or archived) and is left out.')).toBeVisible();

  await ana.caption('Delete... removes the saved analysis, not the spots');
  await dlg.getByRole('button', { name: 'Delete...' }).click();
  await ana.page.getByRole('dialog', { name: 'Delete Saved Analysis' }).getByRole('button', { name: 'Delete' }).click();
  await expect.poll(async () => (await micrographAnalyses(ana, p.micrographId)).map((a) => a.name)).toEqual(['Quartz D1+D2']);
  await expect(dlg.locator('h2').first()).toHaveText('Grain Size Analysis');
  await dlg.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(sections).toHaveCount(1);
});

test('All micrographs: saved with the project, listed on the Project tab', async ({ launch, project }) => {
  const p = await project('E2E Saved Grain Analyses Project');
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await viewMicrograph(ana, p.micrographId);
  await addGrain(ana, p.micrographId, 'A', 100, 200, 40, 'Quartz', []);
  await addGrain(ana, p.micrographId, 'B', 400, 120, 60, 'Quartz', []);
  const total = await polygonCount(ana);

  await ana.caption('All micrographs + All spots, Save As... "Whole project" (Enter key)');
  await openGrainDialog(ana);
  const dlg = grainDialog(ana);
  await dlg.getByLabel('All micrographs').check();
  await dlg.getByLabel('All spots').check();
  await expect(dlg.getByText('All-micrograph analyses are saved with the project.')).toBeVisible();
  await saveAs(ana, 'Whole project', 'enter');
  await expect.poll(async () => (await projectAnalyses(ana)).map((a) => [a.name, a.spotIds.length])).toEqual([['Whole project', total]]);
  await expect.poll(async () => (await micrographAnalyses(ana, p.micrographId)).length).toBe(0);

  await ana.caption('Current micrograph lists only the micrograph\'s own (none)');
  await dlg.getByLabel('Current micrograph').check();
  await dlg.getByTestId('grain-analysis-pick').click();
  await expect(ana.page.getByRole('option')).toHaveCount(1);
  await ana.page.keyboard.press('Escape');
  await dlg.getByRole('button', { name: 'Close', exact: true }).click();

  await ana.caption('the Project tab lists it');
  await ana.page.getByRole('tab', { name: 'Project' }).click();
  await expect(ana.page.getByTestId('saved-grain-analysis')).toContainText('Grain Size: Whole project');
  await expect(ana.page.getByTestId('saved-grain-analysis')).toContainText(`${total} grains`);
});
