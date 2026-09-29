// PURE. Week template, what is due on a date, and the status of every due session.
// No DOM, no Date.now() — callers pass `now` in. Dates are local 'YYYY-MM-DD' strings.

export const SESSION_TYPES = {
  'run':          { label: 'Run',                 kind: 'run',   parts: ['run'] },
  'tkd-club':     { label: 'TKD club (Ge-Baek)',  kind: 'tkd',   parts: ['tkd'] },
  'gym-lower':    { label: 'Lower-body gym',      kind: 'gym',   parts: ['gym'] },
  'gym-upper':    { label: 'Upper-body gym',      kind: 'gym',   parts: ['gym'] },
  'tkd-home':     { label: 'TKD at home',         kind: 'tkd',   parts: ['tkd'] },
  'sunday-combo': { label: 'Full-body + TKD',     kind: 'combo', parts: ['gym', 'tkd'] },
};

// Keyed by JS getDay(): 0 = Sunday … 6 = Saturday.
export const DEFAULT_SCHEDULE = {
  0: [{ type: 'sunday-combo', slot: 'am' }],
  1: [{ type: 'run', slot: 'am' }, { type: 'tkd-club', slot: 'pm', time: '18:00' }],
  2: [{ type: 'gym-lower', slot: 'am' }],
  3: [{ type: 'tkd-club', slot: 'pm', time: '18:00' }],
  4: [],
  5: [{ type: 'gym-upper', slot: 'am' }],
  6: [{ type: 'tkd-home', slot: 'am' }],
};

export const RULES = {
  graceHour: 12,     // a session may still be logged until 12:00 the next day (flagged late)
  moveTargetDow: 4,  // sessions may only be moved onto Thursday
};

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---- date helpers (local time) ----

const pad = (n) => String(n).padStart(2, '0');

export function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function dayOfWeek(iso) {
  return parseISO(iso).getDay();
}

// Monday of the week containing `iso`.
export function weekStart(iso) {
  const dow = dayOfWeek(iso);
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
}

export function daysBetween(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}

export function dateRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// End of the grace window for a session due on `iso`: 12:00 the next day.
export function graceEnd(iso) {
  const d = parseISO(addDays(iso, 1));
  d.setHours(RULES.graceHour, 0, 0, 0);
  return d;
}

function endOfDay(iso) {
  const d = parseISO(iso);
  d.setHours(23, 59, 59, 999);
  return d;
}

// ---- due sessions ----

export const dueId = (date, type) => `${date}:${type}`;

// A move: { fromDate, type, toDate }. Valid only onto the move target day, declared before
// the original day ended, and not into the past relative to the declaration.
export function isValidMove(move, declaredAt) {
  if (dayOfWeek(move.toDate) !== RULES.moveTargetDow) return false;
  if (declaredAt > endOfDay(move.fromDate)) return false;
  return Math.abs(daysBetween(move.fromDate, move.toDate)) <= 6;
}

export function dueOn(iso, schedule = DEFAULT_SCHEDULE, moves = []) {
  const out = [];
  for (const s of schedule[dayOfWeek(iso)] || []) {
    const moved = moves.find((m) => m.fromDate === iso && m.type === s.type);
    if (!moved) out.push({ id: dueId(iso, s.type), date: iso, type: s.type, slot: s.slot, time: s.time });
  }
  for (const m of moves) {
    if (m.toDate === iso) out.push({ id: dueId(m.fromDate, m.type), date: m.fromDate, type: m.type,
      slot: 'am', movedTo: iso });
  }
  return out;
}

// The day a due entry must actually be done on (its own date, or the day it was moved to).
export const effectiveDate = (due) => due.movedTo || due.date;

// Find the log that satisfies a due entry: same scheduled date and type.
export function matchSession(due, sessions) {
  return sessions.find((s) => s.date === due.date && s.type === due.type) || null;
}

// done | late | pending (today, not yet) | overdue (grace window) | missed | upcoming
export function statusOf(due, sessions, now) {
  const log = matchSession(due, sessions);
  const day = effectiveDate(due);
  if (log) {
    return new Date(log.loggedAt) > endOfDay(day) ? 'late' : 'done';
  }
  const today = toISO(now);
  if (day > today) return 'upcoming';
  if (day === today) return 'pending';
  return now < graceEnd(day) ? 'overdue' : 'missed';
}

// Every due entry from `startDate` through today (inclusive), with status and matched log.
export function evaluate({ startDate, now, sessions = [], schedule = DEFAULT_SCHEDULE, moves = [] }) {
  const today = toISO(now);
  const out = [];
  for (const day of dateRange(startDate, today)) {
    for (const due of dueOn(day, schedule, moves)) {
      if (due.date < startDate) continue;
      out.push({ ...due, status: statusOf(due, sessions, now), log: matchSession(due, sessions) });
    }
  }
  return out;
}

export const isComplete = (e) => e.status === 'done' || e.status === 'late';
