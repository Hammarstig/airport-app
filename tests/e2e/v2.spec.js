// v2: snabb check-in, sammanfattning, följa/vänflöde, kommentarer, notiser, topplistor,
// redigera check-in, offlinekö, radera konto och dataexport.
const fs = require('node:fs');
const { test, expect } = require('@playwright/test');
const {
  apiRegister,
  apiCheckin,
  useToken,
  loginNewUser,
  clickCentered,
  daysAgo,
  isMobile,
  setStars,
} = require('./helpers');

const LANDVETTER = { latitude: 57.6628, longitude: 12.2798 };

async function apiAs(request, token, method, path, data) {
  const res = await request.fetch(path, { method, headers: { Authorization: `Bearer ${token}` }, data });
  expect(res.status(), `${method} ${path}: ${await res.text()}`).toBeLessThan(300);
  return res.status() === 204 ? null : res.json();
}

/** Väntar tills service workern styr sidan (installerad PWA: app-skal och route-chunkar i cache). */
async function waitForServiceWorker(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

/** Klickar på "Checka in" i menyn (bottom-nav på mobil, toppmenyn på desktop). */
async function openCheckinFromNav(page) {
  const nav = page.getByRole('navigation', { name: isMobile(test.info()) ? 'Huvudmeny mobil' : 'Huvudmeny', exact: true });
  await nav.getByRole('link', { name: 'Checka in' }).click();
  await expect(page).toHaveURL(/\/checkin$/);
}

test.describe('snabb check-in', () => {
  test.use({ geolocation: LANDVETTER, permissions: ['geolocation'] });

  test('3 tryck: meny -> "Nära dig" -> checka in', async ({ page, request }) => {
    await loginNewUser(page, request);
    await page.goto('/');
    await openCheckinFromNav(page); // tryck 1
    const near = page.getByRole('region', { name: 'Nära dig' });
    const first = near.locator('.quick-pick__item').first();
    await expect(first).toContainText('GOT');
    await expect(first).toContainText(/\d+(,\d)? km/);
    await first.click(); // tryck 2
    await page.getByRole('button', { name: 'Checka in på GOT' }).click(); // tryck 3
    await expect(page).toHaveURL(/\/checkin\/done$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Incheckad på GOT' })).toBeVisible();
  });

  test('"Senaste" visar hemmaflygplats först och senaste besök', async ({ page, request }) => {
    const u = await apiRegister(request, { homeIata: 'GOT' });
    await apiCheckin(request, u.token, { iata: 'CPH', visitedOn: daysAgo(3) });
    await apiCheckin(request, u.token, { iata: 'OSL', visitedOn: daysAgo(1) });
    await useToken(page, u.token);
    await page.goto('/checkin');
    const recent = page.getByRole('region', { name: 'Senaste' }).locator('.quick-pick__item');
    await expect(recent).toHaveCount(3);
    await expect(recent.nth(0)).toContainText('GOT');
    await expect(recent.nth(0)).toContainText('Hemmaflygplats');
    await expect(recent.nth(1)).toContainText('OSL');
    await recent.nth(2).click();
    await expect(page.locator('.selected-airport .iata-tag')).toHaveText('CPH');
  });

  test('nearby-API sorterar på avstånd', async ({ request }) => {
    const rows = await (await request.get(`/api/airports/nearby?lat=${LANDVETTER.latitude}&lon=${LANDVETTER.longitude}&limit=5`)).json();
    expect(rows[0].iata).toBe('GOT');
    for (let i = 1; i < rows.length; i++) expect(rows[i].distanceKm).toBeGreaterThanOrEqual(rows[i - 1].distanceKm);
  });
});

test.describe('snabb check-in utan platsbehörighet', () => {
  test.use({ permissions: [] });

  test('nekad plats visar förklaring och sök fungerar', async ({ page, request, context }) => {
    await context.clearPermissions();
    await loginNewUser(page, request);
    await page.goto('/checkin');
    await page.getByRole('button', { name: 'Visa flygplatser nära mig' }).click();
    await expect(page.getByText(/nekat platsåtkomst|Kunde inte hitta din position/)).toBeVisible();
    await expect(page.locator('main').getByRole('combobox', { name: 'Sök flygplats', exact: true })).toBeVisible();
  });
});

test.describe('sammanfattningsskärm', () => {
  test('visar XP, nivåhöjning, streak och milstolpar för ny kontinent', async ({ page, request }) => {
    const u = await apiRegister(request);
    await apiCheckin(request, u.token, { iata: 'ARN', visitedOn: daysAgo(1) });
    await useToken(page, u.token);
    await page.goto('/checkin?iata=SIN');
    await setStars(page, 'Totalbetyg', 5);
    await page.getByLabel('Kommentar').fill('Changi är bäst');
    const resP = page.waitForResponse((r) => r.url().endsWith('/api/checkins') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Checka in på SIN' }).click();
    const res = await (await resP).json();
    // 10 check-in + 25 ny flygplats + 50 nytt land + 100 ny kontinent + 5 kommentar + 5 betyg
    expect(res.xpGained).toBe(195);
    expect(res.milestones).toMatchObject({ isNewAirport: true, isNewCountry: true, isNewContinent: true, uniqueAirports: 2, countries: 2, continents: 2 });
    const xp = page.locator('.checkin-done__xp');
    await expect(xp).toContainText('+195 XP');
    if (res.levelUp) await expect(xp).toContainText(`du nådde nivå ${res.levelInfo.level}!`);
    await expect(page.getByText('Ny flygplats - din 2:a')).toBeVisible();
    await expect(page.getByText('Nytt land - ditt 2:a')).toBeVisible();
    await expect(page.getByText('Ny kontinent - din 2:a')).toBeVisible();
    await expect(page.getByRole('progressbar', { name: `Framsteg mot nivå ${res.levelInfo.level + 1}` })).toBeVisible();
    await expect(page.locator('.checkin-done__panel')).toContainText(`${String(res.milestones.worldPct).replace('.', ',')} %`);
  });

  test('direkt till /checkin/done utan state skickar till flödet', async ({ page, request }) => {
    await loginNewUser(page, request);
    await page.goto('/checkin/done');
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('följa och vänflöde', () => {
  test('följ från profil, vänflödet visar bara vänner, avfölj', async ({ page, request }) => {
    const me = await loginNewUser(page, request);
    await page.goto('/u/anna');
    const before = Number(await page.getByRole('link', { name: /följare/ }).locator('strong').innerText());
    const btn = page.getByRole('button', { name: 'Följ', exact: true });
    await btn.click();
    await expect(page.getByRole('button', { name: 'Följer' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('link', { name: /följare/ }).locator('strong')).toHaveText(String(before + 1));

    await page.goto(`/u/anna/followers`);
    await expect(page.getByRole('heading', { level: 1, name: 'Följare' })).toBeVisible();
    await expect(page.locator('main').getByText(`@${me.username}`)).toBeVisible();

    // Flödet öppnar fliken Vänner när man följer någon.
    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'Vänner' })).toHaveAttribute('aria-selected', 'true');
    const cards = page.locator('article.checkin');
    await expect(cards.first()).toBeVisible();
    const authors = await cards.locator('.checkin__user').allInnerTexts();
    expect(authors.length).toBeGreaterThan(0);
    for (const a of authors) expect(['Anna Lind', `Testare ${me.username}`]).toContain(a);

    await page.goto('/u/anna');
    await page.getByRole('button', { name: 'Följer' }).click();
    await expect(page.getByRole('button', { name: 'Följ', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await page.goto('/?tab=friends');
    await expect(page.getByText('Inga check-ins från vänner ännu')).toBeVisible();
  });

  test('"Följer dig" visas när någon följer mig', async ({ page, request }) => {
    const a = await apiRegister(request);
    const b = await apiRegister(request);
    await apiAs(request, b.token, 'POST', `/api/users/${a.username}/follow`);
    await useToken(page, a.token);
    await page.goto(`/u/${b.username}`);
    await expect(page.locator('.page__subtitle .badge', { hasText: 'Följer dig' })).toBeVisible();
  });
});

test.describe('kommentarer och notiser', () => {
  test('kommentera, redigera och ta bort; ägaren får notiser med oläst-räknare', async ({ page, request, browser }, testInfo) => {
    const owner = await apiRegister(request);
    const c = await apiCheckin(request, owner.token, { iata: 'GOT', comment: 'Kommentera gärna' });
    const commenter = await loginNewUser(page, request);
    const text = `Bra tips ${Math.random().toString(36).slice(2, 7)}`;

    await page.goto(`/c/${c.id}`);
    await expect(page.getByText('Inga kommentarer ännu.')).toBeVisible();
    await page.getByLabel('Skriv en kommentar').fill(text);
    await page.getByRole('button', { name: 'Skicka kommentar' }).click();
    const item = page.locator('.comment').filter({ hasText: text });
    await expect(item).toBeVisible();
    await expect(page.getByLabel('Skriv en kommentar')).toHaveValue('');

    await item.getByRole('button', { name: 'Redigera' }).click();
    await page.getByLabel('Redigera kommentar').fill(`${text} (ändrad)`);
    await page.getByRole('button', { name: 'Spara' }).click();
    await expect(item).toContainText('(ändrad)');
    await expect(item).toContainText('redigerad');

    // Gilla också, så att ägaren får två notiser plus en följning.
    await clickCentered(page.locator('article.checkin .like-btn'));
    await expect(page.locator('article.checkin .like-btn')).toHaveAttribute('aria-pressed', 'true');
    await apiAs(request, commenter.token, 'POST', `/api/users/${owner.username}/follow`);

    // Kommentarsräknaren i flödet.
    await page.goto(`/u/${owner.username}?tab=checkins`);
    await expect(page.locator('article.checkin').first().getByRole('link', { name: 'Kommentarer, 1' })).toBeVisible();

    // Ägaren: klocka med olästa (följning, kommentar, gilla + märkesnotis för första check-in).
    const auth = { headers: { Authorization: `Bearer ${owner.token}` } };
    const { unread } = await (await request.get('/api/notifications/unread-count', auth)).json();
    expect(unread).toBeGreaterThanOrEqual(3);
    const ctx = await browser.newContext({ ...testInfo.project.use });
    const op = await ctx.newPage();
    await useToken(op, owner.token);
    await op.goto('/');
    const bell = op.getByRole('link', { name: `Notiser, ${unread} olästa` });
    await expect(bell).toBeVisible();
    await expect(op.locator('.notif-dot')).toHaveText(String(unread));
    await bell.click();
    await expect(op).toHaveURL(/\/notifications$/);
    const items = op.locator('.notif-item');
    await expect(items).toHaveCount(unread);
    await expect(op.locator('.notif-item--unread')).toHaveCount(unread);
    await expect(items.filter({ hasText: 'började följa dig' })).toHaveCount(1);
    await expect(items.filter({ hasText: /kommenterade/ })).toHaveCount(1);
    await expect(items.filter({ hasText: /gillade/ })).toHaveCount(1);
    // Listan markeras som läst: klockan nollställs.
    await expect(op.getByRole('link', { name: 'Notiser', exact: true })).toBeVisible();
    expect((await (await op.request.get('/api/notifications/unread-count', auth)).json()).unread).toBe(0);

    // Ägaren kan ta bort kommentaren på sin check-in.
    await items.filter({ hasText: /kommenterade/ }).getByRole('link').click();
    await expect(op).toHaveURL(new RegExp(`/c/${c.id}$`));
    op.once('dialog', (d) => d.accept());
    await op.locator('.comment').filter({ hasText: text }).getByRole('button', { name: 'Ta bort' }).click();
    await expect(op.locator('.comment')).toHaveCount(0);
    await ctx.close();
  });

  test('utloggad ser kommentarer men uppmanas logga in', async ({ page, request }) => {
    const owner = await apiRegister(request);
    const c = await apiCheckin(request, owner.token, { iata: 'ARN' });
    await apiAs(request, owner.token, 'POST', `/api/checkins/${c.id}/comments`, { body: 'Egen kommentar' });
    await page.goto(`/c/${c.id}`);
    await expect(page.locator('.comment')).toContainText('Egen kommentar');
    await expect(page.getByText('för att kommentera.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ta bort' })).toHaveCount(0);
  });
});

test.describe('topplistor', () => {
  test('period, scope, mått och egen placering', async ({ page, request }) => {
    const me = await apiRegister(request);
    await apiCheckin(request, me.token, { iata: 'GOT', visitedOn: daysAgo(0) });
    await apiAs(request, me.token, 'POST', '/api/users/anna/follow');
    await useToken(page, me.token);

    await page.goto('/leaderboard');
    await expect(page.getByRole('group', { name: 'Mått' }).getByRole('button', { name: 'Flygplatser' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('radiogroup', { name: 'Period' }).getByRole('radio', { name: 'Vecka' })).toBeChecked();
    await expect(page.locator('main').getByText(/^\d+ \S+ \d{4} - \d+ \S+ \d{4}$/)).toBeVisible();
    // Egen placering: antingen i listan/pallen eller fäst längst ned.
    const meRow = page.locator('[aria-current="true"]');
    await expect(meRow.first()).toBeVisible();
    const api = await (await page.request.get('/api/rankings/users?metric=airports&period=week&scope=global&limit=50', { headers: { Authorization: `Bearer ${me.token}` } })).json();
    expect(api.me).toMatchObject({ value: 1 });
    expect(api.around.some((r) => r.user.username === me.username)).toBe(true);

    await page.getByRole('radiogroup', { name: 'Period' }).getByText('Alltid').click();
    await expect(page).toHaveURL(/period=all/);
    await expect(page.locator('main').getByText(/^\d+ \S+ \d{4} - \d+ \S+ \d{4}$/)).toHaveCount(0);

    await page.getByRole('radiogroup', { name: 'Vilka' }).getByText('Vänner').click();
    await expect(page).toHaveURL(/scope=friends/);
    const rows = page.getByRole('list', { name: 'Topplista flygplatser' }).locator('li');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('Anna Lind');
    await expect(rows.nth(1)).toContainText('(du)');

    await page.getByRole('radiogroup', { name: 'Vilka' }).getByText('Land').click();
    await expect(page).toHaveURL(/scope=country/);
    await expect(page.locator('#lb-country')).toHaveValue('SE');

    await page.getByRole('group', { name: 'Mått' }).getByRole('button', { name: 'XP' }).click();
    await expect(page).toHaveURL(/metric=xp/);
    await expect(page.getByRole('radiogroup', { name: 'Period' })).toHaveCount(0);
    await expect(page.getByRole('radiogroup', { name: 'Vilka' }).getByText('Land')).toHaveCount(0);
  });

  test('utloggad ser bara världen', async ({ page }) => {
    await page.goto('/leaderboard?scope=friends');
    const scope = page.getByRole('radiogroup', { name: 'Vilka' });
    await expect(scope.getByRole('radio')).toHaveCount(1);
    await expect(page.locator('[aria-current="true"]')).toHaveCount(0);
  });
});

test.describe('redigera check-in', () => {
  test('ändra kommentar, betyg och typ; markeras som redigerad', async ({ page, request }) => {
    const u = await apiRegister(request);
    const c = await apiCheckin(request, u.token, { iata: 'CPH', comment: 'Före ändring', rating: 2 });
    await useToken(page, u.token);
    await page.goto(`/u/${u.username}?tab=checkins`);
    await clickCentered(page.locator('article.checkin').filter({ hasText: 'Före ändring' }).getByRole('link', { name: 'Redigera' }));
    await expect(page).toHaveURL(new RegExp(`/checkin/${c.id}/edit$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Redigera check-in' })).toBeVisible();
    await expect(page.locator('.selected-airport .iata-tag')).toHaveText('CPH');
    await expect(page.locator('.selected-airport').getByRole('button', { name: 'Byt' })).toHaveCount(0);
    await expect(page.getByLabel('Kommentar')).toHaveValue('Före ändring');
    await page.getByLabel('Kommentar').fill('Efter ändring');
    await setStars(page, 'Totalbetyg', 4.5);
    await page.getByRole('radiogroup', { name: 'Typ av besök' }).getByText('Ankomst').click();
    const patch = page.waitForResponse((r) => r.request().method() === 'PATCH');
    await page.getByRole('button', { name: 'Spara ändringar' }).click();
    expect((await patch).status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`/u/${u.username}\\?tab=checkins$`));
    const card = page.locator('article.checkin').filter({ hasText: 'Efter ändring' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('redigerad');
    await expect(card.locator('.kind-chip')).toHaveText(/Ankomst/);
    const fresh = await (await request.get(`/api/checkins/${c.id}`)).json();
    expect(fresh).toMatchObject({ comment: 'Efter ändring', rating: 4.5, kind: 'arrival' });
    expect(fresh.editedAt).toBeTruthy();
  });

  test('andras check-in har ingen redigeringsknapp och redigeringssidan nekas', async ({ page, request }) => {
    const owner = await apiRegister(request);
    const c = await apiCheckin(request, owner.token, { iata: 'OSL', comment: 'Inte din' });
    await loginNewUser(page, request);
    await page.goto(`/c/${c.id}`);
    await expect(page.locator('article.checkin').getByRole('link', { name: 'Redigera' })).toHaveCount(0);
    const res = await page.request.patch(`/api/checkins/${c.id}`, { data: { comment: 'hack' } });
    expect([401, 403]).toContain(res.status());
  });
});

test.describe('offlinekö', () => {
  test('checka in offline, skickas automatiskt när nätet kommer tillbaka', async ({ page, request, context }) => {
    const u = await loginNewUser(page, request);
    const note = `Offline ${Math.random().toString(36).slice(2, 7)}`;
    await page.goto('/checkin?iata=GOT');
    await waitForServiceWorker(page);
    await expect(page.locator('.selected-airport .iata-tag')).toHaveText('GOT');
    await context.setOffline(true);
    await expect(page.locator('.offline-banner')).toHaveText('Du är offline');
    await page.getByLabel('Kommentar').fill(note);
    await page.getByRole('button', { name: 'Checka in på GOT' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Sparad offline' })).toBeVisible();
    await expect(page.locator('.offline-banner')).toHaveText('Offline - 1 check-in väntar på nät');
    expect((await (await request.get(`/api/users/${u.username}/checkins`)).json()).length).toBe(0);

    await context.setOffline(false);
    await expect(page.getByText('Din köade check-in är skickad.')).toBeVisible();
    await expect(page.locator('.offline-banner')).toHaveCount(0);
    const list = await (await request.get(`/api/users/${u.username}/checkins`)).json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ comment: note, airport: { iata: 'GOT' } });
  });

  test.describe('utan service worker (första besöket, innan SW har cachat)', () => {
    test.use({ serviceWorkers: 'block' });
    test('offline check-in kraschar inte appen', async ({ page, request, context }) => {
      await loginNewUser(page, request);
      await page.goto('/checkin?iata=GOT');
      await expect(page.locator('.selected-airport .iata-tag')).toHaveText('GOT');
      await context.setOffline(true);
      await page.getByRole('button', { name: 'Checka in på GOT' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Sparad offline' })).toBeVisible();
      await context.setOffline(false);
    });
  });

  test('kall start offline: flygplats kan väljas från "Senaste" och köas', async ({ page, request, context }) => {
    const u = await apiRegister(request, { homeIata: 'GOT' });
    await apiCheckin(request, u.token, { iata: 'CPH' });
    await useToken(page, u.token);
    await page.goto('/checkin');
    await expect(page.getByRole('region', { name: 'Senaste' }).locator('.quick-pick__item')).toHaveCount(2);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
    await page.goto('/checkin').catch(() => {});
    await page.getByRole('region', { name: 'Senaste' }).locator('.quick-pick__item').filter({ hasText: 'CPH' }).click();
    await page.getByRole('button', { name: 'Checka in på CPH' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Sparad offline' })).toBeVisible();
    await context.setOffline(false);
  });

  test('kö som avvisas av servern visas med fel och kan tas bort', async ({ page, request, context }) => {
    await loginNewUser(page, request);
    await page.goto('/checkin?iata=GOT');
    await waitForServiceWorker(page);
    await expect(page.locator('.selected-airport .iata-tag')).toHaveText('GOT');
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Checka in på GOT' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Sparad offline' })).toBeVisible();
    // Simulera att servern avvisar posten (t.ex. ogiltig data) när kön skickas.
    await page.route('**/api/checkins', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"Testfel från servern"}' })
        : route.continue()
    );
    await context.setOffline(false);
    await expect(page.locator('.offline-banner')).toHaveText(/1 check-in kunde inte skickas/);
    await page.getByRole('link', { name: 'Inställningar' }).click();
    const q = page.locator('.offline-queue');
    await expect(q).toContainText('Testfel från servern');
    await q.getByRole('button', { name: 'Ta bort' }).click();
    await expect(page.getByText('Inget väntar just nu.')).toBeVisible();
  });
});

test.describe('konto', () => {
  test('dataexport laddar ner JSON med egen data', async ({ page, request }) => {
    const u = await apiRegister(request);
    await apiCheckin(request, u.token, { iata: 'GOT', comment: 'Exportera mig' });
    await useToken(page, u.token);
    await page.goto('/settings');
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportera mina data' }).click();
    const file = await dl;
    expect(file.suggestedFilename()).toBe('gatelog-export.json');
    const data = JSON.parse(fs.readFileSync(await file.path(), 'utf8'));
    expect(data.user.username).toBe(u.username);
    expect(data.checkins).toHaveLength(1);
    expect(data.checkins[0].comment).toBe('Exportera mig');
    for (const k of ['loungeReviews', 'comments', 'wishlist', 'following', 'followers']) expect(Array.isArray(data[k])).toBe(true);
    expect(JSON.stringify(data)).not.toMatch(/password|hash/i);
  });

  test('radera konto tar bort konto, check-ins och inloggning', async ({ page, request }) => {
    const u = await apiRegister(request);
    const c = await apiCheckin(request, u.token, { iata: 'ARN', comment: 'Raderas' });
    await useToken(page, u.token);
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Radera konto' }).click();
    const form = page.getByRole('form', { name: 'Radera konto' });
    await expect(form.getByRole('button', { name: 'Radera mitt konto' })).toBeDisabled();
    await form.getByLabel('Bekräfta med ditt lösenord').fill('hemligt123');
    await form.getByRole('button', { name: 'Radera mitt konto' }).click();
    await expect(page.getByText('Ditt konto och alla dina check-ins är raderade.')).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    expect(await page.evaluate(() => localStorage.getItem('gatelog.token'))).toBeNull();
    expect((await request.post('/api/auth/login', { data: { username: u.username, password: 'hemligt123' } })).status()).toBe(401);
    expect((await request.get(`/api/users/${u.username}`)).status()).toBe(404);
    expect((await request.get(`/api/checkins/${c.id}`)).status()).toBe(404);
  });

  test('fel lösenord vid radering ger felmeddelande och behåller inloggningen', async ({ page, request }) => {
    const u = await apiRegister(request);
    await useToken(page, u.token);
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Radera konto' }).click();
    const form = page.getByRole('form', { name: 'Radera konto' });
    await form.getByLabel('Bekräfta med ditt lösenord').fill('fel-losenord');
    await form.getByRole('button', { name: 'Radera mitt konto' }).click();
    await expect(page.getByText('Fel lösenord.')).toBeVisible();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(form.getByLabel('Bekräfta med ditt lösenord')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('gatelog.token'))).not.toBeNull();
  });
});
