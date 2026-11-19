// Startar Gatelog för E2E: temporär databas och uppladdningskatalog, demodata seedas.
// Används av playwright.config.js (webServer). Port via env PORT (default 4173).
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const dir = mkdtempSync(join(tmpdir(), 'gatelog-e2e-'));
process.env.DB_PATH = join(dir, 'e2e.db');
process.env.UPLOAD_DIR = join(dir, 'uploads');
process.env.AUTH_RATE_MAX ||= '10000';
process.env.NODE_ENV ||= 'test';

const { openDb } = await import(join(root, 'server/src/db/index.js'));
const { seedDemo } = await import(join(root, 'server/scripts/seed-demo.js'));
const { createApp } = await import(join(root, 'server/src/app.js'));

const db = openDb(process.env.DB_PATH);
seedDemo(db);
// Moderator för e2e (v4.1/SEC-03: rollen ligger i users.role, som `npm run moderator -w server -- grant`).
const { default: bcrypt } = await import(join(root, 'node_modules/bcryptjs/index.js'));
db.prepare(`INSERT INTO users (username, password_hash, display_name, role, created_at) VALUES (?, ?, ?, 'moderator', ?)`)
  .run('e2e_mod', bcrypt.hashSync('Moderator-2026!', 10), 'E2E Moderator', new Date().toISOString());
// Egen kopia av den byggda klienten: andra agenter kan bygga om client/dist medan sviten körs,
// och då pekade index.html på chunkar som inte längre fanns (vit sida).
const staticDir = join(dir, 'dist');
cpSync(join(root, 'client/dist'), staticDir, { recursive: true });
const app = createApp({ db, jwtSecret: 'e2e-secret', staticDir, uploadDir: process.env.UPLOAD_DIR });
const port = Number(process.env.PORT) || 4173;
const server = app.listen(port, '127.0.0.1', () => console.log(`[e2e] Gatelog på http://127.0.0.1:${port} (data i ${dir})`));
// Nodes standard keepAliveTimeout (5 s) stänger vilande anslutningar samtidigt som testklientens
// keep-alive-pool återanvänder dem, vilket gav sporadiska ECONNRESET under parallell last.
server.keepAliveTimeout = 120_000;
server.headersTimeout = 121_000;

const stop = () => {
  server.close();
  try { db.close(); } catch { /* redan stängd */ }
  rmSync(dir, { recursive: true, force: true });
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
