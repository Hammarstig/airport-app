// S10 Delad enhet (webbläsare): vad finns kvar efter utloggning, och skickas en annan användares
// offlinekö under nästa konto? Kräver en körande server med demodata (npm run seed:demo -w server)
// och byggd klient. Se docs/SECURITY-REVIEW.md.
//   BASE_URL=http://localhost:8795 DB_PATH=/sökväg/gatelog.db node --test tests/security/s10-shared-device.test.mjs
// Hoppas över om servern inte svarar.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
const BASE = process.env.BASE_URL ?? 'http://localhost:8795';
const DB = process.env.DB_PATH ?? '/tmp/claude-0/sec/gatelog.db';
const up = await fetch(`${BASE}/api/health`).then((r) => r.ok, () => false);

describe('S10 delad enhet', { skip: !up && `ingen server på ${BASE}` }, () => {
  let browser; let ctx; let page;
  const marker = `OFFLINE-${Date.now()}`;

  async function login(username) {
    await page.goto(`${BASE}/login`);
    await page.locator('#login-username').fill(username);
    await page.locator('#login-password').fill('demo1234');
    await page.locator('form button[type=submit]').click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
    await page.waitForLoadState('networkidle');
  }

  before(async () => {
    const { chromium } = require('playwright');
    browser = await chromium.launch();
    ctx = await browser.newContext();
    page = await ctx.newPage();
  });
  after(async () => { await browser?.close(); });

  test('SEC-11: offlinekö och lokala data rensas vid utloggning och skickas aldrig som en annan användare', { todo: 'SEC-11' }, async () => {
    await login('anna');
    await page.goto(`${BASE}/settings`);
    await page.waitForLoadState('networkidle');
    // Anna checkar in utan nät. Posten läggs i IndexedDB-utkorgen precis som offlineQueue.enqueue() gör.
    await ctx.setOffline(true);
    await page.evaluate((m) => new Promise((resolve, reject) => {
      const req = indexedDB.open('gatelog', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
      req.onsuccess = () => {
        const t = req.result.transaction('outbox', 'readwrite');
        t.objectStore('outbox').add({ body: { iata: 'BMA', visitedOn: '2026-11-15', kind: 'departure', comment: m, visibility: 'private' },
          photos: [], airport: { iata: 'BMA' }, createdAt: new Date().toISOString(), attempts: 0, error: null });
        t.oncomplete = resolve; t.onerror = () => reject(t.error);
      };
    }), marker);
    // Anna loggar ut medan hon fortfarande är offline (Inställningar > Logga ut).
    await page.getByRole('button', { name: /^Logga ut$/ }).click();
    await page.waitForTimeout(500);
    const leftovers = await page.evaluate(async () => {
      const db = await new Promise((r) => { const q = indexedDB.open('gatelog', 1); q.onsuccess = () => r(q.result); });
      const items = await new Promise((r) => { const q = db.transaction('outbox').objectStore('outbox').getAll(); q.onsuccess = () => r(q.result); });
      return { outbox: items.length, localStorage: Object.keys(localStorage) };
    });
    // Nätet är tillbaka. Mads loggar in på samma enhet; appen startar om och tömmer kön.
    await ctx.setOffline(false);
    await login('mads');
    await page.reload();
    await page.waitForTimeout(2500);
    const db = new DatabaseSync(DB, { readOnly: true });
    const row = db.prepare('SELECT u.username FROM checkins c JOIN users u ON u.id = c.user_id WHERE c.comment = ?').get(marker);
    db.close();
    assert.equal(row, undefined, `Annas offline-check-in publicerades som ${row?.username}`);
    assert.equal(leftovers.outbox, 0, `utkorgen hade ${leftovers.outbox} post(er) kvar efter utloggning; localStorage: ${leftovers.localStorage.join(', ')}`);
  });
});
