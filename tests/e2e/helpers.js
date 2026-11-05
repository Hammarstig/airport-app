// Gemensamma hjälpfunktioner för E2E-testerna.
const { expect } = require('@playwright/test');

const DEMO_PASSWORD = 'demo1234';
const TOKEN_KEY = 'gatelog.token';

let seq = 0;
/** Unikt användarnamn (3-20 tecken a-z0-9_). */
function uniqueName(prefix = 'e2e') {
  seq += 1;
  const rnd = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${Date.now().toString(36).slice(-5)}${rnd}${seq}`.slice(0, 20);
}

function isMobile(testInfo) {
  return testInfo.project.name !== 'desktop';
}

/** Registrerar via API och returnerar { username, token, user }. */
async function apiRegister(request, extra = {}) {
  const username = extra.username || uniqueName();
  const res = await request.post('/api/auth/register', {
    data: { username, password: 'hemligt123', displayName: `Testare ${username}`, ...extra },
  });
  expect(res.status(), await res.text()).toBe(201);
  const body = await res.json();
  return { username, token: body.token, user: body.user };
}

async function apiLogin(request, username, password = DEMO_PASSWORD) {
  const res = await request.post('/api/auth/login', { data: { username, password } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).token;
}

/** Lägger token i localStorage innan appen startar. */
async function useToken(page, token) {
  await page.addInitScript(([k, t]) => {
    try {
      // Bara vid första laddningen i fliken, så att utloggning inte skrivs över vid nästa navigering.
      if (!window.sessionStorage.getItem('e2e.tokenSet')) {
        window.localStorage.setItem(k, t);
        window.sessionStorage.setItem('e2e.tokenSet', '1');
      }
    } catch {
      /* ignorera */
    }
  }, [TOKEN_KEY, token]);
}

/** Registrerar en ny användare via API och loggar in sidan med den. */
async function loginNewUser(page, request, extra) {
  const u = await apiRegister(request, extra);
  await useToken(page, u.token);
  return u;
}

async function apiCheckin(request, token, body) {
  const res = await request.post('/api/checkins', {
    headers: { Authorization: `Bearer ${token}` },
    data: { visitedOn: daysAgo(1), kind: 'departure', ...body },
  });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
}

function daysAgo(n) {
  const d = new Date(Date.now() - n * 86400000);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Samlar konsolfel, sidfel och misslyckade förfrågningar. */
function collectProblems(page) {
  const problems = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push({ kind: 'console', url: page.url(), text: m.text() });
  });
  page.on('pageerror', (e) => problems.push({ kind: 'pageerror', url: page.url(), text: e.message }));
  page.on('requestfailed', (r) =>
    problems.push({ kind: 'requestfailed', url: page.url(), text: `${r.url()} ${r.failure()?.errorText}` })
  );
  return problems;
}

/** Skapar en riktig liten JPEG (96x64, gradient) via canvas i webbläsaren. */
async function makeJpeg(page, { w = 96, h = 64 } = {}) {
  const dataUrl = await page.evaluate(
    ([w, h]) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#FFBE2E');
      g.addColorStop(1, '#1E6BB0');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#14263C';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('GOT', 10, 40);
      return c.toDataURL('image/jpeg', 0.9);
    },
    [w, h]
  );
  const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
  expect(buffer.subarray(0, 3).toString('hex')).toBe('ffd8ff');
  return { name: 'landvetter.jpg', mimeType: 'image/jpeg', buffer };
}

/** Väljer ett alternativ i en combobox (autocomplete) via tangentbordet. */
async function pickFromCombobox(page, label, text, optionText) {
  const input = page.getByRole('combobox', { name: label, exact: typeof label === 'string' });
  await input.fill(text);
  const listbox = page.getByRole('listbox', { name: /Förslag/ });
  const option = optionText
    ? listbox.getByRole('option').filter({ hasText: optionText }).first()
    : listbox.getByRole('option').first();
  await expect(option).toBeVisible();
  await option.click();
  return input;
}

/**
 * Klickar efter att elementet scrollats till mitten. Fasta bottom-nav/topbar på mobil
 * ligger annars över knappar nära kanten när Playwright scrollar "precis in i vyn".
 */
async function clickCentered(locator) {
  await locator.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await locator.click();
}

module.exports = {
  clickCentered,
  DEMO_PASSWORD,
  TOKEN_KEY,
  uniqueName,
  isMobile,
  apiRegister,
  apiLogin,
  useToken,
  loginNewUser,
  apiCheckin,
  daysAgo,
  collectProblems,
  makeJpeg,
  pickFromCombobox,
};
