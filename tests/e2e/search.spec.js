// Flygplatssök, söksidans flikar och URL-filter, recensionssök med <mark>, XSS och tangentbord i autocomplete.
const { test, expect } = require('@playwright/test');
const { apiRegister, apiCheckin, isMobile } = require('./helpers');

const resultCodes = (page) => page.getByRole('list', { name: 'Flygplatser' }).locator('.result-row .iata-tag');

async function searchAirports(page, q) {
  await page.goto('/search');
  await page.locator('#search-q').fill(q);
  await expect(page).toHaveURL(new RegExp(`[?&]q=${encodeURIComponent(q)}`));
  await expect(resultCodes(page).first()).toBeVisible();
}

test.describe('flygplatssök', () => {
  const cases = [
    { q: 'got', first: 'GOT', label: 'IATA' },
    { q: 'stockholm', contains: ['ARN', 'BMA'], label: 'stad' },
    { q: 'heathrow', first: 'LHR', label: 'namn' },
    { q: 'sverige', contains: ['GOT', 'ARN'], label: 'land på svenska' },
    { q: 'sweden', contains: ['GOT', 'ARN'], label: 'land på engelska' },
    { q: 'goteborg', first: 'GOT', label: 'utan diakritik' },
  ];
  for (const c of cases) {
    test(`söksidan hittar "${c.q}" (${c.label})`, async ({ page }) => {
      await searchAirports(page, c.q);
      const codes = await resultCodes(page).allInnerTexts();
      const clean = codes.map((x) => x.replace(/\s/g, ''));
      if (c.first) expect(clean[0]).toBe(c.first);
      for (const code of c.contains || []) expect(clean).toContain(code);
    });
  }

  test('autocomplete matchar land och visar match-etikett', async ({ page }) => {
    await page.goto('/register');
    const input = page.getByRole('combobox', { name: 'Hemmaflygplats (valfritt)' });
    await input.fill('sweden');
    const list = page.getByRole('listbox', { name: 'Förslag på flygplatser' });
    await expect(list.getByRole('option').first()).toBeVisible();
    await expect(list.getByRole('option').first().locator('.match-hint')).toHaveText('Land');
    await input.fill('goteborg');
    await expect(list.getByRole('option').first()).toContainText('Göteborg Landvetter');
    await expect(list.getByRole('option').first().locator('.match-hint')).toHaveText('Stad');
  });

  test('Enter på exakt IATA-kod går till flygplatssidan', async ({ page }) => {
    await page.goto('/search');
    await page.locator('#search-q').fill('cph');
    await page.locator('#search-q').press('Enter');
    await expect(page).toHaveURL(/\/airport\/CPH$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Copenhagen');
  });

  test('tangentbordsnavigering i autocomplete (pilar, Enter, Escape)', async ({ page }) => {
    await page.goto('/register');
    const input = page.getByRole('combobox', { name: 'Hemmaflygplats (valfritt)' });
    const list = page.getByRole('listbox', { name: 'Förslag på flygplatser' });
    const options = list.getByRole('option');
    // Escape stänger en öppen lista utan att välja.
    await input.fill('kastrup');
    await expect(options.first()).toBeVisible();
    await input.press('Escape');
    await expect(list).toBeHidden();
    await expect(input).toHaveValue('kastrup');

    await input.fill('stock');
    // Vänta tills listan visar svaret för "stock" (inte kvarvarande träffar för "kastrup", se BUG-04).
    await expect(options.first()).toContainText('Stockholm');
    await expect(input).toHaveAttribute('aria-expanded', 'true');
    // Första alternativet är aktivt direkt.
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');
    await input.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    const activeId = await options.nth(1).getAttribute('id');
    await expect(input).toHaveAttribute('aria-activedescendant', activeId);
    await input.press('ArrowUp');
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');
    await input.press('ArrowDown');
    const secondCode = (await options.nth(1).locator('.iata-tag').innerText()).replace(/\s/g, '');
    await input.press('Enter');
    await expect(input).toHaveValue(new RegExp(`^${secondCode} - `));
    await expect(list).toBeHidden();
  });

  test('Enter direkt efter ny inmatning väljer inte en gammal träff', async ({ page }) => {
    await page.goto('/register');
    const input = page.getByRole('combobox', { name: 'Hemmaflygplats (valfritt)' });
    await input.fill('kastrup');
    await expect(page.getByRole('option').first()).toContainText('Copenhagen');
    await input.press('Escape');
    await input.fill('heathrow');
    await input.press('Enter');
    await expect(input).not.toHaveValue(/^CPH/);
  });

  test('redigering efter val tömmer inte fältet', async ({ page }) => {
    await page.goto('/register');
    const input = page.getByRole('combobox', { name: 'Hemmaflygplats (valfritt)' });
    await input.fill('stock');
    await expect(page.getByRole('option').first()).toBeVisible();
    await input.press('Enter');
    await expect(input).toHaveValue(/^ARN - /);
    await input.press('End');
    await input.press('Backspace');
    await expect(input).toHaveValue(/^ARN - Stockholm-Arlanda Airpor$/);
  });

  test('topbarens sök (desktop) navigerar till vald flygplats', async ({ page }) => {
    test.skip(isMobile(test.info()), 'topbar-sök finns bara på desktop');
    await page.goto('/');
    const input = page.getByRole('combobox', { name: 'Sök flygplats' });
    await input.fill('heathrow');
    await expect(page.getByRole('listbox').getByRole('option').first()).toBeVisible();
    await input.press('Enter');
    await expect(page).toHaveURL(/\/airport\/LHR$/);
  });
});

test.describe('söksidans flikar och filter', () => {
  test('flikbyte behåller sökord och synkas till URL', async ({ page }) => {
    await page.goto('/search?q=lounge');
    await expect(page.getByRole('tab', { name: 'Flygplatser' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: 'Recensioner' }).click();
    await expect(page).toHaveURL(/tab=reviews/);
    await expect(page).toHaveURL(/q=lounge/);
    await expect(page.getByRole('list', { name: 'Recensioner' })).toBeVisible();
    await page.getByRole('tab', { name: 'Lounger' }).click();
    await expect(page).toHaveURL(/tab=lounges/);
    await expect(page.locator('a[href^="/lounge/"]').first()).toBeVisible();
    await page.getByRole('tab', { name: 'Användare' }).click();
    await expect(page).toHaveURL(/tab=users/);
    await page.locator('#search-q').fill('oli');
    await expect(page.locator('a[href="/u/oliver"]').first()).toBeVisible();
    // Pil höger på fliklistan byter flik.
    await page.getByRole('tab', { name: 'Användare' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/tab=airports/);
  });

  test('filter för land, storlek och sortering hamnar i URL:en och överlever omladdning', async ({ page }) => {
    await page.goto('/search');
    await page.getByRole('button', { name: /^Filter/ }).click();
    await page.getByLabel('Land').selectOption('SE');
    await expect(page).toHaveURL(/country=SE/);
    await page.getByLabel('Storlek').selectOption('large');
    await expect(page).toHaveURL(/type=large/);
    await page.getByLabel('Sortering').selectOption('name');
    await expect(page).toHaveURL(/sort=name/);
    await expect(page.getByRole('button', { name: 'Filter (2)' })).toBeVisible();
    await expect(resultCodes(page).first()).toBeVisible();
    const metas = await page.getByRole('list', { name: 'Flygplatser' }).locator('.result-row__meta').allInnerTexts();
    expect(metas.length).toBeGreaterThan(0);
    for (const m of metas) expect(m).toContain('Sverige');

    await page.reload();
    await expect(page.getByLabel('Sortering')).toHaveValue('name');
    await expect(page.getByRole('button', { name: 'Filter (2)' })).toBeVisible();
    await page.getByRole('button', { name: 'Filter (2)' }).click();
    await expect(page.getByLabel('Land')).toHaveValue('SE');
    await page.getByRole('button', { name: 'Rensa filter' }).click();
    await expect(page).not.toHaveURL(/country=/);
  });

  test('recensionsfilter (flygplats, minsta betyg, klass) synkas till URL', async ({ page }) => {
    await page.goto('/search?tab=reviews&iata=GOT&minRating=4&travelClass=economy');
    const list = page.getByRole('list', { name: 'Recensioner' });
    await expect(list.locator('li').first()).toBeVisible();
    await expect(page.getByLabel('Minsta betyg')).toHaveValue('4');
    await expect(page.getByLabel('Reseklass')).toHaveValue('economy');
    await expect(page.getByRole('combobox', { name: 'Begränsa till flygplats' })).toHaveValue(/^GOT - /);
    for (const tag of await list.locator('.iata-tag').allInnerTexts()) expect(tag.replace(/\s/g, '')).toBe('GOT');
  });
});

test.describe('recensionssök', () => {
  test('träffar markeras med <mark>', async ({ page }) => {
    await page.goto('/search?tab=reviews&q=lounge');
    const list = page.getByRole('list', { name: 'Recensioner' });
    await expect(list.locator('mark').first()).toBeVisible();
    const marks = await list.locator('mark').allInnerTexts();
    expect(marks.length).toBeGreaterThan(1);
    for (const m of marks) expect(m.toLowerCase()).toContain('lounge');
    // Loungerecensioner visas med loungens namn.
    await expect(list.getByText('Loungerecension').first()).toBeVisible();
  });

  test('XSS i kommentar exekveras inte (sök, flöde, flygplatssida)', async ({ page, request }) => {
    const u = await apiRegister(request);
    const probe = `xss${Math.random().toString(36).slice(2, 8)}`;
    const payload = `<img src=x onerror=alert(1)> ${probe} <script>alert(2)</script>`;
    await apiCheckin(request, u.token, { iata: 'BMA', comment: payload });
    const dialogs = [];
    page.on('dialog', (d) => {
      dialogs.push(d.message());
      d.dismiss();
    });

    await page.goto(`/search?tab=reviews&q=${probe}`);
    const hit = page.getByRole('list', { name: 'Recensioner' }).locator('li').first();
    await expect(hit.locator('mark')).toHaveText(probe);
    await expect(hit).toContainText('<img src=x onerror=alert(1)>');
    expect(await page.locator('img[src="x"]').count()).toBe(0);
    expect(await page.locator('main script').count()).toBe(0);

    await page.goto('/');
    await expect(page.locator('article.checkin').filter({ hasText: probe })).toContainText('<img src=x');
    await page.goto('/airport/BMA');
    await expect(page.locator('article.checkin').filter({ hasText: probe })).toBeVisible();
    expect(await page.locator('img[src="x"]').count()).toBe(0);
    await page.waitForTimeout(300);
    expect(dialogs).toEqual([]);
  });

  test('tom sökning visar instruktion, sökord utan träff visar tomt läge', async ({ page }) => {
    await page.goto('/search?tab=reviews');
    await expect(page.getByText('Sök i kommentarer och loungerecensioner')).toBeVisible();
    await page.locator('#search-q').fill('zzqqxxnotfound');
    await expect(page.getByText('Inga recensioner matchar')).toBeVisible();
  });
});
