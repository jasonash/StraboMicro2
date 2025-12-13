import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import pkg from './package.json';

export default defineConfig({
  plugins: [react()],
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
  // OpenCV.js needs these Node.js built-ins stubbed for browser
  optimizeDeps: {
    exclude: ['@techstark/opencv-js'],
  },
});
