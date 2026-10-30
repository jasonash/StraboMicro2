/**
 * Finish Importing (Jason, 2026-10-30): the whole path for batch imported
 * micrographs, with and without instrument info, reference and associated, one
 * and several, every placement choice, Cancel at every step, and micrographs
 * already placed that still need their instrument info. Peter's project was the
 * case that broke: three children with no instrument, scale or location beside
 * finished ones. One copy, not synced.
 */

import fs from 'fs';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { makeProject } from '../lib/fixtures';
import { openSmz } from '../lib/actions';

const W = 400;
const H = 300;
const OVERVIEW = 'Overview (Reference)';

const base = (id: string, name: string, extra: Record<string, unknown>) => ({
  id, name, width: W, height: H, imageWidth: W, imageHeight: H, opacity: 1,
  polish: false, description: '', notes: '', spots: [], orientationInfo: { orientationMethod: 'unoriented' },
  associatedFiles: [], links: [], isMicroVisible: true, isExpanded: false, isSpotExpanded: false, isFlipped: false, tags: [],
  ...extra,
});
const noInfo = { needsInstrumentInfo: true };
const withInfo = { imageType: 'Plane Polarized Light', instrument: { instrumentType: 'Optical Microscopy' } };
const placedThere = { ...withInfo, scalePixelsPerCentimeter: 80000, offsetInParent: { X: 50, Y: 60 }, rotation: 0 };

type Fields = Record<string, unknown>;

async function start(launch: (l: string, a: typeof ACCOUNTS.ana, o?: { login?: boolean }) => Promise<Copy>, runDir: string, name: string,
  children: Array<{ name: string; fields: Fields }>) {
  const overviewId = randomUUID();
  const image = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 90, g: 110, b: 130 } } }).jpeg().toBuffer();
  const micrographs = children.map((c) => base(randomUUID(), c.name, { ...(c.fields.reference ? {} : { parentID: overviewId }), ...c.fields }));
  const p = await makeProject(`${runDir}/fixtures`, name, [], {
    overviewId,
    micrographs,
    images: Object.fromEntries(micrographs.map((m) => [m.id, image])),
  });
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  if (children.some((c) => !c.fields.reference)) {
    await ana.page.getByText(OVERVIEW, { exact: true }).locator('xpath=..')
      .locator('[data-testid="ChevronRightIcon"]').first().click();
  }
  return { ana, overviewId, ids: Object.fromEntries(micrographs.map((m) => [m.name as string, m.id as string])) };
}

/** A micrograph as saved in the store, by name */
async function saved(copy: Copy, name: string): Promise<Fields> {
  return (await copy.state(new Function('e', `
    for (const d of e.app.getState().project?.datasets ?? []) for (const s of d.samples ?? [])
      for (const m of s.micrographs ?? []) if (m.name === ${JSON.stringify(name)}) return {
        needsInstrumentInfo: !!m.needsInstrumentInfo, imageType: m.imageType ?? null,
        instrumentType: m.instrument?.instrumentType ?? null, brand: m.instrument?.instrumentBrand ?? null,
        offset: m.offsetInParent ?? null, scale: m.scalePixelsPerCentimeter ?? null,
        width: m.imageWidth, height: m.imageHeight };
    return null;`) as never)) as unknown as Fields;
}

/** The project's micrographs, to compare before and after a Cancel */
function snapshot(copy: Copy): Promise<string> {
  return copy.state(new Function('e', `
    return JSON.stringify((e.app.getState().project?.datasets ?? []).flatMap((d) => (d.samples ?? []).flatMap((s) => s.micrographs ?? [])));`) as never) as unknown as Promise<string>;
}

const wizard = (copy: Copy) => copy.page.getByRole('dialog', { name: 'Finish Importing' });
const editLocation = (copy: Copy) => copy.page.getByRole('dialog', { name: 'Edit Micrograph Location' });

async function pick(copy: Copy, combo: string, option: string) {
  await wizard(copy).getByRole('combobox', { name: new RegExp(`^${combo}`) }).first().click();
  await copy.page.getByRole('option', { name: option, exact: true }).click();
}

async function click(copy: Copy, button: string) {
  await wizard(copy).getByRole('button', { name: button, exact: true }).click();
}

