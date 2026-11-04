/**
 * Manual figures: the main window, panels, toolbar icons, themes, first launch, About.
 */

import { test, expect } from '../e2e/lib/test';
import { ACCOUNTS } from '../e2e/lib/copy';
import { FELDSPAR, FIGURES, openDemo, renameSpots, setWindowSize, settle, shot, shotRect, view } from './lib';

const W = 1600;
const H = 1000;

test('core', async ({ launch }) => {
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await setWindowSize(ana, W, H);
  await settle(ana);
  await shot(ana, 'first-launch-placeholder');

  await ana.menu('Help', 'About StraboMicro');
  const about = ana.page.getByRole('dialog');
  await expect(about).toBeVisible();
  await ana.page.waitForTimeout(500);
  await shot(ana, 'about-dialog-placeholder', about, 0);
  await ana.page.keyboard.press('Escape');

  await openDemo(ana, FELDSPAR);
  await renameSpots(ana, 'PF-5', { 'new spot': 'Albite 1', 'spot 1': 'Fracture 1' });
  // Demo tidy-up in this copy only: a clean project note, and the tree opened at PF-5
  await ana.state(new Function('e', `e.app.setState((s) => ({ project: { ...s.project,
    notes: 'Experimental deformation of feldspar single crystals, oriented to test slip systems; PT conditions determined to identify flow laws.',
    datasets: s.project.datasets.map((d) => ({ ...d, samples: d.samples.map((x) => ({ ...x, isExpanded: (x.label || x.sampleID) === 'PF-5' })) })) } }));`) as never);
  await view(ana, 'PF-5');
  await settle(ana, 3000);
  await shot(ana, 'overview-raw');
  const rects = await ana.page.evaluate(() => {
    const r = (el: Element | null) => { const b = el?.getBoundingClientRect(); return b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null; };
    const tabs = document.querySelectorAll('[role="tablist"]');
    return { left: r(tabs[0]), right: r(tabs[tabs.length - 1]), header: r(document.querySelector('header')), notes: r([...document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,span')].find((e) => e.textContent?.trim() === 'Detailed Notes') ?? null),
      vw: window.innerWidth, vh: window.innerHeight };
  });
  require('fs').writeFileSync(require('path').join(FIGURES, 'overview-raw.json'), JSON.stringify(rects));
  await shot(ana, 'ThemeDark');

  // Panels
  const tabs = ana.page.getByRole('tablist');
  const leftTabs = tabs.first();
  const lt = await leftTabs.boundingBox();
  if (!lt) throw new Error('no left tabs');
  await shotRect(ana, 'NavigationTabs', { x: lt.x, y: lt.y, width: lt.width, height: lt.height });
  await shotRect(ana, 'ProjectNavigation_sections', { x: 0, y: lt.y, width: lt.width, height: H - lt.y });
  const rt = await tabs.last().boundingBox();
  if (!rt) throw new Error('no right tabs');
  await shotRect(ana, 'MetadataPane', { x: rt.x, y: rt.y, width: W - rt.x, height: H - rt.y });

  // Toolbar icons, in toolbar order
  const buttons = ana.page.locator('.drawing-toolbar button');
  await expect(buttons).toHaveCount(9);
  const files = ['spot', 'line', 'polygon', 'grain-spot', 'auto-spot', 'lasso', 'sketch', 'ruler', 'move-toolbar'];
  for (let i = 0; i < files.length; i++) await shot(ana, files[i], buttons.nth(i), 3);
  await shot(ana, 'download-button', ana.page.getByRole('button', { name: /^Export Micrograph/ }).first(), 2);

  // Recursive spots: the spots of PF-5's associated micrographs on PF-5
  await renameSpots(ana, 'pf5-1 (10x)', { spot1: 'Grain 5' });
  await renameSpots(ana, 'fractures in albite 10x', { 'test spot': 'Fracture 4' });
  await ana.menu('View', 'Show Recursive Spots');
  await settle(ana, 2500);
  const rtabs = await ana.page.getByRole('tablist').last().boundingBox();
  if (!rtabs) throw new Error('no right tabs');
  await shotRect(ana, 'recursive-spots', { x: lt.width, y: lt.y, width: rtabs.x - lt.width, height: 720 });
  await ana.menu('View', 'Show Recursive Spots');
  await settle(ana, 800);

  // Light theme
  await ana.state((e) => e.app.getState().setTheme('light'));
  await settle(ana, 1000);
  await shot(ana, 'ThemeLight');
  await ana.state((e) => e.app.getState().setTheme('dark'));
  await settle(ana, 500);
});
