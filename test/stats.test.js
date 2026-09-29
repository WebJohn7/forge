import { test } from 'node:test';
import assert from 'node:assert/strict';
import { e1rm, liftHistory, liftNames, lastSets, tonnage, weeklyTonnage, pace, formatPace,
  weightAvg7, weightTrendPerWeek, slope, adherenceByWeek } from '../src/stats.js';

const gym = (date, name, sets) => ({ date, type: 'gym-lower', exercises: [{ name, sets }] });

test('e1rm (Epley), ignores junk and >12 reps', () => {
  assert.equal(e1rm(100, 1), 100);
  assert.ok(Math.abs(e1rm(100, 5) - 116.67) < 0.01);
  assert.equal(e1rm(0, 5), 0);
  assert.equal(e1rm(50, 20), 0);
});

test('lift history merges names case-insensitively and takes best set', () => {
  const s = [gym('2026-09-01', 'Squat', [{ kg: 80, reps: 5 }, { kg: 90, reps: 3 }]),
    gym('2026-09-08', ' squat ', [{ kg: 85, reps: 5 }])];
  const h = liftHistory(s, 'SQUAT');
  assert.equal(h.length, 2);
  assert.equal(h[0].e1rm, 99); // 90×3 → 99 beats 80×5 → 93.3
  assert.deepEqual(liftNames(s), ['Squat']);
  assert.deepEqual(lastSets(s, 'squat'), [{ kg: 85, reps: 5 }]);
});

test('tonnage and weekly buckets', () => {
  const s = [gym('2026-09-29', 'Squat', [{ kg: 100, reps: 5 }, { kg: 100, reps: 5 }]), gym('2026-09-21', 'Squat', [{ kg: 50, reps: 10 }])];
  assert.equal(tonnage(s[0]), 1000);
  const w = weeklyTonnage(s, '2026-10-01', 2);
  assert.deepEqual(w, [{ week: '2026-09-21', tonnage: 500 }, { week: '2026-09-28', tonnage: 1000 }]);
});

test('pace formatting', () => {
  assert.equal(pace({ distanceKm: 5, timeMin: 25 }), 5);
  assert.equal(formatPace(5.5), '5:30');
  assert.equal(formatPace(4.999), '5:00');
  assert.equal(pace({ distanceKm: 0, timeMin: 10 }), null);
});

test('bodyweight average and trend', () => {
  const bw = [{ date: '2026-09-22', kg: 68 }, { date: '2026-09-25', kg: 68.4 }, { date: '2026-09-28', kg: 68.8 }];
  assert.equal(weightAvg7(bw, '2026-09-28'), 68.4);
  assert.equal(weightAvg7(bw, '2026-09-10'), null);
  assert.ok(Math.abs(weightTrendPerWeek(bw, '2026-09-28') - 0.93) < 0.01);
  assert.equal(slope([{ x: 1, y: 1 }]), null);
});

test('adherence by week ignores pending sessions', () => {
  const e = [{ date: '2026-09-28', status: 'done' }, { date: '2026-09-29', status: 'missed' }, { date: '2026-09-30', status: 'pending' }];
  const [wk] = adherenceByWeek(e, '2026-09-30', 1);
  assert.deepEqual(wk, { week: '2026-09-28', done: 1, missed: 1, due: 2, pct: 50 });
});
