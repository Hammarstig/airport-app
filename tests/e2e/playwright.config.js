// Playwright-konfiguration för Gatelog (testagenten).
// Bygger klienten, startar servern med temporär DB_PATH/UPLOAD_DIR och demodata (tests/e2e/server.mjs).
// Projekt: "android" (Pixel 7, primärt), "desktop" (1280 px) och "perf" (körs sist, ensam).
const path = require('node:path');
const { defineConfig, devices } = require('@playwright/test');

const PORT = Number(process.env.E2E_PORT) || 4173;
const root = path.resolve(__dirname, '../..');

module.exports = defineConfig({
  testDir: __dirname,
  outputDir: path.join(root, 'test-results'),
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: path.join(root, 'test-results/e2e-results.json') }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'sv-SE',
    timezoneId: 'Europe/Stockholm',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'android', use: { ...devices['Pixel 7'] }, testIgnore: /perf\.spec\.js/ },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testIgnore: /perf\.spec\.js/,
    },
    {
      name: 'perf',
      use: { ...devices['Pixel 7'] },
      testMatch: /perf\.spec\.js/,
      dependencies: ['android', 'desktop'],
      fullyParallel: false,
    },
  ],
  webServer: {
    command: 'npm run build && node --disable-warning=ExperimentalWarning tests/e2e/server.mjs',
    cwd: root,
    url: `http://127.0.0.1:${PORT}/api/health`,
    env: { PORT: String(PORT), AUTH_RATE_MAX: '10000' },
    timeout: 240_000,
    reuseExistingServer: !!process.env.E2E_REUSE_SERVER,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
