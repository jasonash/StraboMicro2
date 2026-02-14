import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import pkg from './package.json';

/**
 * Vite plugin to copy onnxruntime-web WASM and MJS files to the dist output.
 * In development, Vite serves them directly from node_modules.
 * In production, they must be in dist/ so they can be unpacked from asar
 * and loaded by Chromium's ES module loader.
 *
 * Both .wasm (binary) and .mjs (JS glue) files are needed because
 * onnxruntime-web dynamically imports the .mjs backend at runtime,
 * and Chromium cannot load ES modules from inside Electron's asar archive.
 */
function copyOrtWasmPlugin(): Plugin {
  return {
    name: 'copy-ort-wasm',
    writeBundle() {
      const ortDistDir = path.resolve(__dirname, 'node_modules/onnxruntime-web/dist');
      const outputDir = path.resolve(__dirname, 'dist');

      if (!fs.existsSync(ortDistDir)) {
        console.warn('[copy-ort-wasm] onnxruntime-web dist dir not found');
        return;
      }

      const filesToCopy = fs.readdirSync(ortDistDir).filter(f =>
        f.startsWith('ort-wasm') && (f.endsWith('.wasm') || f.endsWith('.mjs'))
      );
      for (const file of filesToCopy) {
        const src = path.join(ortDistDir, file);
        const dest = path.join(outputDir, file);
        fs.copyFileSync(src, dest);
        console.log(`[copy-ort-wasm] Copied ${file} to dist/`);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copyOrtWasmPlugin()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
  },
  assetsInclude: ['**/*.csv'],
  // OpenCV.js and onnxruntime-web need to be excluded from dep optimization
  optimizeDeps: {
    exclude: ['@techstark/opencv-js', 'onnxruntime-web'],
  },
});
