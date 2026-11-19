import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const swSrc = fileURLToPath(new URL('./sw.js', import.meta.url));
const offlineSrc = fileURLToPath(new URL('./offline.html', import.meta.url));
const offlineJs = fileURLToPath(new URL('./offline.js', import.meta.url));
const offlineCss = fileURLToPath(new URL('./offline.css', import.meta.url));
// Offlinesidans filer (egen CSS och JS: CSP tillåter varken inline-skript eller inline-stilar).
const OFFLINE_FILES = {
  '/offline.html': [offlineSrc, 'text/html'],
  '/offline.js': [offlineJs, 'text/javascript'],
  '/offline.css': [offlineCss, 'text/css']
};

/**
 * Bygger /sw.js och /offline.html. App-skalet (index.html, startsidans JS/CSS) och
 * offlinesidan förcachas; övriga route-chunkar cachas när de först laddas.
 */
export function gatelogPwa() {
  return {
    name: 'gatelog-pwa',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = OFFLINE_FILES[req.url];
        if (file) {
          res.setHeader('Content-Type', `${file[1]}; charset=utf-8`);
          res.end(readFileSync(file[0]));
          return;
        }
        next();
      });
    },
    generateBundle(_opts, bundle) {
      // Förcacha index.html, offlinesidan och alla JS/CSS-chunkar (så att varje sida fungerar offline),
      // utom den detaljerade världskartan (233 kB gzip) som bara behövs för små länder.
      const shell = ['/', '/index.html', ...Object.keys(OFFLINE_FILES), '/manifest.webmanifest', '/favicon.svg'];
      for (const file of Object.keys(bundle)) {
        if (/\.(js|css)$/.test(file) && !file.includes('countries-50m')) shell.push(`/${file}`);
      }
      const hash = createHash('sha256').update(shell.join('|'));
      for (const [src] of Object.values(OFFLINE_FILES)) hash.update(readFileSync(src));
      const version = hash.digest('hex').slice(0, 10);
      const code = readFileSync(swSrc, 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify([...new Set(shell)]));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: code });
      for (const [path, [src]] of Object.entries(OFFLINE_FILES))
        this.emitFile({ type: 'asset', fileName: path.slice(1), source: readFileSync(src, 'utf8') });
    }
  };
}
