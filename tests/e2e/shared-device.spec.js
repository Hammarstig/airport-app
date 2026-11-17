// SEC-11: delad enhet. En användares offlinekö och lokala data får aldrig överleva utloggningen
// eller skickas under nästa användares konto.
const { test, expect } = require('@playwright/test');
const { apiRegister } = require('./helpers');

async function uiLogin(page, username) {
  await page.goto('/login');
  await page.locator('#login-username').fill(username);
  await page.locator('#login-password').fill('hemligt123');
  await page.locator('form button[type=submit]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

const outboxCount = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const q = indexedDB.open('gatelog', 1);
        q.onupgradeneeded = () => q.result.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
        q.onsuccess = () => {
          const r = q.result.transaction('outbox').objectStore('outbox').count();
          r.onsuccess = () => resolve(r.result);
        };
      })
  );

test('SEC-11: offlinekön töms vid utloggning och skickas aldrig som nästa användare', async ({ page, request, context }) => {
  const anna = await apiRegister(request);
  const mads = await apiRegister(request);
  const marker = `Delad enhet ${Date.now()}`;

  await uiLogin(page, anna.username);
  await page.goto('/checkin?iata=GOT');
  await page.evaluate(() => navigator.serviceWorker?.ready);
  await expect(page.locator('.selected-airport .iata-tag')).toHaveText('GOT');
  await context.setOffline(true);
  await page.getByLabel(/Kommentar/).first().fill(marker);
  await page.getByRole('button', { name: 'Checka in på GOT' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sparad offline' })).toBeVisible();
  expect(await outboxCount(page)).toBe(1);

  // Anna loggar ut medan hon är offline: hon varnas, och kön och lokala data rensas.
  await page.getByRole('link', { name: 'Inställningar' }).first().click();
  await expect(page.getByRole('note')).toContainText('1 osänd check-in');
  await page.getByRole('button', { name: 'Logga ut', exact: true }).click();
  await expect.poll(() => outboxCount(page)).toBe(0);
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('gatelog.')));
  expect(keys.filter((k) => k !== 'gatelog.theme')).toEqual([]);

  // Nätet kommer tillbaka och Mads loggar in på samma enhet.
  await context.setOffline(false);
  await uiLogin(page, mads.username);
  await page.reload();
  await page.waitForTimeout(1500);
  for (const u of [anna, mads]) {
    const list = await (await request.get(`/api/users/${u.username}/checkins`)).json();
    expect(list.filter((c) => c.comment === marker)).toEqual([]);
  }
});
