import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The browser only ever talks to /api; the server (port 8787) holds any keys.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8787' },
  },
});
