/**
 * Last-used folder memory for file dialogs.
 *
 * Electron 43+ opens file dialogs in the user's Downloads folder whenever no
 * defaultPath is given, and the OS no longer restores the folder the user
 * last browsed to (electron/electron#49868). Before that change, macOS and
 * Windows remembered the last folder per app, so repeated imports from a
 * microscope's output folder were one click. This module restores that by
 * remembering the folder per dialog kind and persisting it across launches.
 *
 * Only open dialogs need this. Save dialogs pass a bare file name, which the
 * native dialog code still treats as "name only, folder chosen by the OS".
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const log = require('electron-log');

const STORE_FILE = 'dialog-dirs.json';

/** @type {Record<string, string> | null} */
let dirs = null;

function storePath() {
  return path.join(app.getPath('userData'), STORE_FILE);
}

function load() {
  if (dirs) return dirs;
  dirs = {};
  try {
    const file = storePath();
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        for (const [kind, dir] of Object.entries(parsed)) {
          if (typeof dir === 'string' && dir.length > 0) dirs[kind] = dir;
        }
      }
    }
  } catch (error) {
    log.warn('[DialogDirs] Could not read last-used folders:', error.message);
  }
  return dirs;
}

function save() {
  try {
    fs.writeFileSync(storePath(), JSON.stringify(dirs ?? {}, null, 2), 'utf8');
  } catch (error) {
    log.warn('[DialogDirs] Could not save last-used folders:', error.message);
  }
}

/**
 * Folder to open a dialog in, or undefined to let Electron pick its default.
 * A remembered folder that no longer exists (unplugged drive, deleted
 * project folder) is ignored rather than producing an unusable dialog.
 *
 * @param {string} kind - Dialog category, e.g. 'images', 'files', 'project'
 * @returns {string | undefined}
 */
function getDefaultPath(kind) {
  const dir = load()[kind];
  if (!dir) return undefined;
  try {
    if (fs.statSync(dir).isDirectory()) return dir;
  } catch {
    // fall through
  }
  return undefined;
}

/**
 * Remember the folder containing a chosen file for future dialogs of this kind.
 *
 * @param {string} kind - Dialog category
 * @param {string | undefined} filePath - A file the user picked
 */
function remember(kind, filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) return;
  const dir = path.dirname(filePath);
  const store = load();
  if (store[kind] === dir) return;
  store[kind] = dir;
  save();
}

module.exports = { getDefaultPath, remember };
