/**
 * PPL/XPL siblings made by each path the app offers end up the same way:
 * the XPL (secondary) has the PPL's parent and placement, and the project
 * is not refused for export or upload as "missing required location".
 * Paths: tree > Link Sibling PPL/XPL Image (on micrographs placed earlier,
 * as after a batch import) and tree + > Add Corresponding XPL Image. The
 * New Micrograph wizard copies the whole micrograph and is not repeated
 * here. Found 2026-10-06 (Daniel Ortega-Arroyo: an XPL placed on its PPL
 * reference, then linked, could not be uploaded and was hidden in the tree).
 * Needs no server work: one copy, not synced. The last test opens a project
 * saved by the old Link Sibling (what Daniel has) and checks the repair on
 * load; it also leaves that project in test-results/sibling-broken-project.smz
 * for opening by hand.
 */

import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { makeProject, writeImage, type FixtureProject } from '../lib/fixtures';
import { openSmz, viewMicrograph } from '../lib/actions';

type Placement = 'reference' | 'offset' | 'affine';

const PLACEMENT_KEYS = ['parentID', 'offsetInParent', 'pointInParent', 'rotation', 'placementType', 'affineMatrix'] as const;

/**
 * A micrograph as Batch Import and then the location dialog leave it:
 * a 1600 x 1200 image on the overview, at full size (offset) or a quarter
 * (affine), or its own reference. Returns its id.
 */
async function placeMicrograph(copy: Copy, p: FixtureProject, imagePath: string, name: string,
  imageType: 'Plane Polarized Light' | 'Cross Polarized Light', placement: Placement, parentId = p.micrographId): Promise<string> {
  await copy.caption(`micrograph '${name}' (${placement})`);
  const id = crypto.randomUUID();
  const placed = placement === 'reference'
    ? {}
    : placement === 'affine'
      ? { parentID: parentId, placementType: 'affine', affineMatrix: [0.25, 0, 400, 0, 0.25, 300], affineTileHash: id,
        affineBoundsOffset: { x: 400, y: 300 }, affineTransformedWidth: 400, affineTransformedHeight: 300 }
      : { parentID: parentId, offsetInParent: { X: 0, Y: 0 }, rotation: 0 };
  const micrograph = {
    id, name, imagePath: id, imageWidth: 1600, imageHeight: 1200, width: 1600, height: 1200, opacity: 1,
    imageType, scalePixelsPerCentimeter: placement === 'affine' ? 160000 : 40000, ...placed,
    orientationInfo: { orientationMethod: 'unoriented' }, spots: [], associatedFiles: [], links: [], tags: [],
    isMicroVisible: true, isExpanded: true, isSpotExpanded: false, isFlipped: false,
  };
  await copy.state(new Function('e', `return (async () => {
    const project = e.app.getState().project;
    const scratch = await window.api.convertToScratchJPEG(${JSON.stringify(imagePath)});
    await window.api.moveFromScratch(scratch.identifier, project.id, ${JSON.stringify(id)});
    e.app.getState().addMicrograph(${JSON.stringify(p.sampleId)}, ${JSON.stringify(micrograph)});
  })()`) as never);
  return id;
}

/** Open the overview's children in the tree */
async function expandOverview(copy: Copy, p: FixtureProject): Promise<void> {
  await copy.state(new Function('e', `return e.app.getState().updateMicrographMetadata(${JSON.stringify(p.micrographId)}, { isExpanded: true })`) as never);
}

function treeRow(copy: Copy, rowText: string) {
  return copy.page.getByText(rowText, { exact: true }).locator('xpath=../..');
}

/** Tree three-dot menu > Link Sibling PPL/XPL Image, pick `candidate`, Link Images */
async function linkSibling(copy: Copy, rowText: string, candidate: string): Promise<void> {
  await copy.caption(`links '${candidate}' as the sibling of '${rowText}'`);
  await treeRow(copy, rowText).locator('button:has([data-testid="MoreVertIcon"])').first().click();
  await copy.page.getByRole('menuitem', { name: 'Link Sibling PPL/XPL Image' }).click();
  const dialog = copy.page.getByRole('dialog', { name: 'Link Sibling PPL/XPL Image' });
  await dialog.getByText(candidate, { exact: true }).click();
  await dialog.getByRole('button', { name: 'Link Images' }).click();
  await expect(dialog).toBeHidden();
}

/** Tree three-dot menu > Unlink Sibling Image */
async function unlinkSibling(copy: Copy, rowText: string): Promise<void> {
  await copy.caption(`unlinks the sibling of '${rowText}'`);
  await treeRow(copy, rowText).locator('button:has([data-testid="MoreVertIcon"])').first().click();
  await copy.page.getByRole('menuitem', { name: 'Unlink Sibling Image' }).click();
}

