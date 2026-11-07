// Check-in med alla fält, visning i flöde/flygplats/profil, gilla, önskelista och radering.
const { test, expect } = require('@playwright/test');
const { clickCentered, loginNewUser, apiRegister, apiCheckin, makeJpeg, pickFromCombobox, daysAgo, useToken } = require('./helpers');

const { setStars, openSection } = require('./helpers');

test.describe('check-in', () => {
  test('fullständig check-in med flygbolag, klass, ny lounge, loungebetyg och foto', async ({ page, request }) => {
    const u = await loginNewUser(page, request, { homeIata: 'GOT' });
    const tag = Math.random().toString(36).slice(2, 8);
    const comment = `E2E-${tag}: snabb säkerhetskontroll och bra kaffe vid gate 14.`;
    const loungeName = `E2E Lounge ${tag}`;
    const visitedOn = daysAgo(2);

    await test.step('fyll i formuläret', async () => {
      await page.goto('/checkin');
      await pickFromCombobox(page, 'Sök flygplats', 'got', 'Landvetter');
      await expect(page.locator('.selected-airport .iata-tag')).toHaveText('GOT');
      await page.getByRole('radiogroup', { name: 'Typ av besök' }).getByText('Transfer').click();
      await setStars(page, 'Totalbetyg', 4.5);
      await page.getByLabel('Kommentar').fill(comment);

      await openSection(page, 'Datum');
      await page.locator('#visitedOn').fill(visitedOn);

      await openSection(page, 'Delbetyg');
      await setStars(page, 'Säkerhetskontroll', 4);
      await setStars(page, 'Renlighet', 5);
      await setStars(page, 'Mat', 3);
      await expect(page.locator('summary', { hasText: 'Delbetyg' })).toContainText('3 av 6');

      await openSection(page, 'Foton');
      await page.getByLabel('Välj foton från galleriet').setInputFiles(await makeJpeg(page));
      await expect(page.getByRole('img', { name: 'Valt foto 1' })).toBeVisible();

      await openSection(page, 'Resedetaljer');
      await pickFromCombobox(page, 'Flygbolag', 'SK', 'Scandinavian');
      await page.getByLabel('Flightnummer').fill('sk1421');
      await expect(page.getByLabel('Flightnummer')).toHaveValue('SK1421');
      await page.getByRole('radiogroup', { name: 'Reseklass' }).getByText('Business').click();
      await page.getByLabel('Lounge', { exact: true }).selectOption('new');
      await page.getByLabel('Loungens namn').fill(loungeName);
      await page.getByLabel('Terminal (valfritt)').fill('2');
      await setStars(page, 'Loungebetyg', 4);
    });

    const created = page.waitForResponse((r) => r.url().endsWith('/api/checkins') && r.request().method() === 'POST');
    const uploaded = page.waitForResponse((r) => /\/api\/checkins\/\d+\/photos$/.test(r.url()));
    await page.getByRole('button', { name: 'Checka in på GOT' }).click();
    const body = await (await created).json();
    expect((await uploaded).status()).toBe(201);
    expect(body).toMatchObject({
      kind: 'transfer',
      rating: 4.5,
      visitedOn,
      flightNumber: 'SK1421',
      travelClass: 'business',
      airline: { iata: 'SK' },
      lounge: { name: loungeName, terminal: '2' },
      ratings: { security: 4, cleanliness: 5, food: 3 },
      levelUp: expect.any(Boolean),
      xpGained: expect.any(Number),
    });

    await test.step('sammanfattningsskärm med XP, nivå, milstolpar och nya märken', async () => {
      await expect(page).toHaveURL(/\/checkin\/done$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Incheckad på GOT' })).toBeVisible();
      await expect(page.locator('.checkin-done__xp')).toHaveText(new RegExp(`^\\+${body.xpGained} XP`));
      await expect(page.locator('.level-bar__title')).toHaveText(`Nivå ${body.levelInfo.level} - ${body.levelInfo.title}`);
      await expect(page.getByText('Ny flygplats - din 1:a')).toBeVisible();
      await expect(page.getByText('Nytt land - ditt 1:a')).toBeVisible();
      await expect(page.locator('.streak__count')).toHaveText('1');
      const badges = page.getByRole('list', { name: 'Nya märken' });
      await expect(badges).toContainText('Nytt märke');
      for (const b of body.newBadges) await expect(badges).toContainText(b.name);
      await expect(page.getByRole('link', { name: 'Lägg till anslutning' })).toHaveAttribute('href', `/checkin?date=${visitedOn}&kind=transfer`);
      await page.getByRole('link', { name: 'Visa GOT' }).click();
    });

    await test.step('syns på flygplatssidan med detaljer, foto och lounge', async () => {
      await expect(page).toHaveURL(/\/airport\/GOT$/);
      const card = page.locator('article.checkin').filter({ hasText: comment });
      await expect(card).toBeVisible();
      await expect(card.locator('.checkin__details')).toHaveText(`SK1421 · Scandinavian Airlines System · Business · ${loungeName}`);
      await expect(card.locator('.kind-chip')).toHaveText(/Transfer/);
      await expect(card.getByRole('img', { name: '4,5 av 5 stjärnor' })).toBeVisible();
      await expect(card.getByRole('button', { name: 'Visa foto 1 av 1' })).toBeVisible();
      const src = await card.locator('.photo-strip img').getAttribute('src');
      expect(src).toMatch(/^\/uploads\/[a-f0-9]{32}\.jpg$/);
      const img = await page.request.get(src);
      expect(img.status()).toBe(200);
      expect(img.headers()['content-type']).toMatch(/image\/jpeg/);
      await expect(page.locator('.gallery img').first()).toBeVisible();
    });

    await test.step('lounge-sidan visar loungebetyget', async () => {
      await page.goto(`/lounge/${body.lounge.id}`);
      await expect(page.getByRole('heading', { level: 1, name: loungeName })).toBeVisible();
      await expect(page.locator('.list__item').filter({ hasText: `Testare ${u.username}` })).toBeVisible();
    });

    await test.step('syns i flödet (Alla och Mina)', async () => {
      await page.goto('/?tab=global');
      await expect(page.locator('article.checkin').filter({ hasText: comment })).toBeVisible();
      await page.getByRole('tab', { name: 'Mina' }).click();
      await expect(page.locator('article.checkin')).toHaveCount(1);
    });

    await test.step('syns på profilen', async () => {
      await page.goto(`/u/${u.username}`);
      await expect(page.locator('.result-row').filter({ hasText: 'Landvetter' })).toBeVisible();
      await expect(page.locator('.level-bar__title')).toHaveText(/^Nivå \d+ - /);
      await page.getByRole('tab', { name: 'Check-ins' }).click();
      await expect(page).toHaveURL(/tab=checkins/);
      await expect(page.locator('article.checkin').filter({ hasText: comment })).toBeVisible();
    });

    await test.step('radera check-in från profilen', async () => {
      page.once('dialog', (d) => d.accept());
      const del = page.waitForResponse((r) => r.request().method() === 'DELETE' && /\/api\/checkins\/\d+$/.test(r.url()));
      await clickCentered(page.locator('article.checkin').filter({ hasText: comment }).getByRole('button', { name: 'Radera' }));
      expect((await del).status()).toBe(204);
      await expect(page.locator('article.checkin').filter({ hasText: comment })).toHaveCount(0);
      const gone = await page.request.get(`/api/checkins/${body.id}`);
      expect(gone.status()).toBe(404);
    });
  });

  test('validering: knappen kräver flygplats och framtida datum stoppas', async ({ page, request }) => {
    await loginNewUser(page, request);
    await page.goto('/checkin');
    await expect(page.getByRole('button', { name: 'Välj flygplats' })).toBeDisabled();
    await pickFromCombobox(page, 'Sök flygplats', 'arn', 'Arlanda');
    await openSection(page, 'Datum');
    await page.locator('#visitedOn').fill('2099-01-01');
    await page.getByRole('button', { name: 'Checka in på ARN' }).click();
    await expect(page.locator('#visitedOn-err')).toHaveText(/framtiden/);
    await expect(page).toHaveURL(/\/checkin$/);
  });

  test('stjärnor: tryck på vänster/höger halva ger halvt/helt betyg, nytt tryck rensar', async ({ page, request }) => {
    await loginNewUser(page, request);
    await page.goto('/checkin?iata=GOT');
    const group = page.getByRole('group', { name: 'Totalbetyg', exact: true });
    const star4 = group.locator('.stars-input__btn').nth(3);
    const box = await star4.boundingBox();
    await page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2);
    await expect(group.getByRole('radio', { name: '4,0 av 5' })).toBeChecked();
    await page.mouse.click(box.x + box.width * 0.2, box.y + box.height / 2);
    await expect(group.getByRole('radio', { name: '3,5 av 5' })).toBeChecked();
    await page.mouse.click(box.x + box.width * 0.2, box.y + box.height / 2);
    await expect(group.getByRole('radio', { checked: true })).toHaveCount(0);
    // Piltangenter flyttar mellan värdena (inbyggd radiogrupp).
    await group.getByRole('radio', { name: '3,5 av 5' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(group.getByRole('radio', { name: '4,0 av 5' })).toBeChecked();
  });

  test('förifylld flygplats via ?iata= och byte av flygplats', async ({ page, request }) => {
    await loginNewUser(page, request);
    await page.goto('/checkin?iata=cph');
    await expect(page.locator('.selected-airport .iata-tag')).toHaveText('CPH');
    await openSection(page, 'Resedetaljer');
    await expect(page.getByLabel('Lounge', { exact: true }).locator('option')).toContainText(['Ingen lounge', 'Aviator Lounge']);
    await page.locator('.selected-airport').getByRole('button', { name: 'Byt' }).click();
    await expect(page.locator('main').getByRole('combobox', { name: 'Sök flygplats', exact: true })).toBeVisible();
  });

  test('gilla och ogilla en check-in (optimistiskt, sparas)', async ({ page, request }) => {
    const owner = await apiRegister(request);
    const text = `Gillamig ${Math.random().toString(36).slice(2, 8)}`;
    await apiCheckin(request, owner.token, { iata: 'ARN', comment: text });
    await loginNewUser(page, request);
    await page.goto('/');
    const card = page.locator('article.checkin').filter({ hasText: text });
    const like = card.locator('.like-btn');
    await expect(like).toHaveAttribute('aria-pressed', 'false');
    await expect(like).toHaveText('0');
    await clickCentered(like);
    await expect(like).toHaveAttribute('aria-pressed', 'true');
    await expect(like).toHaveText('1');
    await page.reload();
    await expect(card.locator('.like-btn')).toHaveAttribute('aria-pressed', 'true');
    await expect(card.locator('.like-btn')).toHaveText('1');
    await clickCentered(card.locator('.like-btn'));
    await expect(card.locator('.like-btn')).toHaveAttribute('aria-pressed', 'false');
    await expect(card.locator('.like-btn')).toHaveText('0');
    await page.reload();
    await expect(card.locator('.like-btn')).toHaveText('0');
  });

  test('gilla utloggad skickar till inloggning', async ({ page }) => {
    await page.goto('/');
    await page.locator('article.checkin .like-btn').first().click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('önskelista: lägg till och ta bort från flygplatssidan', async ({ page, request }) => {
    const u = await loginNewUser(page, request);
    await page.goto('/airport/HND');
    const wish = page.locator('.wish-btn');
    await expect(wish).toHaveText('Vill besöka');
    await wish.click();
    await expect(wish).toHaveAttribute('aria-pressed', 'true');
    await expect(wish).toHaveText('På önskelistan');
    await page.goto(`/u/${u.username}?tab=wishlist`);
    await expect(page.getByRole('list', { name: 'Önskelista' }).locator('.result-row')).toHaveCount(1);
    await expect(page.getByRole('list', { name: 'Önskelista' })).toContainText('Haneda');
    await page.goto('/airport/HND');
    await expect(page.locator('.wish-btn')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.wish-btn').click();
    await expect(page.locator('.wish-btn')).toHaveText('Vill besöka');
    await page.goto(`/u/${u.username}?tab=wishlist`);
    await expect(page.getByText('Önskelistan är tom')).toBeVisible();
  });

  test('egen check-in kan raderas från flödets "Mina"-flik, andras saknar Radera', async ({ page, request }) => {
    const u = await apiRegister(request);
    const text = `Raderamig ${Math.random().toString(36).slice(2, 8)}`;
    await apiCheckin(request, u.token, { iata: 'OSL', comment: text });
    await useToken(page, u.token);
    await page.goto('/');
    // I "Alla" visas ingen raderaknapp (inte ens på egna kort).
    await expect(page.locator('article.checkin').filter({ hasText: 'Mads Jensen' }).first().getByRole('button', { name: 'Radera' })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Mina' }).click();
    page.once('dialog', (d) => d.accept());
    await clickCentered(page.locator('article.checkin').filter({ hasText: text }).getByRole('button', { name: 'Radera' }));
    await expect(page.locator('article.checkin').filter({ hasText: text })).toHaveCount(0);
    await expect(page.getByText('Du har inga check-ins ännu')).toBeVisible();
  });
});
