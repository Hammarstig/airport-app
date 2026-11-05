// Registrering, inloggning, utloggning och skyddade sidor.
const { test, expect } = require('@playwright/test');
const { uniqueName, apiRegister, useToken, isMobile, pickFromCombobox, DEMO_PASSWORD } = require('./helpers');

test.describe('konto', () => {
  test('registrering via formulär med hemmaflygplats', async ({ page }) => {
    const username = uniqueName('reg');
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: 'Skapa konto' })).toBeVisible();
    await page.getByLabel('Användarnamn').fill(username.toUpperCase());
    await page.getByLabel('Visningsnamn (valfritt)').fill('Regina Test');
    await page.getByLabel('Lösenord').fill('hemligt123');
    await pickFromCombobox(page, 'Hemmaflygplats (valfritt)', 'got', 'Landvetter');
    await page.getByRole('button', { name: 'Skapa konto' }).click();
    // Efter registrering skickas man till check-in.
    await expect(page).toHaveURL(/\/checkin$/);
    await expect(page.getByText(/Välkommen till Gatelog, Regina Test/)).toBeVisible();
    await page.goto(`/u/${username}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Regina Test' })).toBeVisible();
    await expect(page.getByText(`@${username}`)).toBeVisible();
    await expect(page.getByRole('link', { name: 'GOT' }).first()).toBeVisible();
  });

  test('registrering validerar och visar 409 för upptaget namn', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Användarnamn').fill('ab');
    await page.getByLabel('Lösenord').fill('kort');
    await page.getByRole('button', { name: 'Skapa konto' }).click();
    await expect(page.locator('#reg-username-err')).toHaveText(/3-20 tecken/);
    await expect(page.locator('#reg-password-err')).toHaveText(/Minst 8 tecken/);
    await page.getByLabel('Användarnamn').fill('oliver');
    await page.getByLabel('Lösenord').fill('hemligt123');
    await page.getByRole('button', { name: 'Skapa konto' }).click();
    await expect(page.locator('#reg-username-err')).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
  });

  test('inloggning med demokonto och fel lösenord', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Användarnamn').fill('oliver');
    await page.getByLabel('Lösenord').fill('fel-losenord');
    await page.getByRole('button', { name: 'Logga in' }).click();
    await expect(page.locator('#login-password-err')).toBeVisible();
    await page.getByLabel('Lösenord').fill(DEMO_PASSWORD);
    await page.getByRole('button', { name: 'Logga in' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(/Välkommen tillbaka, Oliver H/)).toBeVisible();
    // Profillänken ersätter "Logga in" i navigeringen.
    const nav = page.getByRole('navigation', { name: isMobile(test.info()) ? 'Huvudmeny mobil' : 'Huvudmeny', exact: true });
    await expect(nav.getByRole('link', { name: 'Profil' })).toHaveAttribute('href', '/u/oliver');
    await expect(nav.getByRole('link', { name: 'Logga in' })).toHaveCount(0);
  });

  test('skyddad sida skickar till inloggning och tillbaka', async ({ page }) => {
    await page.goto('/checkin');
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Användarnamn').fill('anna');
    await page.getByLabel('Lösenord').fill(DEMO_PASSWORD);
    await page.getByRole('button', { name: 'Logga in' }).click();
    await expect(page).toHaveURL(/\/checkin$/);
    await expect(page.getByRole('heading', { name: 'Checka in' })).toBeVisible();
  });

  test('utloggning (desktop: ikonknapp i toppmenyn)', async ({ page, request }) => {
    test.skip(isMobile(test.info()), 'mobilvarianten testas separat (BUG-02)');
    const u = await apiRegister(request);
    await useToken(page, u.token);
    await page.goto('/');
    await page.getByRole('button', { name: 'Logga ut' }).click();
    await expect(page.getByRole('navigation', { name: 'Huvudmeny', exact: true }).getByRole('link', { name: 'Logga in' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('gatelog.token'))).toBeNull();
    await page.goto('/checkin');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('utloggning på mobil (Android)', async ({ page, request }) => {
    test.skip(!isMobile(test.info()), 'gäller mobil');
    test.fixme(true, 'BUG-02: utloggningsknappen finns bara i toppmenyn som är dold under 768 px');
    const u = await apiRegister(request);
    await useToken(page, u.token);
    await page.goto(`/u/${u.username}`);
    await page.getByRole('button', { name: 'Logga ut' }).click();
    expect(await page.evaluate(() => localStorage.getItem('gatelog.token'))).toBeNull();
  });

  test('ogiltig token i localStorage rensas och sidan fungerar utloggad', async ({ page }) => {
    await useToken(page, 'trasig.token.värde');
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Skapa konto' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('gatelog.token'))).toBeNull();
  });
});
