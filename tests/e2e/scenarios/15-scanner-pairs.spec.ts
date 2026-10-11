/**
 * PPL/XPL pairs for Scanner images (user request 2026-10-11: "Image >
 * Instrument > Scanner > PPL & XPL can be pairs as well"). Scanner names
 * its types "Plane Polarized" / "Cross Polarized"; the pair offers (New
 * Associated Micrograph's Add Corresponding XPL Image?, tree + > Add
 * Corresponding XPL/PPL Image, tree menu > Link Sibling PPL/XPL Image) only
 * knew Optical Microscopy's "Plane Polarized Light" / "Cross Polarized
 * Light". The other half gets the same instrument's name, and a pair never
 * mixes instruments. Needs no server work: one copy, not synced.
 */

import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { writeImage, type FixtureProject } from '../lib/fixtures';
import { openSmz } from '../lib/actions';

type Instrument = 'Scanner' | 'Optical Microscopy';

/** A 1600 x 1200 micrograph placed at full size on the overview, of the given instrument and image type. Returns its id. */
async function placeMicrograph(copy: Copy, p: FixtureProject, imagePath: string, name: string,
  instrumentType: Instrument, imageType: string): Promise<string> {
  await copy.caption(`micrograph '${name}' (${instrumentType}, ${imageType})`);
  const id = crypto.randomUUID();
  const micrograph = {
    id, name, imagePath: id, imageWidth: 1600, imageHeight: 1200, width: 1600, height: 1200, opacity: 1,
    imageType, instrument: { instrumentType }, scalePixelsPerCentimeter: 40000,
    parentID: p.micrographId, offsetInParent: { X: 0, Y: 0 }, rotation: 0,
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

function treeRow(copy: Copy, rowText: string) {
  return copy.page.getByText(rowText, { exact: true }).locator('xpath=../..');
}

/** The pair a micrograph is half of, as the store has it */
async function pairOf(copy: Copy, id: string) {
  return copy.state(new Function('e', `
    const index = e.app.getState().micrographIndex;
    const m = index.get(${JSON.stringify(id)});
    const other = m && m.siblingImageId ? index.get(m.siblingImageId) : null;
    const pick = (x) => x ? { id: x.id, name: x.name, imageType: x.imageType ?? null,
      instrumentType: x.instrument?.instrumentType ?? null, isPrimarySibling: x.isPrimarySibling ?? null,
      siblingImageId: x.siblingImageId ?? null } : null;
    return { self: pick(m), other: pick(other) };
  `) as never) as Promise<{ self: Record<string, unknown> | null; other: Record<string, unknown> | null }>;
}

/** The micrograph called `name`, or null */
async function byName(copy: Copy, name: string) {
  return copy.state(new Function('e', `
    for (const d of e.app.getState().project?.datasets ?? []) for (const s of d.samples ?? [])
      for (const m of s.micrographs ?? []) if (m.name === ${JSON.stringify(name)}) return m.id;
    return null;`) as never) as Promise<string | null>;
}

async function start(launch: (l: string, a: typeof ACCOUNTS.ana, o?: { login?: boolean }) => Promise<Copy>,
  project: (name: string) => Promise<FixtureProject>, name: string) {
  const p = await project(name);
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await ana.state(new Function('e', `return e.app.getState().updateMicrographMetadata(${JSON.stringify(p.micrographId)}, { isExpanded: true })`) as never);
  return { p, ana };
}

test('New Associated Micrograph: a Scanner Plane Polarized image takes its Cross Polarized XPL, No Polarizer does not', async ({ launch, project, runDir }) => {
  const { p, ana } = await start(launch, project, 'E2E Scanner New Pair');
  const pplImg = await writeImage(`${runDir}/images/scan-ppl.jpg`);
  const xplImg = await writeImage(`${runDir}/images/scan-xpl.jpg`);

  await ana.caption('adds a Scanner micrograph with its XPL');
  await treeRow(ana, 'Overview (Reference)').locator('button:has([data-testid="AddIcon"])').first().click();
  await ana.page.getByRole('menuitem', { name: 'Add Associated Micrograph' }).click();
  const dialog = ana.page.getByRole('dialog', { name: 'New Associated Micrograph' });
  const next = dialog.getByRole('button', { name: 'Next' });
  const pick = async (combo: string, option: string) => {
    await dialog.getByRole('combobox', { name: new RegExp(`^${combo}`) }).click();
    await ana.page.getByRole('option', { name: option, exact: true }).click();
  };

  await ana.answerDialog({ kind: 'open', filePaths: [pplImg] });
  await dialog.getByRole('button', { name: 'Browse...' }).click();
  await next.click(); // Load Associated Micrograph
  await next.click(); // Image Rotation
  await pick('Instrument Type', 'Scanner');
  const addXpl = dialog.getByRole('button', { name: 'Add Corresponding XPL Image?' });
  await pick('Image Type', 'No Polarizer');
  await expect(addXpl).toHaveCount(0);
  await pick('Image Type', 'Cross Polarized');
  await expect(dialog.getByRole('button', { name: 'Add Corresponding PPL Image?' })).toBeVisible();
  await pick('Image Type', 'Plane Polarized');
  await ana.answerDialog({ kind: 'open', filePaths: [xplImg] });
  await addXpl.click();
  await expect(dialog.getByText('XPL Image: scan-xpl.jpg')).toBeVisible({ timeout: 30_000 });

  await next.click(); // Instrument & Image Information
  await next.click(); // Instrument Data
  await dialog.getByLabel(/^Name/).fill('Scan PPL');
  await next.click(); // Micrograph Metadata
  await dialog.getByText('Locate as a scaled rectangle', { exact: true }).click();
  await next.click(); // Location Method
  await dialog.getByText('Pixel Conversion Factor', { exact: true }).click();
  await next.click(); // Scale Method
  await expect(dialog.getByLabel('X (px)')).toBeEnabled({ timeout: 30_000 });
  await dialog.getByLabel(/^Number of Pixels/).fill('1000');
  await dialog.getByLabel(/^Physical Length/).fill('100');
  await dialog.getByRole('button', { name: 'Finish' }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });

  let pplId: string | null = null;
  await expect.poll(async () => (pplId = await byName(ana, 'Scan PPL')), { timeout: 30_000 }).not.toBeNull();
  const pair = await pairOf(ana, pplId as unknown as string);
  expect(pair.self).toMatchObject({ imageType: 'Plane Polarized', instrumentType: 'Scanner', isPrimarySibling: true });
  expect(pair.other).toMatchObject({ name: 'scan-xpl', imageType: 'Cross Polarized', instrumentType: 'Scanner', isPrimarySibling: false });
  expect(pair.other?.siblingImageId).toBe(pplId);
  // The PPL/XPL chip in the tree
  await expect(treeRow(ana, 'Scan PPL').getByText('PPL/XPL', { exact: true })).toBeVisible();
  void p;
});

test('Add Corresponding XPL Image on a Scanner PPL, and Add Corresponding PPL Image on a Scanner XPL', async ({ launch, project, runDir }) => {
  const { p, ana } = await start(launch, project, 'E2E Scanner Add Sibling');
  const img = await writeImage(`${runDir}/images/scan.jpg`);
  const pplId = await placeMicrograph(ana, p, img, 'Scan PPL', 'Scanner', 'Plane Polarized');
  const xplId = await placeMicrograph(ana, p, img, 'Scan XPL', 'Scanner', 'Cross Polarized');

  for (const [row, label, id, want] of [
    ['Scan PPL', 'XPL', pplId, 'Cross Polarized'],
    ['Scan XPL', 'PPL', xplId, 'Plane Polarized'],
  ] as const) {
    await ana.caption(`adds a corresponding ${label} image to '${row}'`);
    await treeRow(ana, row).locator('button:has([data-testid="AddIcon"])').first().click();
    await ana.page.getByRole('menuitem', { name: `Add Corresponding ${label} Image` }).click();
    const dialog = ana.page.getByRole('dialog', { name: `Add Corresponding ${label} Image` });
    await ana.answerDialog({ kind: 'open', filePaths: [img] });
    await dialog.getByRole('button', { name: `Select ${label} Image...` }).click();
    const add = dialog.getByRole('button', { name: `Add ${label} Image` });
    await expect(add).toBeEnabled({ timeout: 30_000 });
    await add.click();
    await expect(dialog).toBeHidden({ timeout: 60_000 });

    const pair = await pairOf(ana, id);
    expect(pair.other, `${row}: the new half`).toMatchObject({ imageType: want, instrumentType: 'Scanner' });
    expect(pair.self?.isPrimarySibling, `${row}: PPL is primary`).toBe(label === 'XPL');
    expect(pair.other?.isPrimarySibling).toBe(label === 'PPL');
  }
});

test('Link Sibling PPL/XPL Image offers only the same instrument\'s other half', async ({ launch, project, runDir }) => {
  const { p, ana } = await start(launch, project, 'E2E Scanner Link');
  const img = await writeImage(`${runDir}/images/scan.jpg`);
  const scanPpl = await placeMicrograph(ana, p, img, 'Scan PPL', 'Scanner', 'Plane Polarized');
  const scanXpl = await placeMicrograph(ana, p, img, 'Scan XPL', 'Scanner', 'Cross Polarized');
  await placeMicrograph(ana, p, img, 'Scan Plain', 'Scanner', 'No Polarizer');
  await placeMicrograph(ana, p, img, 'Optical XPL', 'Optical Microscopy', 'Cross Polarized Light');
  const dialog = ana.page.getByRole('dialog', { name: 'Link Sibling PPL/XPL Image' });
  const openLink = async (row: string) => {
    await treeRow(ana, row).locator('button:has([data-testid="MoreVertIcon"])').first().click();
    await ana.page.getByRole('menuitem', { name: 'Link Sibling PPL/XPL Image' }).click();
    await expect(dialog).toBeVisible();
  };

  // A Scanner image with no polarizer is not offered pairing at all
  await treeRow(ana, 'Scan Plain').locator('button:has([data-testid="MoreVertIcon"])').first().click();
  await expect(ana.page.getByRole('menuitem', { name: 'Delete Micrograph' })).toBeVisible();
  await expect(ana.page.getByRole('menuitem', { name: 'Link Sibling PPL/XPL Image' })).toHaveCount(0);
  await ana.page.keyboard.press('Escape');

  // The Overview (an Optical PPL with no instrument set) is not offered the Scanner XPL
  await openLink('Overview (Reference)');
  await expect(dialog.getByText('Optical XPL', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Scan XPL', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();

  // The Scanner PPL is offered only the Scanner XPL
  await ana.caption("links 'Scan XPL' as the sibling of 'Scan PPL'");
  await openLink('Scan PPL');
  await expect(dialog.getByText('Scan XPL', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Optical XPL', { exact: true })).toHaveCount(0);
  await expect(dialog.getByText('Scan Plain', { exact: true })).toHaveCount(0);
  await dialog.getByText('Scan XPL', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Link Images' }).click();
  await expect(dialog).toBeHidden();

  const pair = await pairOf(ana, scanPpl);
  expect(pair.self?.isPrimarySibling).toBe(true);
  expect(pair.other).toMatchObject({ id: scanXpl, isPrimarySibling: false, imageType: 'Cross Polarized' });

  // And it unlinks again from the same menu
  await treeRow(ana, 'Scan PPL').locator('button:has([data-testid="MoreVertIcon"])').first().click();
  await ana.page.getByRole('menuitem', { name: 'Unlink Sibling Image' }).click();
  await expect.poll(async () => (await pairOf(ana, scanPpl)).other).toBeNull();
});
