/**
 * A server that closes the connection while a download is waiting for a slow
 * reader (Sentry ELECTRON-34, 2026-11-04: 376 files into a OneDrive folder
 * on Windows; prod Apache closes every connection after 100 requests).
 *
 * The fetch built into Node 24 (undici 7.30.1) throws an uncatchable
 * AssertionError "assert(!this.paused)" there, and Electron showed "A
 * JavaScript error occurred in the main process". electron/main.js now
 * loads undici 8 from npm on its first line: loaded before anything fetches,
 * it becomes the connection pool of the built-in fetch too, so every fetch
 * in the main process (sync client included, which keeps calling the
 * built-in fetch so tests can still cut the network through it) uses the
 * fixed code. The main process also ignores that one assertion if it ever
 * comes again (electron/fatalErrors.js).
 *
 * The bug needs the reader to be stalled on a timer when the last bytes and
 * the close arrive. A slow disk does that with long, irregular stalls; a
 * reader that waits a few ms per piece does it reliably, so that is what
 * parts 1 and 2 use. This process loads undici first, as main.js does.
 *   1. In fresh processes: Node's built-in fetch throws the assertion (the
 *      test reproduces the bug; if a later Electron fixes it this says so),
 *      but not once undici 8 was loaded first, which electron/main.js does
 *      on its first line (checked too).
 *   2. Here (undici loaded first): the built-in fetch, which the sync
 *      client uses, does not throw it, and every download is whole.
 *   3. The real downloadFile with the server closing every connection:
 *      every file whole, no temp files left; and the client calls
 *      globalThis.fetch (the tests that cut the network rely on that).
 *   4. The real assertion is recognised; other errors still show the box.
 * Runs in Electron so it uses Electron's Node and its bundled undici.
 *
 *   npm run test:download-close
 */

// First, as on the first line of electron/main.js
require('undici');

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { app } = require('electron');
const { createSyncClient } = require('../electron/sync/client');
const { isUndiciPausedAssert, handleFatalError } = require('../electron/fatalErrors');

let failures = 0;
let passes = 0;
function check(label, ok, detail = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? `\n        ${String(detail).slice(0, 500)}` : ''}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SIZE = 2 * 1024 * 1024;
const files = Array.from({ length: 8 }, () => {
  const data = crypto.randomBytes(SIZE);
  return { data, sha: crypto.createHash('sha256').update(data).digest('hex') };
});
const bySha = new Map(files.map((f) => [f.sha, f.data]));

// Like the last answer on a prod Apache connection (Keep-Alive max=100)
const server = http.createServer((req, res) => {
  const sha = (req.url || '').split('/blobs/')[1];
  const data = (sha && bySha.get(sha)) || files[0].data;
  res.writeHead(200, { 'Content-Length': String(data.length), Connection: 'close' });
  res.end(data);
});

/** Errors nobody caught while fn ran */
async function uncaughtDuring(fn) {
  const seen = [];
  const onError = (e) => seen.push(e);
  process.on('uncaughtException', onError);
  let result;
  try {
    result = await fn();
  } finally {
    await sleep(200); // let socket 'end' handlers of the last download run
    process.off('uncaughtException', onError);
  }
  return { seen, result };
}

/** n downloads, the reader waiting 2 ms per piece; resolves the byte counts */
async function slowReads(fetchImpl, url, n) {
  const sizes = [];
  for (let i = 0; i < n; i++) {
    const res = await fetchImpl(url);
    let got = 0;
    for await (const chunk of res.body) {
      got += chunk.length;
      await sleep(2);
    }
    sizes.push(got);
  }
  return sizes;
}

let builtinSample = null;

/** Runs tests/downloadCloseChild.js in a fresh Electron-as-Node process */
function child(mode) {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'downloadCloseChild.js'), mode], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
    timeout: 60_000,
  });
  const line = String(r.stdout || '').trim().split('\n').pop() || '';
  try {
    return JSON.parse(line);
  } catch {
    return { asserts: -1, sample: null, other: [`child ${mode} did not report: ${r.stderr || r.error || line}`], sizes: [], size: 0, undici: '?' };
  }
}

