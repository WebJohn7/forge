import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, weeklyVerdict } from '../src/feedback.js';
import { addDays } from '../src/schedule.js';

const TODAY = '2026-09-28';
const gym = (date, name, kg, reps, rpe = 7) => ({ date, type: 'gym-lower', rpe, exercises: [{ name, sets: [{ kg, reps }] }] });
const find = (fs, re) => fs.find((f) => re.test(f.title));

test('strength: progressing, regressing, stalled', () => {
  const up = analyze({ today: TODAY, sessions: [gym('2026-08-10', 'Squat', 80, 5), gym('2026-09-20', 'Squat', 90, 5)] });
  assert.equal(find(up, /Squat: progressing/).level, 'good');

  const down = analyze({ today: TODAY, sessions: [gym('2026-08-10', 'Squat', 100, 5), gym('2026-09-20', 'Squat', 90, 5)] });
  assert.equal(find(down, /Squat: going backwards/).level, 'bad');

  // Best was 5 weeks ago inside the recent window? No — flat within 4 weeks, 4 sessions, no new best.
  const flat = analyze({ today: TODAY, sessions: [
    gym('2026-09-07', 'Bench', 70, 5), gym('2026-09-14', 'Bench', 70, 5),
    gym('2026-09-21', 'Bench', 70, 5), gym('2026-09-25', 'Bench', 67.5, 5)] });
  assert.equal(find(flat, /Bench: stalled/).level, 'warn');

  const fine = analyze({ today: TODAY, sessions: [gym('2026-09-21', 'Bench', 70, 5)] });
  assert.equal(find(fine, /Bench/), undefined);
});

test('volume spike and drop compare the last two completed weeks', () => {
  const spike = analyze({ today: TODAY, sessions: [gym('2026-09-15', 'Squat', 100, 5), gym('2026-09-22', 'Squat', 100, 10)] });
  assert.ok(find(spike, /Volume jumped/));
  const drop = analyze({ today: TODAY, sessions: [gym('2026-09-15', 'Squat', 100, 10), gym('2026-09-22', 'Squat', 100, 5)] });
  assert.ok(find(drop, /Volume fell/));
});

test('effort: coasting and overreaching need 3+ sessions', () => {
  const easy = [1, 3, 5].map((i) => gym(addDays(TODAY, -i), 'Squat', 50, 5, 4));
  assert.equal(find(analyze({ today: TODAY, sessions: easy }), /coasting/).level, 'bad');
  const hard = [1, 3, 5].map((i) => gym(addDays(TODAY, -i), 'Squat', 50, 5, 9.5));
  assert.ok(find(analyze({ today: TODAY, sessions: hard }), /Average RPE/));
  assert.equal(find(analyze({ today: TODAY, sessions: easy.slice(0, 2) }), /RPE/), undefined);
});

test('weight vs the 69 kg category', () => {
  const bw = (kg) => [0, 1, 2].map((i) => ({ date: addDays(TODAY, -i), kg }));
  assert.equal(find(analyze({ today: TODAY, bodyweight: bw(69.5) }), /over 69/).level, 'bad');
  assert.equal(find(analyze({ today: TODAY, bodyweight: bw(68.8) }), /under the limit/).level, 'warn');
  assert.equal(find(analyze({ today: TODAY, bodyweight: bw(67.5) }), /on target/).level, 'good');
  assert.ok(find(analyze({ today: TODAY }), /No weigh-ins/));
});

test('running: slower pace and missing intervals', () => {
  const run = (d, timeMin, intervals = false) => ({ date: d, type: 'run', run: { distanceKm: 5, timeMin, intervals } });
  const runs = [run('2026-08-10', 25), run('2026-08-17', 25), run('2026-08-24', 25),
    run('2026-09-14', 27), run('2026-09-21', 27), run('2026-09-28', 27)];
  const fs = analyze({ today: TODAY, sessions: runs });
  assert.ok(find(fs, /slower/));
  assert.ok(find(fs, /No interval work/));
  const withIntervals = analyze({ today: TODAY, sessions: [...runs, run('2026-09-20', 20, true)] });
  assert.equal(find(withIntervals, /No interval work/), undefined);
});

test('adherence: repeat offender and debt are bad, sorted first', () => {
  const entries = [];
  for (const d of ['2026-09-07', '2026-09-14', '2026-09-21']) {
    entries.push({ date: d, type: 'run', status: 'missed' }, { date: d, type: 'tkd-club', status: 'done' });
  }
  const debts = [{ task: '5 km run', paidAt: null }];
  const fs = analyze({ today: TODAY, entries, debts, bodyweight: [{ date: TODAY, kg: 67 }] });
  assert.equal(fs[0].level, 'bad');
  assert.ok(find(fs, /You keep skipping Run/));
  assert.ok(find(fs, /You owe 1 penalty/));
  assert.ok(find(fs, /50 % adherence/));
});

test('weekly verdict wording', () => {
  const wk = (statuses) => statuses.map((status, i) => ({ date: addDays('2026-09-21', i), type: 'run', status }));
  assert.match(weeklyVerdict({ today: TODAY, entries: wk(['done', 'done']) }).headline, /^Solid week/);
  assert.match(weeklyVerdict({ today: TODAY, entries: wk(['done', 'missed']) }).headline, /One miss/);
  assert.match(weeklyVerdict({ today: TODAY, entries: wk(['missed', 'missed', 'missed', 'missed', 'done']) }).headline, /lying/);
  assert.match(weeklyVerdict({ today: TODAY }).headline, /No data/);
});
