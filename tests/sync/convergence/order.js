/**
 * Fixed scenarios of concurrent additions the random convergence test
 * rarely lines up: (1) child order (bug A): two or three computers each add
 * a spot to the same micrograph before syncing; every copy and StraboSpot
 * must list the spots in the same order; (2) sketch strokes merge per item:
 * two computers each draw a stroke on the same layer; both stay everywhere.
 *
 *   npm run test:order
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Agent, fixture } = require('./run');

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'smorder-'));
  fixture('wipe-e2e');
  const ana = new Agent('Ana', fixture('token', 'e2e.ana@test.strabospot.org'), path.join(tmp, 'ana'));
  const ben = new Agent('Ben', fixture('token', 'e2e.ben@test.strabospot.org'), path.join(tmp, 'ben'));
  const cleo = new Agent('Cleo', fixture('token', 'e2e.cleo@test.strabospot.org'), path.join(tmp, 'cleo'));
  const agents = [ana, ben, cleo];
  let failures = 0;
  const check = (label, ok, detail = '') => {
    if (!ok) failures++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${!ok && detail ? `\n        ${detail}` : ''}`);
  };
  try {
    await Promise.all(agents.map((a) => a.start()));
    const straboId = crypto.randomUUID();
    const { pid } = await ana.call('create', { straboId, name: 'Order test' });
    for (const who of [ben, cleo]) {
      await ana.call('invite', { email: who.token.email, role: 'editor' });
      const acc = await who.call('accept', { pid });
      if (!acc.ok) throw new Error(`accept: ${JSON.stringify(acc)}`);
    }
    const order = async (m) => Object.fromEntries(await Promise.all(agents.map(async (a) => [a.name, await a.call('spotOrder', { micrograph: m })])));
    const serverOrder = (m) => {
      const a = fixture('assembled', pid);
      for (const d of a.project.datasets) for (const s of d.samples) for (const mm of s.micrographs) if (mm.id === m) return mm.spots.map((x) => x.name);
      return null;
    };
    const settle = async () => {
      for (let i = 0; i < 3; i++) for (const a of agents) await a.call('sync');
    };
    const same = async (label, m) => {
      const o = await order(m);
      const srv = serverOrder(m);
      const all = [...Object.values(o), srv].map((x) => JSON.stringify(x));
      check(label, all.every((x) => x === all[0]), JSON.stringify({ ...o, server: srv }));
    };

    // Two at once, then three at once with different sync orders
    const a1 = await ana.call('addSpotNamed', { name: 'Ana 1' });
    await ben.call('addSpotNamed', { name: 'Ben 1' });
    await ana.call('sync');
    await ben.call('sync');
    await settle();
    await same('two computers add a spot each: one order everywhere', a1.micrograph);

    await cleo.call('addSpotNamed', { name: 'Cleo 2' });
    await ben.call('addSpotNamed', { name: 'Ben 2' });
    await ana.call('addSpotNamed', { name: 'Ana 2' });
    await cleo.call('sync');
    await ana.call('sync');
    await ben.call('sync');
    await settle();
    await same('three computers add a spot each: one order everywhere', a1.micrograph);

    // Interleaved: one syncs between the others' additions
    await ana.call('addSpotNamed', { name: 'Ana 3' });
    await ana.call('sync');
    await ben.call('addSpotNamed', { name: 'Ben 3' });
    await cleo.call('addSpotNamed', { name: 'Cleo 3' });
    await cleo.call('sync');
    await ben.call('sync');
    await settle();
    await same('interleaved additions: one order everywhere', a1.micrograph);

    // Sketch strokes drawn on the same layer at once: both kept (per-item merge)
    await ana.call('addStrokeNamed');
    await settle();
    const sA = await ana.call('addStrokeNamed');
    const sB = await ben.call('addStrokeNamed');
    await ana.call('sync');
    await ben.call('sync');
    await settle();
    for (const a of agents) {
      const ids = await a.call('strokeIds');
      check(`${a.name}: both strokes drawn at once are kept`, ids.includes(sA.id) && ids.includes(sB.id), JSON.stringify(ids));
    }
  } catch (err) {
    failures++;
    console.log(`  FAIL  stopped: ${err.stack || err.message}`);
  } finally {
    await Promise.all(agents.map((a) => a.stop().catch(() => undefined)));
  }
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
}

main();
