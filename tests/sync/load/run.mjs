/**
 * Workshop load test of collaboration sync: one owner and MEMBERS people on
 * one project, on the local dev server. Each simulated person speaks the
 * app's protocol directly (REST + live channel), so the load falls on the
 * server, not on many app windows on this computer. Tests the server only;
 * the app's merge is tested by npm run test:convergence.
 *
 *   1. Everyone joins through a join link: Approve All, timed
 *   2. Everyone downloads the project and its image at once, each person's
 *      speed capped at KBPS, while a probe times ordinary requests
 *   3. A working session of MINUTES: everyone is on the live channel with
 *      presence, adds a spot about every EDIT_SECONDS, and pulls on each
 *      notice, like the app; halfway, everyone pushes at the same moment
 *   4. Checks: no refused push, no server errors, every copy saw every spot,
 *      and the server holds exactly those spots
 *
 *   npm run test:load
 *   MEMBERS=25 IMAGE_MB=100 KBPS=5000 MINUTES=3 EDIT_SECONDS=10 npm run test:load
 *
 * Needs the dev Docker stack with MICROSYNC_ENABLED. Makes load.* accounts
 * under @test.strabospot.org and deletes them and their project at the end.
 */

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

const MEMBERS = Number(process.env.MEMBERS || 25);
const IMAGE_MB = Number(process.env.IMAGE_MB || 100);
const KBPS = Number(process.env.KBPS || 5000);
const MINUTES = Number(process.env.MINUTES || 3);
const EDIT_SECONDS = Number(process.env.EDIT_SECONDS || 10);
const SERVER = process.env.STRABO_E2E_SERVER || 'http://localhost';
const API = `${SERVER}/microsync/v1`;
const LIVE = `${SERVER.replace(/^http/, 'ws')}/microsync/live`;

function fixture(...args) {
  const out = execFileSync('docker', ['exec', 'strabo-php', 'php', '/srv/app/www/tests/microsync/load_fixture.php', ...args],
    { maxBuffer: 1 << 26 }).toString();
  return JSON.parse(out);
}

/** What went wrong and how long things took, by name */
const times = new Map();
const problems = [];
function record(name, ms) {
  if (!times.has(name)) times.set(name, []);
  times.get(name).push(ms);
}
function summary(name) {
  const list = [...(times.get(name) || [])].sort((a, b) => a - b);
  if (list.length === 0) return `${name}: none`;
  const at = (p) => Math.round(list[Math.min(list.length - 1, Math.floor(list.length * p))]);
  return `${name}: n=${list.length} median ${at(0.5)} ms, p95 ${at(0.95)} ms, max ${at(1)} ms`;
}

async function call(person, method, path, { json, body, timed } = {}) {
  const t = performance.now();
  const headers = { Authorization: `Bearer ${person.token}` };
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  if (body !== undefined) headers['Content-Type'] = 'application/octet-stream';
  const res = await fetch(API + path, { method, headers, body: json !== undefined ? JSON.stringify(json) : body });
  const text = await res.text();
  if (timed) record(timed, performance.now() - t);
  if (!res.ok) {
    problems.push(`${person.email} ${method} ${path} -> ${res.status} ${text.slice(0, 200)}`);
    throw new Error(`HTTP ${res.status}`);
  }
  return text ? JSON.parse(text) : null;
}

/** A polygon spot about as large as a hand-drawn one */
function spotBody(name) {
  const points = Array.from({ length: 40 }, (_, i) => ({ X: 1000 + i * 3, Y: 2000 - i * 2 }));
  return { name, geometryType: 'polygon', points, labelColor: '#ffffff', showLabel: true, notes: 'x'.repeat(300) };
}

async function upload(owner, pid, data, sha) {
  const start = await call(owner, 'POST', `/projects/${pid}/uploads`, { json: { sha256: sha, size: data.length, kind: 'image' } });
  if (start.complete) return;
  for (let at = start.received || 0; at < data.length; at += start.chunkSize) {
    await call(owner, 'PUT', `/projects/${pid}/uploads/${start.uploadId}?offset=${at}`, { body: data.subarray(at, at + start.chunkSize) });
  }
  await call(owner, 'POST', `/projects/${pid}/uploads/${start.uploadId}/complete`);
}

/** Read a download no faster than KBPS, as one person on shared Wi-Fi would */
async function download(person, pid, sha, size) {
  const t = performance.now();
  const res = await fetch(`${API}/projects/${pid}/blobs/${sha}`, { headers: { Authorization: `Bearer ${person.token}` } });
  if (!res.ok) {
    problems.push(`${person.email} download -> ${res.status}`);
    return;
  }
  const hash = crypto.createHash('sha256');
  let got = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    hash.update(value);
    got += value.length;
    const due = (got / 1024 / KBPS) * 1000 - (performance.now() - t);
    if (due > 5) await sleep(due);
  }
  record('download whole image', performance.now() - t);
  if (got !== size || hash.digest('hex') !== sha) problems.push(`${person.email} download was damaged (${got} of ${size} bytes)`);
}

