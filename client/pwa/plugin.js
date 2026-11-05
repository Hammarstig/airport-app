import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const swSrc = fileURLToPath(new URL('./sw.js', import.meta.url));
const offlineSrc = fileURLToPath(new URL('./offline.html', import.meta.url));
const offlineJs = fileURLToPath(new URL('./offline.js', import.meta.url));

/**
 * Bygger /sw.js och /offline.html. App-skalet (index.html, startsidans JS/CSS) och
 * offlinesidan förcachas; övriga route-chunkar cachas när de först laddas.
 */
export function gatelogPwa() {
  return {
    name: 'gatelog-pwa',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/offline.html' || req.url === '/offline.js') {
          const js = req.url.endsWith('.js');
          res.setHeader('Content-Type', js ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
          res.end(readFileSync(js ? offlineJs : offlineSrc));
          return;
        }
        next();
      });
    },
    generateBundle(_opts, bundle) {
      // Förcacha index.html, offlinesidan och alla JS/CSS-chunkar (så att varje sida fungerar offline),
      // utom den detaljerade världskartan (233 kB gzip) som bara behövs för små länder.
      const shell = ['/', '/index.html', '/offline.html', '/offline.js', '/manifest.webmanifest', '/favicon.svg'];
      for (const file of Object.keys(bundle)) {
        if (/\.(js|css)$/.test(file) && !file.includes('countries-50m')) shell.push(`/${file}`);
      }
      const version = createHash('sha256').update(shell.join('|')).digest('hex').slice(0, 10);
      const code = readFileSync(swSrc, 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify([...new Set(shell)]));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: code });
      this.emitFile({ type: 'asset', fileName: 'offline.html', source: readFileSync(offlineSrc, 'utf8') });
      this.emitFile({ type: 'asset', fileName: 'offline.js', source: readFileSync(offlineJs, 'utf8') });
    }
  };
}
