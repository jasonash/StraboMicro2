// Bundles the TypeScript sync tests for Node: npm run test:undo-history
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default {
  input: path.join(root, 'tests/sync/undoHistory.test.ts'),
  platform: 'node',
  resolve: { alias: { '@': path.join(root, 'src') } },
  output: { file: path.join(root, 'node_modules/.cache/sync-tests/undoHistory.test.mjs'), format: 'esm' },
};
