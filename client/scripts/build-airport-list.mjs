// Genererar src/data/airports-offline.json: kompakt lista över flygplatser med reguljärtrafik
// för flygplatsval utan nät. Kör: node client/scripts/build-airport-list.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../../server/data/airports.json', import.meta.url));
const out = fileURLToPath(new URL('../src/data/airports-offline.json', import.meta.url));
const TYPE = { large: 'L', medium: 'M', small: 'S' };

const rows = JSON.parse(readFileSync(src, 'utf8'))
  .filter((a) => a.scheduled)
  .map((a) => [a.iata, a.name, a.city || '', a.country, a.continent, TYPE[a.type] || 'S']);

writeFileSync(out, JSON.stringify(rows));
console.log(`${rows.length} flygplatser -> ${out}`);
