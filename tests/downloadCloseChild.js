/**
 * Helper for tests/downloadClose.electron.test.js, run in a fresh process
 * (Electron as Node) because what the built-in fetch uses depends on what
 * was loaded first.
 *   argv[2] = 'builtin'        nothing loaded first
 *           = 'undici-first'   require('undici') first, as electron/main.js does
 * Downloads a 2 MB file 10 times from a server that closes the connection,
 * the reader waiting 2 ms per piece, and prints one line of JSON:
 * { asserts, sample (the first assertion's name, code, message, stack),
 * other, sizes, size, undici }.
 */

if (process.argv[2] === 'undici-first') require('undici');

const http = require('http');
const crypto = require('crypto');

const SIZE = 2 * 1024 * 1024;
const FILE = crypto.randomBytes(SIZE);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let asserts = 0;
let sample = null;
const other = [];
process.on('uncaughtException', (e) => {
  if (e && e.code === 'ERR_ASSERTION' && String(e.message).includes('assert(!this.paused)')) {
    asserts++;
    if (!sample) sample = { name: e.name, code: e.code, message: e.message, stack: e.stack };
  } else other.push(String(e && e.stack));
});

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Length': String(SIZE), Connection: 'close' });
  res.end(FILE);
});

server.listen(0, '127.0.0.1', async () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  const sizes = [];
  for (let i = 0; i < 10; i++) {
    const res = await fetch(url);
    let got = 0;
    for await (const chunk of res.body) {
      got += chunk.length;
      await sleep(2);
    }
    sizes.push(got);
  }
  await sleep(200);
  console.log(JSON.stringify({ asserts, sample, other, sizes, size: SIZE, undici: process.versions.undici }));
  process.exit(0);
});
