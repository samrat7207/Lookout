import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Stage 1 is standalone: no /api proxy yet (Stage 2 adds it).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
