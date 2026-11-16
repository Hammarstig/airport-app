import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { gatelogPwa } from './pwa/plugin.js';
import { routePreload } from './scripts/route-preload.js';

const proxy = {
  '/api': 'http://localhost:8787',
  '/uploads': 'http://localhost:8787'
};

export default defineConfig({
  plugins: [react(), routePreload(), gatelogPwa()],
  server: { port: 5173, proxy },
  preview: { proxy },
  build: {
    target: 'es2020',
    // Manifestet används av scripts/check-budget.mjs för att räkna storlek per sida.
    manifest: true,
    // Märkes-SVG:er ska inte bäddas in i JS (72 bilder skulle annars bli en 230 kB-chunk).
    assetsInlineLimit: (file) => (file.includes('/assets/badges/') ? false : undefined),
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
