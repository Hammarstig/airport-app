// Lasttest: seedar en stor databas och mäter svarstider via HTTP mot appen.
// Kör: npm run bench -w server  (env BENCH_CHECKINS=300000 BENCH_USERS=5000 BENCH_DB=/tmp/x.db)
// Budget (docs/API.md v2 / REVIEW.md C.4): flygplatsautocomplete < 20 ms, recensionssök < 50 ms (medel, varm cache).
import { rmSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, transaction } from '../src/db.js';
import { createApp } from '../src/app.js';

const N_CHECKINS = Number(process.env.BENCH_CHECKINS) || 300_000;
const N_USERS = Number(process.env.BENCH_USERS) || 5_000;
const dir = mkdtempSync(join(tmpdir(), 'gatelog-bench-'));
const DB = process.env.BENCH_DB || join(dir, 'bench.db');

// Deterministisk slump så att körningar går att jämföra.
let seed = 42;
const rnd = () => { // mulberry32
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (a) => a[Math.floor(rnd() * a.length)];

const WORDS = [
  'snabb säkerhetskontroll', 'lång kö', 'bra kaffe', 'trevlig lounge', 'dåligt wifi', 'gratis wifi', 'ren och ljus',
  'smidig transfer', 'långt till gaten', 'dyr mat', 'god mat', 'bra skyltning', 'great lounge', 'slow security',
  'friendly staff', 'clean toilets', 'long walk', 'excellent coffee', 'crowded gates', 'quiet terminal',
  'passkontrollen tog tid', 'bra utsikt', 'trångt vid gaterna', 'fina sittplatser', 'laddstolpar överallt',
];
const comment = () => {
  const n = 1 + Math.floor(rnd() * 3);
  return Array.from({ length: n }, () => pick(WORDS)).join(', ') + '.';
};

function seedBig(db) {
  const airports = db.prepare("SELECT iata FROM airports WHERE scheduled = 1 ORDER BY type_rank, iata").all().map((r) => r.iata);
  const hubs = airports.slice(0, 400);
  const airlines = db.prepare('SELECT iata FROM airlines').all().map((r) => r.iata);
  const t0 = Date.now();
  transaction(db, () => {
    const insU = db.prepare("INSERT INTO users (username, password_hash, display_name, home_iata, created_at) VALUES (?, 'x', ?, ?, '2025-01-01')");
    for (let i = 0; i < N_USERS; i++) insU.run(`user${i}`, `Användare ${i}`, pick(hubs));
    const insC = db.prepare(`INSERT INTO checkins (user_id, iata, visited_on, kind, rating, r_security, r_wifi, comment, created_at, airline_iata, travel_class)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const kinds = ['departure', 'arrival', 'transfer', 'layover'];
    const classes = ['economy', 'economy', 'economy', 'premium_economy', 'business', 'first'];
    const start = Date.parse('2024-11-01');
    for (let i = 0; i < N_CHECKINS; i++) {
      const day = new Date(start + Math.floor(rnd() * 730) * 86400000).toISOString().slice(0, 10);
      insC.run(1 + Math.floor(rnd() * N_USERS), rnd() < 0.7 ? pick(hubs) : pick(airports), day, pick(kinds),
        rnd() < 0.8 ? 0.5 * (2 + Math.floor(rnd() * 9)) : null, rnd() < 0.5 ? 1 + Math.floor(rnd() * 5) : null,
        rnd() < 0.5 ? 1 + Math.floor(rnd() * 5) : null, rnd() < 0.6 ? comment() : null, day + 'T12:00:00Z',
        rnd() < 0.7 ? pick(airlines) : null, rnd() < 0.7 ? pick(classes) : null);
    }
    const insL = db.prepare("INSERT OR IGNORE INTO lounges (iata, name, created_at) VALUES (?, ?, '2025-01-01')");
    for (const iata of hubs) insL.run(iata, `${iata} Lounge`);
    const lounges = db.prepare('SELECT id FROM lounges').all().map((r) => r.id);
    const insR = db.prepare("INSERT INTO lounge_reviews (lounge_id, user_id, rating, comment, visited_on, created_at) VALUES (?, ?, ?, ?, '2025-06-01', '2025-06-01')");
    for (let i = 0; i < N_CHECKINS / 15; i++) insR.run(pick(lounges), 1 + Math.floor(rnd() * N_USERS), 1 + Math.floor(rnd() * 5), comment());
    const insF = db.prepare("INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, '2025-01-01')");
    for (let i = 0; i < N_USERS * 10; i++) {
      const a = 1 + Math.floor(rnd() * N_USERS);
      const b = 1 + Math.floor(rnd() * N_USERS);
      if (a !== b) insF.run(a, b);
    }
  });
  db.exec('ANALYZE');
  return Date.now() - t0;
}

async function measure(base, label, paths, { runs = 5, token } = {}) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  for (const p of paths) await fetch(base + p, { headers }).then((r) => r.arrayBuffer()); // värm
  const times = [];
  for (let k = 0; k < runs; k++) {
    for (const p of paths) {
      const t = process.hrtime.bigint();
      const res = await fetch(base + p, { headers });
      await res.arrayBuffer();
      if (res.status >= 400) throw new Error(`${p} gav ${res.status}`);
      times.push(Number(process.hrtime.bigint() - t) / 1e6);
    }
  }
  times.sort((a, b) => a - b);
  const mean = times.reduce((s, x) => s + x, 0) / times.length;
  const p95 = times[Math.floor(times.length * 0.95)];
  return { label, mean: Math.round(mean * 10) / 10, p95: Math.round(p95 * 10) / 10, max: Math.round(times.at(-1) * 10) / 10 };
}

export async function runBench({ log = console.log } = {}) {
  if (existsSync(DB) && !process.env.BENCH_DB) rmSync(DB);
  const db = openDb(DB);
  const have = db.prepare('SELECT COUNT(*) AS n FROM checkins').get().n;
  if (have < N_CHECKINS) log(`Seedar ${N_USERS} användare och ${N_CHECKINS} check-ins ... ${seedBig(db)} ms`);
  const app = createApp({ db, jwtSecret: 'bench-secret-bench-secret-bench-secret', uploadDir: join(dir, 'up'), env: { NODE_ENV: 'test', RANKING_CACHE_MS: '30000' } });
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const { signToken } = await import('../src/auth.js');
  const token = signToken('bench-secret-bench-secret-bench-secret', { id: 1, username: 'user0' });
  const q = (list) => list.map((x) => `/airports?q=${encodeURIComponent(x)}&limit=8`);
  const results = [
    await measure(base, 'autocomplete', q(['got', 'stock', 'lon', 'sverige', 'heathrow', 'new y', 'fr', 'a', 'essa', 'goteborg'])),
    await measure(base, 'recensionssök', ['lounge', 'kaffe', 'säkerhetskontroll', 'wifi', 'great', 'trångt gaterna']
      .map((x) => `/search?q=${encodeURIComponent(x)}`)),
    await measure(base, 'recensionssök med filter', ['/search?q=lounge&iata=LHR', '/search?q=kaffe&minRating=4', '/search?iata=FRA',
      '/search?q=wifi&travelClass=business']),
    await measure(base, 'topplistor', ['/rankings/users?metric=airports', '/rankings/users?metric=countries&period=year',
      '/rankings/users?metric=checkins&period=week', '/rankings/airports', '/rankings/airports?category=wifi', '/rankings/lounges'], { token }),
    await measure(base, 'flöde vänner', ['/feed?scope=friends', '/feed'], { token }),
    await measure(base, 'flygplats och profil', ['/airports/LHR', '/users/user0', '/users/user0/badges', '/users/user0/map', '/countries'], { token }),
  ];
  server.close();
  db.close();
  if (!process.env.BENCH_DB) rmSync(dir, { recursive: true, force: true });
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const res = await runBench();
  console.table(res);
  const budget = { autocomplete: 20, 'recensionssök': 50, 'recensionssök med filter': 50 };
  let ok = true;
  for (const r of res) {
    if (budget[r.label] && r.mean > budget[r.label]) {
      console.error(`ÖVER BUDGET: ${r.label} ${r.mean} ms > ${budget[r.label]} ms`);
      ok = false;
    }
  }
  process.exit(ok ? 0 : 1);
}
