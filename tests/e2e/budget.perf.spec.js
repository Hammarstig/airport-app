// Prestandabudget som fäller CI (projektet "perf"): Pixel 7, 4x CPU, Slow 4G (150 ms RTT, 1,6 Mbit/s),
// kall start utan service worker. Gränser enligt granskningen: LCP < 2,0 s, CLS < 0,05 och
// tid från tryck till synlig ändring för gilla < 200 ms och sidbyte (förhämtat steg) < 300 ms.
const { test, expect } = require('@playwright/test');
const { apiRegister, apiCheckin } = require('./helpers');

const LCP_MS = 2000;
const CLS = 0.05;
const LIKE_MS = 200;
const NAV_MS = 300;

async function slow(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1000 * 1000) / 8,
    uploadThroughput: (0.75 * 1000 * 1000) / 8
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}

const observe = () => {
  window.__perf = { lcp: 0, cls: 0, el: '' };
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      window.__perf.lcp = e.renderTime || e.loadTime || e.startTime;
      window.__perf.el = `${e.element ? e.element.className || e.element.nodeName : e.url} ${e.size}px²`;
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value;
  }).observe({ type: 'layout-shift', buffered: true });
};

async function login(context, request) {
  const u = await apiRegister(request, { homeIata: 'GOT' });
  await apiCheckin(request, u.token, { iata: 'CPH' });
  await apiCheckin(request, u.token, { iata: 'ARN' });
  const res = await context.request.post('/api/auth/login', { data: { username: u.username, password: 'hemligt123' } });
  expect(res.ok()).toBeTruthy();
  const { user } = await res.json();
  await context.addInitScript((usr) => localStorage.setItem('gatelog.user', JSON.stringify(usr)), user);
  return u;
}

// Klick i sidan och tid tills villkoret är sant (rAF), utan Playwrights rundresor i mätningen.
const timeInPage = (page, selector, until) =>
  page.evaluate(
    ([sel, cond]) =>
      new Promise((resolve) => {
        const el = document.querySelector(sel);
        const check = new Function('el', 'before', `return (${cond})(el, before)`);
        const before = el.getAttribute('aria-pressed');
        const t0 = performance.now();
        const tick = () => (check(el, before) ? resolve(performance.now() - t0) : requestAnimationFrame(tick));
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        el.click();
        requestAnimationFrame(tick);
      }),
    [selector, until.toString()]
  );

test.describe('prestandabudget', () => {
  test.setTimeout(120_000);

  for (const target of [
    { path: '/', ready: 'article.checkin' },
    { path: '/airport/GOT', ready: '.airport-hero__name' },
    { path: '/checkin', ready: '.quick-pick', auth: true }
  ]) {
    test(`LCP och CLS: ${target.path}`, async ({ browser, request }) => {
      const context = await browser.newContext({
        ...test.info().project.use,
        serviceWorkers: 'block',
        bypassCSP: true
      });
      if (target.auth) await login(context, request);
      // Uppvärmning utan strypning (servern ska inte vara kall); egen sida, så webbläsarens cache
      // för mätningen är fortfarande tom (cachen är dessutom avstängd i slow()).
      const warm = await context.newPage();
      await warm.goto(target.path, { waitUntil: 'load' });
      await warm.locator(target.ready).first().waitFor({ timeout: 30_000 });
      await warm.close();
      await context.addInitScript(observe);
      // Median av tre mätningar: en enstaka mätning på delad CI-maskin (2 kärnor, andra jobb) gav
      // sporadiska överskridanden med några tiotal ms.
      const samples = [];
      for (let i = 0; i < 3; i++) {
        const page = await context.newPage();
        await slow(page);
        await page.goto(target.path, { waitUntil: 'load' });
        await page.locator(target.ready).first().waitFor({ timeout: 30_000 });
        await page.waitForTimeout(3000);
        samples.push(await page.evaluate(() => window.__perf));
        await page.close();
      }
      samples.sort((a, b) => a.lcp - b.lcp);
      const { lcp, el } = samples[1];
      const cls = Math.max(...samples.map((x) => x.cls));
      console.log(`[budget] ${target.path}: LCP ${Math.round(lcp)} ms (median av ${samples.map((x) => Math.round(x.lcp)).join('/')}, ${el}), CLS ${cls.toFixed(3)}`);
      expect(lcp, `LCP ${target.path}`).toBeLessThan(LCP_MS);
      expect(cls, `CLS ${target.path}`).toBeLessThan(CLS);
      await context.close();
    });
  }

  test('gilla och sidbyte under 4x CPU', async ({ browser, request }) => {
    const context = await browser.newContext({ ...test.info().project.use, serviceWorkers: 'block', bypassCSP: true });
    await login(context, request);
    const page = await context.newPage();
    await slow(page);
    await page.goto('/?tab=global', { waitUntil: 'load' });
    await page.locator('.checkin .like-btn').first().waitFor();
    // Användaren läser flödet en stund; förhämtningen av nästa steg hinner ske efter load.
    await page.waitForTimeout(6000);
    const like = await timeInPage(page, '.like-btn', (el, before) => el.getAttribute('aria-pressed') !== before);
    const nav = await timeInPage(page, '.checkin__airport', () => !!document.querySelector('.airport-hero__name'));
    console.log(`[budget] gilla ${Math.round(like)} ms, sidbyte flöde -> flygplats ${Math.round(nav)} ms`);
    expect(like).toBeLessThan(LIKE_MS);
    expect(nav).toBeLessThan(NAV_MS);
    await context.close();
  });
});
