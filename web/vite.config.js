import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Offline shell (user-side cache): after a production build, write dist/sw.js listing every
// built file, with a version taken from their hashed names, so a new build gets a new cache
// and the old one is deleted on activate. Nothing is written in dev (`vite`).
function offlineShell() {
  return {
    name: 'lookout-offline-shell',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const shell = ['/', '/index.html', ...files.filter((f) => f !== 'index.html').map((f) => `/${f}`)];
      const version = createHash('sha1').update(files.sort().join('|')).digest('hex').slice(0, 12);
      const tpl = readFileSync(new URL('./src/offline/sw-template.js', import.meta.url), 'utf8');
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: tpl.replace('__VERSION__', version).replace('__SHELL__', JSON.stringify(shell)) });
    },
  };
}

// The browser only ever talks to /api; the server (port 8787) holds any keys.
export default defineConfig({
  plugins: [react(), offlineShell()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8787' },
  },
  // `npm run preview` serves the production build (with the offline shell) on 4173
  preview: {
    port: 4173,
    proxy: { '/api': 'http://localhost:8787' },
  },
});
