/**
 * One simulated computer for the convergence stress test (run.js): its own
 * Documents and userData (AGENT_DIR), one account (AGENT_TOKEN), and the
 * app's sync service doing what the app does, step by step as the driver
 * asks over stdin (one JSON command per line; answers are '@@ ' lines).
 *
 * Edits change project.json the way the store does and save it with the
 * app's serializer; sync is the controller's order (push, pull, apply,
 * save, commit, push what the merge left); decisions are answered through
 * the decisions service like the dialog. The network can be cut in three
 * ways (no-network, dropped, lost-reply), as in the e2e tests.
 */

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const DIR = process.env.AGENT_DIR;
const NAME = process.env.AGENT_NAME;
const TOKEN = JSON.parse(process.env.AGENT_TOKEN || '{}');
const SERVER = process.env.AGENT_SERVER || 'http://localhost';
if (!DIR || !NAME || !TOKEN.token) {
  console.error('AGENT_DIR, AGENT_NAME and AGENT_TOKEN are required');
  process.exit(2);
}
app.setPath('documents', path.join(DIR, 'Documents'));
app.setPath('userData', path.join(DIR, 'userData'));
fs.mkdirSync(path.join(DIR, 'Documents'), { recursive: true });

const E = path.join(__dirname, '../../../electron');

/** Seeded random numbers (mulberry32) */
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
const pick = (r, list) => list[Math.floor(r() * list.length)];

