// v3: sessioner (refresh, utloggning alla enheter, lösenordsbyte), privat profil och följförfrågan,
// synlighet per check-in, blockera/rapportera, moderatorkö, app-genvägar, kartzoom och betygsfråga.
const jwt = require('jsonwebtoken');
const { test, expect } = require('@playwright/test');
const { apiRegister, apiCheckin, loginNewUser, clickCentered, setStars, openSection } = require('./helpers');

const E2E_SECRET = 'e2e-secret'; // samma som tests/e2e/server.mjs

const authed = (token) => ({ headers: { Authorization: `Bearer ${token}` } });
const rnd = () => Math.random().toString(36).slice(2, 7);

/** Loggar in en webbläsarkontext med användarnamn/lösenord (refresh-cookie + sparad användare). */
async function loginContext(ctx, username, password = 'hemligt123') {
  const res = await ctx.request.post('/api/auth/login', { data: { username, password } });
  expect(res.ok(), await res.text()).toBeTruthy();
  const { user } = await res.json();
  await ctx.addInitScript((u) => {
    try {
      if (!sessionStorage.getItem('e2e.userSet')) {
        localStorage.setItem('gatelog.user', JSON.stringify(u));
        sessionStorage.setItem('e2e.userSet', '1');
      }
    } catch {
      /* ignorera */
    }
  }, user);
}

/** Ny webbläsarkontext (egen "enhet") inloggad som användaren. */
async function device(browser, testInfo, username, password = 'hemligt123') {
  const ctx = await browser.newContext({ ...testInfo.project.use });
  await loginContext(ctx, username, password);
  return { ctx, page: await ctx.newPage() };
}

const MOD = { username: 'e2e_mod', password: 'Moderator-2026!' };
/** Moderatorn (MODERATORS=e2e_mod i testservern). Registreras av den första testen som behöver den. */
async function ensureModerator(request) {
  const reg = await request.post('/api/auth/register', { data: MOD });
  expect([201, 409]).toContain(reg.status());
}

