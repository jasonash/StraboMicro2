/**
 * Error Report Bundle
 *
 * The StraboSpot error-report endpoint accepts exactly one log file per
 * report, but the app keeps two logs:
 *
 * - app.log (logService): startup banners plus renderer console.error,
 *   unhandled rejections and uncaught errors
 * - main.log (electron-log): everything the main process logs (imports,
 *   tile loading, uploads, updater, the error report itself)
 *
 * This module concatenates them into a single text document with a short
 * header and a section per file, so a report carries the whole picture.
 * Each file is limited to its most recent MAX_BYTES_PER_FILE bytes; when a
 * file is cut, the section header says so.
 */

const fs = require('fs');
const path = require('path');

// electron-log rotates main.log at 1 MB; logService rotates app.log at 5 MB.
// 2 MB per file keeps a report comfortably small while never cutting main.log.
const MAX_BYTES_PER_FILE = 2 * 1024 * 1024;

const RULE = '='.repeat(72);

/**
 * Read the tail of a file, at most maxBytes long.
 * @param {string} filePath
 * @param {number} maxBytes
 * @returns {{ text: string, size: number, truncated: boolean } | null}
 *   null when the file does not exist or cannot be read
 */
function readTail(filePath, maxBytes) {
  let size;
  try {
    size = fs.statSync(filePath).size;
  } catch {
    return null;
  }

  const start = Math.max(0, size - maxBytes);
  const length = size - start;
  const buffer = Buffer.alloc(length);

  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, length, start);
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      fs.closeSync(fd);
    }
  }

  let text = buffer.toString('utf8');
  const truncated = start > 0;
  if (truncated) {
    // Drop the partial first line so the section starts on a line boundary
    const firstNewline = text.indexOf('\n');
    if (firstNewline !== -1) {
      text = text.slice(firstNewline + 1);
    }
  }

  return { text, size, truncated };
}

function formatSection(label, filePath, tail) {
  const lines = [RULE, `${label}: ${filePath || '(no path)'}`];

  if (!tail) {
    lines.push('(file not found or unreadable)', RULE, '');
    return lines.join('\n');
  }

  if (tail.truncated) {
    lines.push(
      `(showing the last ${tail.text.length} bytes of ${tail.size}; earlier lines omitted)`
    );
  }
  lines.push(RULE, tail.text.endsWith('\n') ? tail.text : `${tail.text}\n`);
  return lines.join('\n');
}

/**
 * Build the combined log document sent with an error report.
 *
 * @param {object} options
 * @param {string} options.appVersion
 * @param {string} [options.appLogPath] - logService file (app.log)
 * @param {string} [options.mainLogPath] - electron-log file (main.log)
 * @param {{ platform?: string, arch?: string, electron?: string, node?: string }} [options.runtime]
 * @param {number} [options.maxBytesPerFile]
 * @returns {string}
 */
function buildErrorReportBundle(options) {
  const {
    appVersion,
    appLogPath,
    mainLogPath,
    runtime = {},
    maxBytesPerFile = MAX_BYTES_PER_FILE,
  } = options;

  const appTail = appLogPath ? readTail(appLogPath, maxBytesPerFile) : null;
  const mainTail = mainLogPath ? readTail(mainLogPath, maxBytesPerFile) : null;

  const describe = (name, tail) => (tail ? `${name} (${tail.size} bytes)` : `${name} (missing)`);

  const header = [
    RULE,
    'StraboMicro2 error report',
    RULE,
    `Version:   ${appVersion}`,
    `Platform:  ${runtime.platform || process.platform} ${runtime.arch || process.arch}`,
    `Electron:  ${runtime.electron || process.versions.electron || 'n/a'}`,
    `Node:      ${runtime.node || process.versions.node}`,
    `Generated: ${new Date().toISOString()}`,
    `Files:     ${describe(path.basename(appLogPath || 'app.log'), appTail)}, ` +
      `${describe(path.basename(mainLogPath || 'main.log'), mainTail)}`,
    RULE,
    '',
  ].join('\n');

  return (
    header +
    '\n' +
    formatSection('Renderer log', appLogPath, appTail) +
    '\n' +
    formatSection('Main process log', mainLogPath, mainTail)
  );
}

module.exports = { buildErrorReportBundle, readTail, MAX_BYTES_PER_FILE };
