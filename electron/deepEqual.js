/**
 * Deep equality for JSON-like data, ignoring object key order.
 * Implementation: electron/shared/deepEqual.mjs (shared with the renderer).
 */

const { deepEqual } = require('./shared/deepEqual.mjs');

module.exports = { deepEqual };
