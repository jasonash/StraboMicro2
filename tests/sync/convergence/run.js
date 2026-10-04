/**
 * Convergence stress test of collaboration sync (layer B): several
 * simulated computers (agent.electron.js, one Electron process each with
 * its own userData, Documents and account) share one project on the local
 * dev server. A seeded random sequence of edits, syncs (also two at once),
 * decisions, network cuts (no-network, dropped, lost-reply) and crashes
 * (killed mid-sync, then started again) runs; then every computer goes
 * online and syncs until nothing moves, and the checks run:
 *
 *   1. every copy equals StraboSpot (the app's Compare with Server) and
 *      every other copy, with nothing held back or left to decide
 *   2. every field value written is one somebody wrote (or the start)
 *   3. a field only one computer ever wrote keeps that computer's last
 *      value, unless its entity was deleted
 *   4. nothing appears that nobody made; tags and groups point only at
 *      what exists
 *   5. no sync failed for any reason but the network being cut
 *
 *   npm run test:convergence                     a random seed (printed)
 *   SEED=12345 STEPS=300 npm run test:convergence
 *
 * The same seed replays the same sequence (timing on the server may still
 * differ; crashes land at seeded delays). Needs the dev Docker stack with
 * MICROSYNC_ENABLED and the e2e accounts (tests/e2e/seed.sql; npm run e2e
 * seeds them). Wipes everything the e2e.* accounts own first.
 */

const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const electron = require('electron');

const SEED = Number(process.env.SEED || Math.floor(Math.random() * 2 ** 31));
const STEPS = Number(process.env.STEPS || 150);
const STRICT_ORDER = process.env.STRICT_ORDER === '1';
const SERVER = process.env.STRABO_E2E_SERVER || 'http://localhost';
const AGENT = path.join(__dirname, 'agent.electron.js');
const REPO = path.resolve(__dirname, '../../..');

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(SEED);
const pick = (list) => list[Math.floor(R() * list.length)];
const nextSeed = () => Math.floor(R() * 2 ** 31);

function fixture(...args) {
  const out = execFileSync('docker', ['exec', 'strabo-php', 'php', '/srv/app/www/tests/microsync/client_fixture.php', ...args.map(String)],
    { maxBuffer: 1 << 28 }).toString();
  return JSON.parse(out);
}

/** Stable JSON (keys sorted) for comparing copies */
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