/** Tree + > Add Corresponding XPL Image, pick the image file, Add XPL Image */
async function addCorrespondingXpl(copy: Copy, rowText: string, imagePath: string): Promise<void> {
  await copy.caption(`adds a corresponding XPL image to '${rowText}'`);
  await treeRow(copy, rowText).locator('button:has([data-testid="AddIcon"])').first().click();
  await copy.page.getByRole('menuitem', { name: 'Add Corresponding XPL Image' }).click();
  const dialog = copy.page.getByRole('dialog', { name: 'Add Corresponding XPL Image' });
  await copy.answerDialog({ kind: 'open', filePaths: [imagePath] });
  await dialog.getByRole('button', { name: 'Select XPL Image...' }).click();
  const add = dialog.getByRole('button', { name: 'Add XPL Image' });
  await expect(add).toBeEnabled({ timeout: 30_000 });
  await add.click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
}

/** The pair's placement fields as the store has them (null for absent) */
async function pair(copy: Copy, pplId: string) {
  return copy.state(new Function('e', `
    const index = e.app.getState().micrographIndex;
    const ppl = index.get(${JSON.stringify(pplId)});
    const xpl = ppl && ppl.siblingImageId ? index.get(ppl.siblingImageId) : null;
    const pick = (m) => m ? Object.fromEntries(${JSON.stringify(PLACEMENT_KEYS)}.map((k) => [k, m[k] ?? null])) : null;
    return { ppl: pick(ppl), xpl: pick(xpl), xplId: xpl ? xpl.id : null,
      roles: [ppl && ppl.isPrimarySibling, xpl && xpl.isPrimarySibling] };
  `) as never) as Promise<{ ppl: Record<string, unknown> | null; xpl: Record<string, unknown> | null; xplId: string | null; roles: unknown[] }>;
}

/**
 * File > Export as .smz...: the names the "Cannot export project" dialog
 * lists (the same check as Upload to Strabo Server on develop), or [] when
 * the export dialog opens. Either dialog is closed again.
 */
async function refusedOnExport(copy: Copy): Promise<string[]> {
  await copy.menu('File', 'Export as .smz...');
  const refused = copy.page.getByRole('dialog', { name: 'Cannot export project' });
  const exportDialog = copy.page.getByRole('dialog', { name: 'Export Project as .smz' });
  await expect(refused.or(exportDialog)).toBeVisible();
  if (await exportDialog.isVisible()) {
    await copy.page.keyboard.press('Escape');
    await expect(exportDialog).toBeHidden();
    return [];
  }
  const names = await refused.locator('li').allInnerTexts();
  await refused.getByRole('button', { name: 'OK' }).click();
  await expect(refused).toBeHidden();
  return names.map((n) => n.replace(/\s+/g, ' ').trim());
}

async function start(launch: (l: string, a: typeof ACCOUNTS.ana, o?: { login?: boolean }) => Promise<Copy>,
  project: (name: string) => Promise<FixtureProject>, name: string) {
  const p = await project(name);
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await expandOverview(ana, p);
  return { p, ana };
}

test('Link Sibling: an XPL placed on its own PPL reference (batch import, then located)', async ({ launch, project, runDir }) => {
  const { p, ana } = await start(launch, project, 'E2E Siblings Placed On PPL');
  const img = await writeImage(`${runDir}/images/overview-xpl.jpg`);
  const xplId = await placeMicrograph(ana, p, img, 'Overview XPL', 'Cross Polarized Light', 'offset');
  expect(await refusedOnExport(ana)).toEqual([]);

  await linkSibling(ana, 'Overview (Reference)', 'Overview XPL');
  const linked = await pair(ana, p.micrographId);
  expect(linked.xplId).toBe(xplId);
  expect(linked.roles).toEqual([true, false]);
  expect.soft(linked.xpl).toEqual(linked.ppl);
  expect.soft(await refusedOnExport(ana)).toEqual([]);

  // Unlinking leaves the XPL where the pair was, not without a location
  await unlinkSibling(ana, 'Overview (Reference)');
  expect.soft(await refusedOnExport(ana)).toEqual([]);
});

