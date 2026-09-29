import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueReminders, localParts, pruneSent } from '../src/reminders.js';

// Prague is UTC+2 in summer time (until 25 Oct 2026). 2026-09-28 is a Monday.
const prague = (iso, hhmm) => new Date(`${iso}T${hhmm}:00+02:00`);
const titles = (rs) => rs.map((r) => r.title);

test('localParts converts to Prague wall-clock', () => {
  assert.deepEqual(localParts(new Date('2026-09-27T22:30:00Z')), { date: '2026-09-28', minutes: 30, dow: 1 });
});

test('Monday morning: run reminder; club reminder in the afternoon', () => {
  assert.deepEqual(titles(dueReminders({}, prague('2026-09-28', '06:30'))), ['Today: Run']);
  assert.deepEqual(titles(dueReminders({}, prague('2026-09-28', '17:20'))), ['Ge-Baek at 18:00']);
});

test('nothing after the 60-minute window, nothing twice', () => {
  assert.deepEqual(dueReminders({}, prague('2026-09-28', '07:31')).filter((r) => r.key.endsWith('morning')), []);
  const sent = new Set(['2026-09-28:morning']);
  assert.deepEqual(titles(dueReminders({}, prague('2026-09-28', '06:45'), sent)), []);
});

test('logged sessions are not nagged', () => {
  const state = { logged: ['2026-09-28:run', '2026-09-28:tkd-club'] };
  assert.deepEqual(dueReminders(state, prague('2026-09-28', '06:30')), []);
  assert.deepEqual(dueReminders(state, prague('2026-09-28', '21:00')), []);
  assert.deepEqual(titles(dueReminders({ logged: ['2026-09-28:run'] }, prague('2026-09-28', '21:05'))),
    ['Not logged: TKD club (Ge-Baek)']);
});

test('next morning: yesterday not logged + unpaid debts', () => {
  const r = dueReminders({ debts: ['5 km run'] }, prague('2026-09-29', '07:00')).find((x) => x.key.endsWith(':debt'));
  assert.equal(r.title, 'Yesterday is not logged');
  assert.match(r.body, /Run \+ TKD club/);
  assert.match(r.body, /Unpaid: 5 km run/);
});

test('Thursday is quiet; Sunday sends the verdict', () => {
  const thu = ['06:30', '07:00', '17:15', '21:00'].flatMap((t) =>
    dueReminders({ logged: ['2026-09-30:tkd-club'] }, prague('2026-10-01', t)));
  assert.deepEqual(thu, []);
  assert.deepEqual(titles(dueReminders({ verdict: 'Solid week.', logged: ['2026-10-04:sunday-combo'] },
    prague('2026-10-04', '20:00'))), ['Weekly verdict']);
});

test('pruneSent keeps recent keys only', () => {
  const kept = pruneSent(new Set(['2026-09-20:morning', '2026-09-27:evening']), prague('2026-09-28', '12:00'));
  assert.deepEqual(kept, ['2026-09-27:evening']);
});
