/**
 * Custom User Data files (docs/custom-user-data-design.md)
 *
 * Writes the template / download as .xlsx or .csv and reads a filled one
 * back as plain text cells. What goes in the file (headers, rows, which
 * columns are locked) is decided by the renderer (src/utils/customUserData.ts);
 * this module only knows about files.
 *
 * .xlsx: the first `lockedCount` columns (names, Spot ID) are
 * locked with sheet protection (no password: a guardrail, the import check
 * is the real safety net), greyed on the rows with spots, header bold and
 * frozen; an "Instructions" sheet carries the text. Sorting, filtering and
 * column widths stay allowed (Excel still refuses to sort locked cells).
 * .csv: UTF-8 with a byte order mark (so Excel reads ± and accents), CRLF.
 * Reading a .csv accepts comma, semicolon (European Excel) or tab.
 */

const fs = require('fs');
const path = require('path');

const DATA_SHEET = 'Custom User Data';
const INSTRUCTIONS_SHEET = 'Instructions';
/** Unlocked columns written after the data, for headers the user adds */
const SPARE_COLUMNS = 300;
const LOCKED_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

/** ExcelJS is large; load it only when a Custom User Data file is used. */
function excel() {
  return require('exceljs');
}

function formatOf(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.xlsx') return 'xlsx';
  if (ext === '.csv' || ext === '.txt' || ext === '.tsv') return 'csv';
  return null;
}

// ---------------------------------------------------------------- CSV

function csvField(value) {
  const s = value == null ? '' : String(value);
  return /[",\r\n;\t]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows to CSV text (with BOM, CRLF line ends) */
function toCsv(headers, rows) {
  const lines = [headers, ...rows].map((r) => r.map(csvField).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** The delimiter of the header line: the most common of , ; tab outside quotes (comma on a tie). */
function detectDelimiter(text) {
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') quoted = !quoted;
    else if (!quoted && (c === '\n' || c === '\r')) break;
    else if (!quoted && c in counts) counts[c]++;
  }
  let best = ',';
  for (const d of [';', '\t']) if (counts[d] > counts[best]) best = d;
  return best;
}

/** CSV text to rows of strings (RFC 4180: quotes, doubled quotes, line breaks inside quotes). */
function parseCsv(input) {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delim = detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"' && field === '') { quoted = true; i++; continue; }
    if (c === delim) { row.push(field); field = ''; i++; continue; }
    if (c === '\r' || c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
      i += c === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += c; i++;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// ---------------------------------------------------------------- XLSX

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** A date cell as text: 2026-10-14, or 2026-10-14 13:05 when it has a time (Excel dates are read as UTC). */
function dateText(d) {
  const day = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) return day;
  const secs = d.getUTCSeconds() ? `:${pad2(d.getUTCSeconds())}` : '';
  return `${day} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}${secs}`;
}

/** Any ExcelJS cell value as the text it shows */
function cellText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : dateText(v);
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text ?? '').join('');
    if ('result' in v) return cellText(v.result); // formula: its last calculated value
    if ('formula' in v || 'sharedFormula' in v) return '';
    if (typeof v.text === 'string') return v.text; // hyperlink
    if (typeof v.error === 'string') return v.error;
  }
  return String(v);
}

/**
 * Write the table as .xlsx.
 * @param {string} filePath
 * @param {{ headers: string[], rows: string[][], lockedCount: number, instructions: string[] }} table
 */
async function writeXlsx(filePath, table) {
  const ExcelJS = excel();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'StraboMicro';
  const ws = wb.addWorksheet(DATA_SHEET, { views: [{ state: 'frozen', ySplit: 1 }] });
  const { headers, rows, lockedCount } = table;

  ws.addRow(headers);
  for (const r of rows) ws.addRow(r);

  const total = headers.length + SPARE_COLUMNS;
  for (let c = 1; c <= total; c++) {
    const col = ws.getColumn(c);
    if (c <= lockedCount) {
      const longest = Math.max(headers[c - 1]?.length ?? 0, ...rows.map((r) => String(r[c - 1] ?? '').length));
      col.width = Math.min(Math.max(longest + 2, 10), 40);
    } else {
      col.width = c <= headers.length ? Math.min(Math.max((headers[c - 1]?.length ?? 0) + 2, 12), 40) : 12;
      col.protection = { locked: false };
      col.numFmt = '@'; // text: what the user types is kept as typed (0.820 stays 0.820)
    }
  }
  // Cells with content carry their own style, so set lock + fill per cell too
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    for (let c = 1; c <= headers.length; c++) {
      const cell = row.getCell(c);
      if (rowNumber === 1) cell.font = { bold: true };
      if (c <= lockedCount) {
        cell.fill = LOCKED_FILL;
      } else {
        cell.protection = { locked: false };
        cell.numFmt = '@';
      }
    }
  });
  await ws.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatColumns: true,
    formatCells: true,
    autoFilter: true,
    sort: true,
  });

  const info = wb.addWorksheet(INSTRUCTIONS_SHEET);
  info.getColumn(1).width = 110;
  table.instructions.forEach((line, i) => {
    const cell = info.getCell(i + 1, 1);
    cell.value = line;
    cell.alignment = { wrapText: true, vertical: 'top' };
    if (i === 0) cell.font = { bold: true, size: 14 };
  });

  await wb.xlsx.writeFile(filePath);
}

/** Read the data sheet of an .xlsx file as rows of text */
async function readXlsx(filePath) {
  const ExcelJS = excel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.getWorksheet(DATA_SHEET) ?? wb.worksheets.find((w) => w.name !== INSTRUCTIONS_SHEET);
  if (!ws) return [];
  const rows = [];
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells = [];
    for (let c = 1; c <= row.cellCount; c++) cells.push(cellText(row.getCell(c).value));
    rows[rowNumber - 1] = cells;
  });
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}

// ---------------------------------------------------------------- API

/**
 * Write a Custom User Data table to .xlsx or .csv (by extension).
 * @param {string} filePath
 * @param {{ headers: string[], rows: string[][], lockedCount: number, instructions: string[] }} table
 */
async function writeTable(filePath, table) {
  const format = formatOf(filePath);
  if (format === 'xlsx') return writeXlsx(filePath, table);
  if (format === 'csv') return fs.promises.writeFile(filePath, toCsv(table.headers, table.rows), 'utf8');
  throw new Error(`Unsupported file type: ${path.extname(filePath) || 'none'}`);
}

/**
 * Read a filled table: the header row and the rows below it as text, with
 * trailing empty rows and cells removed.
 * @param {string} filePath
 * @returns {Promise<{ headers: string[], rows: string[][] }>}
 */
async function readTable(filePath) {
  const format = formatOf(filePath);
  let raw;
  if (format === 'xlsx') raw = await readXlsx(filePath);
  else if (format === 'csv') raw = parseCsv(await fs.promises.readFile(filePath, 'utf8'));
  else throw new Error(`Unsupported file type: ${path.extname(filePath) || 'none'}. Use .xlsx or .csv.`);

  const trimEnd = (r) => {
    let n = r.length;
    while (n > 0 && String(r[n - 1] ?? '').trim() === '') n--;
    return r.slice(0, n).map((v) => String(v ?? ''));
  };
  const rows = raw.map(trimEnd);
  while (rows.length > 0 && rows[rows.length - 1].length === 0) rows.pop();
  const [headers = [], ...body] = rows;
  return { headers, rows: body };
}

module.exports = { writeTable, readTable, parseCsv, toCsv, cellText, DATA_SHEET, INSTRUCTIONS_SHEET };
