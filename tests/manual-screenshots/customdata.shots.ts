/**
 * Manual figures for Custom User Data (section 7): the Tools dialog, the
 * import preview, a spot's section in the right pane and a
 * micrograph's table. The filled template is made from the downloaded one.
 */

import ExcelJS from 'exceljs';
import { test, expect } from '../e2e/lib/test';
import { ACCOUNTS } from '../e2e/lib/copy';
import { TOXAWAY, openDemo, setWindowSize, settle, shot, view } from './lib';

const REF = '160327-5 xz Reference Photomicrograph';

/** Demo values for the first spots of the reference (mineral, Mg#, size, analysis) */
const VALUES: Array<[string, string, string, string]> = [
  ['Garnet', '0.21', '850', 'EPMA-031'],
  ['Biotite', '0.48', '320', 'EPMA-032'],
  ['Plagioclase', '', '410', 'EPMA-033'],
  ['Garnet', '0.19', '1120', 'EPMA-034'],
  ['Quartz', '', '275', ''],
  ['Biotite', '0.51', '290', 'EPMA-035'],
  ['Garnet', '0.22', '960', 'EPMA-036'],
  ['Plagioclase', '', '380', 'EPMA-037'],
];

test('custom user data', async ({ launch, runDir }) => {
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await setWindowSize(ana, 1600, 1200);
  await openDemo(ana, TOXAWAY);
  const refId = await view(ana, REF);
  await settle(ana, 2000);

  // ---- The dialog (its help text is in the manual, so it stays closed)
  await ana.menu('Tools', 'Custom User Data...');
  let dlg = ana.page.getByRole('dialog', { name: 'Custom User Data' });
  await expect(dlg).toBeVisible();
  await ana.page.waitForTimeout(500);
  await shot(ana, 'custom-user-data-dialog', dlg);

  // ---- Download the template, fill it as a user would, import it
  const template = `${runDir}/template.xlsx`;
  await ana.answerDialog({ kind: 'save', filePath: template });
  await dlg.getByRole('button', { name: 'Download Template...' }).click();
  await expect(dlg.getByText(/^Saved \d+ rows/)).toBeVisible();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(template);
  const ws = wb.getWorksheet('Custom User Data');
  if (!ws) throw new Error('no data sheet');
  ['Mineral', 'Mg#', 'Grain size (µm)', 'Analysis'].forEach((h, i) => { ws.getCell(1, 5 + i).value = h; });
  let filled = 0;
  ws.eachRow((row, n) => {
    if (n === 1 || filled >= VALUES.length || row.getCell(2).value !== REF) return;
    VALUES[filled].forEach((v, i) => { if (v) row.getCell(5 + i).value = v; });
    filled++;
  });
  const filledPath = `${runDir}/Toxaway analyses.xlsx`;
  await wb.xlsx.writeFile(filledPath);
  await ana.answerDialog({ kind: 'open', filePaths: [filledPath] });
  await dlg.getByRole('button', { name: 'Import Filled Template...' }).click();
  const preview = ana.page.getByRole('dialog', { name: 'Import Toxaway analyses.xlsx?' });
  await expect(preview).toBeVisible();
  await ana.page.waitForTimeout(500);
  await shot(ana, 'custom-user-data-preview', preview);
  await preview.getByRole('button', { name: 'Apply Import' }).click();
  dlg = ana.page.getByRole('dialog', { name: 'Custom User Data' });
  await dlg.getByRole('button', { name: 'Close' }).click();
  await expect(dlg).toBeHidden();

  // ---- A spot's section in the right pane (the window, for context)
  const spotId = await ana.state(new Function('e', `
    for (const d of e.app.getState().project.datasets) for (const s of d.samples) for (const m of s.micrographs)
      if (m.id === ${JSON.stringify(refId)}) return (m.spots || []).find((x) => Object.keys(x.customUserData ?? {}).length === 4)?.id ?? null;
    return null;`) as never) as string | null;
  if (!spotId) throw new Error('no spot with four values');
  await ana.state(new Function('e', `return e.app.getState().selectActiveSpot(${JSON.stringify(spotId)})`) as never);
  await settle(ana, 1500);
  await shot(ana, 'custom-user-data-spot');

  // ---- The micrograph's table
  await ana.state(new Function('e', `
    e.app.getState().selectActiveSpot(null);
    return e.app.getState().selectMicrograph(${JSON.stringify(refId)});`) as never);
  await settle(ana, 1500);
  const pane = ana.page.getByText('Collected Data:').locator('..');
  await pane.getByText('Custom User Data', { exact: true }).click();
  await pane.getByRole('button', { name: 'Show Custom User Data...' }).click();
  const table = ana.page.getByRole('dialog', { name: /Custom User Data/ });
  await expect(table).toBeVisible();
  await ana.page.waitForTimeout(500);
  await shot(ana, 'custom-user-data-table', table);
});
