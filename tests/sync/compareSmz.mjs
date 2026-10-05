// Gap 4 step 4: compare .smz exports of one project, entity by entity and file by file.
// node tests/sync/compareSmz.mjs <reference.smz> <other.smz> [...]   (first = reference)
// Entities come from the sync model (electron/shared/entityModel.mjs explode); files by SHA-256.
// Tiles, the PDF and the README are derived and skipped.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { explode } from '../../electron/shared/entityModel.mjs';

const files = process.argv.slice(2);
if (files.length < 2) {
  console.error('usage: node compare-smz.mjs ref.smz other.smz [...]');
  process.exit(2);
}

function unpack(smz) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmpsmz-'));
  execFileSync('unzip', ['-q', smz, '-x', '*/tiles/*', '-d', dir]);
  const roots = fs.readdirSync(dir).filter((n) => fs.statSync(path.join(dir, n)).isDirectory());
  if (roots.length !== 1) throw new Error(`${smz}: ${roots.length} top folders`);
  const root = path.join(dir, roots[0]);
  const project = JSON.parse(fs.readFileSync(path.join(root, 'project.json'), 'utf8'));
  const pcDir = path.join(root, 'point-counts');
  const pointCounts = fs.existsSync(pcDir)
    ? fs.readdirSync(pcDir).filter((n) => n.endsWith('.json')).map((n) => JSON.parse(fs.readFileSync(path.join(pcDir, n), 'utf8')))
    : [];
  const hashes = {};
  for (const sub of ['images', 'compositeThumbnails', 'associatedFiles']) {
    const d = path.join(root, sub);
    if (!fs.existsSync(d)) continue;
    for (const n of fs.readdirSync(d)) {
      const f = path.join(d, n);
      if (!fs.statSync(f).isFile()) continue;
      hashes[`${sub}/${n}`] = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    }
  }
  const { entities } = explode(project, pointCounts);
  fs.rmSync(dir, { recursive: true, force: true });
  return { name: path.basename(smz), id: project.id, projectName: project.name, entities, hashes, pointCounts: pointCounts.length };
}

const canon = (v) => {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]));
  return v;
};

/** Field paths whose values differ between two bodies */
function diffPaths(a, b, prefix = '') {
  const out = [];
  if (JSON.stringify(canon(a)) === JSON.stringify(canon(b))) return out;
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  if (isObj(a) && isObj(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out.push(...diffPaths(a[k], b[k], prefix ? `${prefix}.${k}` : k));
    return out;
  }
  out.push(prefix || '(value)');
  return out;
}

const ref = unpack(files[0]);
const summary = (s) => {
  const byType = {};
  for (const k of Object.keys(s.entities)) {
    const t = k.slice(0, k.indexOf(':'));
    byType[t] = (byType[t] ?? 0) + 1;
  }
  return `${s.name}: '${s.projectName}' ${s.id}; entities ${JSON.stringify(byType)}; files ${Object.keys(s.hashes).length}; point-count files ${s.pointCounts}`;
};
console.log(summary(ref));
let problems = 0;
for (const f of files.slice(1)) {
  const o = unpack(f);
  console.log(`\n${summary(o)}`);
  // The project entity's id differs for a separate copy: compare it under one key
  const key = (s, k) => (k.startsWith('project:') ? 'project:*' : k);
  const A = Object.fromEntries(Object.entries(ref.entities).map(([k, v]) => [key(ref, k), v]));
  const B = Object.fromEntries(Object.entries(o.entities).map(([k, v]) => [key(o, k), v]));
  const fieldDiffs = {};
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
    if (!(k in A)) { console.log(`  ONLY in ${o.name}: ${k}`); problems++; continue; }
    if (!(k in B)) { console.log(`  MISSING in ${o.name}: ${k}`); problems++; continue; }
    const d = diffPaths(A[k].body ?? A[k], B[k].body ?? B[k]);
    for (const p of d) {
      const t = k.slice(0, k.indexOf(':'));
      const fk = `${t}.${p}`;
      (fieldDiffs[fk] ??= []).push(k);
    }
  }
  for (const [fk, keys] of Object.entries(fieldDiffs)) {
    const sample = keys[0];
    const a = sample.startsWith('project:') ? ref.entities[Object.keys(ref.entities).find((x) => x.startsWith('project:'))] : ref.entities[sample];
    const b = sample.startsWith('project:') ? o.entities[Object.keys(o.entities).find((x) => x.startsWith('project:'))] : o.entities[sample];
    const get = (e, p) => p.split('.').reduce((x, s) => (x == null ? x : x[s]), e.body ?? e);
    const p = fk.slice(fk.indexOf('.') + 1);
    console.log(`  FIELD ${fk} differs on ${keys.length} entities, e.g. ${sample}: ${JSON.stringify(get(a, p))?.slice(0, 120)} -> ${JSON.stringify(get(b, p))?.slice(0, 120)}`);
    problems++;
  }
  for (const n of new Set([...Object.keys(ref.hashes), ...Object.keys(o.hashes)])) {
    if (!(n in o.hashes)) { console.log(`  FILE missing in ${o.name}: ${n}`); problems++; }
    else if (!(n in ref.hashes)) { console.log(`  FILE only in ${o.name}: ${n}`); problems++; }
    else if (ref.hashes[n] !== o.hashes[n]) { console.log(`  FILE differs: ${n}`); problems++; }
  }
  if (o.pointCounts !== ref.pointCounts) { console.log(`  point-count files ${ref.pointCounts} -> ${o.pointCounts}`); problems++; }
}
console.log(`\n${problems} difference groups`);
