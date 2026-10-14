/**
 * Custom User Data (docs/custom-user-data-design.md), stage 1: Tools >
 * Custom User Data... downloads the template (.xlsx with locked spot
 * columns), a filled file is checked and previewed, Apply Import stores the
 * values on the spots and the column order on the project as one undo step;
 * a broken file is refused with nothing changed. One copy, not synced.
 */

import fs from 'fs';
import ExcelJS from 'exceljs';
import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { openSmz } from '../lib/actions';
import type { FixtureProject } from '../lib/fixtures';

const LOCKED = ['Sample Name', 'Micrograph Name', 'Spot Name', 'Spot ID', 'Archived'];

/** Custom User Data as the store has it: column list + each spot's values by spot name */
async function stored(copy: Copy) {
  return copy.state(new Function('e', `
    const p = e.app.getState().project;
    const spots = {};
    for (const d of p?.datasets ?? []) for (const s of d.samples ?? []) for (const m of s.micrographs ?? [])
      for (const sp of m.spots ?? []) spots[sp.name] = sp.customUserData ?? null;
    return { columns: p?.customUserDataColumns ?? null, spots };
  `) as never) as Promise<{ columns: string[] | null; spots: Record<string, Record<string, string> | null> }>;
}

async function openTool(copy: Copy) {
  await copy.menu('Tools', 'Custom User Data...');
  const dialog = copy.page.getByRole('dialog', { name: 'Custom User Data' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function start(launch: (l: string, a: typeof ACCOUNTS.ana, o?: { login?: boolean }) => Promise<Copy>,
  project: (name: string, spotNames?: string[]) => Promise<FixtureProject>, name: string) {
  const p = await project(name, ['Garnet 1', 'Quartz 1']);
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  return { p, ana };
}

test('download the template, fill it, import it, undo it', async ({ launch, project, runDir }) => {
  const { p, ana } = await start(launch, project, 'E2E Custom Data');
  const dialog = await openTool(ana);
  await expect(dialog.getByText('This project has no Custom User Data yet.')).toBeVisible();

  await ana.caption('downloads the .xlsx template');
  const templatePath = `${runDir}/template.xlsx`;
  await ana.answerDialog({ kind: 'save', filePath: templatePath });
  await dialog.getByRole('button', { name: 'Download Template...' }).click();
  await expect(dialog.getByText(/Saved 2 rows/)).toBeVisible();

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(templatePath);
  const ws = wb.getWorksheet('Custom User Data');
  expect(ws).toBeTruthy();
  if (!ws) return;
  expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual(LOCKED);
  expect((ws.getRow(2).values as unknown[]).slice(1, 4)).toEqual(['TX-01', 'Overview', 'Garnet 1']);
  expect(ws.getCell('D2').value).toBe(p.spots[0].id);
  expect(wb.getWorksheet('Instructions')).toBeTruthy();

  await ana.caption('fills in two columns and imports the file');
  ws.getCell('F1').value = 'Mg#';
  ws.getCell('G1').value = 'Note';
  ws.getCell('F2').value = '0.820';
  ws.getCell('G2').value = 'rim, core';
  ws.getCell('F3').value = '<0.01';
  ws.getCell('C3').value = 'Quartz renamed in Excel';
  const filledPath = `${runDir}/filled.xlsx`;
  await wb.xlsx.writeFile(filledPath);
  await ana.answerDialog({ kind: 'open', filePaths: [filledPath] });
  await dialog.getByRole('button', { name: 'Import Filled Template...' }).click();

  const preview = ana.page.getByRole('dialog', { name: 'Import filled.xlsx?' });
  await expect(preview).toBeVisible();
  await expect(preview.getByText(/2 rows matched to spots\. 3 values on 2 spots/)).toBeVisible();
  await expect(preview.getByText('New columns: Mg#, Note')).toBeVisible();
  await expect(preview.getByText(/"Quartz renamed in Excel" in the file, "Quartz 1" in the project/)).toBeVisible();
  await preview.getByRole('button', { name: 'Apply Import' }).click();
  await expect(ana.page.getByText('Imported 3 values on 2 spots.')).toBeVisible();

  expect(await stored(ana)).toEqual({
    columns: ['Mg#', 'Note'],
    spots: { 'Garnet 1': { 'Mg#': '0.820', Note: 'rim, core' }, 'Quartz 1': { 'Mg#': '<0.01' } },
  });

  await ana.caption('the same file again changes nothing');
  await ana.answerDialog({ kind: 'open', filePaths: [filledPath] });
  await ana.page.getByRole('dialog', { name: 'Custom User Data' }).getByRole('button', { name: 'Import Filled Template...' }).click();
  const again = ana.page.getByRole('dialog', { name: 'Import filled.xlsx?' });
  await expect(again.getByText(/No values change\./)).toBeVisible();
  await expect(again.getByRole('button', { name: 'Apply Import' })).toBeDisabled();
  await again.getByRole('button', { name: 'Back' }).click();
  await ana.page.getByRole('dialog', { name: 'Custom User Data' }).getByRole('button', { name: 'Close' }).click();

  await ana.caption('Edit > Undo takes the whole import back');
  await ana.menu('Edit', 'Undo');
  await expect.poll(() => stored(ana)).toEqual({ columns: null, spots: { 'Garnet 1': null, 'Quartz 1': null } });
  expect(await ana.unansweredDialogs()).toEqual([]);
});

test('a file with a duplicate header is refused and nothing changes', async ({ launch, project, runDir }) => {
  const { p, ana } = await start(launch, project, 'E2E Custom Data Refused');
  const dialog = await openTool(ana);
  const csvPath = `${runDir}/bad.csv`;
  fs.writeFileSync(csvPath, `Spot ID,Mg#,mg# \r\n${p.spots[0].id},1,2\r\n`);
  await ana.answerDialog({ kind: 'open', filePaths: [csvPath] });
  await dialog.getByRole('button', { name: 'Import Filled Template...' }).click();
  await expect(dialog.getByText("bad.csv can't be imported")).toBeVisible();
  await expect(dialog.getByText(/"mg#" appears twice \(columns B and C\)/)).toBeVisible();
  expect(await stored(ana)).toEqual({ columns: null, spots: { 'Garnet 1': null, 'Quartz 1': null } });
});

/** Put Custom User Data on the fixture's spots through the store (as an import would) */
async function seed(copy: Copy, p: FixtureProject) {
  await copy.state(new Function('e', `
    const ids = ${JSON.stringify(p.spots.map((s) => s.id))};
    e.app.getState().changeCustomUserData((project) => {
      const next = structuredClone(project);
      next.customUserDataColumns = ['Mg#', 'Note'];
      for (const d of next.datasets) for (const s of d.samples) for (const m of s.micrographs) for (const sp of m.spots ?? []) {
        if (sp.id === ids[0]) sp.customUserData = { 'Mg#': '0.820', Note: 'rim, core' };
        if (sp.id === ids[1]) sp.customUserData = { 'Mg#': '<0.01' };
      }
      return next;
    });
  `) as never);
}

test('right pane: spot values, micrograph table, row click, remove column, remove all, undo', async ({ launch, project }) => {
  const { p, ana } = await start(launch, project, 'E2E Custom Data Pane');
  await seed(ana, p);
  const pane = ana.page.getByText('Collected Data:').locator('..');

  await ana.caption('a spot shows its values');
  await ana.state(new Function('e', `return e.app.getState().selectActiveSpot(${JSON.stringify(p.spots[0].id)})`) as never);
  await expect(pane.getByText('Custom User Data', { exact: true })).toBeVisible();
  await expect(pane.getByText('0.820')).toBeVisible();
  await expect(pane.getByText('rim, core')).toBeVisible();

  await ana.caption('the micrograph shows a count and the table');
  await ana.state(new Function('e', `
    e.app.getState().selectActiveSpot(null);
    return e.app.getState().selectMicrograph(${JSON.stringify(p.micrographId)});`) as never);
  await expect(pane.getByText('Custom User Data', { exact: true })).toBeVisible();
  await pane.getByText('Custom User Data', { exact: true }).click();
  await expect(pane.getByText('2 columns on 2 spots of this micrograph.')).toBeVisible();
  await pane.getByRole('button', { name: 'Show Custom User Data...' }).click();
  const table = ana.page.getByRole('dialog', { name: /Custom User Data/ });
  await expect(table.getByText('Overview: 2 spots, 2 columns')).toBeVisible();
  await expect(table.getByRole('row')).toHaveCount(3);
  await expect(table.getByRole('row', { name: /Quartz 1/ })).toContainText('<0.01');

  await ana.caption('a row click selects the spot');
  await table.getByRole('row', { name: /Quartz 1/ }).click();
  await expect(table).toBeHidden();
  await expect.poll(() => ana.state(new Function('e', 'return e.app.getState().activeSpotId') as never)).toBe(p.spots[1].id);

  await ana.caption('Remove column takes "Note" out of the whole project');
  await ana.state(new Function('e', `
    e.app.getState().selectActiveSpot(null);
    return e.app.getState().selectMicrograph(${JSON.stringify(p.micrographId)});`) as never);
  await pane.getByText('Custom User Data', { exact: true }).click();
  await pane.getByRole('button', { name: 'Show Custom User Data...' }).click();
  await table.getByRole('button', { name: 'Remove column Note' }).click();
  const confirm = ana.page.getByRole('dialog', { name: 'Remove the column "Note"?' });
  await expect(confirm.getByText(/1 spot has a value in it/)).toBeVisible();
  await confirm.getByRole('button', { name: 'Remove' }).click();
  await expect(table.getByText('Removed the column "Note".')).toBeVisible();
  expect(await stored(ana)).toEqual({ columns: ['Mg#'], spots: { 'Garnet 1': { 'Mg#': '0.820' }, 'Quartz 1': { 'Mg#': '<0.01' } } });

  await ana.caption('Remove All Custom User Data');
  await table.getByRole('button', { name: 'Remove All Custom User Data...' }).click();
  await ana.page.getByRole('dialog', { name: 'Remove all Custom User Data?' }).getByRole('button', { name: 'Remove' }).click();
  expect(await stored(ana)).toEqual({ columns: null, spots: { 'Garnet 1': null, 'Quartz 1': null } });
  await table.getByRole('button', { name: 'Close' }).last().click();
  await expect(pane.getByText('Custom User Data', { exact: true })).toBeHidden();

  await ana.caption('each remove is its own undo step');
  await ana.menu('Edit', 'Undo');
  await expect.poll(() => stored(ana)).toEqual({ columns: ['Mg#'], spots: { 'Garnet 1': { 'Mg#': '0.820' }, 'Quartz 1': { 'Mg#': '<0.01' } } });
  await ana.menu('Edit', 'Undo');
  await expect.poll(() => stored(ana)).toEqual({ columns: ['Mg#', 'Note'], spots: { 'Garnet 1': { 'Mg#': '0.820', Note: 'rim, core' }, 'Quartz 1': { 'Mg#': '<0.01' } } });
});
