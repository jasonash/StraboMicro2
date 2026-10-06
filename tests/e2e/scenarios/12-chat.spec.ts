/**
 * Project chat (spec v3 17bd-17bi), stage C3: the header chip and the chat
 * window in two real copies. No chip while the project is solo; it appears
 * when Ben joins; a message reaches the other copy's chip as unread and is
 * read in its chat window; a link to the selected spot is sent and a click
 * on it selects the spot in the other copy's main window; delete; the close
 * button only hides the window and the chip brings it back; keep on top.
 * Stage C4 (17bh): the unread badge, an OS notification only with the
 * "Chat notifications" switch on (Preferences) and no window focused, a
 * message written offline ('Not sent yet') sent on reconnect, the owner
 * deleting another member's message, and a removed member losing the chip
 * and the badge.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../lib/test';
import { ACCOUNTS, type Copy } from '../lib/copy';
import fs from 'fs';
import { openSmz, turnOnSync, invite, acceptInvitationFromChip, waitSettled, setOffline, removeMember, separateCopyNotice } from '../lib/actions';

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

/** The badge count the OS shows for this copy (Dock / launcher) */
function badge(c: Copy) {
  return c.app.evaluate(({ app }) => app.getBadgeCount());
}

/** Notifications this copy showed (electron/chatNotify.js logs each one) */
function notifications(c: Copy): string[] {
  if (!fs.existsSync(c.logFile)) return [];
  return fs.readFileSync(c.logFile, 'utf8').split('\n').filter((l) => l.includes('[ChatNotify] Notification for project'));
}

/** No window of this copy has focus (the app is in the background), as the OS and the pages see it */
async function background(c: Copy): Promise<void> {
  const focused = await c.app.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) w.blur();
    return BrowserWindow.getAllWindows().filter((w) => w.isFocused()).length;
  });
  expect(focused, 'no window of this copy may keep focus').toBe(0);
  // Playwright keeps emulating focus in its pages; send the blur the OS would
  for (const w of c.app.windows().filter((x) => x.url().includes('chat.html'))) {
    await w.evaluate(() => window.dispatchEvent(new Event('blur')));
  }
}

/** File > Preferences...: set "Chat notifications", Save */
async function setChatNotifications(c: Copy, on: boolean): Promise<void> {
  await c.caption(`turns chat notifications ${on ? 'on' : 'off'} in Preferences`);
  await c.menu('File', 'Preferences...');
  const dialog = c.page.getByRole('dialog', { name: 'Preferences' });
  const box = dialog.getByLabel('Chat notifications');
  await expect(box).toBeEnabled();
  if ((await box.isChecked()) !== on) await box.click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => c.page.evaluate(() => window.api?.chat.notifications())).toBe(on);
}

test('badge, notifications switch, offline message, owner moderation, removed member', async ({ launch, project }) => {
  const p = await project('E2E Chat Notify');
  const ana = await launch('Ana', ACCOUNTS.ana);
  const ben = await launch('Ben', ACCOUNTS.ben);
  await openSmz(ana, p.smzPath, p.id);
  await turnOnSync(ana);
  await waitSettled(ana);
  await invite(ana, ACCOUNTS.ben.email, 'Editor');
  await acceptInvitationFromChip(ben, p.name);
  await waitSettled(ben);
  await expect(chip(ana)).toBeVisible({ timeout: 30_000 });
  await expect(chip(ben)).toBeVisible({ timeout: 20_000 });
  const chatA = await openChat(ana);
  const send = async (text: string) => {
    await chatA.getByRole('textbox', { name: 'Message' }).fill(text);
    await chatA.keyboard.press('Enter');
    await expect(chatA.getByTestId('chat-message').filter({ hasText: text })).toBeVisible();
  };

  // Switch off: the badge counts, no notification
  expect(await ben.page.evaluate(() => window.api?.chat.notifications()), 'on by default').toBe(true);
  await setChatNotifications(ben, false);
  await background(ben);
  await send('Quiet one');
  await expect.poll(() => badge(ben), { timeout: 15_000 }).toBe(1);
  await ben.page.waitForTimeout(2000);
  expect(notifications(ben)).toEqual([]);

  // Switch on, in the background: one notification "<name> in <project>"
  await setChatNotifications(ben, true);
  await background(ben);
  await send('Loud one');
  await expect.poll(() => badge(ben), { timeout: 15_000 }).toBe(2);
  await expect.poll(() => notifications(ben).length, { timeout: 10_000 }).toBe(1);
  expect(notifications(ben)[0]).toContain(`${ACCOUNTS.ana.name} in ${p.name}`);
  expect(notifications(ana), 'never for my own messages').toEqual([]);

  // Reading clears the badge
  const chatB = await openChat(ben);
  await chatB.bringToFront();
  await expect(chatB.getByTestId('chat-message').filter({ hasText: 'Loud one' })).toBeVisible();
  await expect.poll(() => badge(ben), { timeout: 15_000 }).toBe(0);

  // Written offline: 'Not sent yet', sent on reconnect
  await setOffline(ben, true);
  await chatB.getByRole('textbox', { name: 'Message' }).fill('Written in the field');
  await chatB.keyboard.press('Enter');
  const outgoing = chatB.getByTestId('chat-outgoing').filter({ hasText: 'Written in the field' });
  await expect(outgoing).toContainText('Not sent yet', { timeout: 30_000 });
  await setOffline(ben, false);
  await expect(outgoing).toHaveCount(0, { timeout: 30_000 });
  await expect(chatA.getByTestId('chat-message').filter({ hasText: 'Written in the field' })).toBeVisible({ timeout: 15_000 });

  // The owner deletes Ben's message
  const bens = chatA.getByTestId('chat-message').filter({ hasText: 'Written in the field' });
  await bens.hover();
  await bens.getByLabel('Delete message').click();
  await expect(chatB.getByText(`Message deleted by ${ACCOUNTS.ana.name}`)).toBeVisible({ timeout: 15_000 });

  // Removed: Ben's chip and badge go
  await background(ben);
  await send('One more before you go');
  await expect.poll(() => badge(ben), { timeout: 15_000 }).toBe(1);
  await removeMember(ana, ben);
  await separateCopyNotice(ben, 'Removed From the Project');
  await expect(chip(ben)).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(() => badge(ben), { timeout: 15_000 }).toBe(0);

  expect(ana.consoleErrors.filter((l) => /chat/i.test(l))).toEqual([]);
  expect(ben.consoleErrors.filter((l) => /chat/i.test(l))).toEqual([]);
});
