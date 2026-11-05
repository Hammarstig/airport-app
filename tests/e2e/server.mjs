// Startar Gatelog för E2E: temporär databas och uppladdningskatalog, demodata seedas.
// Används av playwright.config.js (webServer). Port via env PORT (default 4173).
import { mkdtempSync, rmSync } from 'node:fs';
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

const { openDb } = await import(join(root, 'server/src/db.js'));
const { seedDemo } = await import(join(root, 'server/scripts/seed-demo.js'));
const { createApp } = await import(join(root, 'server/src/app.js'));

const db = openDb(process.env.DB_PATH);
seedDemo(db);
const app = createApp({ db, jwtSecret: 'e2e-secret', staticDir: join(root, 'client/dist'), uploadDir: process.env.UPLOAD_DIR });
const port = Number(process.env.PORT) || 4173;
const server = app.listen(port, '127.0.0.1', () => console.log(`[e2e] Gatelog på http://127.0.0.1:${port} (data i ${dir})`));

const stop = () => {
  server.close();
  try { db.close(); } catch { /* redan stängd */ }
  rmSync(dir, { recursive: true, force: true });
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
