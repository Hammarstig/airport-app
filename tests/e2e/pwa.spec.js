// PWA (manifest, service worker, offline) och konsolfel.
const { test, expect } = require('@playwright/test');
const { collectProblems } = require('./helpers');

function pngSize(buf) {
  expect(buf.subarray(1, 4).toString('latin1')).toBe('PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

test.describe('PWA', () => {
  test('manifestet är giltigt med maskable-ikoner 192/512', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    const res = await request.get(href);
    expect(res.status()).toBe(200);
    const m = await res.json();
    expect(m.name).toBe('Gatelog');
    expect(m.short_name).toBeTruthy();
    expect(m.start_url).toBe('/');
    expect(['standalone', 'fullscreen', 'minimal-ui']).toContain(m.display);
    expect(m.theme_color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(m.background_color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    // v2: två theme-color (ljust/mörkt tema); det ljusa ska matcha manifestet.
    const metas = await page.locator('meta[name="theme-color"]').evaluateAll((els) => els.map((e) => [e.media, e.content]));
    expect(metas).toContainEqual(['(prefers-color-scheme: light)', m.theme_color]);
    expect(metas.some(([media]) => media === '(prefers-color-scheme: dark)')).toBe(true);
    for (const size of [192, 512]) {
      for (const purpose of ['any', 'maskable']) {
        const icon = m.icons.find((i) => i.sizes === `${size}x${size}` && i.purpose.split(' ').includes(purpose));
        expect(icon, `${purpose} ${size}`).toBeTruthy();
        expect(icon.type).toBe('image/png');
        const img = await request.get(icon.src);
        expect(img.status()).toBe(200);
        expect(img.headers()['content-type']).toContain('image/png');
        expect(pngSize(await img.body())).toEqual({ w: size, h: size });
      }
    }
    const touch = await request.get('/apple-touch-icon.png');
    expect(touch.status()).toBe(200);
  });

  test('service worker registreras och styr sidan', async ({ page }) => {
    await page.goto('/');
    const scope = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return reg.scope;
    });
    expect(scope).toMatch(/\/$/);
    await page.reload();
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const cacheNames = await page.evaluate(() => caches.keys());
    expect(cacheNames.some((k) => k.startsWith('gatelog-shell-'))).toBe(true);
  });

  test('offline visar app-skalet från cachen och app-skalets filer finns i cachen (BUG-08)', async ({ page, context }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const precached = await page.evaluate(async () => {
      const keys = await caches.keys();
      const shell = await caches.open(keys.find((k) => k.startsWith('gatelog-shell-')));
      return (await shell.keys()).map((r) => new URL(r.url).pathname);
    });
    expect(precached).toContain('/offline.html');
    expect(precached.some((p) => /^\/assets\/index-.*\.js$/.test(p))).toBe(true);
    await context.setOffline(true);
    await page.goto('/explore').catch(() => {});
    await expect(page.getByRole('heading', { level: 1, name: 'Utforska' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Du är offline' })).toBeVisible();
    await context.setOffline(false);
  });

  test('offlinesidans "Försök igen" laddar om sidan', async ({ page }) => {
    // Offlinesidan visas bara om app-skalet saknas i cachen; testa knappen direkt på sidan.
    await page.goto('/offline.html');
    await expect(page.getByRole('heading', { name: 'Du är offline' })).toBeVisible();
    const reloaded = page.waitForEvent('load');
    await page.getByRole('button', { name: 'Försök igen' }).click();
    await reloaded;
  });

  test('kamera-input finns för check-in-foto på Android', async ({ page, request }) => {
    const { loginNewUser } = require('./helpers');
    await loginNewUser(page, request);
    await page.goto('/checkin');
    const cam = page.getByLabel('Ta foto med kameran');
    await expect(cam).toHaveAttribute('capture', 'environment');
    await expect(cam).toHaveAttribute('accept', 'image/*');
  });
});

const PAGES = ['/', '/search?q=got', '/search?tab=reviews&q=lounge', '/airport/GOT', '/u/oliver', '/u/oliver?tab=badges',
  '/u/oliver/map', '/u/oliver/map/SE', '/explore', '/country/SE', '/top/food', '/top/lounges', '/lounge/1', '/leaderboard',
  '/login', '/register'];

const isFontCsp = (p) => /fonts\.googleapis\.com/.test(p.text);

test.describe('konsolfel', () => {
  test('inga konsolfel på någon sida', async ({ page }) => {
    const problems = collectProblems(page);
    for (const p of PAGES) {
      await page.goto(p);
      await page.waitForLoadState('networkidle');
    }
    expect(problems).toEqual([]);
  });

  test('inga konsolfel på sidor (utan typsnittsfilter)', async ({ page }) => {
    const problems = collectProblems(page);
    for (const p of PAGES) {
      await page.goto(p);
      await page.waitForLoadState('networkidle');
    }
    expect(problems.filter((p) => !isFontCsp(p))).toEqual([]);
  });

  test('inga konsolfel vid inloggat flöde och check-in-sida', async ({ page, request }) => {
    const { loginNewUser } = require('./helpers');
    await loginNewUser(page, request);
    const problems = collectProblems(page);
    for (const p of ['/', '/checkin', '/checkin?iata=GOT', '/airport/GOT']) {
      await page.goto(p);
      await page.waitForLoadState('networkidle');
    }
    expect(problems.filter((p) => !isFontCsp(p))).toEqual([]);
  });

  test('designens typsnitt laddas (Atkinson Hyperlegible)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => document.fonts.check('16px "Atkinson Hyperlegible"'))).toBe(true);
  });
});

test.describe('mobil layout', () => {
  test('ingen horisontell sidscroll på 412 px', async ({ page }) => {
    test.skip(test.info().project.name === 'desktop', 'gäller mobil');
    for (const p of PAGES) {
      await page.goto(p);
      await page.waitForLoadState('networkidle');
      const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      expect(sw, `horisontell scroll på ${p}`).toBeLessThanOrEqual(cw);
    }
  });
});
