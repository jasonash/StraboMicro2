/**
 * The sync client gives up on a silent connection (electron/sync/client.js
 * TIMEOUTS; found in the gap 4 test 2026-10-05: with the network gone in
 * the middle of a download nothing failed for minutes). A local HTTP server
 * plays a connection that goes quiet: no answer, an answer that stops, a
 * download that stops. Each must turn into 'offline' within the stall time,
 * and a slow but steady download must not.
 *
 *   npm run test:client-timeouts
 */

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createSyncClient, SyncError } = require('../../electron/sync/client');

let failures = 0;
let passes = 0;
function check(label, ok, detail = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FILE = crypto.randomBytes(64 * 1024);
const SHA = crypto.createHash('sha256').update(FILE).digest('hex');

/** What the server does, by path */
const server = http.createServer((req, res) => {
  const url = req.url || '';
  if (url.endsWith('/silent')) return; // never answers
  if (url.endsWith('/stops')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('{"a":'); // then nothing
    return;
  }
  if (url.endsWith('/ok')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }
  if (url.includes('/blobs/stops-')) {
    res.writeHead(200, { 'Content-Length': String(FILE.length) });
    res.write(FILE.subarray(0, 1000)); // then nothing
    return;
  }
  if (url.includes('/blobs/slow-')) {
    // Steady but slow: a piece every 150 ms, longer in total than the stall time
    res.writeHead(200, { 'Content-Length': String(FILE.length) });
    let at = 0;
    const step = FILE.length / 8;
    const t = setInterval(() => {
      res.write(FILE.subarray(at, at + step));
      at += step;
      if (at >= FILE.length) {
        clearInterval(t);
        res.end();
      }
    }, 150);
    return;
  }
  res.writeHead(404);
  res.end();
});

async function main() {
  // Without the timeouts these requests would wait minutes: fail instead
  setTimeout(() => {
    console.log(`  FAIL  the run took more than 30 s (a request never gave up)\n\n${failures + 1} FAILED (${passes} passed)`);
    process.exit(1);
  }, 30_000).unref();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const STALL = 400;
  const client = createSyncClient({
    restServer: `http://127.0.0.1:${port}`,
    getAccessToken: async () => 'token',
    timeouts: { answerMs: STALL, stallMs: STALL },
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smclient-'));

  const timed = async (fn) => {
    const t0 = Date.now();
    try {
      await fn();
      return { err: null, ms: Date.now() - t0 };
    } catch (err) {
      return { err, ms: Date.now() - t0 };
    }
  };
  const offline = (r) => r.err instanceof SyncError && r.err.kind === 'offline';

  let r = await timed(() => client.request('GET', '/silent'));
  check('no answer: offline', offline(r), r.err && r.err.message);
  check('no answer: within the answer time', r.ms < STALL + 500, `${r.ms} ms`);

  r = await timed(() => client.request('GET', '/stops'));
  check('an answer that stops: offline', offline(r), r.err && r.err.message);
  check('an answer that stops: within the stall time', r.ms < 2 * STALL + 500, `${r.ms} ms`);

  r = await timed(() => client.request('GET', '/ok'));
  check('a normal answer still works', r.err === null, r.err && r.err.message);

  const dest = path.join(dir, 'a.bin');
  r = await timed(() => client.downloadFile(1, `stops-${SHA}`, dest));
  check('a download that stops: offline', offline(r), r.err && r.err.message);
  check('a download that stops: within the stall time', r.ms < 2 * STALL + 500, `${r.ms} ms`);
  check('a download that stops: nothing left behind', fs.readdirSync(dir).length === 0, fs.readdirSync(dir));

  // A slow but steady download (pieces 150 ms apart, 1.2 s in all) is not cut off;
  // the server sends sha-named content, so give the real hash as the name
  const slowClient = createSyncClient({
    restServer: `http://127.0.0.1:${port}`,
    getAccessToken: async () => 'token',
    timeouts: { answerMs: STALL, stallMs: STALL },
    fetchImpl: (url, init) => fetch(String(url).replace(`/blobs/${SHA}`, `/blobs/slow-${SHA}`), init),
  });
  r = await timed(() => slowClient.downloadFile(1, SHA, dest));
  check('a slow but steady download finishes', r.err === null && fs.existsSync(dest), r.err && r.err.message);
  check('... and took longer than the stall time', r.ms > STALL, `${r.ms} ms`);

  // A big request body gets more time for the answer to begin
  const bigClient = createSyncClient({
    restServer: `http://127.0.0.1:${port}`,
    getAccessToken: async () => 'token',
    timeouts: { answerMs: 100, stallMs: STALL, minBytesPerSecond: 1024 * 1024 },
  });
  r = await timed(() => bigClient.request('PUT', '/silent', { body: Buffer.alloc(1024 * 1024) }));
  check('1 MB at 1 MB/s: about a second more to answer', offline(r) && r.ms >= 1000 && r.ms < 1800, `${r.ms} ms`);

  fs.rmSync(dir, { recursive: true, force: true });
  server.closeAllConnections();
  server.close();
  console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nALL PASSED (${passes} checks)`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
