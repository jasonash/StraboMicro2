/**
 * What people see when a model download fails (electron/downloadError.js).
 * Sentry ELECTRON-2Z (2026-10-25): a user in China (huggingface.co blocked)
 * got "Failed to download FastSAM model: request to https://huggingface.co/...
 * failed, reason: " with nothing after "reason:".
 * Drives the real downloaders (FastSAM: node-fetch, Grain Spot: Node's fetch)
 * against local servers that fail each way: nothing listening, a name that
 * does not resolve, an HTTP error, and a connection that drops partway.
 * Runs in Electron (both services need app.getPath).
 *
 *   npm run test:model-download-error
 */

import { app } from 'electron';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);

let failures = 0;
let passes = 0;
function check(label, ok, detail = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? `\n        ${String(detail).slice(0, 500)}` : ''}`);
  }
}

/** A server that answers every request with handler(req, res); resolves its base URL */
function serve(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

/** A port nothing listens on (bound, then closed) */
async function closedPort() {
  const { server, base } = await serve(() => {});
  await new Promise((resolve) => server.close(resolve));
  return base;
}

const REACH = 'Could not reach';
const DROPPED = 'dropped partway through the download';
const HTTP = 'could not provide the model right now (HTTP 503)';

async function run() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'model-download-error-'));
  app.setPath('userData', tmp);
  process.env.STRABO_GRAIN_MODEL_DIR = path.join(tmp, 'grain');

  const fastsam = require('../electron/fastsamService.js');
  const grainSpot = require('../electron/grainSpotModel.js');
  const { downloadFailure, errorDetail } = require('../electron/downloadError.js');

  const sent = 'x'.repeat(1000);
  const unavailable = await serve((req, res) => {
    res.writeHead(503, { 'Content-Type': 'text/plain' });
    res.end('busy');
  });
  // Headers promise 1 MB, 1000 bytes arrive, then the connection is cut
  const dropping = await serve((req, res) => {
    res.writeHead(200, { 'Content-Length': String(1_000_000) });
    res.write(sent, () => setTimeout(() => res.socket.destroy(), 50));
  });
  const fine = await serve((req, res) => {
    res.writeHead(200, { 'Content-Length': String(sent.length) });
    res.end(sent);
  });
  const nothing = await closedPort();

  const cases = [
    { label: 'nothing listening', base: nothing, expect: REACH, host: nothing.replace('http://', '') },
    { label: 'name does not resolve', base: 'http://model-host.invalid', expect: REACH, host: 'model-host.invalid' },
    { label: 'HTTP 503', base: unavailable.base, expect: HTTP },
    { label: 'connection dropped partway', base: dropping.base, expect: DROPPED },
  ];

  const fastsamPath = path.join(tmp, 'models', 'FastSAM-x.onnx');
  for (const c of cases) {
    process.env.STRABO_FASTSAM_MODEL_URL = `${c.base}/FastSAM-x.onnx`;
    let message = '';
    try {
      await fastsam.downloadModel();
    } catch (error) {
      message = error.message;
    }
    check(`FastSAM, ${c.label}: says what happened`, message.startsWith('The FastSAM model did not download. ') && message.includes(c.expect), message);
    if (c.host) check(`FastSAM, ${c.label}: names the host`, message.includes(c.host) && message.includes('Some networks and countries block'), message);
    check(`FastSAM, ${c.label}: no raw "reason:" text`, !message.includes('reason:'), message);
    check(`FastSAM, ${c.label}: nothing left behind`, !fs.existsSync(fastsamPath) && !fs.existsSync(`${fastsamPath}.downloading`));
  }

  process.env.STRABO_FASTSAM_MODEL_URL = `${fine.base}/FastSAM-x.onnx`;
  const saved = await fastsam.downloadModel().catch((error) => error);
  check('FastSAM, working server: still downloads', saved === fastsamPath && fs.readFileSync(fastsamPath, 'utf8') === sent, saved);

  // Grain Spot's base URL is read on each download; its IPC handler sends error.message to the prompt
  for (const c of cases) {
    process.env.STRABO_GRAIN_MODEL_URL = c.base;
    let message = '';
    try {
      await grainSpot.download();
    } catch (error) {
      message = error.message;
      check(`Grain Spot, ${c.label}: raw error kept for the log`, typeof error.detail === 'string' && error.detail.length > 0, error.detail);
    }
    check(`Grain Spot, ${c.label}: says what happened`, message.includes(c.expect), message);
    if (c.host) check(`Grain Spot, ${c.label}: names the host`, message.includes(c.host), message);
    check(`Grain Spot, ${c.label}: not the bare "fetch failed"`, !/fetch failed|terminated/.test(message), message);
  }

  // errorDetail follows causes and AggregateError lists (what Node's fetch gives for a timed-out connection)
  const timedOut = Object.assign(new AggregateError([Object.assign(new Error('connect ETIMEDOUT 1.2.3.4:443'), { code: 'ETIMEDOUT' })], ''), { code: 'ETIMEDOUT' });
  const detail = errorDetail(new TypeError('fetch failed', { cause: timedOut }));
  check('errorDetail: the whole chain', detail === 'fetch failed <- ETIMEDOUT AggregateError <- connect ETIMEDOUT 1.2.3.4:443', detail);
  check('downloadFailure: http detail', downloadFailure('http', 'https://huggingface.co/x', { status: 404 }).detail === 'HTTP 404');
  check('downloadFailure: bad url still has a host word', downloadFailure('connect', 'not a url').message.startsWith('Could not reach the download server'));

  for (const s of [unavailable, dropping, fine]) s.server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

app.whenReady().then(async () => {
  try {
    await run();
  } catch (error) {
    failures++;
    console.log('  FAIL  test crashed:', error);
  }
  console.log(`model download errors: ${passes} passed, ${failures} failed`);
  app.exit(failures ? 1 : 0);
});
