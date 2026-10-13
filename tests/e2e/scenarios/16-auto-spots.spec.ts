/**
 * Auto spot mode (Claire, Strabo-Micro issue #60; docs/auto-spot-mode-design.md):
 * with Auto on, a click places a point and a closed polygon is saved at once,
 * named from the chosen preset's pattern (else the project's, else
 * "Spot {n}"), numbered across the sample; the tool stays active; keys 1-9
 * pick the preset; Alt/Option+click opens New Spot filled in; Esc ends the
 * run; manual mode is unchanged. One copy, not synced.
 */

import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { type FixtureProject } from '../lib/fixtures';
import { openSmz, viewMicrograph } from '../lib/actions';

async function start(launch: (l: string, a: typeof ACCOUNTS.ana, o?: { login?: boolean }) => Promise<Copy>,
  project: (name: string) => Promise<FixtureProject>, name: string) {
  const p = await project(name);
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await viewMicrograph(ana, p.micrographId);
  return { p, ana };
}

/** Spot names on a micrograph, in order */
function spotNames(copy: Copy, micrographId: string): Promise<string[]> {
  return copy.state(new Function('e', `
    const m = e.app.getState().micrographIndex.get(${JSON.stringify(micrographId)});
    return (m?.spots ?? []).map((s) => s.name);`) as never) as Promise<string[]>;
}

function spotByName(copy: Copy, micrographId: string, name: string) {
  return copy.state(new Function('e', `
    const m = e.app.getState().micrographIndex.get(${JSON.stringify(micrographId)});
    const s = (m?.spots ?? []).find((x) => x.name === ${JSON.stringify(name)});
    return s ? { id: s.id, geometryType: s.geometryType, points: s.points.length, color: s.color,
      minerals: (s.mineralogy?.minerals ?? []).map((x) => x.name), appliedPresetIds: s.appliedPresetIds ?? null } : null;`) as never) as
    Promise<{ id: string; geometryType: string; points: number; color: string; minerals: string[]; appliedPresetIds: string[] | null } | null>;
}

function activeTool(copy: Copy): Promise<string | null> {
  return copy.state(new Function('e', 'return e.app.getState().activeTool ?? null') as never) as Promise<string | null>;
}

function activeSpotId(copy: Copy): Promise<string | null> {
  return copy.state(new Function('e', 'return e.app.getState().activeSpotId ?? null') as never) as Promise<string | null>;
}

/** Click on the viewer at an offset from its center */
async function clickViewer(copy: Copy, dx: number, dy: number, opts: { alt?: boolean } = {}) {
  const box = await copy.page.locator('.konvajs-content').first().boundingBox();
  if (!box) throw new Error('no viewer');
  if (opts.alt) await copy.page.keyboard.down('Alt');
  await copy.page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
  if (opts.alt) await copy.page.keyboard.up('Alt');
}

const autoButton = (copy: Copy) => copy.page.getByRole('button', { name: 'Auto spot mode' });
const nextLabel = (copy: Copy) => copy.page.getByTestId('auto-spot-next');

test('Auto points: each click is a spot named Spot 1, 2, 3 with no dialog; the tool stays; Esc ends the run', async ({ launch, project }) => {
  const { p, ana } = await start(launch, project, 'E2E Auto Points');

  await ana.caption('turns on Auto, picks Point Spot');
  await autoButton(ana).click();
  await expect(autoButton(ana)).toHaveAttribute('aria-pressed', 'true');
  await expect(ana.page.getByTestId('auto-spot-strip')).toHaveCount(0); // no spot tool yet
  await ana.page.getByRole('button', { name: 'Point tool' }).click();
  await expect(nextLabel(ana)).toHaveText('Next: Spot 1');

  await ana.caption('three clicks');
  await clickViewer(ana, -120, -60);
  await expect(nextLabel(ana)).toHaveText('Next: Spot 2');
  await clickViewer(ana, 0, 40);
  await clickViewer(ana, 140, 0);
  await expect(nextLabel(ana)).toHaveText('Next: Spot 4');
  await expect(ana.page.getByRole('dialog')).toHaveCount(0);

  const names = await spotNames(ana, p.micrographId);
  expect(names.filter((n) => n.startsWith('Spot '))).toEqual(['Spot 1', 'Spot 2', 'Spot 3']);
  const third = await spotByName(ana, p.micrographId, 'Spot 3');
  expect(third?.geometryType).toBe('point');
  expect(await activeSpotId(ana)).toBe(third?.id);
  expect(await activeTool(ana)).toBe('point');

  await ana.caption('Esc ends the run');
  await ana.page.keyboard.press('Escape');
  await expect.poll(() => activeTool(ana)).toBeNull();
  await expect(ana.page.getByTestId('auto-spot-strip')).toHaveCount(0);
  await expect(autoButton(ana)).toHaveAttribute('aria-pressed', 'true'); // Auto stays on for next time
});

