/**
 * Manual figures for Sync and Collaboration (section 9): turning on sync,
 * Collaborators, Open Remote Project with an invitation, the header of a
 * shared project, the sync chip, chat, and the decisions dialog. Needs the
 * dev Docker stack (the e2e accounts Ana Ruiz, Ben Ito, Cleo Park).
 */

import { test, expect } from '../e2e/lib/test';
import { ACCOUNTS, type Copy } from '../e2e/lib/copy';
import { collaborators, editSpot, invite, setOffline, share, syncNow, waitSettled, reviewDecisions } from '../e2e/lib/actions';
import { TOXAWAY, micrographId, openDemo, setWindowSize, settle, shot, shotRect, view } from './lib';
import type { Page } from '@playwright/test';

const REF = '160327-5 xz Reference Photomicrograph';

async function openChat(c: Copy): Promise<Page> {
  const existing = c.app.windows().find((w) => w.url().includes('chat.html'));
  if (existing) {
    await c.page.getByTestId('chat-chip').click();
    return existing;
  }
  const next = c.app.waitForEvent('window', { predicate: (w) => w.url().includes('chat.html'), timeout: 20_000 });
  await c.page.getByTestId('chat-chip').click();
  const w = await next;
  await w.waitForLoadState('domcontentloaded');
  return w;
}

