// Bundles the TypeScript sync tests for Node: npm run test:undo-history, test:geometry-preview, test:composite-refresh, test:sync-chip, test:member-cleanup, test:permissions
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const bundle = (name) => ({
  input: path.join(root, `tests/sync/${name}.test.ts`),
  platform: 'node',
  resolve: { alias: { '@': path.join(root, 'src') } },
  output: { file: path.join(root, `node_modules/.cache/sync-tests/${name}.test.mjs`), format: 'esm' },
});

export default [bundle('undoHistory'), bundle('geometryPreview'), bundle('compositeRefresh'), bundle('syncChipState'), bundle('memberCleanup'), bundle('permissions')];