test('Peter\'s state: the wizard opens for all three, Cancel at every step changes nothing and it opens again, image types per micrograph, Later keeps the instrument info', async ({ launch, runDir }) => {
  const { ana } = await start(launch, runDir, 'E2E Finish Peter', [
    { name: 'act_PPL', fields: placedThere },
    { name: 'amp_PPL', fields: noInfo },
    { name: 'pl_XPL', fields: noInfo },
    { name: 'talc_PPL', fields: noInfo },
  ]);
  const before = await snapshot(ana);
  const w = wizard(ana);

  await ana.caption('clicks amp_PPL: the wizard, listing the three unfinished ones');
  await ana.page.getByText('amp_PPL', { exact: true }).click();
  await expect(w).toBeVisible();
  await expect(w.getByTestId('finish-row')).toHaveCount(3);
  await expect(w.getByTestId('finish-row').first()).toContainText('Needs instrument info, location');
  await click(ana, 'Cancel');
  await expect(w).toBeHidden();
  expect(await snapshot(ana)).toBe(before);

  await ana.caption('Cancel on each later step: nothing changes, and any of them opens the wizard again (no stop-asking)');
  for (const steps of [1, 2, 3]) {
    await ana.page.getByText('talc_PPL', { exact: true }).click();
    await expect(w.getByTestId('finish-row')).toHaveCount(3);
    await click(ana, 'Next'); // Rotate / Flip
    if (steps >= 2) {
      await click(ana, 'Next'); // Instrument & Image Info
      await pick(ana, 'Instrument Type', 'Optical Microscopy');
      await pick(ana, 'Image Type', 'Plane Polarized Light');
    }
    if (steps >= 3) await click(ana, 'Next'); // Instrument Data
    await click(ana, 'Cancel');
    await expect(w).toBeHidden();
    expect(await snapshot(ana)).toBe(before);
  }

  await ana.caption('leaves talc_PPL for later; the two others get one instrument, each its own image type');
  await ana.page.getByText('amp_PPL', { exact: true }).click();
  await w.getByRole('checkbox', { name: 'talc_PPL' }).uncheck();
  await click(ana, 'Next');
  await click(ana, 'Next');
  await expect(w.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await pick(ana, 'Instrument Type', 'Optical Microscopy');
  await pick(ana, 'Image Type', 'Plane Polarized Light');
  await expect(w.getByTestId('image-type-row')).toHaveCount(2);
  await w.getByTestId('image-type-row').filter({ hasText: 'pl_XPL' }).getByRole('combobox').click();
  await ana.page.getByRole('option', { name: 'Cross Polarized Light', exact: true }).click();
  await click(ana, 'Next');
  await w.getByLabel('Instrument Brand').fill('Olympus');
  await click(ana, 'Back');
  await expect(w.getByTestId('image-type-row').filter({ hasText: 'pl_XPL' }).getByRole('combobox')).toHaveText('Cross Polarized Light');
  await click(ana, 'Next');
  await click(ana, 'Next');

  await ana.caption('the placement step: every choice, none highlighted; Later keeps the instrument info');
  await expect(w.getByRole('button', { name: /^Automatically place on / })).toBeVisible();
  await expect(w.getByRole('button', { name: /^Cover the full area of / })).toBeVisible();
  await expect(w.getByRole('button', { name: 'Copy the placement of a placed micrograph...' })).toBeVisible();
  await expect(w.getByRole('button', { name: 'Place by hand, one at a time...' })).toBeVisible();
  await expect(w.locator('.MuiDialogContent-root button.MuiButton-contained')).toHaveCount(4);
  await click(ana, 'Later');
  await expect(w).toBeHidden();
  expect(await saved(ana, 'amp_PPL')).toMatchObject({ needsInstrumentInfo: false, imageType: 'Plane Polarized Light', instrumentType: 'Optical Microscopy', brand: 'Olympus', offset: null });
  expect(await saved(ana, 'pl_XPL')).toMatchObject({ needsInstrumentInfo: false, imageType: 'Cross Polarized Light', instrumentType: 'Optical Microscopy', offset: null });
  expect(await saved(ana, 'talc_PPL')).toMatchObject({ needsInstrumentInfo: true, imageType: null, instrumentType: null });

  await ana.caption('clicking amp_PPL again: no instrument steps for those two, and Copy the placement places only the checked');
  await ana.page.getByText('amp_PPL', { exact: true }).click();
  await expect(w.getByTestId('finish-row')).toHaveCount(3);
  await w.getByRole('checkbox', { name: 'talc_PPL' }).uncheck();
  await click(ana, 'Next'); // Rotate / Flip
  await click(ana, 'Next'); // no instrument step: straight to placing
  await w.getByRole('button', { name: 'Copy the placement of a placed micrograph...' }).click();
  await expect(w).toBeHidden();
  const like = ana.page.getByRole('dialog', { name: 'Place Like a Placed Micrograph' });
  await expect(like.getByTestId('place-unplaced-row')).toHaveCount(2);
  await like.getByRole('button', { name: 'Place 2 micrographs' }).click();
  await expect(like).toBeHidden();
  await expect.poll(async () => (await saved(ana, 'amp_PPL')).offset).toEqual({ X: 50, Y: 60 });
  expect((await saved(ana, 'pl_XPL')).offset).toEqual({ X: 50, Y: 60 });
  expect((await saved(ana, 'talc_PPL')).offset).toBeNull();
});

test('rotation waits for the last step: Cancel leaves the pixels, Next turns them; a placed micrograph without instrument info is never offered rotation', async ({ launch, runDir }) => {
  const { ana, ids } = await start(launch, runDir, 'E2E Finish Rotation', [
    { name: 'Turn me', fields: noInfo },
    { name: 'Placed no info', fields: { ...noInfo, scalePixelsPerCentimeter: 80000, offsetInParent: { X: 10, Y: 10 }, rotation: 0 } },
  ]);
  const w = wizard(ana);

  await ana.caption('uncheck the placed one, rotate the other, Cancel: its size has not changed');
  await ana.page.getByText('Turn me', { exact: true }).click();
  await w.getByRole('checkbox', { name: 'Placed no info' }).uncheck();
  await click(ana, 'Next');
  await w.getByTitle('Rotate 90° clockwise').click();
  await expect(w.getByText(/90/).first()).toBeVisible();
  await click(ana, 'Cancel');
  await expect(w).toBeHidden();
  expect(await saved(ana, 'Turn me')).toMatchObject({ width: W, height: H });

  await ana.caption('again, rotates, and goes through: width and height swap at the save, then Edit Micrograph Location for this one');
  await ana.page.getByText('Turn me', { exact: true }).click();
  await w.getByRole('checkbox', { name: 'Placed no info' }).uncheck();
  await click(ana, 'Next');
  await w.getByTitle('Rotate 90° clockwise').click();
  await click(ana, 'Next');
  expect(await saved(ana, 'Turn me')).toMatchObject({ width: W, height: H });
  await pick(ana, 'Instrument Type', 'Optical Microscopy');
  await pick(ana, 'Image Type', 'Reflected Light');
  await click(ana, 'Next');
  await click(ana, 'Next');
  await expect(editLocation(ana)).toBeVisible();
  expect(await saved(ana, 'Turn me')).toMatchObject({ width: H, height: W, needsInstrumentInfo: false });
  await editLocation(ana).getByRole('button', { name: 'Cancel' }).click();

  await ana.caption('the placed one without instrument info: no Rotate step, Finish, it opens in the viewer; its placement is untouched');
  await ana.page.getByText('Placed no info', { exact: true }).click();
  await w.getByRole('checkbox', { name: 'Turn me' }).uncheck();
  await click(ana, 'Next');
  await expect(w.getByTitle('Rotate 90° clockwise')).toHaveCount(0);
  await expect(w.getByText('Rotate / Flip')).toHaveCount(0);
  await pick(ana, 'Instrument Type', 'Optical Microscopy');
  await pick(ana, 'Image Type', 'Plane Polarized Light');
  await click(ana, 'Next');
  await click(ana, 'Finish');
  await expect(w).toBeHidden();
  expect(await saved(ana, 'Placed no info')).toMatchObject({ needsInstrumentInfo: false, width: W, height: H, offset: { X: 10, Y: 10 } });
  await expect.poll(() => ana.state(new Function('e', 'return e.app.getState().activeMicrographId') as never)).toBe(ids['Placed no info']);
});

test('one micrograph: with instrument info straight to Edit Micrograph Location; several by hand go one at a time and Cancel ends it', async ({ launch, runDir }) => {
  const { ana } = await start(launch, runDir, 'E2E Finish Hand', [
    { name: 'A map', fields: withInfo },
    { name: 'B map', fields: withInfo },
    { name: 'C map', fields: withInfo },
  ]);
  const w = wizard(ana);

  await ana.caption('several with instrument info: list, rotate, placement; by hand');
  await ana.page.getByText('A map', { exact: true }).click();
  await expect(w.getByTestId('finish-row')).toHaveCount(3);
  await expect(w.getByText('Needs location').first()).toBeVisible();
  await click(ana, 'Next');
  await click(ana, 'Next');
  await w.getByRole('button', { name: 'Place by hand, one at a time...' }).click();
  await expect(w).toBeHidden();

  await ana.caption('Same area as parent on the first opens the next; Cancel there stops');
  const edit = editLocation(ana);
  await edit.getByRole('radio', { name: 'Same area as parent' }).check();
  await edit.getByRole('button', { name: 'Finish' }).click();
  await expect.poll(async () => (await saved(ana, 'A map')).offset).toEqual({ X: 0, Y: 0 });
  await expect(edit).toBeVisible();
  await edit.getByRole('button', { name: 'Cancel' }).click();
  await expect(edit).toBeHidden();
  await ana.page.waitForTimeout(500);
  await expect(edit).toBeHidden();
  expect((await saved(ana, 'B map')).offset).toBeNull();

  await ana.caption('Cover the full area places the rest');
  await ana.page.getByText('B map', { exact: true }).click();
  await expect(w.getByTestId('finish-row')).toHaveCount(2);
  await click(ana, 'Next');
  await click(ana, 'Next');
  await w.getByRole('button', { name: /^Cover the full area of / }).click();
  const area = ana.page.getByRole('dialog', { name: /^Place on the Full Area of/ });
  await area.getByRole('button', { name: 'Place 2 micrographs' }).click();
  await expect(area).toBeHidden();
  await expect.poll(async () => (await saved(ana, 'C map')).offset).toEqual({ X: 0, Y: 0 });

  await ana.caption('a finished micrograph just opens; no wizard');
  await ana.page.getByText('C map', { exact: true }).click();
  await expect(w).toBeHidden();
  await expect(edit).toBeHidden();
});

test('Batch Import: instrument info is on by default with image types per file, then the placement choices; unchecked goes on to the instrument steps; one goes to its own dialog', async ({ launch, runDir }) => {
  const { ana } = await start(launch, runDir, 'E2E Finish Batch', []);
  const w = wizard(ana);
  const image = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 120, g: 100, b: 90 } } }).jpeg().toBuffer();
  fs.mkdirSync(`${runDir}/images`, { recursive: true });
  const file = (name: string) => {
    const f = `${runDir}/images/${name}.jpg`;
    fs.writeFileSync(f, image);
    return f;
  };
  const openBatch = async (rowText: string, item: string) => {
    await ana.page.getByText(rowText, { exact: true }).locator('xpath=../..')
      .locator('button:has([data-testid="AddIcon"])').first().click();
    await ana.page.getByRole('menuitem', { name: item }).click();
    return ana.page.getByRole('dialog', { name: item });
  };
  const browse = async (batch: ReturnType<typeof wizard>, files: string[]) => {
    await ana.answerDialog({ kind: 'open', filePaths: files });
    await batch.getByRole('button', { name: 'Browse' }).click();
    await expect(batch.getByRole('button', { name: 'Next' })).toBeEnabled();
  };

  await ana.caption('with instrument info (the default): one instrument, a type per file, then straight to the placement choices');
  let batch = await openBatch(OVERVIEW, 'Batch Import Associated Micrographs');
  await expect(batch.getByRole('checkbox', { name: 'Instrument and Image Info' })).toBeChecked();
  await browse(batch, [file('Ppl one'), file('Xpl one')]);
  await batch.getByRole('button', { name: 'Next' }).click();
  await batch.getByRole('combobox', { name: /^Instrument Type/ }).click();
  await ana.page.getByRole('option', { name: 'Optical Microscopy', exact: true }).click();
  await batch.getByRole('combobox', { name: /^Image Type/ }).first().click();
  await ana.page.getByRole('option', { name: 'Plane Polarized Light', exact: true }).click();
  await batch.getByTestId('image-type-row').filter({ hasText: 'Xpl one' }).getByRole('combobox').click();
  await ana.page.getByRole('option', { name: 'Cross Polarized Light', exact: true }).click();
  await batch.getByRole('button', { name: 'Next' }).click();
  await batch.getByRole('button', { name: 'Next' }).click();
  await batch.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(w.getByText('2 micrographs imported.')).toBeVisible({ timeout: 60_000 });
  await expect(batch).toBeHidden();
  await expect(w.getByRole('button', { name: 'Place by hand, one at a time...' })).toBeVisible();
  await expect(w.getByTestId('finish-row')).toHaveCount(0);
  expect(await saved(ana, 'Ppl one')).toMatchObject({ needsInstrumentInfo: false, imageType: 'Plane Polarized Light', instrumentType: 'Optical Microscopy' });
  expect(await saved(ana, 'Xpl one')).toMatchObject({ imageType: 'Cross Polarized Light' });
  await click(ana, 'Later');
  await expect(w).toBeHidden();

  await ana.caption('unchecked: the import goes on to the instrument steps, with no second question about rotating');
  batch = await openBatch(OVERVIEW, 'Batch Import Associated Micrographs');
  await batch.getByRole('checkbox', { name: 'Instrument and Image Info' }).uncheck();
  await browse(batch, [file('No info one'), file('No info two')]);
  await batch.getByRole('button', { name: 'Next' }).click();
  await batch.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(w.getByText('2 micrographs imported.')).toBeVisible({ timeout: 60_000 });
  await expect(w.getByTitle('Rotate 90° clockwise')).toHaveCount(0);
  await expect(w.getByRole('combobox', { name: /^Instrument Type/ })).toBeVisible();
  await click(ana, 'Cancel');
  await expect(w).toBeHidden();
  expect(await saved(ana, 'No info one')).toMatchObject({ needsInstrumentInfo: true, instrumentType: null });

  await ana.caption('one with instrument info: straight to Edit Micrograph Location');
  batch = await openBatch(OVERVIEW, 'Batch Import Associated Micrographs');
  await browse(batch, [file('Single one')]);
  await batch.getByRole('button', { name: 'Next' }).click();
  await batch.getByRole('combobox', { name: /^Instrument Type/ }).click();
  await ana.page.getByRole('option', { name: 'Optical Microscopy', exact: true }).click();
  await batch.getByRole('combobox', { name: /^Image Type/ }).first().click();
  await ana.page.getByRole('option', { name: 'Reflected Light', exact: true }).click();
  await batch.getByRole('button', { name: 'Next' }).click();
  await batch.getByRole('button', { name: 'Next' }).click();
  await batch.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(editLocation(ana)).toBeVisible({ timeout: 60_000 });
  await editLocation(ana).getByRole('button', { name: 'Cancel' }).click();
  await expect(editLocation(ana)).toBeHidden();
});