test('collab', async ({ launch }) => {
  const ana = await launch('Ana', ACCOUNTS.ana);
  await setWindowSize(ana, 1600, 1000);
  await openDemo(ana, TOXAWAY);
  await view(ana, REF);
  await ana.state((e) => e.app.getState().setSpotLabelMode('none'));

  // ---- Turn on sync
  await ana.menu('File', 'Upload to Strabo Server...');
  let dlg = ana.page.getByRole('dialog', { name: 'Sync this project to StraboSpot' });
  await expect(dlg.getByText(/^About .* to upload/)).toBeVisible({ timeout: 60_000 });
  await ana.page.waitForTimeout(500);
  await shot(ana, 'turn-on-sync-dialog', dlg);
  await dlg.getByText('Sync automatically', { exact: true }).click();
  await dlg.getByRole('button', { name: 'Start Syncing' }).click();
  // The project reopens as a synced copy (the page's test hooks are gone for a moment)
  await expect.poll(() => ana.state((e) => {
    const s = e.sync.getState();
    return s.synced && s.phase === 'ready' && s.pid !== null;
  }).catch(() => false), { timeout: 300_000 }).toBe(true);
  await waitSettled(ana, 300_000);
  await view(ana, REF);

  // ---- Invite Ben (Editor) and Cleo (Viewer)
  await ana.menu('File', 'Collaborate...');
  dlg = ana.page.getByRole('dialog', { name: 'Collaborators' });
  for (const [who, role] of [[ACCOUNTS.ben, 'Editor'], [ACCOUNTS.cleo, 'Viewer']] as const) {
    await dlg.getByLabel('Email address').fill(who.email);
    await dlg.getByRole('combobox').last().click();
    await ana.page.getByRole('option', { name: role, exact: true }).click();
    await dlg.getByRole('button', { name: 'Invite', exact: true }).click();
    await expect(dlg.getByText(new RegExp(`(Invitation sent to|is invited).*${who.email.replace(/\./g, '\\.')}|${who.email.replace(/\./g, '\\.')}.*is invited`))).toBeVisible({ timeout: 30_000 });
  }
  await ana.page.waitForTimeout(800);

  // ---- Ben: Open Remote Project with the invitation at the top, then joins
  const ben = await launch('Ben', ACCOUNTS.ben);
  await setWindowSize(ben, 1600, 1000);
  const auto = ben.page.getByRole('dialog', { name: /You have (an invitation|invitations)/ });
  await expect(auto).toBeVisible({ timeout: 60_000 });
  await auto.getByRole('button', { name: 'Later' }).click();
  await ben.menu('File', 'Open Remote Project...');
  const remote = ben.page.getByRole('dialog', { name: 'Open Remote Project' });
  await expect(remote.getByText('Invitations')).toBeVisible({ timeout: 30_000 });
  await ben.page.waitForTimeout(1500);
  await shot(ben, 'open-remote-project', remote);
  const row = remote.getByRole('listitem').filter({ hasText: TOXAWAY.name }).first();
  await row.getByRole('button', { name: 'Accept' }).click();
  await row.getByRole('button', { name: 'Open' }).click({ timeout: 180_000 });
  await expect.poll(() => ben.state((e) => Boolean(e.sync.getState().synced && e.app.getState().project?.name)), { timeout: 120_000 }).toBe(true);
  await view(ben, REF);
  await waitSettled(ben, 180_000);

  // ---- Collaborators dialog with Ben joined and Cleo invited
  await ana.page.waitForTimeout(2000);
  await dlg.getByRole('button', { name: 'Close' }).click();
  await ana.menu('File', 'Collaborate...');
  dlg = ana.page.getByRole('dialog', { name: 'Collaborators' });
  await expect(dlg.getByText(ACCOUNTS.ben.name).first()).toBeVisible({ timeout: 30_000 });
  await ana.page.waitForTimeout(1000);
  await shot(ana, 'collaborators-dialog', dlg);
  await dlg.getByRole('button', { name: 'Close' }).click();

  // ---- Chat
  const chatA = await openChat(ana);
  await chatA.setViewportSize({ width: 380, height: 560 }).catch(() => undefined);
  await chatA.getByRole('textbox', { name: 'Message' }).fill('Ben, the garnet in the upper left has a nice inclusion trail. Can you add the extinction data?');
  await chatA.keyboard.press('Enter');
  const chatB = await openChat(ben);
  await chatB.getByRole('textbox', { name: 'Message' }).fill('Will do. I am on the Fe map now.');
  await chatB.keyboard.press('Enter');
  // Ana links a spot to her next message
  const refId = await micrographId(ana, REF);
  const grain = await ana.state(new Function('e', `
    const m = e.app.getState().micrographIndex.get(${JSON.stringify(refId)});
    return (m.spots || []).find((s) => s.name === 'Grain 5')?.id ?? null;`) as never) as string | null;
  if (grain) await ana.state(new Function('e', `return e.app.getState().selectActiveSpot(${JSON.stringify(grain)})`) as never);
  await ana.page.waitForTimeout(800);
  await chatA.getByRole('button', { name: 'Link to selection' }).click();
  await chatA.waitForTimeout(500);
  await chatA.getByRole('textbox', { name: 'Message' }).fill('This one, Grain 5.');
  await chatA.keyboard.press('Enter');
  await chatA.waitForTimeout(2500);
  await chatA.screenshot({ path: require('path').join(require('./lib').FIGURES, 'chat-window.png') });

  // ---- Header of the shared project and the sync chip popover (Ana; Ben viewing)
  await ana.state((e) => e.app.getState().selectActiveSpot(null));
  await ana.page.bringToFront().catch(() => undefined);
  await settle(ana, 3000);
  const header = await ana.page.locator('header').first().boundingBox();
  if (header) await shotRect(ana, 'header-synced', { x: 700, y: 0, width: 900, height: header.height });
  await ana.page.getByTestId('sync-chip').click();
  const pop = ana.page.locator('.MuiPopover-paper').last();
  await expect(pop).toBeVisible();
  await ana.page.waitForTimeout(800);
  await shot(ana, 'sync-chip-popover', pop, 6);
  await ana.page.keyboard.press('Escape');

  // ---- A conflict: both change the same spot's shape and name; Ben decides
  if (grain) {
    await setOffline(ben, true);
    const pts = await ana.state(new Function('e', `
      const m = e.app.getState().micrographIndex.get(${JSON.stringify(refId)});
      return (m.spots || []).find((s) => s.id === ${JSON.stringify(grain)}).points;`) as never) as Array<{ X: number; Y: number }>;
    const cx = pts.reduce((a, p) => a + p.X, 0) / pts.length;
    const cy = pts.reduce((a, p) => a + p.Y, 0) / pts.length;
    const scale = (k: number, dx: number) => pts.map((p) => ({ X: cx + (p.X - cx) * k + dx, Y: cy + (p.Y - cy) * k }));
    await editSpot(ana, grain, { name: 'Garnet 5', points: scale(1.25, 0) });
    await waitSettled(ana);
    await editSpot(ben, grain, { name: 'Grt-5', points: scale(0.8, 30) });
    await setOffline(ben, false);
    await syncNow(ben);
    const decisions = await reviewDecisions(ben);
    await ben.page.waitForTimeout(2500);
    await shot(ben, 'sync-decisions-dialog', decisions);
  }
});

// Only the Collaborators dialog, without the demo projects: -g "collaborators dialog only"
test('collaborators dialog only', async ({ launch, project }) => {
  const p = await project('Manual Collaborators');
  const ana = await launch('Ana', ACCOUNTS.ana);
  const ben = await launch('Ben', ACCOUNTS.ben);
  await setWindowSize(ana, 1600, 1000);
  await share(ana, ben, p.smzPath, p.id, p.name, 'Editor');
  await invite(ana, ACCOUNTS.cleo.email, 'Viewer');
  const dlg = await collaborators(ana);
  await expect(dlg.getByText(ACCOUNTS.cleo.name).first()).toBeVisible({ timeout: 30_000 });
  await ana.page.waitForTimeout(1000);
  await shot(ana, 'collaborators-dialog', dlg);
});
