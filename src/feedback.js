// PURE. Rules engine: turns the log into blunt, ranked verdicts, each with a concrete fix.
// weightLimit: null turns all weight findings off.
// A finding: { level: 'bad'|'warn'|'good', area, title, detail, fix }.

import { SESSION_TYPES, addDays, weekStart, effectiveDate, isComplete } from './schedule.js';
import { liftNames, liftHistory, weeklyTonnage, runHistory, formatPace, weightAvg7,
  weightTrendPerWeek, avgRpe, adherencePct } from './stats.js';
import { unpaid } from './penalties.js';

export const THRESHOLDS = {
  progressPct: 2,        // best e1RM up this much (4 wk vs previous 4) = progressing
  regressPct: -3,
  stallSessions: 3,      // no new best in this many sessions of a lift = stalled
  volumeSpikePct: 30,
  volumeDropPct: -20,
  rpeHigh: 9,
  rpeLow: 5,
  paceWorsePct: 3,
  intervalGapDays: 21,
  weightMarginKg: 0.5,
  weightRisePerWeek: 0.3,
  adherenceGood: 95,
  adherenceOk: 80,
};

const RANK = { bad: 0, warn: 1, good: 2 };
const pct = (a, b) => (b ? ((a - b) / b) * 100 : 0);
const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);

function strength(sessions, today, T) {
  const out = [];
  const recentFrom = addDays(today, -27), prevFrom = addDays(today, -55);
  for (const name of liftNames(sessions).slice(0, 6)) {
    const h = liftHistory(sessions, name);
    const recent = h.filter((p) => p.date >= recentFrom);
    const prev = h.filter((p) => p.date >= prevFrom && p.date < recentFrom);
    if (!recent.length) continue;
    const bestRecent = Math.max(...recent.map((p) => p.e1rm));
    if (prev.length) {
      const change = pct(bestRecent, Math.max(...prev.map((p) => p.e1rm)));
      if (change >= T.progressPct) {
        out.push({ level: 'good', area: 'Strength', title: `${name}: progressing (+${f1(change)} %)`,
          detail: `Estimated 1RM ${f1(bestRecent)} kg over the last 4 weeks.`,
          fix: 'Keep adding 1–2.5 kg or a rep each session.' });
        continue;
      }
      if (change <= T.regressPct) {
        out.push({ level: 'bad', area: 'Strength', title: `${name}: going backwards (${f1(change)} %)`,
          detail: `Estimated 1RM dropped to ${f1(bestRecent)} kg.`,
          fix: 'Check sleep and food first. If both are fine, deload 10 % for a week and rebuild.' });
        continue;
      }
    }
    const n = T.stallSessions;
    if (h.length > n) {
      const before = Math.max(...h.slice(0, -n).map((p) => p.e1rm));
      const lastN = Math.max(...h.slice(-n).map((p) => p.e1rm));
      if (lastN <= before) {
        out.push({ level: 'warn', area: 'Strength', title: `${name}: stalled`,
          detail: `No new best in the last ${n} sessions (best ${f1(before)} kg e1RM).`,
          fix: 'Change the stimulus: drop 10 % and switch rep range (e.g. 5×5 → 4×8) for 3 weeks.' });
      }
    }
  }
  return out;
}

function volume(sessions, today, T) {
  // Compare the last two completed weeks, not the week in progress.
  const weeks = weeklyTonnage(sessions, addDays(weekStart(today), -1), 2);
  const [prev, last] = weeks;
  if (!prev.tonnage || !last.tonnage) return [];
  const change = pct(last.tonnage, prev.tonnage);
  if (change > T.volumeSpikePct) {
    return [{ level: 'warn', area: 'Volume', title: `Volume jumped ${Math.round(change)} %`,
      detail: `${last.tonnage} kg last week vs ${prev.tonnage} kg the week before.`,
      fix: 'Jumps over 30 % are how people get hurt. Add at most 10 % per week.' }];
  }
  if (change < T.volumeDropPct) {
    return [{ level: 'warn', area: 'Volume', title: `Volume fell ${Math.round(-change)} %`,
      detail: `${last.tonnage} kg last week vs ${prev.tonnage} kg the week before.`,
      fix: 'Unless this was a planned deload, you did less work. Get the sets back.' }];
  }
  return [];
}

