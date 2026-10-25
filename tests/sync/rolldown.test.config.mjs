// Bundles the TypeScript tests that import through the @ alias for Node: npm run test:undo-history, test:geometry-preview, test:composite-refresh, test:sync-chip, test:member-cleanup, test:permissions, test:activity-feed, test:parked-review, test:presence, test:remote-rows, test:new-spot, test:store-indexes
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const bundle = (name, dir = 'tests/sync') => ({
  input: path.join(root, `${dir}/${name}.test.ts`),
  platform: 'node',
  resolve: { alias: { '@': path.join(root, 'src') } },
  output: { file: path.join(root, `node_modules/.cache/sync-tests/${name}.test.mjs`), format: 'esm' },
});

export default [bundle('undoHistory'), bundle('geometryPreview'), bundle('compositeRefresh'), bundle('syncChipState'), bundle('memberCleanup'), bundle('permissions'), bundle('activityFeed'), bundle('parkedReview'), bundle('presence'), bundle('remoteProjectRow'), bundle('newSpot', 'tests'), { ...bundle('storeIndexes', 'tests'), transform: { define: { 'import.meta.env': '{"DEV":false,"PROD":true,"MODE":"test"}' } } }];
