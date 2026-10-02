/**
 * Which StraboSpot account this computer works as (collaboration spec v3
 * §11.4, 16d, 16at, 16ax, 16ba).
 *
 * - active: the account logged in now (with the configured server), or null.
 * - last: the last account that logged in on this computer, kept after
 *   logout; logged out, Recent Projects lists its copies ("Jason's copy")
 *   and they open for editing (16d).
 * - known: names of every account that logged in here, by server folder and
 *   pkey, so a copy's owner can be named ("This copy belongs to Jason Ash");
 *   a copy's sidecar only records the email.
 *
 * Stored in userData/accounts.json. The renderer reports every login state
 * change (auth:state-changed); this module then tells projectFolders which
 * account's copies a project id means.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const log = require('electron-log');
const projectFolders = require('./projectFolders');

const FILENAME = 'accounts.json';

/** @type {{ last: Account | null, known: Record<string, { name: string, email: string }> } | null} */
let record = null;
/** @type {Account | null} */
let active = null;

/**
 * @typedef {{ server: string, pkey: string, name: string, email: string }} Account
 */

function filePath() {
  return path.join(app.getPath('userData'), FILENAME);
}

function load() {
  if (record) return record;
  try {
    const data = JSON.parse(fs.readFileSync(filePath(), 'utf8'));
    record = {
      last: data && data.last && data.last.pkey ? data.last : null,
      known: data && data.known && typeof data.known === 'object' ? data.known : {},
    };
  } catch (_) {
    record = { last: null, known: {} };
  }
  return record;
}

function save() {
  try {
    const target = filePath();
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(record, null, 2), 'utf8');
    fs.renameSync(tmp, target);
  } catch (err) {
    log.warn(`[Accounts] Could not save ${FILENAME}: ${err.message}`);
  }
}

/** Key of an account in `known`: server folder name + pkey */
function accountKey(serverFolder, pkey) {
  return `${serverFolder}/${pkey}`;
}

/** The account for the copies a project id means: logged in, else the last one. */
function applyPreference() {
  const preferred = active || load().last;
  projectFolders.setPreferredAccount(preferred ? { server: preferred.server, pkey: preferred.pkey } : null);
}

/**
 * The renderer's login state changed (login, logout, startup check, expiry).
 * @param {{ pkey: string | number, name?: string, email?: string } | null} user - Logged-in user, or null
 * @param {string} restServer - The configured REST server
 */
function setLoggedIn(user, restServer) {
  if (user && user.pkey !== undefined && user.pkey !== null && /^\d+$/.test(String(user.pkey))) {
    const account = {
      server: restServer || 'https://strabospot.org',
      pkey: String(user.pkey),
      name: user.name || '',
      email: user.email || '',
    };
    active = account;
    const r = load();
    r.last = account;
    r.known[accountKey(projectFolders.serverFolderName(account.server), account.pkey)] = {
      name: account.name,
      email: account.email,
    };
    save();
  } else {
    active = null;
  }
  applyPreference();
}

/** @returns {Account | null} */
function getActive() {
  return active;
}

/** @returns {Account | null} */
function getLast() {
  return load().last;
}

/**
 * Name and email of an account that logged in here, or null.
 * @param {string} serverFolder - projectFolders.serverFolderName(server)
 * @param {string} pkey
 */
function describe(serverFolder, pkey) {
  return load().known[accountKey(serverFolder, String(pkey))] || null;
}

/** Same account: server folder and pkey */
function sameAccount(a, b) {
  return Boolean(a && b) && String(a.pkey) === String(b.pkey) &&
    projectFolders.serverFolderName(a.server) === projectFolders.serverFolderName(b.server);
}

/**
 * May this copy be opened now (16d, 16at)? Local-only copies always; an
 * account copy when it belongs to the logged-in account, or, logged out, to
 * the last account. Otherwise owner names who it belongs to.
 * @param {string} folderPath
 * @returns {{ ok: true } | { ok: false, owner: { name: string, email: string, server: string, pkey: string, otherServer: boolean } }}
 */
function checkCopyOwner(folderPath) {
  const copy = projectFolders.accountOfFolder(folderPath);
  if (!copy) return { ok: true };
  const allowed = active || load().last;
  if (allowed && String(allowed.pkey) === copy.pkey && projectFolders.serverFolderName(allowed.server) === copy.server) {
    return { ok: true };
  }
  const known = describe(copy.server, copy.pkey);
  let email = known ? known.email : '';
  if (!email) {
    // The sidecar records the email of the account the copy is bound to
    try {
      const state = JSON.parse(fs.readFileSync(path.join(folderPath, 'sync', 'state.json'), 'utf8'));
      email = (state && state.binding && state.binding.email) || '';
    } catch (_) { /* unknown */ }
  }
  // A copy of another server (the app is set to a different one): logging in does not help, Preferences does
  const otherServer = Boolean(allowed) && projectFolders.serverFolderName(allowed.server) !== copy.server;
  return { ok: false, owner: { name: known ? known.name : '', email, server: copy.server, pkey: copy.pkey, otherServer } };
}

/** For tests: forget the cached record and the logged-in account */
function resetForTest() {
  record = null;
  active = null;
}

module.exports = {
  setLoggedIn,
  getActive,
  getLast,
  describe,
  sameAccount,
  checkCopyOwner,
  applyPreference,
  resetForTest,
};
