/**
 * Deep equality for JSON-like data, ignoring object key order.
 *
 * Same result as comparing JSON.stringify output, except that two objects
 * with the same keys in a different order are equal. Follows JSON rules:
 * object properties whose value is undefined or a function are ignored,
 * undefined inside an array counts as null, array order matters.
 *
 * Renderer copy: src/utils/deepEqual.ts (keep the two in step; the main
 * process is CommonJS and cannot import the renderer's TypeScript).
 */

function isDropped(value) {
  return value === undefined || typeof value === 'function';
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const x = isDropped(a[i]) ? null : a[i];
      const y = isDropped(b[i]) ? null : b[i];
      if (!deepEqual(x, y)) return false;
    }
    return true;
  }

  const aKeys = Object.keys(a).filter((k) => !isDropped(a[k]));
  const bKeys = Object.keys(b).filter((k) => !isDropped(b[k]));
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key) || isDropped(b[key])) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

module.exports = { deepEqual };
