// Prestandabudget i testsviten (mindre datamängd än `npm run bench`, som kör 300 000 check-ins).
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.BENCH_CHECKINS ??= '30000';
process.env.BENCH_USERS ??= '1500';

test('svarstider inom budget med många check-ins', { timeout: 120_000 }, async () => {
  const { runBench } = await import('../scripts/bench.js');
  const res = Object.fromEntries((await runBench({ log() {} })).map((r) => [r.label, r]));
  assert.ok(res.autocomplete.mean < 20, `autocomplete ${res.autocomplete.mean} ms`);
  assert.ok(res['recensionssök'].mean < 50, `recensionssök ${res['recensionssök'].mean} ms`);
  assert.ok(res['recensionssök med filter'].mean < 50, `sök med filter ${res['recensionssök med filter'].mean} ms`);
  assert.ok(res.topplistor.mean < 100, `topplistor ${res.topplistor.mean} ms`);
});
