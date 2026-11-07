// Prestandamätning på Pixel 7 med CPU-throttling 4x och ~4G (9/1,5 Mbps, 60 ms RTT).
// Resultat skrivs till test-results/perf.json och konsolen. Mål enligt API.md: LCP < 2,5 s, initial JS < 200 kB gzip.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { test, expect } = require('@playwright/test');

const RUNS = Number(process.env.PERF_RUNS) || 3;
const OUT = path.resolve(__dirname, '../../test-results/perf.json');
const results = { conditions: { device: 'Pixel 7', cpuThrottle: 4, downMbps: 9, upMbps: 1.5, rttMs: 60, runs: RUNS }, pages: {}, autocomplete: null, js: null };

const PAGES = [
  { path: '/', ready: 'article.checkin' },
  { path: '/search', ready: '.result-row' },
  { path: '/airport/GOT', ready: '.airport-hero__name' },
  { path: '/u/oliver/map', ready: '.map__country' },
];

async function throttle(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 60,
    downloadThroughput: (9 * 1000 * 1000) / 8,
    uploadThroughput: (1.5 * 1000 * 1000) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  return cdp;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

async function measure(browser, devCfg, target) {
  // Nytt kontext per mätning = kall start (ingen HTTP-cache, ingen service worker).
  const context = await browser.newContext({ ...devCfg, serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__perf = { lcp: 0, cls: 0, tbt: 0, longTasks: 0 };
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__perf.lcp = e.renderTime || e.loadTime || e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        window.__perf.longTasks += 1;
        window.__perf.tbt += Math.max(0, e.duration - 50);
      }
    }).observe({ type: 'longtask', buffered: true });
  });
  await throttle(page);
  await page.goto(target.path, { waitUntil: 'commit' });
  await page.locator(target.ready).first().waitFor({ state: 'visible', timeout: 30_000 });
  // "Tid till interaktiv" (proxy): när huvudinnehållet syns och huvudtråden svarar på en uppgift.
  const tti = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const ch = new MessageChannel();
        ch.port1.onmessage = () => resolve(performance.now());
        ch.port2.postMessage(0);
      })
  );
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const res = performance.getEntriesByType('resource');
    const js = res.filter((r) => r.name.endsWith('.js'));
    return {
      ...window.__perf,
      fcp: fcp ? fcp.startTime : null,
      dcl: nav.domContentLoadedEventEnd,
      load: nav.loadEventEnd,
      jsBytes: js.reduce((n, r) => n + (r.transferSize || 0), 0),
      jsFiles: js.map((r) => r.name.split('/').pop()),
      fontBytes: res.filter((r) => r.name.endsWith('.woff2')).reduce((n, r) => n + (r.transferSize || 0), 0),
      fontFiles: res.filter((r) => r.name.endsWith('.woff2')).length,
      totalBytes: res.reduce((n, r) => n + (r.transferSize || 0), 0) + (nav.transferSize || 0),
    };
  });
  await context.close();
  return { ...m, tti };
}

test.describe.configure({ mode: 'serial' });

test.describe('prestanda (Pixel 7, 4x CPU, 4G)', () => {
  test.setTimeout(300_000);

  for (const target of PAGES) {
    test(`LCP och tid till interaktiv: ${target.path}`, async ({ browser }, testInfo) => {
      const runs = [];
      for (let i = 0; i < RUNS; i++) runs.push(await measure(browser, testInfo.project.use, target));
      const r = {
        lcpMs: Math.round(median(runs.map((x) => x.lcp))),
        fcpMs: Math.round(median(runs.map((x) => x.fcp))),
        ttiMs: Math.round(median(runs.map((x) => x.tti))),
        tbtMs: Math.round(median(runs.map((x) => x.tbt))),
        cls: Number(median(runs.map((x) => x.cls)).toFixed(3)),
        jsKbTransfer: Math.round(median(runs.map((x) => x.jsBytes)) / 1024),
        totalKbTransfer: Math.round(median(runs.map((x) => x.totalBytes)) / 1024),
        jsFiles: runs[0].jsFiles,
        fontKbTransfer: Math.round(median(runs.map((x) => x.fontBytes)) / 1024),
        fontFiles: runs[0].fontFiles,
        rawLcp: runs.map((x) => Math.round(x.lcp)),
      };
      results.pages[target.path] = r;
      console.log(`[perf] ${target.path}: LCP ${r.lcpMs} ms, FCP ${r.fcpMs} ms, TTI ${r.ttiMs} ms, TBT ${r.tbtMs} ms, CLS ${r.cls}, JS ${r.jsKbTransfer} kB, typsnitt ${r.fontFiles} filer/${r.fontKbTransfer} kB`);
      expect.soft(r.lcpMs, `LCP för ${target.path}`).toBeLessThan(2500);
      expect.soft(r.cls, `CLS för ${target.path}`).toBeLessThan(0.1);
    });
  }

  test('autocomplete: tid från sista tangent till förslag', async ({ browser }, testInfo) => {
    const context = await browser.newContext({ ...testInfo.project.use, serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.goto('/register');
    await page.waitForLoadState('networkidle');
    await throttle(page);
    const input = page.getByRole('combobox', { name: 'Hemmaflygplats (valfritt)' });
    const times = [];
    for (const q of ['got', 'stockholm', 'heathrow', 'sweden', 'goteborg', 'lond']) {
      await input.fill('');
      await page.waitForTimeout(400);
      const t0 = Date.now();
      await input.pressSequentially(q, { delay: 0 });
      await page.getByRole('listbox', { name: 'Förslag på flygplatser' }).getByRole('option').first().waitFor();
      await expect(page.getByRole('option').first()).not.toContainText('Inga');
      times.push(Date.now() - t0);
    }
    await context.close();
    results.autocomplete = { medianMs: median(times), maxMs: Math.max(...times), samplesMs: times, note: 'inkl. 150 ms debounce' };
    console.log(`[perf] autocomplete: median ${median(times)} ms, max ${Math.max(...times)} ms (${times.join(', ')})`);
    expect.soft(median(times)).toBeLessThan(1000);
  });

  test('JS-storlek (byggda filer, gzip)', async ({ request }) => {
    const dist = path.resolve(__dirname, '../../client/dist');
    const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
    const initial = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
    const gz = (f) => zlib.gzipSync(fs.readFileSync(path.join(dist, f))).length;
    const all = fs.readdirSync(path.join(dist, 'assets')).filter((f) => f.endsWith('.js'));
    const initialKb = initial.reduce((n, f) => n + gz(f), 0) / 1024;
    const totalKb = all.reduce((n, f) => n + gz(`assets/${f}`), 0) / 1024;
    const largest = all
      .map((f) => ({ file: f, gzipKb: Number((gz(`assets/${f}`) / 1024).toFixed(1)) }))
      .sort((a, b) => b.gzipKb - a.gzipKb)
      .slice(0, 6);
    // Servern ska komprimera JS.
    const res = await request.get(`/${initial[0]}`, { headers: { 'Accept-Encoding': 'gzip' } });
    results.js = {
      initialFiles: initial,
      initialGzipKb: Number(initialKb.toFixed(1)),
      totalGzipKb: Number(totalKb.toFixed(1)),
      largest,
      servedEncoding: res.headers()['content-encoding'] || null,
    };
    console.log(`[perf] JS: initialt ${initialKb.toFixed(1)} kB gzip (${initial.join(', ')}), totalt ${totalKb.toFixed(1)} kB gzip`);
    expect.soft(initialKb).toBeLessThan(200);
    expect.soft(results.js.servedEncoding).toBe('gzip');
  });

  test.afterAll(() => {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  });
});
