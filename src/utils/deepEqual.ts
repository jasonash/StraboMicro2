/**
 * Deep equality for JSON-like data, ignoring object key order.
 *
 * Same result as comparing JSON.stringify output, except that two objects
 * with the same keys in a different order are equal. Follows JSON rules:
 * object properties whose value is undefined or a function are ignored,
 * undefined inside an array counts as null, array order matters.
 *
 * Main-process copy: electron/deepEqual.js (keep the two in step; the main
 * process is CommonJS and cannot import this file).
 */

function isDropped(value: unknown): boolean {
  return value === undefined || typeof value === 'function';
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const x: unknown = isDropped(a[i]) ? null : a[i];
      const y: unknown = isDropped(b[i]) ? null : b[i];
      if (!deepEqual(x, y)) return false;
    }
    return true;
  }

  if (!isPlainRecord(a) || !isPlainRecord(b)) return false;

  const aKeys = Object.keys(a).filter((k) => !isDropped(a[k]));
  const bKeys = Object.keys(b).filter((k) => !isDropped(b[k]));
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key) || isDropped(b[key])) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}
