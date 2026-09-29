import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueOn, evaluate, statusOf, weekStart, addDays, dayOfWeek, isValidMove, effectiveDate } from '../src/schedule.js';

// 2026-09-28 is a Monday.
const MON = '2026-09-28';
const at = (iso, h = 10, m = 0) => { const [y, mo, d] = iso.split('-').map(Number); return new Date(y, mo - 1, d, h, m); };
const log = (date, type, loggedAt = at(date, 20)) => ({ id: `${date}-${type}`, date, type, loggedAt: loggedAt.toISOString() });

test('date helpers', () => {
  assert.equal(dayOfWeek(MON), 1);
  assert.equal(weekStart('2026-10-04'), MON); // Sunday belongs to the week that started Monday
  assert.equal(weekStart(MON), MON);
  assert.equal(addDays('2026-09-30', 1), '2026-10-01');
});

test('the week: 7 sessions, Thursday empty', () => {
  const week = [0, 1, 2, 3, 4, 5, 6].map((i) => dueOn(addDays(MON, i)).map((d) => d.type));
  assert.deepEqual(week, [
    ['run', 'tkd-club'], ['gym-lower'], ['tkd-club'], [], ['gym-upper'], ['tkd-home'], ['sunday-combo'],
  ]);
  assert.equal(week.flat().length, 7);
});

test('status lifecycle: upcoming → pending → overdue → missed', () => {
  const due = dueOn('2026-09-29')[0]; // Tue lower
  assert.equal(statusOf(due, [], at(MON)), 'upcoming');
  assert.equal(statusOf(due, [], at('2026-09-29', 22)), 'pending');
  assert.equal(statusOf(due, [], at('2026-09-30', 11, 59)), 'overdue');
  assert.equal(statusOf(due, [], at('2026-09-30', 12, 0)), 'missed');
});

test('logging same day is done, next morning is late, both complete', () => {
  const due = dueOn('2026-09-29')[0];
  assert.equal(statusOf(due, [log('2026-09-29', 'gym-lower')], at('2026-10-02')), 'done');
  assert.equal(statusOf(due, [log('2026-09-29', 'gym-lower', at('2026-09-30', 9))], at('2026-10-02')), 'late');
});

test('a log for the wrong type does not satisfy the session', () => {
  const due = dueOn('2026-09-29')[0];
  assert.equal(statusOf(due, [log('2026-09-29', 'gym-upper')], at('2026-10-02')), 'missed');
});

test('evaluate catches up over days the app was not opened', () => {
  const entries = evaluate({ startDate: MON, now: at('2026-10-05', 13), sessions: [log(MON, 'run')] });
  // Mon run done; Mon club, Tue, Wed, Fri, Sat, Sun missed; next Mon run + club pending today.
  const missed = entries.filter((e) => e.status === 'missed').map((e) => e.id);
  assert.equal(missed.length, 6);
  assert.ok(missed.includes(`${MON}:tkd-club`));
  assert.equal(entries.filter((e) => e.status === 'pending').length, 2);
});

test('moves: only onto Thursday, only declared before the day ends', () => {
  const move = { fromDate: '2026-09-29', type: 'gym-lower', toDate: '2026-10-01' };
  assert.ok(isValidMove(move, at('2026-09-29', 7)));
  assert.equal(isValidMove(move, at('2026-09-30', 7)), false);
  assert.equal(isValidMove({ ...move, toDate: '2026-10-02' }, at('2026-09-29', 7)), false);

  assert.deepEqual(dueOn('2026-09-29', undefined, [move]), []);
  const thu = dueOn('2026-10-01', undefined, [move]);
  assert.equal(thu.length, 1);
  assert.equal(effectiveDate(thu[0]), '2026-10-01');
  // Moved session is judged by Thursday, not Tuesday.
  assert.equal(statusOf(thu[0], [], at('2026-09-30', 20)), 'upcoming');
  assert.equal(statusOf(thu[0], [], at('2026-10-02', 13)), 'missed');
  assert.equal(statusOf(thu[0], [log('2026-09-29', 'gym-lower', at('2026-10-01', 8))], at('2026-10-02', 13)), 'done');
});
