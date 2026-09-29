import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../src/schedule.js';
import { penaltyTasks, newDebts, payOldest, unpaid, streak, longestStreak, disciplineScore, DEFAULT_PENALTIES } from '../src/penalties.js';

const MON = '2026-09-28';
const at = (iso, h = 10, m = 0) => { const [y, mo, d] = iso.split('-').map(Number); return new Date(y, mo - 1, d, h, m); };
const log = (date, type, loggedAt = at(date, 20)) => ({ id: `${date}-${type}`, date, type, loggedAt: loggedAt.toISOString() });

test('penalty per type; Sunday combo owes both', () => {
  assert.deepEqual(penaltyTasks('run'), [DEFAULT_PENALTIES.run]);
  assert.deepEqual(penaltyTasks('tkd-home'), [DEFAULT_PENALTIES.tkd]);
  assert.deepEqual(penaltyTasks('sunday-combo'), [DEFAULT_PENALTIES.gym, DEFAULT_PENALTIES.tkd]);
});

test('debts are created once per miss (idempotent)', () => {
  const entries = evaluate({ startDate: MON, now: at('2026-09-29', 13), sessions: [log(MON, 'run')] });
  const first = newDebts(entries, []);
  assert.equal(first.length, 1); // Monday club missed
  assert.equal(first[0].task, DEFAULT_PENALTIES.tkd);
  assert.equal(newDebts(entries, first).length, 0);
});

test('payOldest pays in creation order', () => {
  const debts = [
    { id: 'b', createdAt: '2026-10-02T10:00:00.000Z', paidAt: null },
    { id: 'a', createdAt: '2026-09-30T10:00:00.000Z', paidAt: null },
  ];
  const once = payOldest(debts, '2026-10-03T10:00:00.000Z');
  assert.equal(once.find((d) => d.id === 'a').paidAt, '2026-10-03T10:00:00.000Z');
  assert.equal(unpaid(once).length, 1);
  assert.equal(unpaid(payOldest(once, 'x')).length, 0);
  assert.equal(payOldest([], 'x').length, 0);
});

test('streak resets on a miss and freezes while debt is open', () => {
  // Week 1: all done except Wednesday club.
  const sessions = [log(MON, 'run'), log(MON, 'tkd-club'), log('2026-09-29', 'gym-lower'),
    log('2026-10-02', 'gym-upper'), log('2026-10-03', 'tkd-home'), log('2026-10-04', 'sunday-combo')];
  const now = at('2026-10-04', 22);
  const entries = evaluate({ startDate: MON, now, sessions });
  const debts = newDebts(entries, []);
  assert.equal(debts.length, 1);
  // Fri, Sat, Sun were all completed while the Wednesday debt was open → frozen at 0.
  assert.equal(streak(entries, debts), 0);
  assert.equal(longestStreak(entries, debts), 3);

  // Paid Friday morning → Fri, Sat, Sun count.
  const paid = payOldest(debts, at('2026-10-02', 7).toISOString());
  assert.equal(streak(entries, paid), 3);
});

test('discipline score: +3 done, −15 miss, −2 per open debt per day, clamped', () => {
  const entries = evaluate({ startDate: MON, now: at('2026-10-01', 13), sessions: [log(MON, 'run'), log(MON, 'tkd-club')] });
  // Mon: 2 done (capped at 100). Tue: missed (85). Wed: missed (70). Thu: today.
  const debts = newDebts(entries, []);
  const { score, history } = disciplineScore({ entries, debts, startDate: MON, now: at('2026-10-01', 13) });
  assert.equal(history[0].score, 100);
  // Tue miss −15 → 85; its debt is created Wed 12:00, so no decay yet at end of Tue.
  assert.equal(history[1].score, 85);
  // Wed miss −15 → 70; Tue debt open at end of Wed → −2 → 68.
  assert.equal(history[2].score, 68);
  assert.equal(score, 68); // Thursday not finished, no decay applied yet
  assert.ok(disciplineScore({ entries: [], debts: [], startDate: MON, now: at(MON) }).score === 100);
});