test('Link Sibling: an XPL imported as its own reference', async ({ launch, project, runDir }) => {
  const { p, ana } = await start(launch, project, 'E2E Siblings Two References');
  const img = await writeImage(`${runDir}/images/overview-xpl.jpg`);
  await placeMicrograph(ana, p, img, 'Overview XPL', 'Cross Polarized Light', 'reference');

  await linkSibling(ana, 'Overview (Reference)', 'Overview XPL');
  const linked = await pair(ana, p.micrographId);
  expect.soft(linked.xpl).toEqual(linked.ppl);
  expect.soft(await refusedOnExport(ana)).toEqual([]);
});

for (const placement of ['offset', 'affine'] as const) {
  test(`Link Sibling: a PPL placed on the overview (${placement}), its XPL a separate reference`, async ({ launch, project, runDir }) => {
    const { p, ana } = await start(launch, project, `E2E Siblings Link ${placement}`);
    const pplImg = await writeImage(`${runDir}/images/rim-ppl.jpg`);
    const xplImg = await writeImage(`${runDir}/images/rim-xpl.jpg`);
    const pplId = await placeMicrograph(ana, p, pplImg, 'Rim PPL', 'Plane Polarized Light', placement);
    await placeMicrograph(ana, p, xplImg, 'Rim XPL', 'Cross Polarized Light', 'reference');

    await linkSibling(ana, 'Rim PPL', 'Rim XPL');
    const linked = await pair(ana, pplId);
    expect.soft(linked.xpl).toEqual(linked.ppl);
    expect.soft(await refusedOnExport(ana)).toEqual([]);
  });

  test(`Add Corresponding XPL Image on a PPL placed on the overview (${placement})`, async ({ launch, project, runDir }) => {
    const { p, ana } = await start(launch, project, `E2E Siblings Add ${placement}`);
    const pplImg = await writeImage(`${runDir}/images/rim-ppl.jpg`);
    const xplImg = await writeImage(`${runDir}/images/rim-xpl.jpg`);
    const pplId = await placeMicrograph(ana, p, pplImg, 'Rim PPL', 'Plane Polarized Light', placement);

    await addCorrespondingXpl(ana, 'Rim PPL', xplImg);
    const linked = await pair(ana, pplId);
    expect(linked.roles).toEqual([true, false]);
    expect.soft(linked.xpl).toEqual(linked.ppl);
    expect.soft(await refusedOnExport(ana)).toEqual([]);
  });
}

test('Add Corresponding XPL Image on the PPL reference', async ({ launch, project, runDir }) => {
  const { p, ana } = await start(launch, project, 'E2E Siblings Add Reference');
  const xplImg = await writeImage(`${runDir}/images/overview-xpl.jpg`);

  await addCorrespondingXpl(ana, 'Overview (Reference)', xplImg);
  const linked = await pair(ana, p.micrographId);
  expect.soft(linked.xpl).toEqual(linked.ppl);
  expect.soft(await refusedOnExport(ana)).toEqual([]);
});

/**
 * A project as the old Link Sibling saved it: an XPL placed on its own PPL
 * reference and linked (parent kept, location gone), an affine PPL linked to
 * an XPL reference (no affine copied), a healthy pair, and an XPL unlinked
 * after the old link (nothing left to say where it was).
 */
async function oldLinkedProject(runDir: string): Promise<{ p: FixtureProject; ids: Record<string, string> }> {
  const ids = { overviewXpl: randomUUID(), rimPpl: randomUUID(), rimXpl: randomUUID(), corePpl: randomUUID(), coreXpl: randomUUID(), veinXpl: randomUUID() };
  const overviewId = randomUUID();
  const base = (id: string, name: string, imageType: string) => ({
    id, name, imagePath: id, imageWidth: 1600, imageHeight: 1200, width: 1600, height: 1200, opacity: 1, imageType,
    scalePixelsPerCentimeter: 40000, orientationInfo: { orientationMethod: 'unoriented' }, spots: [], associatedFiles: [],
    links: [], tags: [], isMicroVisible: true, isExpanded: true, isSpotExpanded: false, isFlipped: false,
  });
  const XPL = 'Cross Polarized Light';
  const PPL = 'Plane Polarized Light';
  const affine = { placementType: 'affine', affineMatrix: [0.25, 0, 400, 0, 0.25, 300], affineBoundsOffset: { x: 400, y: 300 },
    affineTransformedWidth: 400, affineTransformedHeight: 300 };
  const p = await makeProject(`${runDir}/fixtures`, 'E2E Siblings Old Link', ['Garnet 1'], {
    overviewId,
    overview: { isExpanded: true, siblingImageId: ids.overviewXpl, isPrimarySibling: true },
    micrographs: [
      { ...base(ids.overviewXpl, 'Overview XPL', XPL), parentID: overviewId, offsetInParent: null, pointInParent: null,
        siblingImageId: overviewId, isPrimarySibling: false },
      { ...base(ids.rimPpl, 'Rim PPL', PPL), parentID: overviewId, ...affine, affineTileHash: ids.rimPpl, scalePixelsPerCentimeter: 160000,
        siblingImageId: ids.rimXpl, isPrimarySibling: true },
      { ...base(ids.rimXpl, 'Rim XPL', XPL), offsetInParent: null, pointInParent: null, siblingImageId: ids.rimPpl, isPrimarySibling: false },
      { ...base(ids.corePpl, 'Core PPL', PPL), parentID: overviewId, offsetInParent: { X: 200, Y: 100 }, rotation: 0,
        siblingImageId: ids.coreXpl, isPrimarySibling: true },
      { ...base(ids.coreXpl, 'Core XPL', XPL), parentID: overviewId, offsetInParent: { X: 200, Y: 100 }, rotation: 0,
        siblingImageId: ids.corePpl, isPrimarySibling: false },
      { ...base(ids.veinXpl, 'Vein XPL', XPL), parentID: overviewId, offsetInParent: null, pointInParent: null },
    ],
  });
  return { p, ids };
}

