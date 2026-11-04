/**
 * Where onnxruntime-web finds its WebAssembly files, for the renderer and
 * for workers (FastSAM in fastsamInference.ts, Grain Spot in grainSpot/).
 *
 * In development Vite serves them from node_modules. In the packaged app the
 * renderer is served from app://bundle/ by electron/main.js, which maps that
 * scheme onto dist/; onnxruntime-web is pointed at the .mjs loader that
 * vite.config.ts copies into dist/, and the .wasm binary is then resolved
 * relative to the .mjs URL (see ort.mjs locateFile). Chromium's import()
 * could not load ES modules straight from an asar file:// URL, which is why
 * the loader is served through the protocol handler instead.
 *
 * build: the default import ('onnxruntime-web', FastSAM) loads the jsep
 * files; 'onnxruntime-web/webgpu' (Grain Spot) loads the asyncify files.
 *
 * Call from the window (not a worker): the packaged path is resolved
 * against the page's URL, and a worker gets the result as a message.
 */
export type OrtWasmPaths = string | { mjs: string };

export function ortWasmPaths(build: 'jsep' | 'asyncify' = 'jsep'): OrtWasmPaths {
  if (import.meta.env.DEV) return '/node_modules/onnxruntime-web/dist/';
  return { mjs: new URL(`ort-wasm-simd-threaded.${build}.mjs`, window.location.href).href };
}

/** Threads for WASM inference: all cores when the page is cross-origin isolated (COOP/COEP in main.js), else 1 */
export function ortThreads(): number {
  const isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
  return isolated ? (navigator.hardwareConcurrency || 4) : 1;
}
