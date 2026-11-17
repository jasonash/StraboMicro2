/**
 * Web viewer configuration (web-viewer/src/config/viewerConfig.ts): the
 * server build's links, the standalone build's config.js options, and the
 * project id check.
 *
 *   npm run test:web-viewer-config
 */

import {
  cleanProjectId,
  readViewerConfig,
  viewerLinks,
  chooseLayout,
  detailsBeside,
  DEFAULT_SMZ_FILES_LOCATION,
  COMPACT_BELOW_WIDTH,
  DETAILS_BESIDE_FROM_WIDTH,
} from '../web-viewer/src/config/viewerConfig.ts';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}

// --- project id ---
check('v1 id accepted', cleanProjectId('17176049358379') === '17176049358379');
check('v2 uuid accepted', cleanProjectId('07bb808e-43ff-46aa-8b8f-13c881ff217a') === '07bb808e-43ff-46aa-8b8f-13c881ff217a');
check('spaces trimmed', cleanProjectId(' 863 ') === '863');
for (const bad of ['', '../secret', 'a/b', 'https://evil.example/x', '..', 'a b', '%2e%2e', 'x'.repeat(101)]) {
  check(`refused: ${JSON.stringify(bad)}`, cleanProjectId(bad) === null, cleanProjectId(bad));
}
check('missing id', cleanProjectId(null) === null);

// --- server build ---
{
  const c = readViewerConfig('server', '?p=863&base=/straboMicroFiles/', undefined);
  check('server: base from the address, no trailing slash', c.baseUrl === '/straboMicroFiles', c.baseUrl);
  check('server: project id', c.projectId === '863');
  check('server: logo, no footer', c.showHeader && !c.showFooter);
  const l = viewerLinks(c, '863', false);
  check('server: PDF through the endpoint (not the static file)', l.pdf === '/download_micro_pdf?project_id=863', l.pdf);
  check('server: SMZ endpoint', l.smz === '/download_micro_file?project_id=863', l.smz);
  check('server: Share endpoint', l.share === '/share_micro_file?project_id=863', l.share);
  check('server: deep link', l.openInApp === 'strabomicro://open?p=863', l.openInApp);
  check('server: default base', readViewerConfig('server', '?p=1', undefined).baseUrl === DEFAULT_SMZ_FILES_LOCATION);
}

// --- standalone build, no config.js ---
{
  const c = readViewerConfig('standalone', '?p=17176049358379', undefined);
  check('standalone default: ./smzFiles', c.baseUrl === './smzFiles', c.baseUrl);
  check('standalone default: header + footer + pdf', c.showHeader && c.showFooter && c.showPdfLink);
  const none = viewerLinks(c, '17176049358379', false);
  check('standalone: no PDF until found', none.pdf === null, none.pdf);
  check('standalone: no SMZ / Share without a pattern', none.smz === null && none.share === null, none);
  check('standalone: no deep link (needs a strabospot.org number)', none.openInApp === null);
  const found = viewerLinks(c, '17176049358379', true);
  check('standalone: static project.pdf once found', found.pdf === './smzFiles/17176049358379/project.pdf', found.pdf);
}

// --- standalone build ignores ?base= ---
{
  const c = readViewerConfig('standalone', '?p=1&base=https://evil.example/data', { smzFilesLocation: './projects/' });
  check('standalone: ?base= ignored, config.js wins', c.baseUrl === './projects', c.baseUrl);
}

// --- standalone build with config.js ---
{
  const c = readViewerConfig('standalone', '?p=abc-1', {
    smzFilesLocation: 'https://data.example.org/smz/',
    showHeader: false,
    showFooter: false,
    showPdfLink: false,
    smzDownloadUrl: 'https://data.example.org/zips/{id}.smz',
    shareUrl: 'https://portal.example.org/view.html?p={id}',
  });
  check('config: full URL kept, trailing slash dropped', c.baseUrl === 'https://data.example.org/smz', c.baseUrl);
  check('config: header + footer off', !c.showHeader && !c.showFooter);
  const l = viewerLinks(c, 'abc-1', true);
  check('config: showPdfLink false hides the PDF even when found', l.pdf === null, l.pdf);
  check('config: SMZ pattern filled', l.smz === 'https://data.example.org/zips/abc-1.smz', l.smz);
  check('config: Share pattern filled', l.share === 'https://portal.example.org/view.html?p=abc-1', l.share);
}

// --- wrong types in config.js fall back to the defaults ---
{
  const c = readViewerConfig('standalone', '?p=1', {
    smzFilesLocation: 42,
    showHeader: 'no',
    showFooter: null,
    smzDownloadUrl: ['x'],
  });
  check('bad types: default location', c.baseUrl === './smzFiles', c.baseUrl);
  check('bad types: default booleans', c.showHeader && c.showFooter, c);
  check('bad types: no SMZ button', viewerLinks(c, '1', false).smz === null);
}

// --- layout + theme ---
{
  const server = readViewerConfig('server', '?p=1', undefined);
  check('server: full layout, dark by default', server.layout === 'full' && server.theme === 'dark', server);
  const serverAsked = readViewerConfig('server', '?p=1&layout=compact&theme=light', undefined);
  check('server: ?layout= ?theme= honored', serverAsked.layout === 'compact' && serverAsked.theme === 'light', serverAsked);

  const plain = readViewerConfig('standalone', '?p=1', undefined);
  check('standalone: auto layout, dark by default', plain.layout === 'auto' && plain.theme === 'dark', plain);
  const fromConfig = readViewerConfig('standalone', '?p=1', { layout: 'compact', theme: 'light' });
  check('standalone: config.js layout + theme', fromConfig.layout === 'compact' && fromConfig.theme === 'light', fromConfig);
  const linkWins = readViewerConfig('standalone', '?p=1&layout=full&theme=dark', { layout: 'compact', theme: 'light' });
  check('standalone: the address wins over config.js', linkWins.layout === 'full' && linkWins.theme === 'dark', linkWins);
  const junk = readViewerConfig('standalone', '?p=1&layout=huge&theme=pink', { layout: 7, theme: 'blue' });
  check('unknown values fall back', junk.layout === 'auto' && junk.theme === 'dark', junk);

  check('auto: narrow -> compact', chooseLayout('auto', COMPACT_BELOW_WIDTH - 1) === 'compact');
  check('auto: wide -> full', chooseLayout('auto', COMPACT_BELOW_WIDTH) === 'full');
  check('fixed layouts ignore width', chooseLayout('full', 300) === 'full' && chooseLayout('compact', 2000) === 'compact');
  check('details beside from 700', detailsBeside(DETAILS_BESIDE_FROM_WIDTH) && !detailsBeside(DETAILS_BESIDE_FROM_WIDTH - 1));
}

console.log(`\nweb viewer config: ${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
