// Utforska, land, kategoritopplistor, lounger, topplistor, märken och 404.
const { test, expect } = require('@playwright/test');
const { apiLogin, useToken } = require('./helpers');

test.describe('utforska och topplistor', () => {
  test('utforska visar topplistor, kontinenter, länder och kategorier', async ({ page }) => {
    await page.goto('/explore');
    await expect(page.getByRole('heading', { level: 1, name: 'Utforska' })).toBeVisible();
    await expect(page.locator('.tile--continent')).toHaveCount(6);
    await expect(page.locator('.tile--continent[data-continent="EU"]')).toContainText('Europa');
    const countries = page.getByRole('region', { name: 'Populära länder' }).locator('.list__item');
    await expect(countries.first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sverige' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bäst på mat' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Visa topplistan för Mat' })).toBeVisible();
  });

  test('landssida via utforska', async ({ page }) => {
    await page.goto('/explore');
    await page.getByRole('link', { name: 'Sverige' }).click();
    await expect(page).toHaveURL(/\/country\/SE$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sverige' })).toBeVisible();
    await expect(page.locator('.result-row').filter({ hasText: 'Landvetter' }).first()).toBeVisible();
    await expect(page.locator('.stat').filter({ hasText: 'Flygplatser' }).locator('.stat__value')).toHaveText(/^\d+$/);
  });

  test('kategoritopplista: mat, byte till wifi och landsfilter', async ({ page }) => {
    await page.goto('/explore');
    await page.getByRole('link', { name: 'Visa topplistan för Mat' }).click();
    await expect(page).toHaveURL(/\/top\/food$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Bäst på mat/);
    const list = page.getByRole('list', { name: /Topplista/ });
    await expect(list.locator('.result-row').first()).toBeVisible();
    const scores = (await list.locator('.rating-badge').allInnerTexts()).map((t) => Number(t.replace(',', '.')));
    for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    await page.getByRole('navigation', { name: 'Kategorier' }).getByRole('link', { name: 'Wifi' }).click();
    await expect(page).toHaveURL(/\/top\/wifi/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Bäst på wifi/);
    await page.getByLabel('Land').selectOption('SE');
    await expect(page).toHaveURL(/country=SE/);
    for (const m of await list.locator('.result-row__meta').allInnerTexts()) expect(m).toContain('Sverige');
  });

  test('loungetopplista och loungesida', async ({ page }) => {
    await page.goto('/top/lounges');
    await expect(page.getByRole('heading', { level: 1, name: 'Bästa lounger' })).toBeVisible();
    const first = page.locator('a[href^="/lounge/"]').first();
    const name = await first.innerText();
    await first.click();
    await expect(page).toHaveURL(/\/lounge\/\d+$/);
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recensioner' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Logga in för att recensera' })).toBeVisible();
  });

  test('inloggad kan recensera lounge från loungesidan', async ({ page, request }) => {
    const { apiRegister } = require('./helpers');
    const u = await apiRegister(request);
    await useToken(page, u.token);
    await page.goto('/lounge/1');
    await page.getByRole('button', { name: 'Recensera', exact: true }).click();
    const slider = page.getByRole('slider', { name: /^Betyg för / });
    await slider.focus();
    for (let i = 0; i < 7; i++) await slider.press('ArrowRight');
    const comment = `Loungetest ${u.username}`;
    await page.getByLabel('Kommentar (valfritt)').fill(comment);
    await page.getByRole('button', { name: 'Skicka recension' }).click();
    await expect(page.getByText(comment)).toBeVisible();
  });

  test('topplista resenärer visar demoanvändare', async ({ page }) => {
    await page.goto('/leaderboard');
    await expect(page.getByRole('tab', { name: 'Flygplatser' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.list__item').first()).toContainText('Oliver H');
    await page.getByRole('tab', { name: 'Länder' }).click();
    await expect(page.locator('.list__item').first()).toBeVisible();
  });

  test('topplistan är nåbar från mobilmenyn', async ({ page }) => {
    // Bottom-nav saknar "Topplistor" men Utforska länkar dit.
    await page.goto('/explore');
    await page.getByRole('link', { name: /Resenärer/ }).click();
    await expect(page).toHaveURL(/\/leaderboard$/);
  });
});

test.describe('märken', () => {
  test('profilens märkesflik visar upplåsta och låsta märken', async ({ page }) => {
    await page.goto('/u/oliver?tab=badges');
    await expect(page.getByText(/\d+ av 14 märken upplåsta/)).toBeVisible();
    await expect(page.locator('.badge-card')).toHaveCount(14);
    await expect(page.locator('.badge-card--locked').first()).toBeVisible();
    await expect(page.locator('.badge-card').filter({ hasText: 'Nordisk resenär' })).not.toHaveClass(/badge-card--locked/);
    // Ikonerna är riktiga bilder som laddas.
    const broken = await page.locator('.badge-card__icon').evaluateAll((imgs) =>
      imgs.filter((i) => i.tagName === 'IMG' && (!i.complete || i.naturalWidth === 0)).length
    );
    expect(broken).toBe(0);
  });

  test('"Nytt märke"-modal stängs med Escape', async ({ page, request }) => {
    const { apiRegister } = require('./helpers');
    const u = await apiRegister(request);
    await useToken(page, u.token);
    await page.goto('/checkin?iata=ARN');
    await expect(page.getByRole('combobox', { name: 'Flygplats', exact: true })).toHaveValue(/^ARN - /);
    await page.getByRole('button', { name: 'Checka in', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Nytt märke' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/airport\/ARN$/);
  });
});

test.describe('404', () => {
  test('okänd sida visar "Fel gate"', async ({ page }) => {
    const res = await page.goto('/finns/inte');
    expect(res.status()).toBe(200); // SPA-fallback
    await expect(page.getByText('Fel gate')).toBeVisible();
    await expect(page).toHaveTitle(/Hittades inte/);
    await page.getByRole('link', { name: 'Till flödet' }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('okänd flygplats, användare och kategori', async ({ page }) => {
    await page.goto('/airport/QQQ');
    await expect(page.getByText(/Flygplatsen QQQ finns inte/)).toBeVisible();
    await page.goto('/airport/toolong');
    await expect(page.getByText('Fel gate')).toBeVisible();
    await page.goto('/u/finnsintealls');
    await expect(page.getByText(/Användaren finnsintealls finns inte/)).toBeVisible();
    await page.goto('/top/okand');
    await expect(page.getByText('Okänd kategori.')).toBeVisible();
    await page.goto('/lounge/999999');
    await expect(page.getByText('Fel gate')).toBeVisible();
  });

  test('okänd API-väg ger JSON 404', async ({ request }) => {
    const r = await request.get('/api/finnsinte');
    expect(r.status()).toBe(404);
    expect((await r.json()).error).toBeTruthy();
  });
});

test.describe('karta', () => {
  test('världskartan laddar med länder och växeln ändrar procent', async ({ page }) => {
    await page.goto('/u/oliver/map');
    const svg = page.locator('.map__svg').first();
    await expect(svg).toBeVisible();
    expect(await page.locator('.map__country').count()).toBeGreaterThan(150);
    expect(await page.locator('.map__country[data-step]:not([data-step="0"])').count()).toBeGreaterThanOrEqual(5);
    const pct = page.locator('.stat').filter({ hasText: 'av världens flygplatser' }).locator('.stat__value');
    const totals = page.locator('.stat').filter({ hasText: 'Besökta flygplatser' }).locator('.stat__value');
    await expect(pct).toHaveText(/%$/);
    const before = await pct.innerText();
    const totalBefore = await totals.innerText();
    expect(totalBefore).toMatch(/\/ 4008$/);
    await page.getByRole('button', { name: 'Alla flygplatser' }).click();
    await expect(page).toHaveURL(/scope=all/);
    await expect(page.getByRole('button', { name: 'Alla flygplatser' })).toHaveAttribute('aria-pressed', 'true');
    await expect(totals).toHaveText(/\/ 8799$/);
    await expect(pct).not.toHaveText(before);
    await page.getByRole('button', { name: 'Reguljärtrafik' }).click();
    await expect(pct).toHaveText(before);
  });

  test('landsvy SE visar regioner med korrekta länsnamn', async ({ page }) => {
    await page.goto('/u/oliver/map/SE');
    await expect(page.getByRole('heading', { name: 'Sverige' })).toBeVisible();
    await expect(page.locator('.map__svg path.map__country').first()).toBeVisible();
    expect(await page.locator('.map__dot').count()).toBeGreaterThan(20);
    expect(await page.locator('.map__dot--visited').count()).toBeGreaterThanOrEqual(2);
    const table = page.getByRole('table', { name: /Täckning per region i Sverige/ });
    await expect(table).toBeVisible();
    for (const lan of ['Västra Götalands län', 'Stockholms län', 'Hallands län', 'Skåne län', 'Norrbottens län', 'Örebro län', 'Östergötlands län']) {
      await expect(table.getByText(lan, { exact: true })).toBeVisible();
    }
    const names = (await table.locator('tbody tr').allInnerTexts()).map((r) => r.split('\t')[0].split('\n')[0].trim());
    for (const n of names) expect(VALID_LAN).toContain(n);
  });

  test('landsvy SE med alla flygplatser har bara riktiga län', async ({ page }) => {
    test.fixme(true, 'BUG-06: GVX (Gävle-Sandviken) har region "SE-U-A"/"Okänt län" i airports.json i stället för SE-X Gävleborgs län');
    await page.goto('/u/oliver/map/SE?scope=all');
    const table = page.getByRole('table', { name: /Täckning per region i Sverige/ });
    await expect(table).toBeVisible();
    const names = (await table.locator('tbody tr').allInnerTexts()).map((r) => r.split('\t')[0].split('\n')[0].trim());
    for (const n of names) expect(VALID_LAN).toContain(n);
  });

  test('klick på land i länderlistan öppnar landsvyn', async ({ page }) => {
    await page.goto('/u/oliver/map');
    await page.getByRole('table', { name: /Besökta länder/ }).getByRole('link', { name: 'Sverige' }).click();
    await expect(page).toHaveURL(/\/u\/oliver\/map\/SE$/);
  });

  test('egen karta nås från profilens kartflik', async ({ page, request }) => {
    const token = await apiLogin(request, 'anna');
    await useToken(page, token);
    await page.goto('/u/anna');
    await page.getByRole('tab', { name: 'Karta' }).click();
    await expect(page).toHaveURL(/\/u\/anna\/map$/);
    await expect(page.locator('.map__svg').first()).toBeVisible();
  });
});

const VALID_LAN = [
  'Blekinge län', 'Dalarnas län', 'Gotlands län', 'Gävleborgs län', 'Hallands län', 'Jämtlands län',
  'Jönköpings län', 'Kalmar län', 'Kronobergs län', 'Norrbottens län', 'Skåne län', 'Stockholms län',
  'Södermanlands län', 'Uppsala län', 'Värmlands län', 'Västerbottens län', 'Västernorrlands län',
  'Västmanlands län', 'Västra Götalands län', 'Örebro län', 'Östergötlands län',
];