test.describe('sessioner', () => {
  test('utgången access-token förnyas med refresh-cookien och anropet görs om', async ({ page, request }) => {
    const u = await apiRegister(request);
    // Riktig session i webbläsaren (refresh-cookie) ...
    const login = await page.context().request.post('/api/auth/login', { data: { username: u.username, password: 'hemligt123' } });
    const { user } = await login.json();
    // ... men access-token i minnet är utgången (giltig signatur, exp i det förflutna).
    const { sub, sid } = jwt.decode(u.token);
    const expired = jwt.sign({ sub, sid, username: u.username, iat: 1000, exp: 2000 }, E2E_SECRET);
    await page.addInitScript(
      ([t, usr]) => {
        if (!sessionStorage.getItem('e2e.exp')) {
          localStorage.setItem('gatelog.token', t);
          localStorage.setItem('gatelog.user', JSON.stringify(usr));
          sessionStorage.setItem('e2e.exp', '1');
        }
      },
      [expired, user]
    );
    const seen = [];
    page.on('response', async (r) => {
      if (!r.url().includes('/api/')) return;
      let code = null;
      if (r.status() === 401) code = (await r.json().catch(() => ({}))).code;
      seen.push({ path: new URL(r.url()).pathname, status: r.status(), code });
    });
    await page.goto('/notifications');
    await expect(page.getByRole('heading', { level: 1, name: 'Notiser' })).toBeVisible();
    await expect(page).toHaveURL(/\/notifications$/);
    await expect.poll(() => seen.some((s) => s.code === 'token_expired')).toBe(true);
    await expect.poll(() => seen.some((s) => s.path === '/api/auth/refresh' && s.status === 200)).toBe(true);
    // Anropet som fick token_expired lyckades efter förnyelsen.
    const failed = seen.find((s) => s.code === 'token_expired').path;
    await expect.poll(() => seen.some((s) => s.path === failed && s.status === 200)).toBe(true);
    // Sessionen överlever omladdning (ny token via cookien).
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Notiser' })).toBeVisible();
  });

  test('återkallad session vid refresh loggar ut', async ({ page, request }) => {
    const u = await loginNewUser(page, request);
    await page.goto('/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Inställningar' })).toBeVisible();
    // Allt återkallas från en annan "enhet".
    await request.post('/api/auth/logout-all', authed(u.token));
    await page.reload();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('avsluta alla inloggningar loggar ut alla enheter; enskild enhet kan avslutas', async ({ browser, request }, testInfo) => {
    const u = await apiRegister(request);
    const a = await device(browser, testInfo, u.username);
    const b = await device(browser, testInfo, u.username);
    const c = await device(browser, testInfo, u.username);
    await b.page.goto('/settings/sakerhet');
    await c.page.goto('/settings/sakerhet');
    await a.page.goto('/settings/sakerhet');
    const list = a.page.getByRole('list', { name: 'Inloggade enheter' });
    // API-registreringen + tre enheter.
    await expect(list.locator('li')).toHaveCount(4);
    await expect(list.locator('li').filter({ hasText: '(den här)' })).toHaveCount(1);
    await list.locator('li').filter({ hasNotText: '(den här)' }).first().getByRole('button').click();
    await expect(list.locator('li')).toHaveCount(3);

    a.page.once('dialog', (d) => d.accept());
    await a.page.getByRole('button', { name: 'Avsluta alla inloggningar' }).click();
    await expect(a.page.getByText('Du är utloggad på alla enheter.')).toBeVisible();
    await expect(a.page).toHaveURL(/\/$/);
    for (const dev of [b, c]) {
      await dev.page.reload();
      await expect(dev.page).toHaveURL(/\/login$/);
    }
    expect((await request.get('/api/me', authed(u.token))).status()).toBe(401);
    for (const d of [a, b, c]) await d.ctx.close();
  });

  test('lösenordsbyte: fel nuvarande lösenord, byte loggar ut andra enheter, nytt lösenord fungerar', async ({ browser, request }, testInfo) => {
    const u = await apiRegister(request);
    const a = await device(browser, testInfo, u.username);
    const b = await device(browser, testInfo, u.username);
    await b.page.goto('/settings/sakerhet');
    await a.page.goto('/settings/sakerhet');
    const form = a.page.getByRole('form', { name: 'Byt lösenord' });
    await form.getByLabel('Nuvarande lösenord').fill('fel-losenord');
    await form.getByLabel('Nytt lösenord').fill('Nytt-Losen-2026');
    await form.getByRole('button', { name: 'Byt lösenord' }).click();
    await expect(form.getByRole('alert')).toHaveText('Fel nuvarande lösenord.');
    await expect(a.page).toHaveURL(/\/settings\/sakerhet$/);

    await form.getByLabel('Nuvarande lösenord').fill('hemligt123');
    await form.getByRole('button', { name: 'Byt lösenord' }).click();
    await expect(a.page.getByText('Lösenordet är bytt. Andra enheter har loggats ut.')).toBeVisible();
    // Denna enhet är kvar inloggad, även efter omladdning.
    await a.page.reload();
    await expect(a.page.getByRole('heading', { level: 1, name: 'Säkerhet' })).toBeVisible();
    await b.page.reload();
    await expect(b.page).toHaveURL(/\/login$/);
    expect((await request.post('/api/auth/login', { data: { username: u.username, password: 'hemligt123' } })).status()).toBe(401);
    expect((await request.post('/api/auth/login', { data: { username: u.username, password: 'Nytt-Losen-2026' } })).status()).toBe(200);
    await a.ctx.close();
    await b.ctx.close();
  });
});