/** Show the pair's other image (the X key) and wait until it is drawn */
async function toggleSibling(copy: Copy): Promise<void> {
  await copy.state((e) => e.app.getState().toggleSiblingView());
  await expect(copy.page.getByText('Loading image...')).toHaveCount(0, { timeout: 60_000 });
}

test('a project linked by the old Link Sibling opens repaired, exports, and stays repaired after saving', async ({ launch, runDir }) => {
  const { p, ids } = await oldLinkedProject(runDir);
  fs.mkdirSync('test-results', { recursive: true });
  fs.copyFileSync(p.smzPath, 'test-results/sibling-broken-project.smz');
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await expandOverview(ana, p);

  // Repaired on load, and that is a change to save
  const overview = await pair(ana, p.micrographId);
  expect.soft(overview.xpl, 'Overview XPL: a reference like its PPL').toEqual(overview.ppl);
  const rim = await pair(ana, ids.rimPpl);
  expect.soft(rim.xpl, 'Rim XPL: affine on the overview like its PPL').toEqual(rim.ppl);
  const rimTiles = await ana.state(new Function('e', `return e.app.getState().micrographIndex.get(${JSON.stringify(ids.rimXpl)})?.affineTileHash ?? null`) as never);
  expect.soft(rimTiles, 'Rim XPL: its own tile key').toBe(ids.rimXpl);
  const core = await pair(ana, ids.corePpl);
  expect.soft(core.xpl, 'Core pair untouched').toEqual(core.ppl);
  expect.soft(await ana.state((e) => e.app.getState().isDirty)).toBe(true);

  // Only the unlinked XPL still needs a location (it shows in the tree with the warning)
  expect.soft(await refusedOnExport(ana)).toEqual(['Vein XPL Needs location']);
  await expect(treeRow(ana, 'Vein XPL')).toBeVisible();

  // Both pairs draw, and toggle to the XPL and back
  for (const id of [p.micrographId, ids.rimPpl]) {
    await viewMicrograph(ana, id);
    await toggleSibling(ana);
    await toggleSibling(ana);
  }
  expect(ana.consoleErrors.filter((l) => /Failed to load image|load-tiles|affine|ENOENT/i.test(l))).toEqual([]);

  // Saved repaired; loading the saved project repairs nothing more
  await ana.menu('File', 'Save Project');
  await expect.poll(() => ana.state((e) => e.app.getState().isDirty)).toBe(false);
  const saved = await ana.state(new Function('e', `return window.api.loadProjectJson(${JSON.stringify(p.id)})`) as never) as {
    datasets: Array<{ samples: Array<{ micrographs: Array<{ id: string; parentID?: string | null; placementType?: string | null }> }> }>;
  };
  const onDisk = new Map(saved.datasets[0].samples[0].micrographs.map((m) => [m.id, m]));
  expect.soft(onDisk.get(ids.overviewXpl)?.parentID ?? null, 'saved: Overview XPL a reference').toBeNull();
  expect.soft(onDisk.get(ids.rimXpl)?.placementType, 'saved: Rim XPL affine').toBe('affine');
  await ana.state(new Function('e', `return window.api.loadProjectJson(${JSON.stringify(p.id)})
    .then((project) => e.app.getState().loadProject(project, e.app.getState().projectFilePath))`) as never);
  expect.soft(await ana.state((e) => e.app.getState().isDirty), 'reopened: nothing to repair').toBe(false);
});
