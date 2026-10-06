/**
 * Project chat (spec v3 17bd-17bi), stage C3: the header chip and the chat
 * window in two real copies. No chip while the project is solo; it appears
 * when Ben joins; a message reaches the other copy's chip as unread and is
 * read in its chat window; a link to the selected spot is sent and a click
 * on it selects the spot in the other copy's main window; delete; the close
 * button only hides the window and the chip brings it back; keep on top.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import { openSmz, turnOnSync, invite, acceptInvitationFromChip, waitSettled } from '../lib/actions';

const chip = (c: Copy) => c.page.getByTestId('chat-chip');

/** Click the chip; the chat window (chat.html) of this copy */
async function openChat(c: Copy): Promise<Page> {
  const existing = c.app.windows().find((w) => w.url().includes('chat.html'));
  if (!existing) {
    const next = c.app.waitForEvent('window', { predicate: (w) => w.url().includes('chat.html'), timeout: 20_000 });
    await chip(c).click();
    const w = await next;
    await w.waitForLoadState('domcontentloaded');
    return w;
  }
  await chip(c).click();
  return existing;
}

/** Is this copy's chat window shown / kept on top (main process) */
function chatWindowFlags(c: Copy) {
  return c.app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('chat.html'));
    return w ? { visible: w.isVisible(), onTop: w.isAlwaysOnTop(), title: w.getTitle() } : null;
  });
}

test('two members chat in the chat window', async ({ launch, project }) => {
  const p = await project('E2E Chat');
  const garnet = p.spots[0];
  const ana = await launch('Ana', ACCOUNTS.ana);
  const ben = await launch('Ben', ACCOUNTS.ben);

  await openSmz(ana, p.smzPath, p.id);
  await turnOnSync(ana);
  await waitSettled(ana);
  await ana.caption('a solo synced project: no chat chip (17be g)');
  await ana.page.waitForTimeout(1500);
  await expect(chip(ana)).toHaveCount(0);

  await invite(ana, ACCOUNTS.ben.email, 'Editor');
  await acceptInvitationFromChip(ben, p.name);
  await waitSettled(ben);
  await ben.caption('Ben is in: the chip shows in both copies');
  await expect(chip(ben)).toBeVisible({ timeout: 20_000 });
  await expect(chip(ana)).toBeVisible({ timeout: 30_000 });

  // Ana writes
  const chatA = await openChat(ana);
  await expect.poll(() => chatWindowFlags(ana)).toMatchObject({ visible: true, title: `Chat: ${p.name}` });
  await ana.caption('writes to Ben');
  await chatA.getByLabel('Message').fill('Hello Ben, can you check the garnet?');
  await chatA.keyboard.press('Enter');
  await expect(chatA.getByTestId('chat-message').filter({ hasText: 'Hello Ben' })).toBeVisible();
  await expect(chatA.getByTestId('chat-outgoing')).toHaveCount(0);

  // Ben's chip counts it; opening the chat shows it and clears the count
  await expect(chip(ben)).toHaveAttribute('aria-label', /1 unread message/, { timeout: 10_000 });
  const chatB = await openChat(ben);
  await chatB.bringToFront();
  await expect(chatB.getByTestId('chat-message').filter({ hasText: 'Hello Ben' })).toBeVisible();
  await expect(chip(ben)).toHaveAttribute('aria-label', 'Chat', { timeout: 10_000 });

  // Ben links the spot he has selected
  await ben.caption(`selects '${garnet.name}' and links it in a message`);
  await ben.state(new Function('e', `return e.app.getState().selectActiveSpot(${JSON.stringify(garnet.id)})`) as never);
  await chatB.getByLabel('Link to selection').click();
  await expect(chatB.getByRole('button', { name: garnet.name })).toBeVisible();
  await chatB.getByLabel('Message').fill('Here it is');
  await chatB.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(chatB.getByTestId('chat-message').filter({ hasText: 'Here it is' })).toBeVisible();

  // Ana sees the link with the spot's name; a click selects it in her main window
  const linkA = chatA.getByTestId('chat-message').filter({ hasText: 'Here it is' }).getByRole('button', { name: garnet.name });
  await expect(linkA).toBeVisible({ timeout: 10_000 });
  await ana.caption('clicks the link: her main window selects the spot');
  await ana.state(new Function('e', 'return e.app.getState().selectActiveSpot(null)') as never);
  await linkA.click();
  await expect.poll(() => ana.state((e) => e.app.getState().activeSpotId)).toBe(garnet.id);

  // Ana deletes her first message; Ben's window says so
  const first = chatA.getByTestId('chat-message').filter({ hasText: 'Hello Ben' });
  await first.hover();
  await first.getByLabel('Delete message').click();
  await expect(chatB.getByText('Message deleted')).toBeVisible({ timeout: 10_000 });
  await expect(chatB.getByTestId('chat-message').filter({ hasText: 'Hello Ben' })).toHaveCount(0);

  // The close button only hides it (17be e); the chip brings the same window back
  await ana.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('chat.html'))?.close();
  });
  await expect.poll(() => chatWindowFlags(ana)).toMatchObject({ visible: false });
  await chip(ana).click();
  await expect.poll(() => chatWindowFlags(ana)).toMatchObject({ visible: true });
  expect(ana.app.windows().filter((w) => w.url().includes('chat.html'))).toHaveLength(1);

  // Keep on top (17be b)
  await chatA.getByLabel('Keep on top').click();
  await expect.poll(() => chatWindowFlags(ana)).toMatchObject({ onTop: true });
  await chatA.getByLabel('Stop keeping on top').click();
  await expect.poll(() => chatWindowFlags(ana)).toMatchObject({ onTop: false });

  // (a 404 at startup, before login, is not chat's: filtered like the other scenarios do)
  expect(ana.consoleErrors.filter((l) => /chat/i.test(l))).toEqual([]);
  expect(ben.consoleErrors.filter((l) => /chat/i.test(l))).toEqual([]);
});
