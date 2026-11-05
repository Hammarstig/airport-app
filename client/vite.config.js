import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { gatelogPwa } from './pwa/plugin.js';

const proxy = {
  '/api': 'http://localhost:8787',
  '/uploads': 'http://localhost:8787'
};

export default defineConfig({
  plugins: [react(), gatelogPwa()],
  server: { port: 5173, proxy },
  preview: { proxy },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run)\//.test(id))
            return 'vendor';
          if (/node_modules\/(d3-|topojson-client)/.test(id)) return 'map-vendor';
        }
      }
    }
  }
});