/** Every notice heard: [seq, when] */
const noticed = [];

/** One person in the working session */
class Person {
  constructor(account, pid, micrographId) {
    Object.assign(this, account);
    this.pid = pid;
    this.micrographId = micrographId;
    this.clientId = crypto.randomUUID();
    this.seen = new Set();
    this.seq = 0;
    this.pulling = false;
    this.pullAgain = false;
    this.accepted = [];
    this.people = 0;
    this.closed = false;
  }

  connect(sent) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(LIVE);
      this.ws = ws;
      const giveUp = setTimeout(() => reject(new Error(`${this.email}: live channel never subscribed`)), 30_000);
      ws.onopen = () => ws.send(JSON.stringify({ t: 'auth', token: this.token }));
      ws.onerror = () => {};
      ws.onclose = (e) => {
        if (!this.closed) problems.push(`${this.email} live channel closed: ${e.code} ${e.reason}`);
      };
      ws.onmessage = (e) => {
        const m = JSON.parse(String(e.data));
        if (m.t === 'ready') ws.send(JSON.stringify({ t: 'sub', pid: this.pid }));
        else if (m.t === 'nosub') problems.push(`${this.email} not followed: ${m.error}`);
        else if (m.t === 'subbed') {
          clearTimeout(giveUp);
          ws.send(JSON.stringify({ t: 'presence', pid: this.pid, state: 'here', viewing: { type: 'micrograph', id: this.micrographId } }));
          resolve();
        } else if (m.t === 'presence') this.people = (m.people || []).length;
        else if (m.t === 'error') problems.push(`${this.email} live error: ${JSON.stringify(m)}`);
        else if (m.t === 'changed' && m.by !== this.clientId) {
          // Often before the pusher's own answer, so matched up at the end
          noticed.push([Number(m.seq), performance.now()]);
          void this.pull();
        }
      };
    });
  }

  /** On a notice: pull, one at a time, again if another notice came meanwhile */
  async pull() {
    if (this.pulling) {
      this.pullAgain = true;
      return;
    }
    this.pulling = true;
    try {
      do {
        this.pullAgain = false;
        let more = true;
        while (more) {
          const r = await call(this, 'GET', `/projects/${this.pid}/changes?since=${this.seq}&limit=1000`, { timed: 'pull' });
          for (const c of r.changes) {
            if (c.type === 'spot' || c.entityType === 'spot') this.seen.add(c.id ?? c.entityId);
          }
          this.seq = Math.max(this.seq, Number(r.headSeq) || 0);
          more = r.more === true;
        }
      } while (this.pullAgain);
    } catch (_) {
      // counted in problems; the final pull tries again
    } finally {
      this.pulling = false;
    }
  }

  async addSpot(sent, label) {
    const id = crypto.randomUUID();
    const before = performance.now();
    const r = await call(this, 'POST', `/projects/${this.pid}/push`, {
      timed: label,
      json: {
        pushId: crypto.randomUUID(),
        clientId: this.clientId,
        changes: [{ op: 'create', type: 'spot', id, parentType: 'micrograph', parentId: this.micrographId, body: spotBody(`${this.email} ${id.slice(0, 6)}`) }],
      },
    });
    const result = r.results[0];
    if (result.status !== 'accepted') {
      problems.push(`${this.email} push not accepted: ${JSON.stringify(result)}`);
      return;
    }
    if (result.seq) sent.set(Number(result.seq), before);
    this.accepted.push(id);
    this.seen.add(id);
  }

  close() {
    this.closed = true;
    this.ws?.close();
  }
}

function dockerLoad() {
  try {
    return execFileSync('docker', ['stats', '--no-stream', '--format', '{{.Name}} {{.CPUPerc}} {{.MemUsage}}']).toString().trim().split('\n')
      .filter((l) => /strabo-(php|postgres|live)/.test(l)).map((l) => l.split(' / ')[0]).join(', ');
  } catch (_) {
    return 'unavailable';
  }
}