async function main() {
  setTimeout(() => {
    console.log(`  FAIL  the run took more than 120 s\n\n${failures + 1} FAILED (${passes} passed)`);
    app.exit(1);
  }, 120_000).unref();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const restServer = `http://127.0.0.1:${server.address().port}`;
  const url = `${restServer}/microsync/v1/projects/1/blobs/${files[0].sha}`;
  console.log(`Electron ${process.versions.electron}, Node ${process.versions.node}, built-in undici ${process.versions.undici}, npm undici ${require('undici/package.json').version}`);

  // 1. Node's built-in fetch, each case in a fresh process (load order matters)
  {
    const builtin = child('builtin');
    builtinSample = builtin.sample;
    if (builtin.asserts > 0) console.log(`  built-in fetch: the assertion was thrown in ${builtin.asserts} of 10 downloads (bug reproduced)`);
    else console.log(`  NOTE  the built-in fetch no longer throws it (undici ${builtin.undici}); the npm undici may no longer be needed`);
    check('built-in fetch: no other uncaught error', builtin.other.length === 0, builtin.other[0]);
    // What the safety net relies on: once caught, the download still completes
    check('built-in fetch: downloads whole once the assertion is caught', builtin.sizes.every((n) => n === builtin.size), builtin.sizes.join(', '));

    const first = child('undici-first');
    check('undici loaded first: the built-in fetch no longer throws it', first.asserts === 0 && first.other.length === 0, JSON.stringify(first).slice(0, 300));
    check('undici loaded first: every download whole', first.sizes.every((n) => n === first.size), first.sizes.join(', '));

    // electron/main.js must load it before anything can fetch
    const mainCode = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('//') && !l.startsWith('process.env.'));
    check("electron/main.js: require('undici') is its first statement", mainCode[0] === "require('undici');", mainCode[0]);
  }

  // For part 4: the assertion as the built-in fetch threw it (this process
  // loaded undici 8 first, so it cannot throw it here)
  const realAssert = builtinSample && Object.assign(new Error(builtinSample.message), builtinSample);

  // 2. The built-in fetch here, where undici was loaded first
  {
    const { seen, result } = await uncaughtDuring(() => slowReads(fetch, url, 30));
    check('built-in fetch after undici: no uncaught error in 30 downloads', seen.length === 0, seen[0] && seen[0].stack);
    check('built-in fetch after undici: every download whole', result.every((n) => n === SIZE), result.join(', '));
  }

  // 3. The real downloadFile, as the app makes the client
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strabo-download-close-'));
    const client = createSyncClient({ restServer, getAccessToken: async () => 'token' });
    const { seen, result } = await uncaughtDuring(async () => {
      const out = [];
      for (const f of files) {
        const dest = path.join(dir, f.sha);
        try {
          await client.downloadFile(1, f.sha, dest);
          out.push(fs.readFileSync(dest).equals(f.data));
        } catch (err) {
          out.push(err);
        }
      }
      return out;
    });
    check('downloadFile: no uncaught error', seen.length === 0, seen[0] && seen[0].stack);
    check(`downloadFile: all ${files.length} files whole`, result.every((r) => r === true), result.find((r) => r !== true));
    const leftovers = fs.readdirSync(dir).filter((n) => n.includes('.download-'));
    check('downloadFile: no temp files left', leftovers.length === 0, leftovers.join(', '));

    // The tests that cut the network replace globalThis.fetch: it must be used
    const realFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async (u, o) => {
      calls++;
      return realFetch(u, o);
    };
    // (inside uncaughtDuring: an uncaught error here would open Electron's
    // error box and block the run)
    await uncaughtDuring(async () => {
      try {
        await createSyncClient({ restServer, getAccessToken: async () => 'token' }).downloadFile(1, files[0].sha, path.join(dir, 'via-global'));
      } catch (_) { /* counted below */ }
    });
    globalThis.fetch = realFetch;
    check('the sync client calls globalThis.fetch', calls === 1, `calls: ${calls}`);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 4. Recognising the assertion
  {
    const shown = [];
    const warned = [];
    const deps = { dialog: { showErrorBox: (t, c) => shown.push([t, c]) }, log: { warn: (...a) => warned.push(a) } };
    if (realAssert) {
      check('the real assertion is recognised', isUndiciPausedAssert(realAssert));
      check('the real assertion: no error box', handleFatalError(realAssert, deps) === 'ignored' && shown.length === 0, shown[0]);
      check('the real assertion: logged', warned.length === 1);
    }
    const otherAssert = new (require('assert').AssertionError)({ message: 'something else', actual: 1, expected: 2, operator: '===' });
    check('another AssertionError is not ignored', !isUndiciPausedAssert(otherAssert));
    if (builtinSample) {
      const otherUndiciAssert = Object.assign(new Error('assert(this.ptr != null)'), { code: 'ERR_ASSERTION', stack: builtinSample.stack.replace('assert(!this.paused)', 'assert(this.ptr != null)') });
      check('another undici assertion is not ignored', !isUndiciPausedAssert(otherUndiciAssert));
    }
    const sameTextElsewhere = Object.assign(new Error('assert(!this.paused)'), { code: 'ERR_ASSERTION', stack: 'Error: assert(!this.paused)\n    at mine (app.js:1:1)' });
    check('the same text outside undici is not ignored', !isUndiciPausedAssert(sameTextElsewhere));
    check('a plain Error is not ignored', !isUndiciPausedAssert(new Error('boom')));
    check('a non-error is not ignored', !isUndiciPausedAssert('assert(!this.paused) undici') && !isUndiciPausedAssert(undefined));
    const before = shown.length;
    const origError = console.error;
    console.error = () => {};
    const outcome = handleFatalError(new TypeError('boom'), deps);
    console.error = origError;
    check('other errors still show the error box', outcome === 'shown' && shown.length === before + 1 && shown[before][0] === 'A JavaScript error occurred in the main process' && shown[before][1].includes('TypeError: boom'), shown[before]);
  }

  server.close();
  console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nAll ${passes} checks passed`);
  app.exit(failures ? 1 : 0);
}

app.whenReady().then(main).catch((err) => {
  console.log(`  FAIL  ${err.stack}`);
  app.exit(1);
});
