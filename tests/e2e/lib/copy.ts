/**
 * One running copy of the app in an end-to-end test: its own userData and
 * Documents (STRABO_E2E_DIR, electron/main.js), logged in as one of the
 * e2e accounts (tests/e2e/seed.sql), against the local dev server.
 *
 * The test drives it the way a person does: application menus by their
 * labels, dialogs by their buttons. Native file pickers and message boxes
 * cannot be clicked, so the test queues their answers (answerDialog).
 */

import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { WATCH, pause } from './watch';

export const REPO = path.resolve(__dirname, '../../..');
export const SERVER = process.env.STRABO_E2E_SERVER || 'http://localhost';
export const PASSWORD = 'testpass123';

export interface Account {
  email: string;
  name: string;
}

export const ACCOUNTS = {
  ana: { email: 'e2e.ana@test.strabospot.org', name: 'Ana Ruiz' },
  ben: { email: 'e2e.ben@test.strabospot.org', name: 'Ben Ito' },
  cleo: { email: 'e2e.cleo@test.strabospot.org', name: 'Cleo Park' },
  dev: { email: 'e2e.dev@test.strabospot.org', name: 'Dev Shah' },
} as const satisfies Record<string, Account>;

/** An answer for the next native dialog the app opens */
export type DialogAnswer =
  | { kind: 'open'; filePaths: string[] }
  | { kind: 'save'; filePath: string }
  | { kind: 'message'; response: number };

export class Copy {
  /** console.error lines of the page, oldest first */
  readonly consoleErrors: string[] = [];
  /** Every console line of the page, oldest first (the last 5000) */
  readonly consoleLines: string[] = [];
  /** Messages of browser alert() / confirm() the page showed (accepted), oldest first */
  readonly alerts: string[] = [];

  constructor(
    readonly label: string,
    readonly account: Account,
    readonly app: ElectronApplication,
    readonly page: Page,
    readonly dir: string,
  ) {}

  /** The main log of this copy (attached to a failed test) */
  get logFile(): string {
    return path.join(this.dir, 'userData', 'logs', 'main.log');
  }

  /** Click an application menu item by its labels, e.g. ['File', 'Open Local Project (.smz)'] */
  async menu(...labels: string[]): Promise<void> {
    await this.caption(`${labels.join(' > ')}`);
    await this.app.evaluate(({ Menu }, labels) => {
      let items = Menu.getApplicationMenu()?.items ?? [];
      let item = null;
      for (const label of labels) {
        item = items.find((i) => i.label === label) ?? null;
        if (!item) throw new Error(`No menu item '${label}' (looking for ${labels.join(' > ')})`);
        items = item.submenu?.items ?? [];
      }
      if (!item) throw new Error('No menu labels');
      if (!item.enabled) throw new Error(`Menu item '${labels.join(' > ')}' is disabled`);
      // The app's click handlers use their own window, not the arguments
      (item.click as () => void)();
    }, labels);
  }

  /** Queue the answer for the next native dialog (file picker, save, message box) */
  async answerDialog(answer: DialogAnswer): Promise<void> {
    await this.app.evaluate((_electron, answer) => {
      const g = globalThis as unknown as { __e2eDialogs: DialogAnswer[] };
      g.__e2eDialogs.push(answer);
    }, answer);
  }

  /** Native dialogs the app opened that the test had not answered (should be empty) */
  async unansweredDialogs(): Promise<string[]> {
    return this.app.evaluate(() => (globalThis as unknown as { __e2eUnanswered: string[] }).__e2eUnanswered.slice());
  }

  /** Show what the test is doing in this window (watch mode), and pace the run */
  async caption(text: string): Promise<void> {
    if (!WATCH) return;
    await this.page.evaluate(([who, text]) => {
      let el = document.getElementById('__e2e_caption');
      if (!el) {
        el = document.createElement('div');
        el.id = '__e2e_caption';
        el.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483647;' +
          'background:rgba(20,20,20,.92);color:#fff;font:600 15px system-ui;padding:8px 14px;border-radius:8px;' +
          'border:2px solid #4fc3f7;pointer-events:none;max-width:90%;text-align:center';
        document.body.appendChild(el);
      }
      el.textContent = `${who}: ${text}`;
    }, [this.label, text]);
    await pause();
  }

  /** Log in through Account > Login... and the Sign in dialog */
  async login(): Promise<void> {
    await this.menu('Account', 'Login...');
    const dialog = this.page.getByRole('dialog', { name: 'Sign in to StraboSpot' });
    await dialog.getByLabel('Email').fill(this.account.email);
    await dialog.getByLabel('Password').fill(PASSWORD);
    await this.caption(`signs in as ${this.account.name}`);
    await dialog.getByRole('button', { name: 'Sign In' }).click();
    await dialog.waitFor({ state: 'hidden' });
    await this.page.waitForFunction(() => window.__e2e?.auth.getState().isAuthenticated === true);
  }