function effort(sessions, today, T) {
  const from = addDays(today, -13);
  const n = sessions.filter((s) => s.date >= from && s.date <= today && s.rpe > 0).length;
  if (n < 3) return [];
  const r = avgRpe(sessions, from, today);
  if (r >= T.rpeHigh) {
    return [{ level: 'warn', area: 'Recovery', title: `Average RPE ${r} for two weeks`,
      detail: 'Everything is near-max. That is not sustainable on 7 sessions a week.',
      fix: 'Make Saturday TKD technical and light, sleep 8 h before club days.' }];
  }
  if (r <= T.rpeLow) {
    return [{ level: 'bad', area: 'Effort', title: `Average RPE ${r} — you're coasting`,
      detail: 'Showing up is not the same as training.',
      fix: 'Every session needs at least one set or round that ends at RPE 8+.' }];
  }
  return [];
}

function running(sessions, today, T) {
  const out = [];
  const runs = runHistory(sessions).filter((r) => r.date >= addDays(today, -55));
  const steady = runs.filter((r) => !r.intervals);
  if (steady.length >= 4) {
    const last = steady.slice(-3), prev = steady.slice(-6, -3);
    const avg = (xs) => xs.reduce((a, r) => a + r.pace, 0) / xs.length;
    const change = pct(avg(last), avg(prev)); // positive = slower
    if (change > T.paceWorsePct) {
      out.push({ level: 'warn', area: 'Running', title: `Runs are ${f1(change)} % slower`,
        detail: `Recent pace ${formatPace(avg(last))}/km vs ${formatPace(avg(prev))}/km before.`,
        fix: 'Monday run comes before club training — keep it, but push the second half.' });
    } else if (change < -T.paceWorsePct) {
      out.push({ level: 'good', area: 'Running', title: `Pace improved ${f1(-change)} %`,
        detail: `Now ${formatPace(avg(last))}/km.`, fix: 'Keep it going.' });
    }
  }
  const lastIntervals = runs.filter((r) => r.intervals).map((r) => r.date).pop();
  if (runs.length && (!lastIntervals || lastIntervals < addDays(today, -T.intervalGapDays))) {
    out.push({ level: 'warn', area: 'Running', title: 'No interval work in 3 weeks',
      detail: 'TKD rounds are anaerobic. Steady runs alone do not train that.',
      fix: 'Make one Monday run a month 8 × 30 s hard / 90 s easy.' });
  }
  return out;
}

function weight(bodyweight, today, limit, T) {
  const avg = weightAvg7(bodyweight, today);
  if (avg == null) {
    return bodyweight.length ? [] : [{ level: 'warn', area: 'Weight', title: 'No weigh-ins',
      detail: `You fight in the ≤ ${limit} kg category and you're not tracking it.`,
      fix: 'Weigh in every morning after the toilet, before food.' }];
  }
  const trend = weightTrendPerWeek(bodyweight, today);
  if (avg > limit) {
    return [{ level: 'bad', area: 'Weight', title: `7-day average ${avg} kg — over ${limit}`,
      detail: `You are ${f1(avg - limit)} kg over your category.`,
      fix: 'Cut slowly: ~0.5 kg/week, no crash cut. Start with less sugar and drinks.' }];
  }
  if (limit - avg < T.weightMarginKg) {
    return [{ level: 'warn', area: 'Weight', title: `Only ${f1(limit - avg)} kg under the limit`,
      detail: `7-day average ${avg} kg.`, fix: 'No margin for a competition week. Hold, don\'t gain.' }];
  }
  if (trend != null && trend > T.weightRisePerWeek) {
    return [{ level: 'warn', area: 'Weight', title: `Gaining ${trend} kg/week`,
      detail: `7-day average ${avg} kg, limit ${limit} kg.`,
      fix: `At this rate you hit ${limit} kg in ~${Math.max(1, Math.round((limit - avg) / trend))} weeks.` }];
  }
  return [{ level: 'good', area: 'Weight', title: `Weight on target (${avg} kg)`,
    detail: `${f1(limit - avg)} kg under the ${limit} kg limit.`, fix: 'Keep weighing in daily.' }];
}

