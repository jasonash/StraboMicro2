/**
 * Copy the standalone viewer (dist-standalone/, from npm run build:standalone)
 * into a checkout of the StraboSpot/StraboMicro-Web-Viewer repository, the
 * package third parties deploy.
 *
 *   npm run publish:standalone -- /path/to/StraboMicro-Web-Viewer
 *
 * Replaces in the checkout: view.html, config.js, embed-example.html,
 * assets/ (all of it: hashed file names change every build),
 * smzFiles/README.md, build-info.json.
 * Never touches: README.md, LICENSE, .gitignore, docs/, the project folders
 * in smzFiles/. Nothing is committed or pushed.
 */

import { cpSync, existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../dist-standalone/', import.meta.url));
const target = process.argv[2] ? resolve(process.argv[2]) : '';

function fail(message) {
  console.error(`publish-standalone: ${message}`);
  process.exit(1);
}

if (!target) fail('give the path of a StraboMicro-Web-Viewer checkout');
if (!existsSync(join(source, 'view.html'))) fail('dist-standalone/view.html not found; run npm run build:standalone first');

// Make sure the target is the viewer repository, so assets/ is never removed elsewhere
let remote = '';
try {
  remote = execFileSync('git', ['-C', target, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
} catch {
  fail(`${target} is not a git checkout`);
}
if (!/StraboMicro-Web-Viewer(\.git)?$/i.test(remote)) fail(`${target} is not a StraboMicro-Web-Viewer checkout (origin: ${remote})`);

for (const name of ['view.html', 'config.js', 'embed-example.html']) {
  cpSync(join(source, name), join(target, name));
}
rmSync(join(target, 'assets'), { recursive: true, force: true });
cpSync(join(source, 'assets'), join(target, 'assets'), { recursive: true });

mkdirSync(join(target, 'smzFiles'), { recursive: true });
writeFileSync(join(target, 'smzFiles', 'README.md'), readFileSync(join(source, 'smzFiles', 'README.txt'), 'utf8'));

// Which StraboMicro2 commit this package was built from
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const git = (...args) => execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
const buildInfo = {
  source: 'https://github.com/jasonash/StraboMicro2 (web-viewer/)',
  commit: git('rev-parse', 'HEAD'),
  uncommittedChanges: git('status', '--porcelain', '--', 'web-viewer').length > 0,
  built: new Date().toISOString(),
};
writeFileSync(join(target, 'build-info.json'), JSON.stringify(buildInfo, null, 2) + '\n');

console.log(`Copied the standalone viewer into ${target} (commit ${buildInfo.commit.slice(0, 7)}${buildInfo.uncommittedChanges ? ', with uncommitted changes' : ''}).`);
console.log('Review with git status there, then commit.');