app.whenReady().then(async () => {
  const tokenService = require(`${E}/tokenService`);
  const stored = { accessToken: TOKEN.token, refreshToken: 'r', expiresAt: Date.now() + 3600_000,
    user: { pkey: String(TOKEN.pkey), email: TOKEN.email, name: NAME } };
  tokenService.getTokens = async () => JSON.parse(JSON.stringify(stored));
  tokenService.saveTokens = async () => {};
  tokenService.clearTokens = async () => {};

  const svc = require(`${E}/sync/syncService`);
  const ser = require(`${E}/projectSerializer`);
  const projectFolders = require(`${E}/projectFolders`);
  const { applyEntityChanges, explode, perUserFields } = await import(`${E}/shared/entityModel.mjs`);
  const sharp = require('sharp');

  let projectId = process.env.AGENT_PROJECT || null;
  const realFetch = globalThis.fetch;

  // ---------------------------------------------------------------- network
  function setNet(mode) {
    if (mode === 'online') {
      globalThis.fetch = realFetch;
      return;
    }
    const code = mode === 'no-network' ? 'ECONNREFUSED' : 'ECONNRESET';
    globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!url.startsWith(SERVER)) return realFetch(input, init);
      const fail = () => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error(code), { code }) });
      if (mode === 'lost-reply') {
        const res = await realFetch(input, init);
        await res.arrayBuffer().catch(() => undefined);
        throw fail();
      }
      throw fail();
    };
  }

  // ---------------------------------------------------------------- project
  const load = () => ser.loadProjectJson(projectId);
  const save = (p) => ser.saveProjectJson(p, projectId);
  const all = (p) => {
    const out = { datasets: [], samples: [], micrographs: [], spots: [] };
    for (const d of p.datasets ?? []) {
      out.datasets.push(d);
      for (const s of d.samples ?? []) {
        out.samples.push(s);
        for (const m of s.micrographs ?? []) {
          out.micrographs.push(m);
          for (const sp of m.spots ?? []) out.spots.push({ spot: sp, micrograph: m });
        }
      }
    }
    return out;
  };

  async function image(seed) {
    const r = rng(seed);
    const circles = [];
    for (let i = 0; i < 30; i++) {
      circles.push(`<circle cx="${Math.floor(r() * 800)}" cy="${Math.floor(r() * 600)}" r="${20 + Math.floor(r() * 60)}" fill="rgb(${Math.floor(90 + r() * 140)},120,90)"/>`);
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#333"/>${circles.join('')}</svg>`;
    return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
  }

  function newSpot(name, x, y) {
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(), name, labelColor: '0xffffffff', showLabel: true, color: '0x00ff00ff', opacity: 50,
      date: now, time: now, notes: '', modifiedTimestamp: Date.now(), geometryType: 'polygon',
      points: [{ X: x, Y: y }, { X: x + 120, Y: y - 30 }, { X: x + 90, Y: y + 80 }], associatedFiles: [], links: [], tags: [],
    };
  }

  /** The owner's starting project: a reference micrograph with a child on it, spots on both, tags, a group */
  async function create({ straboId, name }) {
    projectId = straboId;
    const now = new Date().toISOString();
    const micro = (id, mname, parentID) => ({
      id, name: mname, imageType: 'Plane Polarized Light', width: 800, height: 600, imageWidth: 800, imageHeight: 600,
      opacity: 1, scale: '', polish: false, polishDescription: '', description: '', notes: '', scalePixelsPerCentimeter: 20000,
      rotation: 0, spots: [], orientationInfo: { orientationMethod: 'unoriented' }, associatedFiles: [], links: [],
      isMicroVisible: true, isExpanded: false, isSpotExpanded: false, isFlipped: false, tags: [],
      ...(parentID ? { parentID, offsetInParent: { X: 100, Y: 80 }, scaleX: 0.4, scaleY: 0.4, pointInParent: null } : {}),
    });
    const ref = micro(crypto.randomUUID(), 'Reference', null);
    const child = micro(crypto.randomUUID(), 'Detail', ref.id);
    ref.spots = ['Garnet', 'Quartz', 'Biotite', 'Plagioclase'].map((n, i) => newSpot(n, 60 + i * 150, 120 + i * 90));
    child.spots = ['Rim', 'Core'].map((n, i) => newSpot(n, 80 + i * 200, 150));
    const tags = ['Porphyroblast', 'Matrix'].map((n) => ({ id: crypto.randomUUID(), name: n, tagType: 'Other', notes: '' }));
    ref.spots[0].tags = [tags[0].id];
    const project = {
      id: straboId, name, startDate: '', endDate: '', purposeOfStudy: '', otherTeamMembers: '', areaOfInterest: '',
      instrumentsUsed: '', gpsDatum: 'WGS84', magneticDeclination: '', notes: '', date: now, modifiedTimestamp: now,
      projectLocation: '',
      datasets: [{
        id: crypto.randomUUID(), name: 'Thin sections', date: now, modifiedTimestamp: now,
        samples: [{
          id: crypto.randomUUID(), existsOnServer: false, label: 'CV-01', sampleID: 'CV-01', igsn: '', longitude: 0, latitude: 0,
          mainSamplingPurpose: '', sampleDescription: '', materialType: '', inplacenessOfSample: '', orientedSample: '',
          sampleSize: '', degreeOfWeathering: '', sampleNotes: '', sampleType: '', color: '', lithology: '', sampleUnit: '',
          otherMaterialType: '', sampleOrientationNotes: '', otherSamplingPurpose: '',
          micrographs: [ref, child], isExpanded: false, isSpotExpanded: false,
        }],
      }],
      groups: [{ id: crypto.randomUUID(), name: 'Overview set', micrographs: [ref.id], spotIDs: [] }],
      tags,
    };
    const folder = path.join(projectFolders.getStraboMicro2DataPath(), straboId);
    fs.mkdirSync(path.join(folder, 'images'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'images', ref.id), await image(1));
    fs.writeFileSync(path.join(folder, 'images', child.id), await image(2));
    fs.writeFileSync(path.join(folder, 'project.json'), JSON.stringify(project, null, 2));
    await save(await load());
    const on = await svc.turnOn(straboId, SERVER, 'manual');
    if (!on.ok) throw new Error(`turn on: ${JSON.stringify(on)}`);
    for (let i = 0; i < 10; i++) {
      const r = await svc.push(straboId, SERVER, () => {});
      if (!r.ok) throw new Error(`first upload: ${JSON.stringify(r)}`);
      if (r.ready) return { pid: on.pid };
    }
    throw new Error('first upload never ready');
  }

  // ------------------------------------------------------------------ edits
  const WEIGHTS = [
    ['spotField', 30], ['micrographField', 10], ['sampleField', 5], ['datasetName', 3], ['projectNotes', 3],
    ['addSpot', 12], ['deleteSpot', 7], ['moveSpot', 6], ['tagSpot', 8], ['untagSpot', 4], ['groupMicrograph', 4],
    ['addTag', 3], ['deleteTag', 2], ['deleteChildMicrograph', 1],
  ];
  const TOTAL = WEIGHTS.reduce((n, [, w]) => n + w, 0);

  /** One random edit, chosen from this copy's project by the step's seed; returns what it wrote */
  async function edit({ seed, step }) {
    const r = rng(seed);
    const p = await load();
    const a = all(p);
    const value = `${NAME}#${step}`;
    let roll = r() * TOTAL;
    let kind = WEIGHTS[0][0];
    for (const [k, w] of WEIGHTS) {
      if ((roll -= w) < 0) {
        kind = k;
        break;
      }
    }
    const writes = [];
    const created = [];
    const deleted = [];
    const touchSpot = (sp) => { sp.modifiedTimestamp = Date.now(); };
    switch (kind) {
      case 'spotField': {
        if (a.spots.length === 0) return { kind: 'none' };
        const { spot } = pick(r, a.spots);
        const field = pick(r, ['name', 'notes']);
        spot[field] = value;
        touchSpot(spot);
        writes.push({ key: `spot:${spot.id}`, field, value });
        break;
      }
      case 'micrographField': {
        const m = pick(r, a.micrographs);
        if (!m) return { kind: 'none' };
        const field = pick(r, ['name', 'notes', 'description']);
        m[field] = value;
        writes.push({ key: `micrograph:${m.id}`, field, value });
        break;
      }
      case 'sampleField': {
        const s = pick(r, a.samples);
        const field = pick(r, ['sampleNotes', 'sampleDescription']);
        s[field] = value;
        writes.push({ key: `sample:${s.id}`, field, value });
        break;
      }
      case 'datasetName': {
        const d = pick(r, a.datasets);
        d.name = value;
        writes.push({ key: `dataset:${d.id}`, field: 'name', value });
        break;
      }
      case 'projectNotes':
        p.notes = value;
        writes.push({ key: `project:${p.id}`, field: 'notes', value });
        break;
      case 'addSpot': {
        const m = pick(r, a.micrographs);
        if (!m) return { kind: 'none' };
        const sp = newSpot(value, 50 + Math.floor(r() * 500), 50 + Math.floor(r() * 400));
        m.spots = [...(m.spots ?? []), sp];
        created.push(`spot:${sp.id}`);
        writes.push({ key: `spot:${sp.id}`, field: 'name', value });
        break;
      }
      case 'deleteSpot': {
        if (a.spots.length === 0) return { kind: 'none' };
        const { spot, micrograph } = pick(r, a.spots);
        micrograph.spots = micrograph.spots.filter((x) => x.id !== spot.id);
        deleted.push(`spot:${spot.id}`);
        break;
      }
      case 'moveSpot': {
        if (a.spots.length === 0) return { kind: 'none' };
        const { spot } = pick(r, a.spots);
        const dx = Math.floor(r() * 40) - 20;
        spot.points = (spot.points ?? []).map((pt) => ({ X: pt.X + dx, Y: pt.Y + dx }));
        touchSpot(spot);
        writes.push({ key: `spot:${spot.id}`, field: 'points', value: null });
        break;
      }
      case 'tagSpot':
      case 'untagSpot': {
        const tags = p.tags ?? [];
        if (a.spots.length === 0 || tags.length === 0) return { kind: 'none' };
        const { spot } = pick(r, a.spots);
        const tag = pick(r, tags);
        const has = (spot.tags ?? []).includes(tag.id);
        if (kind === 'tagSpot' && !has) spot.tags = [...(spot.tags ?? []), tag.id];
        else if (kind === 'untagSpot' && has) spot.tags = spot.tags.filter((t) => t !== tag.id);
        else return { kind: 'none' };
        writes.push({ key: `spot:${spot.id}`, field: 'tags', value: null });
        break;
      }
      case 'groupMicrograph': {
        const g = pick(r, p.groups ?? []);
        const m = pick(r, a.micrographs);
        if (!g || !m) return { kind: 'none' };
        const list = g.micrographs ?? [];
        g.micrographs = list.includes(m.id) ? list.filter((x) => x !== m.id) : [...list, m.id];
        writes.push({ key: `group:${g.id}`, field: 'micrographs', value: null });
        break;
      }
      case 'addTag': {
        const t = { id: crypto.randomUUID(), name: value, tagType: 'Other', notes: '' };
        p.tags = [...(p.tags ?? []), t];
        created.push(`tag:${t.id}`);
        writes.push({ key: `tag:${t.id}`, field: 'name', value });
        break;
      }
      case 'deleteTag': {
        const t = pick(r, p.tags ?? []);
        if (!t) return { kind: 'none' };
        // The store removes a deleted tag from its spots too
        p.tags = p.tags.filter((x) => x.id !== t.id);
        for (const { spot } of a.spots) if ((spot.tags ?? []).includes(t.id)) spot.tags = spot.tags.filter((x) => x !== t.id);
        deleted.push(`tag:${t.id}`);
        break;
      }
      case 'deleteChildMicrograph': {
        for (const s of a.samples) {
          const child = (s.micrographs ?? []).find((m) => m.parentID);
          if (!child) continue;
          s.micrographs = s.micrographs.filter((m) => m.id !== child.id);
          for (const g of p.groups ?? []) g.micrographs = (g.micrographs ?? []).filter((x) => x !== child.id);
          deleted.push(`micrograph:${child.id}`, ...(child.spots ?? []).map((sp) => `spot:${sp.id}`));
          await save(p);
          return { kind, writes, created, deleted };
        }
        return { kind: 'none' };
      }
      default:
        return { kind: 'none' };
    }
    await save(p);
    return { kind, writes, created, deleted };
  }

  // ------------------------------------------------------------------- sync
  /** The controller's cycle: push; pull, apply, save, commit; push what the merge left */
  async function sync() {
    let result = await svc.push(projectId, SERVER, () => {});
    if (!result.ok) return { ok: false, kind: result.kind, message: result.message, removal: result.removal ?? null };
    const r = await svc.pull(projectId, SERVER, () => {});
    if (!r.ok) return { ok: false, kind: r.kind, message: r.message, removal: r.removal ?? null };
    if (r.changes.length > 0) {
      const p = await load();
      applyEntityChanges(p, r.changes, 'redo');
      await save(p);
    }
    const c = await svc.commitPull(projectId, r.pullId);
    if (!c.ok) return { ok: false, kind: c.kind, message: c.message };
    if (r.changes.length > 0 || result.conflicts > 0 || result.restored > 0) {
      result = await svc.push(projectId, SERVER, () => {});
      if (!result.ok) return { ok: false, kind: result.kind, message: result.message };
    }
    return { ok: true, received: r.summary?.received ?? r.changes.length, applied: r.changes.length };
  }

  /**
   * Answer every waiting decision as the dialog would, choices from the
   * seed: one answer at a time, the list read again after each (an answer
   * can settle other rows, as the dialog shows)
   */
  async function decide({ seed }) {
    const r = rng(seed);
    const answers = [];
    const one = async (decision) => {
      const d = await svc.decide(projectId, decision);
      if (!d.ok) return { ok: false, decision, message: d.message };
      if (d.changes.length > 0) {
        const p = await load();
        applyEntityChanges(p, d.changes, 'redo');
        await save(p);
      }
      const c = await svc.decideCommit(projectId, d.decisionId);
      if (!c.ok) return { ok: false, decision, message: c.message };
      return { ok: true, decision };
    };
    for (let i = 0; i < 100; i++) {
      const L = await svc.listDecisions(projectId);
      if (!L.ok) return { ok: false, message: L.message, answers };
      let decision = null;
      if (L.conflicts.length > 0) {
        const cf = L.conflicts[0];
        const choices = {};
        for (const f of cf.fields) choices[f.id] = r() < 0.5 ? 'mine' : 'theirs';
        decision = { kind: 'conflict', key: cf.key, choices };
      } else if (L.questions.length > 0) {
        // They deleted what I changed: restore or delete; I deleted what they changed: keep deleted or bring back
        const q = L.questions[0];
        const fits = q.kind === 'theirs_deleted' ? ['restore', 'delete'] : ['keep_deleted', 'bring_back'];
        decision = { kind: 'question', key: q.key, answer: r() < 0.5 ? fits[0] : fits[1] };
      } else if (L.refused.length > 0) {
        decision = { kind: 'refused', key: L.refused[0].key, answer: 'discard' };
      }
      if (!decision) break;
      const a = await one(decision);
      answers.push(a);
      if (!a.ok) break;
    }
    return { ok: answers.every((x) => x.ok), answers };
  }

  async function status() {
    const s = await svc.getStatus(projectId);
    return { synced: s.synced, pending: s.pending ?? 0, conflicts: s.conflicts ?? 0, questions: s.questions ?? 0, refused: s.refused ?? 0 };
  }

  /** This copy's entities as the sync sees them (per-user fields left out) */
  async function canonical() {
    const folder = projectFolders.getProjectFolderPath(projectId);
    const project = JSON.parse(fs.readFileSync(path.join(folder, 'project.json'), 'utf8'));
    const pcPath = path.join(folder, 'pointCounts.json');
    const pointCounts = fs.existsSync(pcPath) ? JSON.parse(fs.readFileSync(pcPath, 'utf8')) : [];
    const out = {};
    for (const [k, e] of Object.entries(explode(project, Array.isArray(pointCounts) ? pointCounts : []).entities)) {
      const body = { ...e.body };
      for (const f of perUserFields(e.type)) delete body[f];
      out[k] = { parentType: e.parentType, parentId: e.parentId, body, childOrder: e.childOrder ?? null };
    }
    return out;
  }

  const commands = {
    create,
    invite: ({ email, role }) => svc.changeMembers(projectId, SERVER, { action: 'invite', email, role }),
    role: ({ pkey, role }) => svc.changeMembers(projectId, SERVER, { action: 'role', pkey, role }),
    accept: async ({ pid }) => {
      const a = await svc.answerInvite(SERVER, pid, true);
      if (!a.ok) return a;
      return commands.open({ pid });
    },
    open: async ({ pid }) => {
      const o = await svc.openRemote(pid, SERVER, 'manual', () => {});
      if (o.ok) projectId = o.projectId;
      return o;
    },
    edit,
    sync,
    decide,
    status,
    net: ({ mode }) => { setNet(mode); return { ok: true }; },
    compare: () => svc.testCompare(projectId, SERVER),
    canonical,
    ping: () => ({ ok: true, projectId }),
  };

  const send = (msg) => process.stdout.write(`@@ ${JSON.stringify(msg)}\n`);
  const lines = readline.createInterface({ input: process.stdin });
  // One command at a time, in order (the driver may still send while one runs)
  let queue = Promise.resolve();
  lines.on('line', (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    queue = queue.then(async () => {
      try {
        const fn = commands[msg.cmd];
        if (!fn) throw new Error(`unknown command ${msg.cmd}`);
        send({ id: msg.id, ok: true, result: await fn(msg.args ?? {}) });
      } catch (err) {
        send({ id: msg.id, ok: false, error: err instanceof Error ? `${err.message}\n${err.stack}` : String(err) });
      }
    });
  });
  lines.on('close', () => app.exit(0));
  send({ ready: true, name: NAME, projectId });
});
