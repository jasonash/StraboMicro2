/**
 * Every menu accelerator in electron/main.js is used once (2026-10-13: File >
 * Export as .smz... and Spot > Edit Selected Spots... both had
 * CmdOrCtrl+Shift+E, so only one of them could ever fire).
 * CmdOrCtrl+M stays free for macOS Minimize, and the macOS Window menu that
 * has it is there (2026-10-29: Cmd+M merged spots instead of minimizing).
 *
 *   npm run test:menu-accelerators
 */

const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8');
const start = source.indexOf('async function buildMenu()');
const end = source.indexOf('Menu.buildFromTemplate(menuTemplate)', start);
if (start < 0 || end < 0) {
  console.log('  FAIL  buildMenu() or its template not found in electron/main.js');
  process.exit(1);
}
const menu = source.slice(start, end);

// Each accelerator with the label of its item (the nearest label before it)
const items = [];
const acceleratorPattern = /accelerator:\s*'([^']+)'/g;
let match;
while ((match = acceleratorPattern.exec(menu))) {
  const labels = [...menu.slice(0, match.index).matchAll(/label:\s*([^\n]+?),?\s*\n/g)];
  const label = labels.length ? labels[labels.length - 1][1].trim() : '(no label)';
  items.push({ label, accelerator: match[1] });
}

let failures = 0;

const byKey = new Map();
for (const item of items) {
  const key = item.accelerator.toLowerCase();
  byKey.set(key, [...(byKey.get(key) || []), item.label]);
}
for (const [key, labels] of byKey) {
  if (labels.length > 1) {
    failures++;
    console.log(`  FAIL  ${key} is on ${labels.length} menu items: ${labels.join(', ')}`);
  }
}

if (byKey.has('cmdorctrl+m')) {
  failures++;
  console.log(`  FAIL  CmdOrCtrl+M is on ${byKey.get('cmdorctrl+m').join(', ')}; it is Minimize on macOS`);
}
if (!/process\.platform === 'darwin' \? \[\{ role: 'windowMenu' \}\]/.test(menu)) {
  failures++;
  console.log("  FAIL  no macOS Window menu (role: 'windowMenu') in the menu template");
}

if (items.length < 20) {
  failures++;
  console.log(`  FAIL  only ${items.length} accelerators found; the pattern no longer matches the menu`);
}

console.log(failures ? `\n${failures} failure(s)` : `${items.length} accelerators, all different`);
process.exit(failures ? 1 : 0);
