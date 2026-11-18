// Prestandabudget för klientbygget. Körs efter `vite build` (npm run budget) och i CI; avslutar med
// felkod om en gräns överskrids. Storlekar är gzip.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const manifest = JSON.parse(readFileSync(`${dist}.vite/manifest.json`, 'utf8'));
const gz = (file) => gzipSync(readFileSync(dist + file)).length / 1024;

const BUDGET = {
  initialJs: 100, // entry + statiska importer (det som laddas före första renderingen)
  initialCss: 25,
  likelyNext: 30, // förhämtning av troligaste nästa steg per sida (lib/prefetch.js)
  lazyChunk: 40, // varje sida/komponent som laddas vid behov
  // Stora men isolerade data-/kartchunkar som bara laddas på kartsidan eller för offline.
  exempt: { 'map-vendor': 30, 'countries-110m': 45, 'countries-50m': 240, 'airports-offline': 80 }
};

// Alla filer (rekursivt via statiska importer) som en manifestpost drar in.
function closure(key, seen = new Set()) {
  if (seen.has(key)) return seen;
  seen.add(key);
  for (const dep of manifest[key].imports || []) closure(dep, seen);
  return seen;
}
const files = (keys) => [...new Set(keys.flatMap((k) => [...closure(k)]).map((k) => manifest[k].file))];
const cssOf = (keys) => [...new Set(keys.flatMap((k) => [...closure(k)]).flatMap((k) => manifest[k].css || []))];
const sum = (list) => list.reduce((n, f) => n + gz(f), 0);

const entry = Object.keys(manifest).find((k) => manifest[k].isEntry);
const initial = [...closure(entry)];
const initialSet = new Set(files([entry]));
const errors = [];
const report = [];
const check = (name, value, limit) => {
  report.push(`${value.toFixed(1).padStart(6)} kB / ${String(limit).padStart(3)} kB  ${name}`);
  if (value > limit) errors.push(`${name}: ${value.toFixed(1)} kB > ${limit} kB`);
};

check('initial JS', sum(files([entry])), BUDGET.initialJs);
check('initial CSS', sum(cssOf([entry])), BUDGET.initialCss);

// Troligaste nästa steg: samma tabell som lib/prefetch.js.
const page = (name) => Object.keys(manifest).find((k) => k.endsWith(`/${name}.jsx`));
const LIKELY = {
  '/': ['CheckinPage', 'AirportPage'],
  '/airport': ['CheckinPage'],
  '/u': ['AirportPage'],
  '/checkin': ['DonePage']
};
for (const [route, pages] of Object.entries(LIKELY)) {
  const extra = files(pages.map(page)).filter((f) => !initialSet.has(f));
  check(`förhämtning från ${route}`, sum(extra), BUDGET.likelyNext);
}

for (const [k, m] of Object.entries(manifest)) {
  if (!m.file.endsWith('.js') || initial.includes(k)) continue;
  const name = m.file.replace(/^assets\//, '').replace(/-[\w-]{8}\.js$/, '');
  const limit = BUDGET.exempt[name] ?? BUDGET.lazyChunk;
  const size = gz(m.file);
  if (size > limit) errors.push(`${name}: ${size.toFixed(1)} kB > ${limit} kB`);
}

console.log(report.join('\n'));
if (errors.length) {
  console.error(`\nPrestandabudgeten överskrids:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log('\nPrestandabudget: OK');