test('reference micrographs without instrument info or scale: the same steps, then Set Micrograph Scale one at a time', async ({ launch, runDir }) => {
  const { ana } = await start(launch, runDir, 'E2E Finish References', [
    { name: 'Ref one', fields: { ...noInfo, reference: true } },
    { name: 'Ref two', fields: { ...noInfo, reference: true } },
  ]);
  const w = wizard(ana);
  await ana.caption('clicks Ref one: both listed, not the finished Overview');
  await ana.page.getByText('Ref one (Reference)', { exact: true }).click();
  await expect(w.getByTestId('finish-row')).toHaveCount(2);
  await expect(w.getByTestId('finish-row').first()).toContainText('Needs instrument info, scale');
  await click(ana, 'Next');
  await click(ana, 'Next');
  await pick(ana, 'Instrument Type', 'Optical Microscopy');
  await pick(ana, 'Image Type', 'Reflected Light');
  await click(ana, 'Next');
  await click(ana, 'Next');
  await ana.caption('the Scale step opens Set Micrograph Scale; Cancel leaves the scale unset, the instrument info saved');
  await w.getByRole('button', { name: 'Set the scale of each, one at a time...' }).click();
  const scale = ana.page.getByRole('dialog', { name: 'Set Micrograph Scale' });
  await expect(scale).toBeVisible();
  await scale.getByRole('button', { name: 'Cancel' }).click();
  await expect(scale).toBeHidden();
  expect(await saved(ana, 'Ref one')).toMatchObject({ needsInstrumentInfo: false, imageType: 'Reflected Light', scale: null });
  expect(await saved(ana, 'Ref two')).toMatchObject({ needsInstrumentInfo: false, scale: null });
  await ana.caption('clicking one with only its scale missing still offers both');
  await ana.page.getByText('Ref two (Reference)', { exact: true }).click();
  await expect(w.getByTestId('finish-row')).toHaveCount(2);
});