test.describe('integritet', () => {
  test('privat profil: följförfrågan, godkännande i notiser, därefter synlig', async ({ browser, request }, testInfo) => {
    const p = await apiRegister(request);
    const note = `Privat resa ${rnd()}`;
    await apiCheckin(request, p.token, { iata: 'GOT', comment: note });
    const owner = await device(browser, testInfo, p.username);
    await owner.page.goto('/settings/integritet');
    const sw = owner.page.getByRole('switch', { name: /Privat profil/ });
    await expect(sw).not.toBeChecked();
    const saved = owner.page.waitForResponse((r) => r.url().endsWith('/api/me/settings') && r.request().method() === 'PATCH');
    await sw.click();
    expect((await saved).status()).toBe(200);
    await expect(sw).toBeChecked();

    const s = await apiRegister(request);
    const fan = await device(browser, testInfo, s.username);
    await fan.page.goto(`/u/${p.username}`);
    await expect(fan.page.getByRole('heading', { name: 'Privat profil' })).toBeVisible();
    await expect(fan.page.getByText(`Följ @${p.username} för att se`)).toBeVisible();
    await expect(fan.page.getByRole('tab', { name: 'Check-ins' })).toHaveCount(0);
    await fan.page.getByRole('button', { name: 'Följ', exact: true }).click();
    await expect(fan.page.getByRole('button', { name: 'Förfrågan skickad' })).toBeVisible();
    await expect(fan.page.getByText(`Förfrågan skickad till @${p.username}.`)).toBeVisible();

    await owner.page.goto('/notifications');
    const reqs = owner.page.getByRole('list', { name: 'Följförfrågningar' });
    await expect(reqs).toContainText(s.username);
    await reqs.getByRole('button', { name: 'Godkänn' }).click();
    await expect(owner.page.getByText(`@${s.username} följer dig nu.`)).toBeVisible();

    await fan.page.reload();
    await expect(fan.page.getByRole('button', { name: 'Följer' })).toBeVisible();
    await fan.page.getByRole('tab', { name: 'Check-ins' }).click();
    await expect(fan.page.locator('article.checkin').filter({ hasText: note })).toBeVisible();
    await owner.ctx.close();
    await fan.ctx.close();
  });

  test('synlighet per check-in: "Bara jag" syns för ägaren men inte för andra', async ({ page, request, browser }, testInfo) => {
    const u = await loginNewUser(page, request);
    const word = `hemlig${rnd()}`;
    const note = `Resa ${word}`;
    await page.goto('/checkin?iata=GOT');
    await expect(page.locator('.selected-airport .iata-tag')).toHaveText('GOT');
    await page.getByLabel('Kommentar').fill(note);
    await openSection(page, 'Vem ser den');
    await page.getByRole('radiogroup', { name: 'Vem ser check-in:en' }).getByText('Bara jag', { exact: true }).click();
    const resP = page.waitForResponse((r) => r.url().endsWith('/api/checkins') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Checka in på GOT' }).click();
    const c = await (await resP).json();
    expect(c.visibility).toBe('private');

    await page.goto(`/u/${u.username}?tab=checkins`);
    const card = page.locator('article.checkin').filter({ hasText: note });
    await expect(card.locator('.visibility-chip')).toHaveText(/Privat/);

    const other = await apiRegister(request);
    const o = await device(browser, testInfo, other.username);
    await o.page.goto(`/c/${c.id}`);
    await expect(o.page.getByText('Fel gate')).toBeVisible();
    await o.page.goto('/airport/GOT');
    await expect(o.page.locator('article.checkin').first()).toBeVisible();
    await expect(o.page.locator('article.checkin').filter({ hasText: note })).toHaveCount(0);
    await o.page.goto(`/search?tab=reviews&q=${word}`);
    await expect(o.page.getByText('Inga recensioner matchar')).toBeVisible();
    await o.ctx.close();
  });

  test('standardsynlighet och fördröjning ställs in under Integritet', async ({ page, request }) => {
    const u = await loginNewUser(page, request);
    await page.goto('/settings/integritet');
    const vis = page.getByRole('radiogroup', { name: 'Vem ser nya check-ins' });
    let saved = page.waitForResponse((r) => r.url().endsWith('/api/me/settings') && r.request().method() === 'PATCH');
    await vis.getByText('Följare', { exact: true }).click();
    await saved;
    saved = page.waitForResponse((r) => r.url().endsWith('/api/me/settings') && r.request().method() === 'PATCH');
    await page.getByRole('radiogroup', { name: 'Visa check-ins för andra efter' }).getByText('24 h', { exact: true }).click();
    await saved;
    const s = await (await request.get('/api/me/settings', authed(u.token))).json();
    expect(s).toMatchObject({ defaultVisibility: 'friends', publishDelayHours: 24 });
    // Formuläret förväljer standardsynligheten.
    await page.goto('/checkin?iata=ARN');
    await expect(page.locator('summary', { hasText: 'Vem ser den' })).toContainText('Följare');
  });
});

test.describe('blockera och rapportera', () => {
  test('rapportera och blockera via profilmenyn, häv i inställningar', async ({ page, request }) => {
    const target = await apiRegister(request);
    // Unik text per test: android och desktop körs parallellt mot samma server.
    const marker = `Blockeras ${test.info().project.name} ${rnd()}`;
    await apiCheckin(request, target.token, { iata: 'CPH', comment: marker });
    const me = await loginNewUser(page, request);
    await page.goto('/?tab=global');
    await expect(page.locator('article.checkin').filter({ hasText: marker })).toBeVisible();
    await page.goto(`/u/${target.username}`);
    await page.getByRole('button', { name: 'Fler val' }).click();
    const menu = page.getByRole('menu', { name: `Val för @${target.username}` });
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    await menu.getByRole('menuitem', { name: 'Rapportera' }).click();
    const dialog = page.getByRole('dialog', { name: 'Rapportera användare' });
    await expect(dialog.getByRole('button', { name: 'Skicka rapport' })).toBeDisabled();
    await dialog.getByText('Spam eller reklam').click();
    await dialog.getByLabel('Kommentar (valfritt)').fill('Säljer klockor i kommentarer');
    await dialog.getByRole('button', { name: 'Skicka rapport' }).click();
    await expect(page.getByText('Tack. Rapporten är skickad till moderatorerna.')).toBeVisible();
    await expect(dialog).toHaveCount(0);

    await page.getByRole('button', { name: 'Fler val' }).click();
    page.once('dialog', (d) => d.accept());
    await page.getByRole('menuitem', { name: 'Blockera' }).click();
    await expect(page.getByText(`@${target.username} är blockerad.`)).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    const blocked = await (await request.get('/api/me/blocks', authed(me.token))).json();
    expect(blocked.map((b) => b.username)).toEqual([target.username]);
    await page.goto('/?tab=global');
    await expect(page.locator('article.checkin').first()).toBeVisible();
    await expect(page.locator('article.checkin').filter({ hasText: marker })).toHaveCount(0);

    await page.goto('/settings/integritet');
    const list = page.getByRole('list', { name: 'Blockerade' });
    await expect(list).toContainText(target.username);
    await list.getByRole('button', { name: 'Häv blockering' }).click();
    await expect(page.getByText(`Blockeringen av @${target.username} är hävd.`)).toBeVisible();
    await expect(page.getByText('Du har inte blockerat någon.')).toBeVisible();
  });

  test('rapportera check-in via "..."-menyn och kommentar; Escape stänger dialogen', async ({ page, request }) => {
    const owner = await apiRegister(request);
    const c = await apiCheckin(request, owner.token, { iata: 'OSL', comment: 'Rapportera mig' });
    await request.post(`/api/checkins/${c.id}/comments`, { ...authed(owner.token), data: { body: 'Olämplig kommentar' } });
    await loginNewUser(page, request);
    await page.goto(`/c/${c.id}`);
    await clickCentered(page.locator('article.checkin').getByRole('button', { name: 'Fler val' }));
    await page.getByRole('menu', { name: /^Val för check-in av / }).getByRole('menuitem', { name: 'Rapportera' }).click();
    const d1 = page.getByRole('dialog', { name: 'Rapportera check-in' });
    await expect(d1).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(d1).toHaveCount(0);
    await clickCentered(page.locator('.comment').filter({ hasText: 'Olämplig kommentar' }).getByRole('button', { name: 'Rapportera' }));
    const d2 = page.getByRole('dialog', { name: 'Rapportera kommentar' });
    await d2.getByText('Trakasserier').click();
    await d2.getByRole('button', { name: 'Skicka rapport' }).click();
    await expect(page.getByText('Tack. Rapporten är skickad till moderatorerna.')).toBeVisible();
  });
});

test.describe('moderering', () => {
  test('moderatorkön visar rapporter och "Ta bort" raderar innehållet', async ({ page, request }) => {
    await ensureModerator(request);
    const bad = await apiRegister(request);
    const tag = rnd();
    const c = await apiCheckin(request, bad.token, { iata: 'GOT', comment: `Moderera ${tag}` });
    const reporter = await apiRegister(request);
    const rep = await request.post('/api/reports', {
      ...authed(reporter.token),
      data: { type: 'checkin', target: c.id, reason: 'spam', note: `notering ${tag}` }
    });
    expect(rep.status()).toBe(201);

    await loginContext(page.context(), MOD.username, MOD.password);
    await page.goto('/settings');
    await page.getByRole('link', { name: 'Modereringskö' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Moderering' })).toBeVisible();
    const row = page.locator('.list__item').filter({ hasText: `notering ${tag}` });
    await expect(row).toBeVisible();
    await expect(row).toContainText(`Moderera ${tag}`);
    await expect(row).toContainText(`@${reporter.username}`);
    await row.getByRole('button', { name: 'Ta bort' }).click();
    await expect(row).toHaveCount(0);
    expect((await request.get(`/api/checkins/${c.id}`)).status()).toBe(404);
    await page.getByRole('radiogroup', { name: 'Status' }).getByText('Åtgärdade', { exact: true }).click();
    await expect(page.locator('.list__item').filter({ hasText: `notering ${tag}` })).toBeVisible();
  });

  test('moderatorkön visar vad som rapporterats och av vem (BUG-13)', async ({ page, request }) => {
    await ensureModerator(request);
    const bad = await apiRegister(request);
    const reporter = await apiRegister(request);
    const text = `Rapporterad kommentarstext ${rnd()}`;
    const c = await apiCheckin(request, bad.token, { iata: 'ARN', comment: 'Visa mig' });
    const com = await (await request.post(`/api/checkins/${c.id}/comments`, { ...authed(bad.token), data: { body: text } })).json();
    await request.post('/api/reports', { ...authed(reporter.token), data: { type: 'comment', target: com.id, reason: 'harassment' } });
    await request.post('/api/reports', { ...authed(reporter.token), data: { type: 'user', target: bad.username, reason: 'spam' } });
    await loginContext(page.context(), MOD.username, MOD.password);
    await page.goto('/moderation');
    await expect(page.locator('main')).toContainText(text);
    await expect(page.locator('main')).not.toContainText('[object Object]');
    await expect(page.locator('main')).not.toContainText('@undefined');
    await expect(page.locator(`main a[href="/u/${bad.username}"]`).first()).toBeVisible();
    await expect(page.locator('main')).toContainText(`@${reporter.username}`);
  });

  test('vanlig användare får inte se moderatorkön', async ({ page, request }) => {
    await loginNewUser(page, request);
    await page.goto('/settings');
    await expect(page.getByRole('link', { name: 'Modereringskö' })).toHaveCount(0);
    await page.goto('/moderation');
    await expect(page.getByText('Fel gate')).toBeVisible();
  });
});

test.describe('övrigt v3', () => {
  test('manifestet har app-genvägar till riktiga sidor med ikoner', async ({ page, request }) => {
    const m = await (await request.get('/manifest.webmanifest')).json();
    expect(Array.isArray(m.shortcuts)).toBe(true);
    expect(m.shortcuts.length).toBeGreaterThanOrEqual(2);
    expect(m.shortcuts.map((s) => s.url)).toContain('/checkin');
    for (const s of m.shortcuts) {
      expect(s.name).toBeTruthy();
      expect(s.url).toMatch(/^\/[^/]?/);
      for (const icon of s.icons || []) {
        const r = await request.get(icon.src);
        expect(r.status(), icon.src).toBe(200);
      }
      await page.goto(s.url);
      await expect(page.getByText('Fel gate')).toHaveCount(0);
    }
  });

  test('världskartan zoomar in på besökta länder och kan växla till hela världen', async ({ page }) => {
    await page.goto('/u/oliver/map');
    const g = page.locator('.map__svg > g').first();
    await expect(page.locator('.map__country').first()).toBeVisible();
    const scale = async () => {
      const t = (await g.getAttribute('transform')) || '';
      const m = /scale\(([\d.]+)\)/.exec(t);
      return m ? Number(m[1]) : 1;
    };
    await expect.poll(scale).toBeGreaterThan(1.2);
    await page.getByRole('button', { name: 'Hela världen' }).click();
    await expect.poll(scale).toBeLessThan(1.01);
    await page.getByRole('button', { name: 'Mina länder' }).click();
    await expect.poll(scale).toBeGreaterThan(1.2);
    // Ett besökt land ligger i bild efter zoomen.
    const box = await page.locator('.map__svg').boundingBox();
    const visited = await page.locator('.map__country:not([data-step="0"])').first().boundingBox();
    const cx = visited.x + visited.width / 2;
    expect(cx).toBeGreaterThan(box.x);
    expect(cx).toBeLessThan(box.x + box.width);
  });

  test('betygsfråga på sammanfattningen när betyg saknas', async ({ page, request }) => {
    const u = await loginNewUser(page, request);
    await page.goto('/checkin?iata=GOT');
    const resP = page.waitForResponse((r) => r.url().endsWith('/api/checkins') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Checka in på GOT' }).click();
    const c = await (await resP).json();
    expect(c.rating).toBeNull();
    const prompt = page.getByRole('region', { name: 'Hur var GOT?' });
    await expect(prompt).toBeVisible();
    const patch = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().endsWith(`/api/checkins/${c.id}`));
    await setStars(page, 'Betyg för GOT', 4);
    expect((await patch).status()).toBe(200);
    await expect(prompt.getByRole('status')).toHaveText('Tack! Betyget är sparat.');
    expect((await (await request.get(`/api/checkins/${c.id}`, authed(u.token))).json()).rating).toBe(4);
  });

  test('ingen betygsfråga när betyg redan är satt', async ({ page, request }) => {
    await loginNewUser(page, request);
    await page.goto('/checkin?iata=ARN');
    await setStars(page, 'Totalbetyg', 3.5);
    await page.getByRole('button', { name: 'Checka in på ARN' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Incheckad på ARN' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Hur var ARN?' })).toHaveCount(0);
  });
});
