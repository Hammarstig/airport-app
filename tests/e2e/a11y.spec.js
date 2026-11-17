// Tillgänglighet med axe-core (WCAG 2.1 A/AA) i ljust och mörkt tema, utloggad och inloggad.
// Kör i projekten android och desktop. axe injiceras från node_modules (CSP kringgås bara i dessa tester).
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { loginNewUser, apiCheckin } = require('./helpers');

const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const OUT = path.resolve(__dirname, '../../test-results/axe');

const PUBLIC = ['/', '/search', '/explore', '/search?tab=reviews&q=lounge', '/airport/GOT', '/u/oliver', '/u/oliver?tab=badges',
  '/u/oliver?tab=map', '/u/oliver/map', '/u/oliver/map/SE', '/country/SE', '/top/food', '/top/lounges', '/lounge/1',
  '/login', '/register', '/about', '/finns-inte'];
const PRIVATE = ['/checkin', '/settings', '/notifications', '/?tab=friends'];

test.use({ bypassCSP: true });

async function audit(page, url) {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300); // låt animationer och lata delar sätta sig
  await page.addScriptTag({ content: AXE });
  return page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
  });
}

for (const scheme of ['light', 'dark']) {
  test.describe(`axe ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test('publika sidor har inga WCAG-fel', async ({ page }, testInfo) => {
      test.setTimeout(180_000);
      const found = {};
      for (const url of PUBLIC) {
        const v = await audit(page, url);
        if (v.length) found[url] = v;
      }
      fs.mkdirSync(OUT, { recursive: true });
      fs.writeFileSync(path.join(OUT, `${testInfo.project.name}-${scheme}-public.json`), JSON.stringify(found, null, 2));
      expect(found).toEqual({});
    });

    test('topplistan (med pall) har inga WCAG-fel', async ({ page, request }) => {
      test.fixme(true, 'BUG-14: länkarna runt avatarerna i pallen (.podium__avatar) saknar tillgängligt namn (axe link-name)');
      // Se till att veckans topplista har minst tre personer så att pallen visas.
      for (let i = 0; i < 3; i++) {
        const u = await require('./helpers').apiRegister(request);
        await apiCheckin(request, u.token, { iata: 'GOT', visitedOn: require('./helpers').daysAgo(0) });
      }
      expect(await audit(page, '/leaderboard')).toEqual([]);
    });

    test('inloggade sidor har inga WCAG-fel', async ({ page, request }, testInfo) => {
      test.setTimeout(120_000);
      const u = await loginNewUser(page, request);
      await apiCheckin(request, u.token, { iata: 'GOT', comment: 'axe' });
      const found = {};
      for (const url of [...PRIVATE, `/u/${u.username}`]) {
        const v = await audit(page, url);
        if (v.length) found[url] = v;
      }
      fs.mkdirSync(OUT, { recursive: true });
      fs.writeFileSync(path.join(OUT, `${testInfo.project.name}-${scheme}-private.json`), JSON.stringify(found, null, 2));
      expect(found).toEqual({});
    });
  });
}
