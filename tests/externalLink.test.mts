/**
 * Links in project data that may open outside the app (src/utils/externalLink.ts).
 *
 *   npm run test:external-link
 */

import { isWebLink } from '../src/utils/externalLink.ts';

let failures = 0;
let passes = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        got      ${String(actual)}\n        expected ${String(expected)}`);
  }
}

for (const url of ['https://strabospot.org', 'http://example.org/a?b=1', 'HTTPS://EXAMPLE.ORG', 'ftp://example.org/file']) {
  eq(`opens: ${url}`, isWebLink(url), true);
}
for (const url of ['file:///etc/hosts', 'smb://host/share', 'javascript:alert(1)', 'mailto:a@b.org', 'vscode://x', 'www.example.org', 'not a link', '', null, undefined]) {
  eq(`stays text: ${String(url)}`, isWebLink(url), false);
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
