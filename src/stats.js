// PURE. Numbers derived from the log: strength, volume, adherence, running, bodyweight.

import { weekStart, addDays, isComplete, effectiveDate, daysBetween } from './schedule.js';

// Estimated one-rep max (Epley). Sets above 12 reps are too noisy to count.
export function e1rm(kg, reps) {
  if (!(kg > 0) || !(reps > 0) || reps > 12) return 0;
  return reps === 1 ? kg : kg * (1 + reps / 30);
}

const round1 = (x) => Math.round(x * 10) / 10;

// Normalised exercise name so "Bench press" and "bench  Press " are the same lift.
export const liftKey = (name) => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');

export function sessionsWithLifts(sessions) {
  return sessions.filter((s) => Array.isArray(s.exercises) && s.exercises.length);
}

// Every lift name seen, most frequently trained first.
export function liftNames(sessions) {
  const count = new Map(), display = new Map();
  for (const s of sessionsWithLifts(sessions)) {
    for (const ex of s.exercises) {
      const k = liftKey(ex.name);
      if (!k) continue;
      count.set(k, (count.get(k) || 0) + 1);
      if (!display.has(k)) display.set(k, ex.name.trim());
    }
  }
  return [...count.keys()].sort((a, b) => count.get(b) - count.get(a)).map((k) => display.get(k));
}

// [{date, e1rm, topSet:{kg,reps}}] — best estimated 1RM per session for one lift, by date.
export function liftHistory(sessions, name) {
  const key = liftKey(name);
  const out = [];
  for (const s of sessionsWithLifts(sessions)) {
    let best = 0, top = null;
    for (const ex of s.exercises) {
      if (liftKey(ex.name) !== key) continue;
      for (const set of ex.sets || []) {
        const v = e1rm(+set.kg, +set.reps);
        if (v > best) { best = v; top = { kg: +set.kg, reps: +set.reps }; }
      }
    }
    if (best > 0) out.push({ date: s.date, e1rm: round1(best), topSet: top });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// Most recent sets for a lift — used to prefill the log form.
export function lastSets(sessions, name) {
  const key = liftKey(name);
  const sorted = sessionsWithLifts(sessions).slice().sort((a, b) => b.date.localeCompare(a.date));
  for (const s of sorted) {
    const ex = s.exercises.find((e) => liftKey(e.name) === key);
    if (ex && ex.sets?.length) return ex.sets.map((x) => ({ reps: +x.reps, kg: +x.kg }));
  }
  return null;
}

export function tonnage(session) {
  let t = 0;
  for (const ex of session.exercises || []) {
    for (const set of ex.sets || []) t += (+set.kg || 0) * (+set.reps || 0);
  }
  return t;
}

// [{week, tonnage}] for `weeks` weeks ending with the week containing `today`.
export function weeklyTonnage(sessions, today, weeks = 8) {
  const last = weekStart(today);
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const wk = addDays(last, -7 * i);
    const end = addDays(wk, 6);
    const t = sessions.filter((s) => s.date >= wk && s.date <= end).reduce((a, s) => a + tonnage(s), 0);
    out.push({ week: wk, tonnage: Math.round(t) });
  }
  return out;
}

// [{week, done, due, missed, pct}] over evaluated entries. Pending/upcoming don't count yet.
export function adherenceByWeek(entries, today, weeks = 8) {
  const last = weekStart(today);
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const wk = addDays(last, -7 * i);
    const end = addDays(wk, 6);
    const inWk = entries.filter((e) => effectiveDate(e) >= wk && effectiveDate(e) <= end);
    const done = inWk.filter(isComplete).length;
    const missed = inWk.filter((e) => e.status === 'missed').length;
    const due = done + missed;
    out.push({ week: wk, done, missed, due, pct: due ? Math.round((100 * done) / due) : null });
  }
  return out;
}

export function adherencePct(entries) {
  const done = entries.filter(isComplete).length;
  const due = done + entries.filter((e) => e.status === 'missed').length;
  return due ? Math.round((100 * done) / due) : null;
}

// Minutes per km.
export function pace(run) {
  if (!run || !(run.distanceKm > 0) || !(run.timeMin > 0)) return null;
  return run.timeMin / run.distanceKm;
}

export function formatPace(p) {
  if (p == null) return '–';
  const m = Math.floor(p);
  const s = Math.round((p - m) * 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
}

// [{date, pace, distanceKm, intervals}] for every logged run.
export function runHistory(sessions) {
  return sessions
    .filter((s) => s.run && pace(s.run) != null)
    .map((s) => ({ date: s.date, pace: pace(s.run), distanceKm: +s.run.distanceKm, intervals: !!s.run.intervals }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Mean of weigh-ins in the 7 days ending at `iso`, or null.
export function weightAvg7(bodyweight, iso) {
  const from = addDays(iso, -6);
  const xs = bodyweight.filter((b) => b.date >= from && b.date <= iso).map((b) => +b.kg);
  return xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}

// Least-squares slope of y per x. Points: [{x, y}]. Null with fewer than 2 distinct x.
export function slope(points) {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  let num = 0, den = 0;
  for (const p of points) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2; }
  return den ? num / den : null;
}

// Bodyweight trend in kg per week over the last `days` days.
export function weightTrendPerWeek(bodyweight, today, days = 21) {
  const from = addDays(today, -days + 1);
  const pts = bodyweight.filter((b) => b.date >= from && b.date <= today)
    .map((b) => ({ x: daysBetween(from, b.date), y: +b.kg }));
  const s = slope(pts);
  return s == null ? null : Math.round(s * 7 * 100) / 100;
}

export function avgRpe(sessions, from, to) {
  const xs = sessions.filter((s) => s.date >= from && s.date <= to && s.rpe > 0).map((s) => +s.rpe);
  return xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}
