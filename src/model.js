// PURE. One function that turns the stored data into everything the screens show.

import { DEFAULT_SCHEDULE, evaluate, toISO, addDays, effectiveDate, isComplete } from './schedule.js';
import { DEFAULT_PENALTIES, newDebts, unpaid, streak, longestStreak, disciplineScore } from './penalties.js';
import { analyze, weeklyVerdict } from './feedback.js';

export const DEFAULT_SETTINGS = {
  startDate: null,            // first day the rules apply; set on first launch
  watchWeight: false,         // weight-category tracking; off while there are no competitions
  weightLimit: 69,
  penalties: DEFAULT_PENALTIES,
  schedule: DEFAULT_SCHEDULE,
  lifts: {
    'gym-lower': ['Squat', 'Romanian deadlift', 'Bulgarian split squat', 'Calf raise'],
    'gym-upper': ['Bench press', 'Pull-up', 'Overhead press', 'Barbell row'],
    'sunday-combo': ['Deadlift', 'Front squat', 'Dips', 'Chin-up'],
  },
  push: { workerUrl: '', token: '' },
};

export function withDefaults(settings) {
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  s.penalties = { ...DEFAULT_PENALTIES, ...(settings?.penalties || {}) };
  s.lifts = { ...DEFAULT_SETTINGS.lifts, ...(settings?.lifts || {}) };
  s.push = { ...DEFAULT_SETTINGS.push, ...(settings?.push || {}) };
  return s;
}

// Returns derived state plus `createdDebts` — debts the caller must persist.
export function compute({ sessions = [], bodyweight = [], debts = [], moves = [], settings, now }) {
  const s = withDefaults(settings);
  const today = toISO(now);
  const startDate = s.startDate || today;
  const entries = evaluate({ startDate, now, sessions, schedule: s.schedule, moves });
  const createdDebts = newDebts(entries, debts, s.penalties);
  const allDebts = [...debts, ...createdDebts];
  const open = unpaid(allDebts).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const { score, history } = disciplineScore({ entries, debts: allDebts, startDate, now });
  const findings = analyze({ entries, sessions, bodyweight, debts: allDebts, today, weightLimit: s.watchWeight ? s.weightLimit : null });
  return {
    settings: s,
    today,
    startDate,
    entries,
    todayEntries: entries.filter((e) => effectiveDate(e) === today),
    overdue: entries.filter((e) => e.status === 'overdue'),
    createdDebts,
    debts: allDebts,
    openDebts: open,
    streak: streak(entries, allDebts),
    bestStreak: longestStreak(entries, allDebts),
    score,
    scoreHistory: history,
    findings,
    verdict: weeklyVerdict({ entries, findings, today }),
    missedTotal: entries.filter((e) => e.status === 'missed').length,
    doneTotal: entries.filter(isComplete).length,
  };
}

// What the notification Worker needs to know. Kept small: last 3 days of logged ids.
export function pushState(derived, moves) {
  const from = addDays(derived.today, -3);
  return {
    schedule: derived.settings.schedule,
    penalties: derived.settings.penalties,
    moves: moves.filter((m) => m.toDate >= from || m.fromDate >= from),
    logged: derived.entries.filter((e) => e.log && effectiveDate(e) >= from).map((e) => e.id),
    debts: derived.openDebts.map((d) => d.task),
    verdict: derived.verdict.headline,
    timeZone: 'Europe/Prague',
  };
}
