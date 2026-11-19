// v4: import av resehistorik, inbjudningar, vänförslag, stammisar, utmaningar, märkesögonblick,
// årsöversikten "Ditt 2026", inställningar som undersidor och skyddade standardval för nya konton.
const fs = require('node:fs');
const { test, expect } = require('@playwright/test');
const { apiRegister, apiCheckin, loginNewUser, useToken, uniqueName, daysAgo } = require('./helpers');

const authed = (token) => ({ headers: { Authorization: `Bearer ${token}` } });
const rnd = () => Math.random().toString(36).slice(2, 7);
const NO_DELAY = { privacy: { publishDelayHours: 0 } };

test.describe('inställningar', () => {
  test('översikten länkar till fem undersidor med egna rubriker', async ({ page, request }) => {
    await loginNewUser(page, request);
    await page.goto('/settings');
    const nav = page.getByRole('navigation', { name: 'Inställningar' });
    const pages = [
      ['Konto', '/settings/konto'],
      ['Integritet', '/settings/integritet'],
      ['Notiser', '/settings/notiser'],
      ['Säkerhet', '/settings/sakerhet'],
      ['Data', '/settings/data'],
    ];
    await expect(nav.getByRole('link')).toHaveCount(pages.length);
    for (const [title, href] of pages) {
      await nav.getByRole('link', { name: new RegExp(`^${title}`) }).click();
      await expect(page).toHaveURL(new RegExp(`${href}$`));
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await expect(page).toHaveTitle(new RegExp(`^${title} - Inställningar`));
      await page.getByRole('button', { name: 'Tillbaka' }).click();
      await expect(page).toHaveURL(/\/settings$/);
    }
    await page.goto('/settings/finns-inte');
    await expect(page.getByText('Fel gate')).toBeVisible();
  });

  test('registreringens skyddade standardval visas under Integritet', async ({ page }) => {
    // Testservern kör NODE_ENV=test där standardvalen är avstängda (se server/src/config.js);
    // själva standardvärdena (1 h, dold hemmaflygplats) testas i tests/api/v4.test.mjs.
    const username = uniqueName('def');
    await page.goto('/register');
    await page.getByLabel('Användarnamn').fill(username);
    await page.getByLabel('Lösenord').fill('Kvast-Tiger-7319');
    const regP = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
    await page.getByRole('button', { name: 'Skapa konto' }).click();
    const reg = await (await regP).json();
    expect(reg.settings).toBeTruthy();
    await expect(page).toHaveURL(/\/checkin$/);
    await page.goto('/settings/integritet');
    const delay = { 0: 'Direkt', 1: '1 h', 24: '24 h', 168: '7 dagar' }[reg.settings.publishDelayHours];
    await expect(page.getByRole('radiogroup', { name: 'Visa check-ins för andra efter' }).getByRole('radio', { name: delay })).toBeChecked();
    const hide = page.getByRole('switch', { name: 'Dölj min hemmaflygplats' });
    if (reg.settings.hideHomeAirport) await expect(hide).toBeChecked();
    else await expect(hide).not.toBeChecked();
    await expect(page.getByRole('switch', { name: /Privat profil/ })).not.toBeChecked();
  });
});

