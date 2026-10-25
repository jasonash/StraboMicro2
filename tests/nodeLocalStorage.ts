// Browser globals for Node tests that load the real store: a Map-backed
// localStorage (session persistence) and an empty window (no window.api, so
// the store's IPC calls are skipped). Import it before the store.
const storage = new Map<string, string>();
const localStorage = {
  getItem: (k: string) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k: string, v: string) => void storage.set(k, String(v)),
  removeItem: (k: string) => void storage.delete(k),
};
const g = globalThis as { localStorage?: unknown; window?: unknown };
g.localStorage = localStorage;
g.window ??= { localStorage, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true };
