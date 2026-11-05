import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const swSrc = fileURLToPath(new URL('./sw.js', import.meta.url));
const offlineSrc = fileURLToPath(new URL('./offline.html', import.meta.url));

/**
 * Bygger /sw.js och /offline.html. App-skalet (index.html, startsidans JS/CSS) och
 * offlinesidan förcachas; övriga route-chunkar cachas när de först laddas.
 */
export function gatelogPwa() {
  return {
    name: 'gatelog-pwa',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/offline.html') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(readFileSync(offlineSrc));
          return;
        }
        next();
      });
    },
    generateBundle(_opts, bundle) {
      const shell = ['/offline.html'];
      for (const [file, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk' && chunk.isEntry) {
          shell.push(`/${file}`, ...chunk.imports.map((f) => `/${f}`));
          for (const css of chunk.viteMetadata?.importedCss || []) shell.push(`/${css}`);
        }
      }
      const version = createHash('sha256').update(shell.join('|')).digest('hex').slice(0, 10);
      const code = readFileSync(swSrc, 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify([...new Set(shell)]));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: code });
      this.emitFile({ type: 'asset', fileName: 'offline.html', source: readFileSync(offlineSrc, 'utf8') });
    }
  };
}
