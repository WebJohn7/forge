// Browser-only. Today: what is due, what you owe, one tap to log.

import { SESSION_TYPES, DAY_NAMES, dueOn, addDays, dayOfWeek, isValidMove, RULES, graceEnd, effectiveDate } from '../schedule.js';
import { SCORE } from '../penalties.js';
import { weightAvg7 } from '../stats.js';
import { esc, chip, prettyDate } from './dom.js';

const label = (type) => SESSION_TYPES[type]?.label || type;

// The Thursday a session due on `iso` may be moved to (the one after it), if the rules allow.
function moveTarget(entry, now) {
  if (entry.movedTo) return null;
  for (let i = 1; i <= 6; i++) {
    const to = addDays(entry.date, i);
    if (dayOfWeek(to) === RULES.moveTargetDow) {
      return isValidMove({ fromDate: entry.date, type: entry.type, toDate: to }, now) ? to : null;
    }
  }
  return null;
}

export function renderToday(root, { d, data, actions, now }) {
  const { today, settings } = d;
  const parts = [];

  parts.push(`<h1>${prettyDate(today, today)}, ${new Date(`${today}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long' })}</h1>`);

  // Score strip
  const red = d.score < SCORE.redBelow;
  parts.push(`<div class="tiles">
    <div class="tile ${red ? 'bad' : ''}"><div class="tile-label">Discipline</div><div class="tile-value num">${d.score}</div>
      <div class="tile-note">${red ? 'Below 70. Earn it back.' : 'out of 100'}</div></div>
    <div class="tile ${d.openDebts.length ? 'bad' : ''}"><div class="tile-label">Streak</div><div class="tile-value num">${d.streak}</div>
      <div class="tile-note">${d.openDebts.length ? 'Frozen — debt unpaid' : `best ${d.bestStreak}`}</div></div>
  </div>`);

  // Debt
  if (d.openDebts.length) {
    parts.push(`<h2>You owe</h2><div class="card alert">
      ${d.openDebts.map((x) => `<div class="card-row"><div><div class="card-title">${esc(x.task)}</div>
        <div class="card-sub">for ${esc(label(x.missedType))}, ${esc(prettyDate(x.missedDate, today))}</div></div></div>`).join('<hr style="border:0;border-top:1px solid var(--line);margin:10px 0">')}
      <div class="btn-row"><a class="btn primary block" href="#log?penalty=1">Log penalty — pays the oldest</a></div>
    </div>`);
  }

  // Overdue from yesterday
  for (const e of d.overdue) {
    const left = Math.max(0, Math.round((graceEnd(effectiveDate(e)) - now) / 60000));
    parts.push(`<div class="card alert"><div class="card-row"><div>
      <div class="card-title">${esc(label(e.type))} — not logged</div>
      <div class="card-sub">${prettyDate(effectiveDate(e), today)}. ${Math.floor(left / 60)} h ${left % 60} min until it's a miss.</div></div>${chip('overdue')}</div>
      <div class="btn-row"><a class="btn primary" href="#log?due=${encodeURIComponent(e.id)}">Log it</a></div></div>`);
  }

  // Today
  parts.push('<h2>Today</h2>');
  if (!d.todayEntries.length) {
    parts.push(`<div class="card"><div class="card-title">Rest day</div>
      <div class="card-sub">${dayOfWeek(today) === 4 ? 'Thursday. Recover — sleep, stretch, eat.' : 'Nothing scheduled.'}</div></div>`);
  }
  for (const e of d.todayEntries) {
    const done = e.status === 'done' || e.status === 'late';
    const target = !done ? moveTarget(e, now) : null;
    const when = e.movedTo ? `moved from ${prettyDate(e.date, today)}` : e.time ? `at ${e.time}` : e.slot === 'am' ? 'morning' : 'evening';
    parts.push(`<div class="card"><div class="card-row"><div>
      <div class="card-title">${esc(label(e.type))}</div><div class="card-sub">${esc(when)}</div></div>${chip(e.status)}</div>
      <div class="btn-row">
        ${done ? `<a class="btn small" href="#log?edit=${encodeURIComponent(e.log.id)}">Edit log</a>`
          : `<a class="btn primary" href="#log?due=${encodeURIComponent(e.id)}">Log it</a>`}
        ${target ? `<button class="btn small" data-move="${esc(e.id)}" data-to="${target}">Move to Thu ${prettyDate(target, today)}</button>` : ''}
      </div></div>`);
  }

  // Weigh-in
  const todayW = data.bodyweight.find((b) => b.date === today);
  const avg = weightAvg7(data.bodyweight, today);
  parts.push(`<h2>Weigh-in</h2><form class="card" id="weigh">
    <div class="card-row" style="align-items:flex-end">
      <label class="field" style="flex:1;margin:0"><span>Morning weight (kg)</span>
        <input type="number" inputmode="decimal" step="0.1" min="30" max="150" name="kg" value="${todayW ? todayW.kg : ''}" placeholder="68.0" required></label>
      <button class="btn primary" type="submit">${todayW ? 'Update' : 'Save'}</button>
    </div>
    <div class="hint" style="margin-top:8px">7-day average: ${avg ?? '–'} kg · limit ${settings.weightLimit} kg</div>
  </form>`);

  // Rest of the week
  const rows = [];
  for (let i = 1; i <= 6; i++) {
    const day = addDays(today, i);
    const due = dueOn(day, settings.schedule, data.moves);
    rows.push(`<div class="list-item"><span class="secondary">${DAY_NAMES[dayOfWeek(day)]} ${prettyDate(day, today) === 'Tomorrow' ? '(tomorrow)' : ''}</span>
      <span>${due.length ? due.map((x) => esc(label(x.type))).join(' + ') : '<span class="muted">rest</span>'}</span></div>`);
  }
  parts.push(`<h2>Coming up</h2><div class="card">${rows.join('')}</div>`);

  root.innerHTML = parts.join('');

  root.querySelector('#weigh').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const kg = parseFloat(new FormData(ev.target).get('kg'));
    if (kg > 0) await actions.saveWeight(today, kg);
  });
  root.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', async () => {
    const [fromDate, type] = [b.dataset.move.slice(0, 10), b.dataset.move.slice(11)];
    await actions.addMove({ fromDate, type, toDate: b.dataset.to });
  }));
}