async function main() {
  console.log(`${MEMBERS} members, ${IMAGE_MB} MB image, ${KBPS} KB/s each, ${MINUTES} min session, a spot every ${EDIT_SECONDS} s each\n`);
  const accounts = fixture('setup', String(MEMBERS));
  const owner = accounts.find((a) => a.email.startsWith('load.owner'));
  const members = accounts.filter((a) => a !== owner);
  try {
    // ------------------------------------------------------------- project
    const straboId = crypto.randomUUID();
    const dataset = crypto.randomUUID();
    const sample = crypto.randomUUID();
    const micrograph = crypto.randomUUID();
    const { pid } = await call(owner, 'POST', '/projects', { json: { straboId, name: 'Workshop load test' } });
    await call(owner, 'POST', `/projects/${pid}/push`, {
      json: {
        pushId: crypto.randomUUID(),
        clientId: crypto.randomUUID(),
        changes: [
          { op: 'create', type: 'project', id: straboId, body: { name: 'Workshop load test' } },
          { op: 'create', type: 'dataset', id: dataset, parentType: 'project', parentId: straboId, body: { name: 'Dataset' } },
          { op: 'create', type: 'sample', id: sample, parentType: 'dataset', parentId: dataset, body: { name: 'Sample' } },
          { op: 'create', type: 'micrograph', id: micrograph, parentType: 'sample', parentId: sample, body: { name: 'Reference', imageWidth: 10000, imageHeight: 8000 } },
        ],
      },
    });
    const image = crypto.randomBytes(IMAGE_MB * 1024 * 1024);
    const sha = crypto.createHash('sha256').update(image).digest('hex');
    await upload(owner, pid, image, sha);
    await call(owner, 'PUT', `/projects/${pid}/refs`, { json: { entityType: 'micrograph', entityId: micrograph, role: 'image', sha256: sha } });
    await call(owner, 'POST', `/projects/${pid}/ready`);

    // ---------------------------------------------------------------- join
    const joined = fixture('join', String(pid));
    console.log(`Join: everyone asked in ${joined.askMs} ms; Approve All took ${joined.approveAllMs} ms for ${joined.approved} people (emails only filed on dev)`);
    if (joined.approved !== MEMBERS) problems.push(`Approve All approved ${joined.approved} of ${MEMBERS}: ${joined.refused}`);

    // ------------------------------------------------------------ download
    let probing = true;
    const probe = (async () => {
      while (probing) {
        await call(owner, 'GET', `/projects/${pid}/members`, { timed: 'ordinary request during downloads' }).catch(() => {});
        await sleep(500);
      }
    })();
    const dlStart = performance.now();
    await Promise.all(members.map(async (m) => {
      await call(m, 'GET', `/projects/${pid}/snapshot`, { timed: 'snapshot' });
      await download(m, pid, sha, image.length);
    }));
    probing = false;
    await probe;
    console.log(`Download: all ${MEMBERS} finished in ${Math.round((performance.now() - dlStart) / 1000)} s; ${dockerLoad()}`);

    // ------------------------------------------------------------- session
    const sent = new Map();
    const people = members.map((m) => new Person(m, pid, micrograph));
    await Promise.all(people.map((p) => p.connect(sent)));
    await sleep(2500);
    const present = people.map((p) => p.people);
    console.log(`Live: ${people.length} connected, each sees ${Math.min(...present)} to ${Math.max(...present)} people present`);
    if (Math.min(...present) < MEMBERS) problems.push(`presence showed only ${Math.min(...present)} of ${MEMBERS}`);

    const endAt = performance.now() + MINUTES * 60_000;
    let spiked = false;
    await Promise.all(people.map(async (p, i) => {
      await sleep((i / people.length) * EDIT_SECONDS * 1000);
      while (performance.now() < endAt) {
        await p.addSpot(sent, 'push').catch(() => {});
        await sleep(EDIT_SECONDS * 1000 * (0.5 + Math.random()));
      }
    }).concat((async () => {
      await sleep(MINUTES * 30_000);
      spiked = true;
      console.log(`Spike at the halfway point; ${dockerLoad()}`);
      await Promise.all(people.flatMap((p) => [p.addSpot(sent, 'push in the spike').catch(() => {})]));
    })()));
    console.log(`Session finished${spiked ? '' : ' (no spike!)'}; ${dockerLoad()}`);

    // -------------------------------------------------------------- settle
    await sleep(3000);
    for (const p of people) await p.pull();
    const expected = new Set(people.flatMap((p) => p.accepted));
    let incomplete = 0;
    for (const p of people) {
      const missing = [...expected].filter((id) => !p.seen.has(id));
      if (missing.length > 0) {
        incomplete++;
        problems.push(`${p.email} never saw ${missing.length} spots`);
      }
    }
    const snap = await call(owner, 'GET', `/projects/${pid}/snapshot`);
    const onServer = (snap.entities || []).filter((e) => e.type === 'spot').map((e) => e.id);
    if (onServer.length !== expected.size || onServer.some((id) => !expected.has(id))) {
      problems.push(`the server holds ${onServer.length} spots, ${expected.size} were accepted`);
    }
    people.forEach((p) => p.close());
    for (const [seq, at] of noticed) {
      if (sent.has(seq)) record('notice after the push was sent', at - sent.get(seq));
    }
    console.log(`Result: ${expected.size} spots accepted, ${onServer.length} on the server, ${people.length - incomplete} of ${people.length} copies saw all of them\n`);

    for (const n of ['ordinary request during downloads', 'snapshot', 'download whole image', 'push', 'push in the spike', 'notice after the push was sent', 'pull']) {
      console.log(summary(n));
    }
  } finally {
    console.log(`\nCleanup: ${JSON.stringify(fixture('cleanup'))}`);
  }
  if (problems.length > 0) {
    console.log(`\nFAILED, ${problems.length} problems:\n${problems.slice(0, 30).join('\n')}`);
    process.exit(1);
  }
  console.log('\nPASSED');
}

main().catch((err) => {
  console.error(err);
  try {
    fixture('cleanup');
  } catch (_) { /* reported above */ }
  process.exit(1);
});
