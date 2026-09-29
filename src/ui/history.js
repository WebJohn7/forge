// Browser-only. Everything logged, newest first. Tap a session to edit it.

import { SESSION_TYPES } from '../schedule.js';
import { tonnage, pace, formatPace } from '../stats.js';
import { esc, prettyDate, chip } from './dom.js';

const TABS = { sessions: 'Sessions', weight: 'Weight', debts: 'Penalties' };
const label = (type) => SESSION_TYPES[type]?.label || (type === 'penalty' ? 'Penalty workout' : 'Extra session');

function summary(s) {
  const bits = [];
  if (s.exercises?.length) bits.push(`${s.exercises.length} lifts · ${Math.round(tonnage(s)).toLocaleString('en-GB')} kg`);
  if (s.run?.distanceKm) bits.push(`${s.run.distanceKm} km @ ${formatPace(pace(s.run))}${s.run.intervals ? ' · intervals' : ''}`);
  if (s.tkd?.focus) bits.push(s.tkd.focus);
  if (s.durationMin) bits.push(`${s.durationMin} min`);
  if (s.rpe) bits.push(`RPE ${s.rpe}`);
  return bits.join(' · ') || s.notes || '';
}

export function renderHistory(root, { d, data, actions }) {
  const tab = renderHistory.tab || 'sessions';
  let body = '';

  if (tab === 'sessions') {
    const late = new Set(d.entries.filter((e) => e.status === 'late').map((e) => e.log.id));
    const list = data.sessions.slice().sort((a, b) => b.date.localeCompare(a.date) || b.loggedAt.localeCompare(a.loggedAt));
    body = list.length ? list.map((s) => `<div class="list-item"><button class="link" data-edit="${esc(s.id)}">
        <div class="card-title" style="font-size:16px">${esc(label(s.type))}</div>
        <div class="card-sub">${esc(prettyDate(s.date, d.today))}${summary(s) ? ` · ${esc(summary(s))}` : ''}</div></button>
        ${late.has(s.id) ? chip('late') : ''}</div>`).join('') : '<p class="muted">Nothing logged yet.</p>';
  } else if (tab === 'weight') {
    const list = data.bodyweight.slice().sort((a, b) => b.date.localeCompare(a.date));
    body = list.length ? list.map((b) => `<div class="list-item"><span>${esc(prettyDate(b.date, d.today))}</span>
        <span class="num">${esc(b.kg)} kg <button class="icon-btn" data-del-w="${esc(b.date)}" aria-label="Delete weigh-in">×</button></span></div>`).join('')
      : '<p class="muted">No weigh-ins yet.</p>';
  } else {
    const list = d.debts.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    body = list.length ? list.map((x) => `<div class="list-item"><div>
        <div class="card-title" style="font-size:16px">${esc(x.task)}</div>
        <div class="card-sub">missed ${esc(label(x.missedType))}, ${esc(prettyDate(x.missedDate, d.today))}${x.paidAt ? ` · paid ${esc(prettyDate(x.paidAt.slice(0, 10), d.today))}` : ''}</div></div>
        ${chip(x.paidAt ? 'good' : 'bad', x.paidAt ? 'Paid' : 'Owed')}</div>`).join('')
      : '<p class="muted">No penalties. Keep it that way.</p>';
  }

  root.innerHTML = `<h1>History</h1>
    <div class="seg" role="group" aria-label="View">${Object.entries(TABS).map(([k, v]) =>
      `<button type="button" data-tab="${k}" aria-pressed="${tab === k}">${v}</button>`).join('')}</div>
    <div class="card">${body}</div>`;

  root.onclick = async (ev) => {
    const t = ev.target.closest('[data-tab]');
    if (t) { renderHistory.tab = t.dataset.tab; return renderHistory(root, { d, data, actions }); }
    const e = ev.target.closest('[data-edit]');
    if (e) { location.hash = `#log?edit=${encodeURIComponent(e.dataset.edit)}`; return; }
    const w = ev.target.closest('[data-del-w]');
    if (w) await actions.deleteWeight(w.dataset.delW);
  };
}
