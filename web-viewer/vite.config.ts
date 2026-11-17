import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const STANDALONE_CONFIG = fileURLToPath(new URL('./standalone/config.js', import.meta.url));

/**
 * Standalone build (vite --mode standalone): the page loads the deployer's
 * config.js before the app, the dev server serves standalone/config.js, and
 * the build writes it next to the page (not hashed, so it can be edited).
 */
function standaloneConfig(): Plugin {
  return {
    name: 'strabo-standalone-config',
    transformIndexHtml(html) {
      return html.replace('<!-- standalone-config -->', '<script src="./config.js"></script>');
    },
    configureServer(server) {
      server.middlewares.use('/config.js', (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript');
        res.end(readFileSync(STANDALONE_CONFIG, 'utf8'));
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'config.js', source: readFileSync(STANDALONE_CONFIG, 'utf8') });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const standalone = mode === 'standalone';
  return {
    plugins: [react(), ...(standalone ? [standaloneConfig()] : [])],
    server: {
      port: 3000,
    },
    // For production build, assets are served relative to the page
    base: './',
    // The standalone package must not carry public/ (index.php is the
    // strabospot.org router; smzFiles/ holds local test projects). The dev
    // server still serves public/smzFiles for testing.
    publicDir: standalone && command === 'build' ? false : 'public',
    build: {
      outDir: standalone ? 'dist-standalone' : 'dist',
    },
  };
});
