/**
 * Mineral colors in the Mineralogy/Lithology dialog (Claire, 2026-11-23):
 * each mineral in the list shows its color for View Spots by Mineral Color;
 * a click opens a color picker; the color is saved to the project's colors
 * with Save (Cancel drops it), and the right pane shows the same color. A
 * Contributor (no project settings) sees the swatch but cannot open the
 * picker. One copy, not synced (the role is set in the store).
 */

import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { openSmz, viewMicrograph, addSpot } from '../lib/actions';

async function start(launch: (l: string, a: typeof ACCOUNTS.ana, o?: { login?: boolean }) => Promise<Copy>,
  project: (name: string) => Promise<{ smzPath: string; id: string; micrographId: string }>, name: string) {
  const p = await project(name);
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await viewMicrograph(ana, p.micrographId);
  return { p, ana };
}

async function addData(copy: Copy, entry: string) {
  await copy.page.getByPlaceholder('Select or search data type...').click();
  await copy.page.getByRole('option', { name: entry, exact: true }).click();
}

/** A spot with Garnet then Quartz, selected so the right pane shows it */
async function garnetSpot(copy: Copy, micrographId: string): Promise<string> {
  const spotId = await addSpot(copy, micrographId, 'S1');
  await copy.state(new Function('e', `
    const st = e.app.getState();
    st.updateSpotData(${JSON.stringify(spotId)}, { mineralogy: { minerals: [
      { name: 'Garnet', operator: 'eq', percentage: 30 }, { name: 'Quartz', operator: 'eq', percentage: 70 }] } });
    return st.selectActiveSpot(${JSON.stringify(spotId)});`) as never);
  await expect(copy.page.getByText('Spot Details')).toBeVisible();
  return spotId;
}

function projectColors(copy: Copy): Promise<{ mineral: string; color: string }[] | null> {
  return copy.state(new Function('e', 'return e.app.getState().project?.mineralColors ?? null') as never) as
    Promise<{ mineral: string; color: string }[] | null>;
}

/** Click the open picker's hue bar at this fraction of its width */
async function pickHue(copy: Copy, at: number) {
  const box = await copy.page.getByRole('slider', { name: 'Hue' }).boundingBox();
  if (!box) throw new Error('no hue bar');
  await copy.page.mouse.click(box.x + box.width * at, box.y + box.height / 2);
}

const swatch = (scope: ReturnType<Copy['page']['getByRole']>, mineral: string) =>
  scope.getByRole('button', { name: `${mineral} color` });

test('a mineral color chosen in the dialog is saved to the project with Save; Cancel drops it', async ({ launch, project }) => {
  const { p, ana } = await start(launch, project, 'E2E Mineral Color Dialog');
  await garnetSpot(ana, p.micrographId);

  await ana.caption('right pane: each mineral has its color (Garnet and Quartz built-in)');
  const pane = ana.page.getByTestId('summary-mineral-color');
  await expect(pane).toHaveCount(2);
  const garnetBuiltIn = await pane.first().getAttribute('data-color');
  expect(garnetBuiltIn).toMatch(/^#[0-9a-f]{6}$/i);

  await ana.caption('Add Data > Mineralogy/Lithology: swatches, and the first-mineral note');
  await addData(ana, 'Mineralogy/Lithology');
  let dialog = ana.page.getByRole('dialog', { name: 'Spot Mineralogy/Lithology' });
  await expect(dialog).toBeVisible();
  await expect(swatch(dialog, 'Garnet')).toHaveAttribute('data-color', garnetBuiltIn ?? '');
  await expect(dialog.getByText('In View Spots by Mineral Color, a spot takes the color of its first mineral.')).toBeVisible();

  await ana.caption('changes the hue, Esc closes only the picker, Cancel: nothing saved');
  await swatch(dialog, 'Garnet').click();
  const hue = ana.page.getByRole('slider', { name: 'Hue' });
  await pickHue(ana, 0.5);
  await ana.page.keyboard.press('Escape');
  await expect(hue).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(swatch(dialog, 'Garnet')).not.toHaveAttribute('data-color', garnetBuiltIn ?? '');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect(await projectColors(ana)).toBeNull();
  await expect(pane.first()).toHaveAttribute('data-color', garnetBuiltIn ?? '');

  await ana.caption('again, Save: the project has a Garnet color; the right pane shows it');
  await addData(ana, 'Mineralogy/Lithology');
  dialog = ana.page.getByRole('dialog', { name: 'Spot Mineralogy/Lithology' });
  await swatch(dialog, 'Garnet').click();
  await pickHue(ana, 0.6);
  await ana.page.keyboard.press('Escape');
  const chosen = await swatch(dialog, 'Garnet').getAttribute('data-color');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => projectColors(ana)).toEqual([{ mineral: 'Garnet', color: chosen }]);
  await expect(pane.first()).toHaveAttribute('data-color', chosen ?? '');
  await expect(pane.nth(1)).not.toHaveAttribute('data-color', chosen ?? '');

  await ana.caption('one undo puts back the color');
  await ana.menu('Edit', 'Undo');
  await expect.poll(() => projectColors(ana)).toBeNull();
});

