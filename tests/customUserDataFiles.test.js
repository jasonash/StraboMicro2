/**
 * Custom User Data files (electron/customUserDataFiles.js): CSV write/parse
 * (quotes, line breaks, BOM, semicolon and tab files), .xlsx write/read
 * round trip, locked and unlocked columns, Excel-typed cells read as text.
 *
 *   npm run test:custom-user-data-files
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const ExcelJS = require('exceljs');
const unzipper = require('unzipper');
const { writeTable, readTable, parseCsv, toCsv, cellText } = require('../electron/customUserDataFiles');

let failures = 0;
let passes = 0;
function check(label, ok, detail = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cud-files-'));
const headers = ['Sample Name', 'Micrograph Name', 'Spot Name', 'Spot ID', 'Mg#', 'Notes'];
const rows = [
  ['Sample A', 'XPL', 'Spot 1', 'a-1', '0.820', 'has, comma'],
  ['Sample A', 'XPL', 'Spot "2"', 'b-2', '<0.01', 'two\nlines'],
  ['Sample B', 'PPL', 'Spöt ±3', 'c-3', '', ' padded '],
];
const table = { headers, rows, lockedCount: 4, instructions: ['StraboMicro Custom User Data', '', 'How to use'] };

async function main() {
  // ------------------------------------------------------------ CSV
  const csv = toCsv(headers, rows);
  check('csv: starts with BOM', csv.charCodeAt(0) === 0xfeff);
  check('csv: CRLF line ends', csv.includes('\r\n'));
  check('csv: parse(write) round trip', eq(parseCsv(csv), [headers, ...rows]), parseCsv(csv));
  check('csv: semicolon file', eq(parseCsv('Spot ID;Mg#\r\na;0,82\r\n'), [['Spot ID', 'Mg#'], ['a', '0,82']]));
  check('csv: tab file', eq(parseCsv('Spot ID\tMg#\na\t1\n'), [['Spot ID', 'Mg#'], ['a', '1']]));
  check('csv: comma wins a tie', eq(parseCsv('a,b;c\n1,2;3'), [['a', 'b;c'], ['1', '2;3']]));
  check('csv: delimiter inside quotes in the header ignored', eq(parseCsv('"a;b",c\n1,2'), [['a;b', 'c'], ['1', '2']]));
  check('csv: no final newline', eq(parseCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']]));
  check('csv: empty fields', eq(parseCsv('a,,c\n,,\n'), [['a', '', 'c'], ['', '', '']]));
  check('csv: doubled quotes', eq(parseCsv('"say ""hi"""\n'), [['say "hi"']]));

  const csvPath = path.join(dir, 't.csv');
  await writeTable(csvPath, table);
  const readCsv = await readTable(csvPath);
  check('csv file: headers', eq(readCsv.headers, headers));
  check('csv file: rows', eq(readCsv.rows, rows), readCsv.rows);

  fs.writeFileSync(path.join(dir, 'trail.csv'), 'Spot ID,Mg#,,\r\na,1,,\r\n,,,\r\n\r\n');
  const trail = await readTable(path.join(dir, 'trail.csv'));
  check('read: trailing empty cells and rows removed', eq(trail, { headers: ['Spot ID', 'Mg#'], rows: [['a', '1']] }), trail);

  // ------------------------------------------------------------ XLSX
  const xPath = path.join(dir, 't.xlsx');
  await writeTable(xPath, table);
  const readX = await readTable(xPath);
  check('xlsx: headers round trip', eq(readX.headers, headers), readX.headers);
  check('xlsx: rows round trip (text kept as typed)', eq(readX.rows, rows.map((r) => {
    const out = [...r];
    while (out.length && out[out.length - 1] === '') out.pop();
    return out;
  })), readX.rows);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xPath);
  const ws = wb.getWorksheet('Custom User Data');
  check('xlsx: data sheet first, Instructions second', wb.worksheets[0].name === 'Custom User Data' && wb.worksheets[1].name === 'Instructions');
  check('xlsx: instructions text', wb.getWorksheet('Instructions').getCell('A1').value === 'StraboMicro Custom User Data');
  check('xlsx: header frozen', ws.views[0]?.state === 'frozen' && ws.views[0]?.ySplit === 1);
  check('xlsx: header bold', ws.getCell('A1').font?.bold === true && ws.getCell('E1').font?.bold === true);
  check('xlsx: locked columns locked (cell default)', ws.getCell('D2').protection?.locked !== false);
  check('xlsx: value cells unlocked', ws.getCell('E2').protection?.locked === false && ws.getCell('E1').protection?.locked === false);
  check('xlsx: value cells are text format', ws.getCell('E2').numFmt === '@');
  check('xlsx: locked cells grey on spot rows', ws.getCell('A2').fill?.fgColor?.argb === 'FFE0E0E0' && ws.getCell('D4').fill?.fgColor?.argb === 'FFE0E0E0');
  check('xlsx: grey stops after the last spot row', !ws.getCell('A5').fill);
  check('xlsx: spare columns unlocked + text', ws.getColumn(7).protection?.locked === false && ws.getColumn(7).numFmt === '@' && ws.getColumn(300).protection?.locked === false);
  check('xlsx: locked columns not unlocked', ws.getColumn(4).protection?.locked !== false);

  const zip = await unzipper.Open.file(xPath);
  const sheetXml = (await zip.files.find((f) => f.path === 'xl/worksheets/sheet1.xml').buffer()).toString();
  const prot = sheetXml.match(/<sheetProtection[^>]*>/)?.[0] ?? '';
  check('xlsx: sheet protected, no password', prot.includes('sheet="1"') && !/password/i.test(prot), prot);
  check('xlsx: sort, filter, column widths allowed', /sort="0"/.test(prot) && /autoFilter="0"/.test(prot) && /formatColumns="0"/.test(prot), prot);

  // A file the user filled in Excel: numbers, dates, formulas, rich text, links
  const filled = new ExcelJS.Workbook();
  const fs1 = filled.addWorksheet('Custom User Data');
  fs1.addRow(['Spot ID', 'Num', 'Date', 'DateTime', 'Formula', 'Rich', 'Link', 'Bool']);
  fs1.addRow(['a', 0.82, new Date(Date.UTC(2026, 9, 14)), new Date(Date.UTC(2026, 9, 14, 13, 5)),
    { formula: '1+1', result: 2 }, { richText: [{ text: 'bo' }, { text: 'ld' }] }, { text: 'site', hyperlink: 'https://x' }, true]);
  const fPath = path.join(dir, 'filled.xlsx');
  await filled.xlsx.writeFile(fPath);
  const readF = await readTable(fPath);
  check('xlsx typed cells as text', eq(readF.rows[0], ['a', '0.82', '2026-10-14', '2026-10-14 13:05', '2', 'bold', 'site', 'TRUE']), readF.rows[0]);

  // Sheet renamed by the user: first non-Instructions sheet is read
  const renamed = new ExcelJS.Workbook();
  renamed.addWorksheet('Instructions').addRow(['x']);
  renamed.addWorksheet('Mine').addRow(['Spot ID', 'V']);
  renamed.getWorksheet('Mine').addRow(['a', 'v']);
  const rPath = path.join(dir, 'renamed.xlsx');
  await renamed.xlsx.writeFile(rPath);
  check('xlsx: renamed data sheet found', eq(await readTable(rPath), { headers: ['Spot ID', 'V'], rows: [['a', 'v']] }));

  check('cellText: null, NaN, formula without result', cellText(null) === '' && cellText(NaN) === '' && cellText({ formula: 'A1' }) === '');

  let threw = false;
  try { await readTable(path.join(dir, 'x.pdf')); } catch (e) { threw = /Unsupported file type/.test(e.message); }
  check('read: unsupported type refused', threw);

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