test('Preset by key 1: a closed polygon is Ol-1 with the preset color and mineral; the project default names the rest', async ({ launch, project }) => {
  const { p, ana } = await start(launch, project, 'E2E Auto Preset');

  await ana.caption('a project preset Olivine (Ol-{n}, blue, olivine) on key 1; project default Grain {n}');
  await ana.state(new Function('e', `
    const st = e.app.getState();
    st.createPreset({ id: 'preset-ol', name: 'Olivine', spotNamePattern: 'Ol-{n}', createdAt: 'x', modifiedAt: 'x',
      data: { color: '0x3366ccff', opacity: 70, mineralogy: { minerals: [{ name: 'olivine' }] } } }, 'project');
    st.setPresetKeyBinding('1', 'preset-ol');
    e.app.setState({ project: { ...e.app.getState().project, spotNamePattern: 'Grain {n}' } });`) as never);

  await autoButton(ana).click();
  await ana.page.getByRole('button', { name: 'Polygon tool' }).click();
  await expect(nextLabel(ana)).toHaveText('Next: Grain 1');
  await ana.page.keyboard.press('1');
  await expect(nextLabel(ana)).toHaveText('Next: Ol-1');

  await ana.caption('draws a triangle, double-click closes it');
  await clickViewer(ana, -100, -80);
  await clickViewer(ana, 100, -80);
  await clickViewer(ana, 0, 90);
  await ana.page.waitForTimeout(600); // past the double-click window
  const box = await ana.page.locator('.konvajs-content').first().boundingBox();
  if (!box) throw new Error('no viewer');
  await ana.page.mouse.dblclick(box.x + box.width / 2 - 100, box.y + box.height / 2 + 60);
  await expect(nextLabel(ana)).toHaveText('Next: Ol-2');
  await expect(ana.page.getByRole('dialog')).toHaveCount(0);

  const ol = await spotByName(ana, p.micrographId, 'Ol-1');
  expect(ol).toMatchObject({ geometryType: 'polygon', color: '0x3366ccff', minerals: ['olivine'], appliedPresetIds: ['preset-ol'] });
  expect(ol?.points).toBeGreaterThanOrEqual(4);
  expect(await activeTool(ana)).toBe('polygon');

  await ana.caption('back to Default in the strip');
  await ana.page.getByRole('combobox', { name: 'Auto spot preset' }).click();
  await ana.page.getByRole('option', { name: /^Default/ }).click();
  await expect(nextLabel(ana)).toHaveText('Next: Grain 1');
});

test('Numbering covers the sample: a Spot 7 on another micrograph of the sample makes the next Spot 8', async ({ launch, project }) => {
  const { p, ana } = await start(launch, project, 'E2E Auto Sample');

  await ana.caption('another micrograph of the sample holds an archived Spot 7');
  await ana.state(new Function('e', `
    const st = e.app.getState();
    const id = 'other-micrograph';
    st.addMicrograph(${JSON.stringify(p.sampleId)}, { id, name: 'Other', imagePath: id, imageWidth: 100, imageHeight: 100,
      spots: [{ id: 'spot-7', name: 'Spot 7', archived: true, geometryType: 'point', points: [{ X: 1, Y: 1 }] }] });`) as never);

  await autoButton(ana).click();
  await ana.page.getByRole('button', { name: 'Point tool' }).click();
  await expect(nextLabel(ana)).toHaveText('Next: Spot 8');
  await clickViewer(ana, 0, 0);
  expect(await spotNames(ana, p.micrographId)).toContain('Spot 8');
});

test('Alt/Option+click opens New Spot with the auto name; manual mode still asks and turns the tool off', async ({ launch, project }) => {
  const { p, ana } = await start(launch, project, 'E2E Auto Alt');

  await autoButton(ana).click();
  await ana.page.getByRole('button', { name: 'Point tool' }).click();
  await ana.caption('Alt+click');
  await clickViewer(ana, 30, 30, { alt: true });
  const dialog = ana.page.getByRole('dialog', { name: /Create New Spot/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Name' })).toHaveValue('Spot 1');
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Special');
  await dialog.getByRole('button', { name: 'Create Spot' }).click();
  await expect(dialog).toHaveCount(0);
  expect(await spotNames(ana, p.micrographId)).toContain('Special');
  expect(await activeTool(ana)).toBe('point'); // auto mode keeps the tool
  await expect(nextLabel(ana)).toHaveText('Next: Spot 1');

  await ana.caption('Auto off: the dialog opens, saving turns the tool off');
  await autoButton(ana).click();
  await expect(ana.page.getByTestId('auto-spot-strip')).toHaveCount(0);
  await clickViewer(ana, -30, -30);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Name' })).toHaveValue('');
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Manual');
  await dialog.getByRole('button', { name: 'Create Spot' }).click();
  await expect.poll(() => activeTool(ana)).toBeNull();
  expect(await spotNames(ana, p.micrographId)).toContain('Manual');
});
