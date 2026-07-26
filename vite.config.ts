import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: true, port: 5173 },
  build: { target: 'es2022' },
  // Only index.html is the app entry; keep the archived prototype out of the scan.
  optimizeDeps: { entries: ['index.html'] },
});
