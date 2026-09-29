// PURE. Decides which push notifications are due right now. Runs inside the Cloudflare
// Worker's cron (every 15 min) and in Node tests. The Worker holds a copy of `state`
// that the app syncs: schedule, moves, logged due-ids, unpaid debt tasks, weekly verdict.

import { SESSION_TYPES, DEFAULT_SCHEDULE, dueOn, addDays } from './schedule.js';
import { penaltyTasks, DEFAULT_PENALTIES } from './penalties.js';

export const DEFAULT_TIMES = {
  morning: '06:30',   // today's morning session
  debt: '07:00',      // unpaid penalties + yesterday not logged
  club: '17:15',      // Mon/Wed: bus to Ge-Baek at 17:30
  evening: '21:00',   // anything due today still not logged
  weekly: '20:00',    // Sunday: weekly verdict
};

export const MAX_LATE_MIN = 60; // never send a reminder more than an hour after its time

// Local wall-clock parts for `now` in `timeZone`: { date: 'YYYY-MM-DD', minutes, dow }.
export function localParts(now, timeZone = 'Europe/Prague') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    weekday: 'short', hourCycle: 'h23',
  }).formatToParts(now).map((p) => [p.type, p.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: +parts.hour * 60 + +parts.minute, dow };
}

const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const label = (type) => SESSION_TYPES[type]?.label || type;

// Returns [{ key, title, body }]. `sent` is the set of keys already delivered (dedupe).
export function dueReminders(state, now, sent = new Set()) {
  const {
    schedule = DEFAULT_SCHEDULE, moves = [], logged = [], debts = [], verdict = null,
    times = DEFAULT_TIMES, penalties = DEFAULT_PENALTIES, timeZone = 'Europe/Prague',
  } = state || {};
  const { date, minutes, dow } = localParts(now, timeZone);
  const isLogged = (due) => logged.includes(due.id);
  const today = dueOn(date, schedule, moves).filter((d) => !isLogged(d));
  const yesterday = dueOn(addDays(date, -1), schedule, moves).filter((d) => !isLogged(d));
  const out = [];

  const window = (name) => {
    const t = toMin(times[name] || DEFAULT_TIMES[name]);
    return minutes >= t && minutes < t + MAX_LATE_MIN;
  };
  const add = (name, title, body) => {
    const key = `${date}:${name}`;
    if (window(name) && !sent.has(key)) out.push({ key, title, body });
  };

  const morning = today.filter((d) => d.slot === 'am');
  if (morning.length) {
    add('morning', `Today: ${morning.map((d) => label(d.type)).join(' + ')}`,
      'Do it this morning. Log it or it counts as a miss.');
  }

  const owed = [...debts];
  if (yesterday.length || owed.length) {
    const lines = [];
    if (yesterday.length) {
      const tasks = yesterday.flatMap((d) => penaltyTasks(d.type, penalties));
      lines.push(`${yesterday.map((d) => label(d.type)).join(' + ')} not logged. Until 12:00, then you owe: ${tasks.join(', ')}.`);
    }
    if (owed.length) lines.push(`Unpaid: ${owed.join(' · ')}. Streak frozen.`);
    add('debt', yesterday.length ? 'Yesterday is not logged' : `You owe ${owed.length} penalt${owed.length === 1 ? 'y' : 'ies'}`,
      lines.join(' '));
  }

  if (today.some((d) => d.type === 'tkd-club')) {
    add('club', 'Ge-Baek at 18:00', 'Bus leaves 17:30. Pack your dobok.');
  }

  if (today.length) {
    add('evening', `Not logged: ${today.map((d) => label(d.type)).join(' + ')}`,
      'Log it now or it becomes a miss tomorrow at 12:00.');
  }

  if (dow === 0 && verdict) {
    add('weekly', 'Weekly verdict', verdict);
  }

  return out;
}

// Keys older than `keepDays` can be dropped from the sent set.
export function pruneSent(sent, now, keepDays = 3, timeZone = 'Europe/Prague') {
  const cutoff = addDays(localParts(now, timeZone).date, -keepDays);
  return [...sent].filter((k) => k.slice(0, 10) >= cutoff);
}