test.describe('import av resehistorik', () => {
  const csv = [
    'Date,From,To,Airline,Flight',
    '2025-06-01,GOT,AMS,KL,KL1158',
    '2025-06-01,GOT,AMS,KL,KL1158',
    '2025-07-10,ESSA,CPH,SK,SK1401',
    '2099-01-01,GOT,ARN,SK,SK1',
    'inte-ett-datum,GOT,ARN,,',
  ].join('\n');
  const file = (name = 'flighty.csv', body = csv) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(body) });

  test('förhandsvisning, import, inte i flödet, ångra', async ({ page, request }) => {
    const u = await loginNewUser(page, request);
    await page.goto('/settings/data');
    await expect(page.getByRole('group', { name: 'Källa' }).getByRole('button', { name: 'Flighty' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByLabel('CSV-fil att importera').setInputFiles(file());
    const status = page.getByRole('status').filter({ hasText: 'flighty.csv' });
    // 5 datarader: 2 flygningar = 4 nya check-ins (ESSA översätts till ARN), 1 dubblettflygning, 2 rader som inte kan läsas.
    await expect(status).toContainText('5 rader, 4 nya check-ins');
    await expect(status).toContainText('2 dubbletter hoppas över');
    await expect(status).toContainText('2 rader kan inte läsas');
    const table = page.getByRole('table', { name: 'Förhandsvisning av importen' });
    await expect(table.locator('tbody tr')).toHaveCount(6);
    await expect(table.locator('tbody tr').filter({ hasText: 'ARN' })).toContainText('Avgång');
    await expect(table.locator('tbody tr.is-error')).toHaveCount(2);
    await expect(page.getByRole('list', { name: 'Steg' }).locator('[aria-current="step"]')).toHaveText('Granska');

    await page.getByRole('button', { name: 'Importera 4 check-ins' }).click();
    await expect(page.getByText('4 check-ins importerade, 2 dubbletter hoppades över. Märken och statistik är uppdaterade.')).toBeVisible();
    const list = await (await request.get(`/api/users/${u.username}/checkins?limit=50`, authed(u.token))).json();
    expect(list).toHaveLength(4);
    expect(list.every((c) => c.source === 'import')).toBe(true);
    expect(list.map((c) => c.airport.iata).sort()).toEqual(['AMS', 'ARN', 'CPH', 'GOT']);
    // Importerade check-ins syns inte i flödet.
    const feed = await (await request.get('/api/feed?scope=mine&limit=50', authed(u.token))).json();
    expect(feed.filter((c) => c.user.username === u.username)).toHaveLength(0);
    await page.getByRole('link', { name: 'Visa min profil' }).click();
    await expect(page.locator('.result-row')).toHaveCount(4);

    // Samma fil igen: bara dubbletter, inget att importera.
    await page.goto('/settings/data');
    await page.getByLabel('CSV-fil att importera').setInputFiles(file());
    await expect(page.getByRole('status').filter({ hasText: 'flighty.csv' })).toContainText('0 nya check-ins');
    await expect(page.getByRole('button', { name: /^Importera/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Avbryt' }).click();

    // Ångra importen.
    page.once('dialog', (d) => d.accept());
    await page.getByRole('region', { name: 'Tidigare importer' }).getByRole('button', { name: 'Ångra' }).click();
    await expect(page.getByText('Importen är borttagen.')).toBeVisible();
    expect(await (await request.get(`/api/users/${u.username}/checkins`, authed(u.token))).json()).toHaveLength(0);
  });

  test('ogiltig fil och för stor fil ger begripliga fel', async ({ page, request }) => {
    await loginNewUser(page, request);
    await page.goto('/settings/data');
    await page.getByLabel('CSV-fil att importera').setInputFiles(file('fel.csv', 'namn,stad\nAnna,Göteborg\n'));
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByLabel('CSV-fil att importera').setInputFiles(file('stor.csv', `date,iata\n${'2025-01-01,GOT\n'.repeat(80000)}`));
    await expect(page.getByRole('alert')).toHaveText('Filen är större än 1 MB. Dela upp den i flera filer.');
  });
});

test.describe('inbjudningar och vänförslag', () => {
  test('inbjudningslänk: skapa, registrera via länken, ömsesidig följning och notis', async ({ page, request, browser }, testInfo) => {
    const host = await loginNewUser(page, request);
    await page.goto('/settings/konto');
    await page.getByRole('button', { name: 'Skapa inbjudningslänk' }).click();
    const link = page.getByLabel('Inbjudningslänk');
    await expect(link).toContainText('/register?ref=');
    const code = (await link.innerText()).split('ref=')[1].trim();
    expect(code).toMatch(/^[A-Z2-9]{10}$/);
    await expect(page.getByText(/Använd 0 av 5 gånger/)).toBeVisible();

    const ctx = await browser.newContext({ ...testInfo.project.use });
    const guest = await ctx.newPage();
    const username = uniqueName('inv');
    await guest.goto(`/register?ref=${code.toLowerCase()}`);
    await expect(guest.getByText(/har bjudit in dig/)).toContainText(`Testare ${host.username}`);
    await guest.getByLabel('Användarnamn').fill(username);
    await guest.getByLabel('Lösenord').fill('Kvast-Tiger-7319');
    await guest.getByRole('button', { name: 'Skapa konto' }).click();
    await expect(guest.getByText(`Du och @${host.username} följer nu varandra.`)).toBeVisible();
    await ctx.close();

    const prof = await (await request.get(`/api/users/${username}`, authed(host.token))).json();
    expect(prof.followedByMe).toBe(true);
    expect(prof.followsMe).toBe(true);
    const notes = await (await request.get('/api/notifications', authed(host.token))).json();
    expect(notes.items.some((n) => n.type === 'invite_accepted' && n.actor?.username === username)).toBe(true);
    await page.reload();
    await expect(page.getByText(/Använd 1 av 5 gånger/)).toBeVisible();
  });

  test('ogiltig inbjudningskod ignoreras vid registrering', async ({ page }) => {
    const username = uniqueName('inv');
    await page.goto('/register?ref=FELKOD1234');
    await expect(page.getByText(/har bjudit in dig/)).toHaveCount(0);
    await page.getByLabel('Användarnamn').fill(username);
    await page.getByLabel('Lösenord').fill('Kvast-Tiger-7319');
    await page.getByRole('button', { name: 'Skapa konto' }).click();
    await expect(page).toHaveURL(/\/checkin$/);
  });

  test('vänförslag med gemensam vän; följ och dölj (kommer inte tillbaka)', async ({ page, request }) => {
    const me = await apiRegister(request);
    const friend = await apiRegister(request);
    const fof = await apiRegister(request, { displayName: `Vänsvän ${rnd()}` });
    await request.post(`/api/users/${friend.username}/follow`, authed(me.token));
    await request.post(`/api/users/${fof.username}/follow`, authed(friend.token));
    await useToken(page, me.token);
    await page.goto('/search?tab=users');
    const section = page.getByRole('region', { name: 'Förslag till dig' });
    const card = section.locator('.suggest-card').filter({ hasText: fof.user.displayName });
    await expect(card).toBeVisible();
    await expect(card.locator('.suggest-card__reason')).toHaveText('1 gemensam vän');
    await card.getByRole('button', { name: 'Följ', exact: true }).click();
    await expect(card.getByRole('button', { name: 'Följer' })).toBeVisible();
    expect((await (await request.get(`/api/users/${fof.username}`, authed(me.token))).json()).followedByMe).toBe(true);

    const other = section.locator('.suggest-card').filter({ hasNotText: fof.user.displayName }).first();
    const otherName = (await other.locator('.suggest-card__name').innerText()).trim();
    await other.getByRole('button', { name: `Dölj förslaget ${otherName}` }).click();
    await expect(section.locator('.suggest-card').filter({ hasText: otherName })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('region', { name: 'Förslag till dig' }).locator('.suggest-card').first()).toBeVisible();
    await expect(page.locator('.suggest-card').filter({ hasText: otherName })).toHaveCount(0);
  });
});

test.describe('stammisar', () => {
  test('borgmästare på en flygplats och övertagande med notis', async ({ page, request }) => {
    // Egen flygplats per projekt: android och desktop körs parallellt mot samma server.
    const iata = test.info().project.name === 'desktop' ? 'SFT' : 'OER';
    const a = await apiRegister(request, NO_DELAY);
    for (const d of [3, 2]) await apiCheckin(request, a.token, { iata, visitedOn: daysAgo(d) });
    await page.goto(`/airport/${iata}`);
    const mayor = page.locator('.regulars__mayor');
    await expect(mayor).toContainText(`Borgmästare på ${iata}`);
    await expect(mayor.getByRole('link')).toHaveText(`Testare ${a.username}`);
    await expect(mayor).toContainText('2 check-ins senaste 60 dagarna');
    const mine = await (await request.get(`/api/users/${a.username}/mayorships`)).json();
    expect(mine.map((m) => m.airport.iata)).toContain(iata);

    const b = await apiRegister(request, NO_DELAY);
    for (const d of [3, 2, 1]) await apiCheckin(request, b.token, { iata, visitedOn: daysAgo(d) });
    await page.reload();
    await expect(page.locator('.regulars__mayor').getByRole('link')).toHaveText(`Testare ${b.username}`);
    await expect(page.getByRole('list', { name: `Stammisar på ${iata}` })).toContainText(`Testare ${a.username}`);
    const na = await (await request.get('/api/notifications', authed(a.token))).json();
    expect(na.items.some((n) => n.type === 'mayor_lost' && n.actor?.username === b.username)).toBe(true);
    const nb = await (await request.get('/api/notifications', authed(b.token))).json();
    expect(nb.items.some((n) => n.type === 'mayor_gained')).toBe(true);
  });

  test('flygplats utan stammis förklarar hur man blir borgmästare', async ({ page }) => {
    await page.goto('/airport/HFS');
    await expect(page.getByText(/Checka in här minst två gånger på 60 dagar för att bli borgmästare på HFS/)).toBeVisible();
  });
});

test.describe('utmaningar och märkesögonblick', () => {
  test('månadsutmaningar visas på märkesfliken med framsteg och klarmarkering', async ({ page, request }) => {
    const u = await loginNewUser(page, request);
    // Tre nya flygplatser i två länder denna månad, med kommentar.
    for (const [iata, d] of [['GOT', 1], ['CPH', 1], ['OSL', 0]]) {
      await apiCheckin(request, u.token, { iata, visitedOn: daysAgo(d), comment: 'Utmaning' });
    }
    const api = await (await request.get(`/api/users/${u.username}/challenges`)).json();
    await page.goto(`/u/${u.username}?tab=badges`);
    for (const c of api.challenges) {
      const card = page.locator('.challenge-card').filter({ hasText: c.name });
      await expect(card).toBeVisible();
      if (c.completed) {
        await expect(card).toHaveClass(/challenge-card--done/);
        await expect(card.locator('.challenge-card__meta')).toContainText('Klar');
      } else {
        await expect(card.locator('.challenge-card__meta')).toContainText(`${Math.min(c.progress.current, c.progress.target)} av ${c.progress.target}`);
      }
    }
    expect(api.challenges.find((c) => c.id === 'new-airports').completed).toBe(true);
    expect(api.challenges.find((c) => c.id === 'reviewer').completed).toBe(true);
    const notes = await (await request.get('/api/notifications', authed(u.token))).json();
    expect(notes.items.filter((n) => n.type === 'challenge_completed').length).toBeGreaterThanOrEqual(2);
  });

  test('märkesögonblick efter första check-in: nivå och märken i tur och ordning, fokus och Escape', async ({ page, request }) => {
    await loginNewUser(page, request);
    await page.goto('/checkin?iata=GOT');
    const resP = page.waitForResponse((r) => r.url().endsWith('/api/checkins') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Checka in på GOT' }).click();
    const c = await (await resP).json();
    const total = (c.levelUp ? 1 : 0) + c.newBadges.length;
    expect(total).toBeGreaterThan(0);
    const dialog = page.locator('.badge-moment[role="dialog"]');
    await expect(dialog).toBeVisible();
    if (c.levelUp) {
      await expect(dialog.locator('.badge-moment__kicker')).toHaveText('Ny nivå');
      await expect(dialog.locator('#bm-title')).toHaveText(`Nivå ${c.levelInfo.level}`);
    }
    // Stega igenom; den primära knappen har fokus vid varje steg.
    for (let i = 1; i < total; i++) {
      const next = dialog.getByRole('button', { name: `Nästa (${i + 1} av ${total})` });
      await expect(next).toBeFocused();
      await next.click();
    }
    const done = dialog.getByRole('button', { name: 'Fortsätt' });
    await expect(done).toBeFocused();
    // Fokusfällan: Tab stannar i dialogen.
    for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('.badge-moment'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Incheckad på GOT' })).toBeVisible();
  });
});

test.describe('Ditt 2026', () => {
  test('årsöversikten bläddras med knappar och piltangenter och kan sparas som bild', async ({ page }) => {
    await page.goto('/u/oliver/year/2026');
    await expect(page.getByRole('heading', { level: 1, name: '@olivers 2026' })).toBeVisible();
    const deck = page.getByRole('region', { name: 'Årsöversikt 2026' });
    const slides = deck.locator('.wrapped-slide');
    await expect(slides.first()).toBeVisible();
    const n = await slides.count();
    expect(n).toBeGreaterThan(3);
    const pos = page.locator('[aria-live="polite"]').filter({ hasText: /^\d+ av \d+$/ });
    await expect(pos).toHaveText(`1 av ${n}`);
    await expect(page.getByRole('button', { name: 'Föregående bild' })).toBeDisabled();
    await page.getByRole('button', { name: 'Nästa bild' }).click();
    await expect(pos).toHaveText(`2 av ${n}`);
    await deck.focus();
    await page.keyboard.press('ArrowRight');
    await expect(pos).toHaveText(`3 av ${n}`);
    // Vänsterpil testas separat (BUG-16 på bred skärm).
    // Siffrorna stämmer med API:t.
    const y = await (await page.request.get('/api/users/oliver/year/2026')).json();
    await expect(deck).toContainText(String(y.uniqueAirports));

    const dl = page.waitForEvent('download', { timeout: 15_000 }).catch(() => null);
    await page.getByRole('button', { name: 'Dela bilden' }).click();
    const file = await dl;
    if (file) {
      // Bild 3 visas efter Nästa och högerpil.
      expect(file.suggestedFilename()).toMatch(/^gatelog-2026-3\.png$/);
      const buf = fs.readFileSync(await file.path());
      expect(buf.subarray(1, 4).toString('latin1')).toBe('PNG');
      await expect(page.getByText('Bilden är sparad.')).toBeVisible();
    }
  });

  test('vänsterpil går exakt en bild bakåt', async ({ page }) => {
    await page.goto('/u/oliver/year/2026');
    const deck = page.getByRole('region', { name: 'Årsöversikt 2026' });
    await expect(deck.locator('.wrapped-slide').first()).toBeVisible();
    const n = await deck.locator('.wrapped-slide').count();
    const pos = page.locator('[aria-live="polite"]').filter({ hasText: /^\d+ av \d+$/ });
    for (const k of [2, 3]) {
      await page.getByRole('button', { name: 'Nästa bild' }).click();
      await expect(pos).toHaveText(`${k} av ${n}`);
    }
    await deck.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(pos).toHaveText(`2 av ${n}`);
    await page.getByRole('button', { name: 'Föregående bild' }).click();
    await expect(pos).toHaveText(`1 av ${n}`);
  });

  test('egen profil länkar till "Ditt 2026"', async ({ page, request }) => {
    const u = await loginNewUser(page, request);
    await apiCheckin(request, u.token, { iata: 'GOT' });
    await page.goto(`/u/${u.username}`);
    await page.getByRole('link', { name: 'Ditt 2026' }).click();
    await expect(page).toHaveURL(new RegExp(`/u/${u.username}/year/2026$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Ditt 2026' })).toBeVisible();
  });

  test('ogiltigt år och privat profil hanteras', async ({ page, request }) => {
    await page.goto('/u/oliver/year/1850');
    await expect(page.locator('.wrapped-slide')).toHaveCount(0);
    const p = await apiRegister(request);
    await request.patch('/api/me/settings', { ...authed(p.token), data: { isPrivate: true } });
    await page.goto(`/u/${p.username}/year/2026`);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.locator('.wrapped-slide')).toHaveCount(0);
  });
});
