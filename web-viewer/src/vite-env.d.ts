/// <reference types="vite/client" />

/** Set by config.js in the standalone build (src/config/viewerConfig.ts) */
interface Window {
  StraboMicroViewerConfig?: import('./config/viewerConfig').StandaloneConfigInput;
}