  /** Read from the page's stores (window.__e2e, src/services/e2eHooks.ts) */
  async state<T>(fn: (e2e: NonNullable<Window['__e2e']>) => T): Promise<T> {
    const source = fn.toString();
    return this.page.evaluate((source) => {
      const e2e = window.__e2e;
      if (!e2e) throw new Error('Not in e2e mode (window.__e2e missing)');
      // eslint-disable-next-line no-new-func
      return (new Function('e2e', `return (${source})(e2e);`))(e2e);
    }, source) as Promise<T>;
  }

  async close(): Promise<void> {
    await this.app.close().catch(() => undefined);
  }
}

/**
 * Launch a copy as an account. Watch mode places the windows side by side:
 * slot 0 left, slot 1 right, slot 2 bottom left, ...
 */
export async function launchCopy(label: string, account: Account, slot: number, runDir: string,
  extraEnv: Record<string, string> = {}): Promise<Copy> {
  const dir = path.join(runDir, label.toLowerCase());
  fs.mkdirSync(dir, { recursive: true });
  const app = await electron.launch({
    args: ['.'],
    cwd: REPO,
    env: { ...process.env, ...extraEnv, STRABO_E2E_DIR: dir, STRABO_E2E_SERVER: SERVER } as Record<string, string>,
  });

  // Native dialogs answered from the test's queue; anything unanswered is
  // cancelled and recorded, so a forgotten answer fails instead of hanging
  await app.evaluate(({ dialog }) => {
    const g = globalThis as unknown as { __e2eDialogs: DialogAnswer[]; __e2eUnanswered: string[] };
    g.__e2eDialogs = [];
    g.__e2eUnanswered = [];
    const next = (kind: string, options: unknown) => {
      const a = g.__e2eDialogs[0];
      if (a && a.kind === kind) return g.__e2eDialogs.shift();
      g.__e2eUnanswered.push(`${kind}: ${JSON.stringify(options).slice(0, 300)}`);
      return null;
    };
    const opts = (args: unknown[]) => (args.length > 1 ? args[1] : args[0]);
    dialog.showOpenDialog = (async (...args: unknown[]) => {
      const a = next('open', opts(args));
      return a && a.kind === 'open' ? { canceled: false, filePaths: a.filePaths } : { canceled: true, filePaths: [] };
    }) as typeof dialog.showOpenDialog;
    dialog.showSaveDialog = (async (...args: unknown[]) => {
      const a = next('save', opts(args));
      return a && a.kind === 'save' ? { canceled: false, filePath: a.filePath } : { canceled: true, filePath: '' };
    }) as typeof dialog.showSaveDialog;
    dialog.showMessageBox = (async (...args: unknown[]) => {
      const a = next('message', opts(args));
      return { response: a && a.kind === 'message' ? a.response : 0, checkboxChecked: false };
    }) as typeof dialog.showMessageBox;
  });

  const page = await app.waitForEvent('window', {
    predicate: (p) => p.url().startsWith('http://localhost:5173'),
    timeout: 60_000,
  }).catch(async () => {
    const found = app.windows().find((p) => p.url().startsWith('http://localhost:5173'));
    if (found) return found;
    // What there is to go on: the windows that did open, and the end of the main log
    const windows = app.windows().map((p) => p.url()).join(', ') || 'none';
    const logFile = path.join(dir, 'userData', 'logs', 'main.log');
    const tail = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n').slice(-25).join('\n') : '(no main.log)';
    await app.close().catch(() => undefined);
    throw new Error(`${label}: the main window did not open (windows: ${windows})\n--- main.log tail ---\n${tail}`);
  });
  await page.waitForFunction(() => Boolean(window.__e2e), undefined, { timeout: 60_000 });

  await app.evaluate(({ BrowserWindow, screen }, [label, slot]) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().startsWith('http://localhost:5173'));
    if (!win) return;
    const area = screen.getPrimaryDisplay().workArea;
    const cols = 2;
    const rows = Number(slot) >= 2 ? 2 : 1;
    const w = Math.floor(area.width / cols);
    const h = Math.floor(area.height / rows);
    const col = Number(slot) % cols;
    const row = Math.floor(Number(slot) / cols);
    win.setBounds({ x: area.x + col * w, y: area.y + row * h, width: w, height: h });
    win.setTitle(`StraboMicro [${label}]`);
    win.on('page-title-updated', (e) => {
      e.preventDefault();
    });
  }, [label, slot] as const);

  const copy = new Copy(label, account, app, page, dir);
  page.on('console', (msg) => {
    const text = msg.text().slice(0, 1000);
    if (msg.type() === 'error') copy.consoleErrors.push(text);
    copy.consoleLines.push(text);
    if (copy.consoleLines.length > 5000) copy.consoleLines.shift();
  });
  page.on('pageerror', (err) => copy.consoleErrors.push(`pageerror: ${err.message}`));
  page.on('dialog', (d) => {
    copy.alerts.push(d.message());
    void d.accept().catch(() => undefined);
  });
  return copy;
}

export function newRunDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'strabo-e2e-'));
}
