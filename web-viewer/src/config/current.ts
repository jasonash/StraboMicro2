/**
 * This page's configuration, read once (src/config/viewerConfig.ts).
 * Server build: ?base= / ?p= / ?layout= / ?theme= from the address.
 * Standalone build (vite --mode standalone): the deployer's config.js plus ?p=, ?layout=, ?theme=.
 */

import { readViewerConfig, type ViewerConfig } from './viewerConfig';

export const viewerConfig: ViewerConfig = readViewerConfig(
  import.meta.env.MODE === 'standalone' ? 'standalone' : 'server',
  window.location.search,
  window.StraboMicroViewerConfig,
);
