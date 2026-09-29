import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compute, pushState, withDefaults } from '../src/model.js';

const at = (iso, h = 10) => { const [y, mo, d] = iso.split('-').map(Number); return new Date(y, mo - 1, d, h); };
const log = (date, type, h = 20) => ({ id: `${date}-${type}`, date, type, loggedAt: at(date, h).toISOString() });

test('first launch: no misses before startDate', () => {
  const d = compute({ settings: {}, now: at('2026-09-30', 9) });
  assert.equal(d.startDate, '2026-09-30');
  assert.equal(d.missedTotal, 0);
  assert.deepEqual(d.todayEntries.map((e) => e.type), ['tkd-club']);
  assert.equal(d.score, 100);
});

test('misses create debts once; caller persists them', () => {
  const settings = { startDate: '2026-09-28' };
  const d = compute({ settings, sessions: [log('2026-09-28', 'run')], now: at('2026-09-30', 13) });
  assert.equal(d.createdDebts.length, 2); // Mon club + Tue lower
  const again = compute({ settings, debts: d.createdDebts, sessions: [log('2026-09-28', 'run')], now: at('2026-09-30', 13) });
  assert.equal(again.createdDebts.length, 0);
  assert.equal(again.openDebts.length, 2);
  assert.equal(again.findings[0].level, 'bad');
});

test('pushState carries recent logged ids and unpaid debt tasks', () => {
  const settings = { startDate: '2026-09-28' };
  const d = compute({ settings, sessions: [log('2026-09-28', 'run')], now: at('2026-09-30', 13) });
  const p = pushState(d, []);
  assert.deepEqual(p.logged, ['2026-09-28:run']);
  assert.equal(p.debts.length, 2);
  assert.equal(p.timeZone, 'Europe/Prague');
});

test('withDefaults merges partial settings', () => {
  const s = withDefaults({ penalties: { run: '10 km' } });
  assert.equal(s.penalties.run, '10 km');
  assert.ok(s.penalties.tkd);
  assert.equal(s.weightLimit, 69);
});

test('weight watching is off by default and silences weight feedback', () => {
  const bodyweight = [{ date: '2026-09-30', kg: 72 }];
  const off = compute({ settings: {}, bodyweight, now: at('2026-09-30', 9) });
  assert.equal(off.settings.watchWeight, false);
  assert.equal(off.findings.filter((f) => f.area === 'Weight').length, 0);
  const on = compute({ settings: { watchWeight: true }, bodyweight, now: at('2026-09-30', 9) });
  assert.equal(on.findings.find((f) => f.area === 'Weight').level, 'bad'); // 72 kg over the 69 kg limit
});