test('a Contributor sees the colors but cannot change them', async ({ launch, project }) => {
  const { p, ana } = await start(launch, project, 'E2E Mineral Color Contributor');
  await garnetSpot(ana, p.micrographId);
  await ana.state(new Function('e', `e.sync.setState({ synced: true, role: 'contributor', pkey: '1' })`) as never);

  await addData(ana, 'Mineralogy/Lithology');
  const dialog = ana.page.getByRole('dialog', { name: 'Spot Mineralogy/Lithology' });
  await expect(dialog).toBeVisible();
  await expect(swatch(dialog, 'Garnet')).toHaveCount(0);
  const view = dialog.getByRole('img', { name: 'Garnet color' });
  await expect(view).toBeVisible();
  await view.hover();
  await expect(ana.page.getByRole('tooltip')).toContainText('Only the owner or an Editor can change');
  await view.click();
  await expect(ana.page.getByRole('slider', { name: 'Hue' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});

function minerals(copy: Copy, spotId: string) {
  return copy.state(new Function('e', `
    const s = e.app.getState().spotIndex.get(${JSON.stringify(spotId)});
    return s?.mineralogy?.minerals ?? null;`) as never) as Promise<{ name: string; operator: string | null; percentage: number | null }[] | null>;
}

test('Save keeps "no amount": Quartz never becomes Quartz0 (Jason, 2026-11-23)', async ({ launch, project }) => {
  const { p, ana } = await start(launch, project, 'E2E Mineral No Amount');
  const spotId = await addSpot(ana, p.micrographId, 'qz-8');
  await ana.caption("a spot as a preset made it: Quartz with no amount (operator '', 0); Garnet = 30%; Biotite saved by the old bug (eq, 0)");
  await ana.state(new Function('e', `
    const st = e.app.getState();
    st.updateSpotData(${JSON.stringify(spotId)}, { mineralogy: { minerals: [
      { name: 'Quartz', operator: '', percentage: 0 }, { name: 'Garnet', operator: 'eq', percentage: 30 },
      { name: 'Biotite', operator: 'eq', percentage: 0 }] } });
    return st.selectActiveSpot(${JSON.stringify(spotId)});`) as never);

  const rows = ana.page.getByTestId('summary-mineral-color').locator('xpath=..');
  await expect(rows).toHaveText(['Quartz', 'Garnet = 30%', 'Biotite']);

  await ana.caption('the dialog lists no amount for Quartz and Biotite; Save');
  await addData(ana, 'Mineralogy/Lithology');
  const dialog = ana.page.getByRole('dialog', { name: 'Spot Mineralogy/Lithology' });
  await expect(dialog.getByText('= 30%')).toBeVisible();
  await expect(dialog.getByText(/(^|[^0-9.])0%/)).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();

  await ana.caption('stored as the legacy app does (null); the right pane still says Quartz');
  await expect.poll(() => minerals(ana, spotId)).toEqual([
    { name: 'Quartz', operator: null, percentage: null },
    { name: 'Garnet', operator: 'eq', percentage: 30 },
    { name: 'Biotite', operator: null, percentage: null },
  ]);
  await expect(rows).toHaveText(['Quartz', 'Garnet = 30%', 'Biotite']);
});
