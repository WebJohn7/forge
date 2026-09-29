// PURE. Misses → penalty debt, debt payoff, streak, discipline score.

import { SESSION_TYPES, graceEnd, effectiveDate, isComplete, dateRange, toISO, addDays } from './schedule.js';

export const DEFAULT_PENALTIES = {
  tkd: '100 burpees + 20 min shadow-boxing',
  gym: '150 push-ups + 150 squats',
  run: '5 km run',
};

export const SCORE = {
  start: 100,
  miss: -15,
  done: +3,
  debtPerDay: -2,
  redBelow: 70,
};

// Penalty tasks owed for one missed session type (the Sunday combo owes both parts).
export function penaltyTasks(type, penalties = DEFAULT_PENALTIES) {
  const meta = SESSION_TYPES[type];
  if (!meta) return [];
  const kinds = meta.kind === 'combo' ? meta.parts : [meta.kind];
  return kinds.map((k) => penalties[k]).filter(Boolean);
}

// New debts for every missed entry that does not have one yet. Idempotent: keyed by due id.
// Debt timestamps are the moment the miss became final (end of the grace window).
export function newDebts(entries, existingDebts, penalties = DEFAULT_PENALTIES) {
  const have = new Set(existingDebts.map((d) => d.dueId));
  const out = [];
  for (const e of entries) {
    if (e.status !== 'missed' || have.has(e.id)) continue;
    penaltyTasks(e.type, penalties).forEach((task, i) => {
      out.push({
        id: `debt:${e.id}:${i}`,
        dueId: e.id,
        missedDate: effectiveDate(e),
        missedType: e.type,
        task,
        createdAt: graceEnd(effectiveDate(e)).toISOString(),
        paidAt: null,
      });
    });
  }
  return out;
}

export const unpaid = (debts) => debts.filter((d) => !d.paidAt);

// Pay the oldest unpaid debt. Returns a new array; the paid debt gets `paidAt` and `paidBy`.
export function payOldest(debts, paidAt, paidBy = null) {
  const open = unpaid(debts).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  if (!open.length) return debts;
  const target = open[0].id;
  return debts.map((d) => (d.id === target ? { ...d, paidAt, paidBy } : d));
}

function debtOpenAt(debt, t) {
  return new Date(debt.createdAt) <= t && (!debt.paidAt || new Date(debt.paidAt) > t);
}

// Chronological list of finished (complete or missed) entries.
function settled(entries) {
  return entries
    .filter((e) => isComplete(e) || e.status === 'missed')
    .sort((a, b) => effectiveDate(a).localeCompare(effectiveDate(b)) || (a.slot || '').localeCompare(b.slot || ''));
}

// Consecutive completed sessions since the last miss. A session completed while any
// debt was open does not add to the streak.
export function streak(entries, debts) {
  let n = 0;
  for (const e of settled(entries)) {
    if (e.status === 'missed') { n = 0; continue; }
    const at = new Date(e.log.loggedAt);
    if (debts.some((d) => debtOpenAt(d, at))) continue;
    n += 1;
  }
  return n;
}

export function longestStreak(entries, debts) {
  let n = 0, best = 0;
  for (const e of settled(entries)) {
    if (e.status === 'missed') { n = 0; continue; }
    if (debts.some((d) => debtOpenAt(d, new Date(e.log.loggedAt)))) continue;
    best = Math.max(best, ++n);
  }
  return best;
}

// Discipline score walked day by day from startDate to now. Per day: apply that day's
// completed sessions (+3) and misses (−15), then −2 for each debt open at the end of the day.
// Clamped to [0, 100]. Returns { score, history: [{date, score}] }.
export function disciplineScore({ entries, debts, startDate, now }) {
  const today = toISO(now);
  const byDay = new Map();
  for (const e of entries) {
    const d = effectiveDate(e);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(e);
  }
  let score = SCORE.start;
  const history = [];
  for (const day of dateRange(startDate, today)) {
    for (const e of byDay.get(day) || []) {
      if (isComplete(e)) score += SCORE.done;
      else if (e.status === 'missed') score += SCORE.miss;
      score = Math.min(SCORE.start, Math.max(0, score));
    }
    // Debt decay counts only for days that have fully ended.
    if (day < today) {
      const eod = new Date(`${addDays(day, 1)}T00:00:00`);
      const open = debts.filter((d) => debtOpenAt(d, eod)).length;
      score = Math.max(0, score + open * SCORE.debtPerDay);
    }
    history.push({ date: day, score });
  }
  return { score, history };
}