function adherence(entries, today, T) {
  const out = [];
  const recent = entries.filter((e) => effectiveDate(e) >= addDays(today, -27));
  const p = adherencePct(recent);
  if (p != null) {
    const level = p >= T.adherenceGood ? 'good' : p >= T.adherenceOk ? 'warn' : 'bad';
    const title = level === 'good' ? `${p} % of sessions done (4 weeks)`
      : level === 'warn' ? `${p} % adherence — holes in the plan` : `${p} % adherence — this isn't a plan, it's a wish`;
    out.push({ level, area: 'Adherence', title,
      detail: `${recent.filter(isComplete).length} done, ${recent.filter((e) => e.status === 'missed').length} missed.`,
      fix: level === 'good' ? 'Nothing to fix. Keep it boring.' : 'Look at which session you skip and fix the reason, not the symptom.' });
  }
  // Repeat offender: a session type missed in 2+ of the last 3 weeks.
  const wk = weekStart(today);
  for (const type of Object.keys(SESSION_TYPES)) {
    let weeksMissed = 0;
    for (let i = 1; i <= 3; i++) {
      const from = addDays(wk, -7 * i), to = addDays(from, 6);
      if (entries.some((e) => e.type === type && e.status === 'missed' && effectiveDate(e) >= from && effectiveDate(e) <= to)) weeksMissed++;
    }
    if (weeksMissed >= 2) {
      out.push({ level: 'bad', area: 'Adherence', title: `You keep skipping ${SESSION_TYPES[type].label}`,
        detail: `Missed in ${weeksMissed} of the last 3 weeks.`,
        fix: 'Pattern, not accident. Move it to a time you can actually keep — or admit it and change the plan.' });
    }
  }
  return out;
}

function debt(debts) {
  const open = unpaid(debts);
  if (!open.length) return [];
  return [{ level: 'bad', area: 'Debt', title: `You owe ${open.length} penalt${open.length === 1 ? 'y' : 'ies'}`,
    detail: open.map((d) => d.task).join(' · '), fix: 'Your streak is frozen until it is paid. Do it today.' }];
}

export function analyze({ entries = [], sessions = [], bodyweight = [], debts = [], today, weightLimit = 69, thresholds = {} }) {
  const T = { ...THRESHOLDS, ...thresholds };
  const findings = [
    ...debt(debts),
    ...adherence(entries, today, T),
    ...strength(sessions, today, T),
    ...volume(sessions, today, T),
    ...effort(sessions, today, T),
    ...running(sessions, today, T),
    ...(weightLimit == null ? [] : weight(bodyweight, today, weightLimit, T)),
  ];
  return findings.sort((a, b) => RANK[a.level] - RANK[b.level]);
}

// One-line verdict for the last completed week + the top 3 fixes.
export function weeklyVerdict({ entries = [], findings = [], today }) {
  const from = addDays(weekStart(today), -7), to = addDays(from, 6);
  const wk = entries.filter((e) => effectiveDate(e) >= from && effectiveDate(e) <= to);
  const done = wk.filter(isComplete).length;
  const missed = wk.filter((e) => e.status === 'missed').length;
  const bad = findings.filter((f) => f.level === 'bad').length;
  let headline;
  if (!done && !missed) headline = 'No data for last week yet.';
  else if (missed === 0 && bad === 0) headline = `Solid week. ${done}/${done} sessions.`;
  else if (missed === 0) headline = `All ${done} sessions done — but the numbers have problems.`;
  else if (missed === 1) headline = `${done}/${done + missed}. One miss. Pay it and move on.`;
  else if (missed <= 3) headline = `${done}/${done + missed}. Not good enough for a black belt.`;
  else headline = `${done}/${done + missed}. You're lying to yourself.`;
  const fixes = findings.filter((f) => f.level !== 'good').slice(0, 3).map((f) => f.fix);
  return { from, to, done, missed, headline, fixes };
}