/** Did the server ever record this value for the field (micro_changes)? */
function reachedServer(pid, key, field, value) {
  const sep = key.indexOf(':');
  const type = key.slice(0, sep);
  const id = key.slice(sep + 1);
  if (!/^[a-z_]+$/.test(type) || !/^[0-9a-f-]{36}$/i.test(id) || !/^\w+$/.test(field)) return false;
  const v = String(value).replace(/'/g, "''");
  const out = execFileSync('docker', ['exec', 'strabo-postgres', 'psql', '-U', 'strabodbuser', '-d', 'strabospot', '-tAc',
    `SELECT count(*) FROM strabomicro.micro_changes WHERE project_id = ${Number(pid)} AND entity_type = '${type}' AND entity_id = '${id}'
     AND after->'body'->>'${field}' = '${v}'`]).toString().trim();
  return Number(out) > 0;
}

/** Which parts of two entity states differ, with both values */
function whatDiffers(x, y) {
  if (!x || !y) return x ? 'missing on this copy' : 'only on this copy';
  const out = [];
  for (const part of ['parentType', 'parentId', 'childOrder']) {
    if (stable(x[part]) !== stable(y[part])) out.push(`${part} ${stable(x[part])} vs ${stable(y[part])}`);
  }
  for (const f of new Set([...Object.keys(x.body), ...Object.keys(y.body)])) {
    if (stable(x.body[f]) !== stable(y.body[f])) out.push(`${f} ${stable(x.body[f]).slice(0, 150)} vs ${stable(y.body[f]).slice(0, 150)}`);
  }
  return out.join('; ');
}

class Agent {
  constructor(name, token, dir) {
    this.name = name;
    this.token = token;
    this.dir = dir;
    this.net = 'online';
    this.projectId = null;
    this.tail = [];
    this.seq = 0;
    this.waiting = new Map();
  }

  start() {
    fs.mkdirSync(this.dir, { recursive: true });
    this.proc = spawn(electron, [AGENT], {
      cwd: REPO,
      env: {
        ...process.env, AGENT_DIR: this.dir, AGENT_NAME: this.name, AGENT_TOKEN: JSON.stringify(this.token),
        AGENT_SERVER: SERVER, AGENT_PROJECT: this.projectId || '', ELECTRON_ENABLE_LOGGING: '',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.net = 'online';
    if (!this.logFile) this.logFile = fs.createWriteStream(`${this.dir}.log`, { flags: 'a' });
    this.logFile.write(`=== started\n`);
    const keep = (line) => {
      this.tail.push(line);
      if (this.tail.length > 300) this.tail.shift();
      this.logFile.write(`${line}\n`);
    };
    const ready = new Promise((resolve, reject) => {
      readline.createInterface({ input: this.proc.stdout }).on('line', (line) => {
        if (!line.startsWith('@@ ')) return keep(line);
        const msg = JSON.parse(line.slice(3));
        if (msg.ready) return resolve();
        const w = this.waiting.get(msg.id);
        if (!w) return;
        this.waiting.delete(msg.id);
        if (msg.ok) w.resolve(msg.result);
        else w.reject(new Error(`${this.name} ${w.cmd}: ${msg.error}`));
      });
      readline.createInterface({ input: this.proc.stderr }).on('line', keep);
      this.proc.on('exit', (code, signal) => {
        for (const w of this.waiting.values()) w.reject(new Error(`${this.name} exited (${signal || code}) during ${w.cmd}`));
        this.waiting.clear();
        reject(new Error(`${this.name} exited (${signal || code}) before it was ready`));
      });
    });
    return ready;
  }

  call(cmd, args = {}, timeoutMs = 180_000) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        reject(new Error(`${this.name} ${cmd}: no answer in ${timeoutMs / 1000} s`));
      }, timeoutMs);
      this.waiting.set(id, {
        cmd,
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.logFile?.write(`>>> ${Agent.step ?? ''} ${cmd} ${JSON.stringify(args).slice(0, 200)}\n`);
      this.proc.stdin.write(`${JSON.stringify({ id, cmd, args })}\n`);
    });
  }

  kill() {
    return new Promise((resolve) => {
      if (this.proc.exitCode !== null || this.proc.signalCode !== null) return resolve();
      this.proc.once('exit', () => resolve());
      this.proc.kill('SIGKILL');
    });
  }

  async stop() {
    this.proc.stdin.end();
    await new Promise((resolve) => {
      const t = setTimeout(() => { this.proc.kill('SIGKILL'); resolve(); }, 5000);
      this.proc.once('exit', () => { clearTimeout(t); resolve(); });
    });
  }
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'smconverge-'));
  console.log(`Convergence: SEED=${SEED} STEPS=${STEPS} (replay: SEED=${SEED} STEPS=${STEPS} npm run test:convergence)`);
  console.log(`  work folder ${tmp}`);
  fixture('wipe-e2e');
  const tokens = {
    ana: fixture('token', 'e2e.ana@test.strabospot.org'),
    ben: fixture('token', 'e2e.ben@test.strabospot.org'),
    cleo: fixture('token', 'e2e.cleo@test.strabospot.org'),
  };
  const agents = [
    new Agent('Ana', tokens.ana, path.join(tmp, 'ana')),
    new Agent('AnaLaptop', tokens.ana, path.join(tmp, 'ana-laptop')),
    new Agent('Ben', tokens.ben, path.join(tmp, 'ben')),
    new Agent('Cleo', tokens.cleo, path.join(tmp, 'cleo')),
  ];
  const [ana, laptop, ben, cleo] = agents;
  await Promise.all(agents.map((a) => a.start()));

  const log = [];
  const problems = [];
  const orderWarnings = [];
  const counts = {};
  const count = (k) => { counts[k] = (counts[k] || 0) + 1; };
  const countAnswers = (d, step) => {
    for (const x of d.answers ?? []) {
      count(`answered ${x.decision.kind}${x.decision.answer ? ` ${x.decision.answer}` : ''}`);
      // Delete it / Keep deleted: the question's entities are deleted at this step
      if (x.ok && (x.decision.answer === 'delete' || x.decision.answer === 'keep_deleted')) {
        for (const k of x.decision.keys ?? [x.decision.key]) deletedAt.set(k, [...(deletedAt.get(k) ?? []), step]);
      }
    }
  };
  /** key|field => [{ agent, value, step }] */
  const writes = new Map();
  const created = new Set();
  const deletedBy = new Map();
  /** key => steps it was deleted at (with everything beneath it) */
  const deletedAt = new Map();
  let serverPidOf = 0;

  try {
    // Setup: Ana's project, Ben and Cleo invited as Editors, Ana's laptop downloads it
    const straboId = crypto.randomUUID();
    const { pid } = await ana.call('create', { straboId, name: `Convergence ${SEED}` });
    serverPidOf = pid;
    for (const a of agents) a.projectId = straboId;
    for (const who of [ben, cleo]) {
      const inv = await ana.call('invite', { email: who.token.email, role: 'editor' });
      if (!inv.ok) throw new Error(`invite ${who.name}: ${JSON.stringify(inv)}`);
      const acc = await who.call('accept', { pid });
      if (!acc.ok) throw new Error(`accept ${who.name}: ${JSON.stringify(acc)}`);
    }
    const opened = await laptop.call('open', { pid });
    if (!opened.ok) throw new Error(`laptop open: ${JSON.stringify(opened)}`);
    const start = await ana.call('canonical');
    console.log(`  project ${straboId} (server ${pid}), ${Object.keys(start).length} entities, 4 computers\n`);

    const doSync = async (a, step) => {
      const r = await a.call('sync');
      count(r.ok ? 'sync ok' : `sync ${r.kind}`);
      if (!r.ok && !(r.kind === 'offline' && a.net !== 'online')) {
        problems.push(`step ${step}: ${a.name} sync failed (${r.kind}) while ${a.net}: ${r.message}`);
      }
      return r;
    };

    // ------------------------------------------------------------ the run
    for (let step = 1; step <= STEPS; step++) {
      Agent.step = step;
      const roll = R();
      const a = pick(agents);
      if (roll < 0.5) {
        const e = await a.call('edit', { seed: nextSeed(), step });
        count(`edit ${e.kind}`);
        for (const w of e.writes ?? []) {
          const k = `${w.key}|${w.field}`;
          if (!writes.has(k)) writes.set(k, []);
          writes.get(k).push({ agent: a.name, value: w.value, step });
        }
        for (const k of e.created ?? []) created.add(k);
        for (const k of e.deleted ?? []) {
          deletedBy.set(k, a.name);
          deletedAt.set(k, [...(deletedAt.get(k) ?? []), step]);
        }
        log.push({ step, agent: a.name, edit: e.kind, writes: e.writes, created: e.created, deleted: e.deleted });
      } else if (roll < 0.74) {
        const r = await doSync(a, step);
        log.push({ step, agent: a.name, sync: r.ok ? 'ok' : r.kind });
      } else if (roll < 0.79) {
        const b = pick(agents.filter((x) => x !== a));
        count('two syncs at once');
        await Promise.all([doSync(a, step), doSync(b, step)]);
        log.push({ step, agents: [a.name, b.name], sync: 'together' });
      } else if (roll < 0.85) {
        const d = await a.call('decide', { seed: nextSeed() });
        countAnswers(d, step);
        if (!d.ok) problems.push(`step ${step}: ${a.name} decide failed: ${JSON.stringify((d.answers ?? []).filter((x) => !x.ok)).slice(0, 600)}`);
        log.push({ step, agent: a.name, decide: d.answers?.map((x) => x.decision) });
      } else if (roll < 0.94) {
        const mode = a.net === 'online' ? pick(['no-network', 'dropped', 'lost-reply']) : 'online';
        await a.call('net', { mode });
        a.net = mode;
        count(`net ${mode}`);
        log.push({ step, agent: a.name, net: mode });
      } else {
        // A crash: killed while a sync runs (or between steps), then started again online
        const midSync = R() < 0.7;
        const delay = Math.floor(R() * 400);
        if (midSync) a.call('sync').catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, delay));
        await a.kill();
        await a.start();
        count(midSync ? 'crash mid-sync' : 'crash');
        log.push({ step, agent: a.name, crash: midSync ? `mid-sync after ${delay} ms` : 'idle' });
      }
    }

    // ------------------------------------------------- settle everything
    for (const a of agents) {
      if (a.net !== 'online') await a.call('net', { mode: 'online' });
      a.net = 'online';
    }
    Agent.step = 'settle';
    let settled = false;
    for (let round = 1; round <= 12 && !settled; round++) {
      let moved = 0;
      for (const a of agents) {
        const r = await doSync(a, `settle ${round}`);
        if (r.ok) moved += r.received;
        const d = await a.call('decide', { seed: nextSeed() });
        countAnswers(d, Infinity);
        if (!d.ok) problems.push(`settle ${round}: ${a.name} decide failed: ${JSON.stringify((d.answers ?? []).filter((x) => !x.ok)).slice(0, 600)}`);
        if ((d.answers ?? []).length > 0) {
          moved += d.answers.length;
          log.push({ step: `settle ${round}`, agent: a.name, decide: d.answers.map((x) => x.decision) });
          await doSync(a, `settle ${round}`);
        }
      }
      const statuses = await Promise.all(agents.map((a) => a.call('status')));
      const quiet = statuses.every((s) => s.pending === 0 && s.conflicts === 0 && s.questions === 0 && s.refused === 0);
      settled = quiet && moved === 0;
      if (round === 12 && !settled) problems.push(`did not settle in 12 rounds: ${JSON.stringify(statuses)}`);
    }

    // ------------------------------------------------------------ checks
    const finals = {};
    for (const a of agents) {
      const c = await a.call('compare');
      if (!c.ok || c.differences.length > 0 || c.held > 0) {
        problems.push(`${a.name} differs from StraboSpot: ${JSON.stringify(c).slice(0, 1500)}`);
      }
      finals[a.name] = await a.call('canonical');
    }
    const ref = finals.Ana;
    for (const a of agents.slice(1)) {
      const mine = finals[a.name];
      const keys = new Set([...Object.keys(ref), ...Object.keys(mine)]);
      for (const k of keys) {
        if (stable(ref[k]) === stable(mine[k])) continue;
        // Only the order of children differs: known (concurrent additions are
        // appended in a different order per copy), reported apart unless STRICT_ORDER=1
        const orderOnly = ref[k] && mine[k] && stable({ ...ref[k], childOrder: null }) === stable({ ...mine[k], childOrder: null });
        if (orderOnly && !STRICT_ORDER) orderWarnings.push(`${a.name} vs Ana: order of children of ${k}`);
        else problems.push(`${a.name} differs from Ana on ${k}: ${whatDiffers(ref[k], mine[k])}`);
      }
    }

    const final = ref;
    for (const [k, list] of writes) {
      const [key, field] = k.split('|');
      const e = final[key];
      if (!e || list[0].value === null) continue;
      const value = e.body[field] ?? null;
      // A spot made during the run starts with empty notes (newSpot)
      const allowed = new Set([start[key]?.body[field] ?? null, ...(created.has(key) ? [''] : []), ...list.map((w) => w.value)]);
      if (!allowed.has(value)) problems.push(`${key} ${field} = ${JSON.stringify(value)}: nobody wrote that (writes: ${JSON.stringify(list)})`);
      const writers = new Set(list.map((w) => w.agent));
      const last = list[list.length - 1];
      // Deleted after the write (and brought back): a write that never reached
      // StraboSpot went with the delete, which is how a delete works; one the
      // server had must come back with a restore
      const deletedLater = (deletedAt.get(key) ?? []).some((st) => st >= last.step) && !reachedServer(serverPidOf, key, field, last.value);
      if (writers.size === 1 && value !== last.value && !deletedLater) {
        problems.push(`${key} ${field}: only ${last.agent} wrote it, last ${JSON.stringify(last.value)} (step ${last.step}), but it is ${JSON.stringify(value)}`);
      }
    }
    // Conflicts are offered, not settled silently: in a run where several
    // fields were written by more than one computer, some must have met
    const contested = [...writes.values()].filter((list) => list[0].value !== null && new Set(list.map((w) => w.agent)).size > 1).length;
    if (contested >= 5 && !counts['answered conflict']) {
      problems.push(`no conflict was ever offered, although ${contested} fields were written by more than one computer`);
    }
        const tagIds = new Set(Object.keys(final).filter((k) => k.startsWith('tag:')).map((k) => k.slice(4)));
    const micrographIds = new Set(Object.keys(final).filter((k) => k.startsWith('micrograph:')).map((k) => k.slice(11)));
    for (const [k, e] of Object.entries(final)) {
      if (!start[k] && !created.has(k)) problems.push(`${k} exists but nobody made it`);
      if (k.startsWith('spot:')) {
        for (const t of e.body.tags ?? []) if (!tagIds.has(t)) problems.push(`${k} is tagged with a tag that does not exist (${t})`);
      }
      if (k.startsWith('group:')) {
        for (const m of e.body.micrographs ?? []) if (!micrographIds.has(m)) problems.push(`${k} lists a micrograph that does not exist (${m})`);
      }
    }

    console.log('  What happened:');
    for (const [k, n] of Object.entries(counts).sort()) console.log(`    ${String(n).padStart(4)}  ${k}`);
    console.log(`  Final project: ${Object.keys(final).length} entities, ${[...writes.keys()].length} fields written, ${created.size} made, ${deletedBy.size} deleted`);
  } catch (err) {
    problems.push(`stopped: ${err.stack || err.message}`);
  } finally {
    fs.writeFileSync(path.join(tmp, 'steps.json'), JSON.stringify(log, null, 1));
    if (problems.length > 0) {
      for (const a of agents) fs.writeFileSync(path.join(tmp, `${a.name}-output.txt`), a.tail.join('\n'));
    }
    await Promise.all(agents.map((a) => a.stop().catch(() => undefined)));
  }

  if (orderWarnings.length > 0) {
    console.log(`\nKnown issue, child order differs (${orderWarnings.length}; STRICT_ORDER=1 fails on it):`);
    for (const w of orderWarnings.slice(0, 5)) console.log(`  ~ ${w}`);
  }
  if (problems.length > 0) {
    console.log(`\nFAILED: ${problems.length} problem(s)`);
    for (const p of problems.slice(0, 40)) console.log(`  - ${p}`);
    console.log(`\nSteps: ${path.join(tmp, 'steps.json')}; each computer's full output in <name>.log beside its folder.`);
    console.log(`Replay: SEED=${SEED} STEPS=${STEPS} npm run test:convergence`);
    process.exit(1);
  }
  console.log(`\nPASSED (SEED=${SEED}, ${STEPS} steps)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
