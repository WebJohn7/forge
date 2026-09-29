// Browser-only. Log a session: pick what you are logging, fill the parts it has.

import { SESSION_TYPES, effectiveDate } from '../schedule.js';
import { lastSets } from '../stats.js';
import { esc, prettyDate, setPath } from './dom.js';

const EXTRA_KINDS = { gym: 'Gym', run: 'Run', tkd: 'TKD' };
const label = (type) => SESSION_TYPES[type]?.label || (type === 'penalty' ? 'Penalty workout' : 'Extra session');

function partsOf(model) {
  if (model.type === 'penalty') return [];
  if (model.type === 'extra') return [model.extraKind || 'gym'];
  return SESSION_TYPES[model.type]?.parts || [];
}

function blankExercises(type, settings, sessions) {
  return (settings.lifts[type] || []).map((name) => ({
    name, sets: lastSets(sessions, name) || [{ kg: '', reps: '' }, { kg: '', reps: '' }, { kg: '', reps: '' }],
  }));
}

function newModel(type, date, ctx) {
  const m = { id: null, date, type, rpe: null, durationMin: '', notes: '' };
  const parts = SESSION_TYPES[type]?.parts || [];
  if (parts.includes('gym')) m.exercises = blankExercises(type, ctx.d.settings, ctx.data.sessions);
  if (parts.includes('run')) m.run = { distanceKm: '', timeMin: '', intervals: false };
  if (parts.includes('tkd')) m.tkd = { focus: '' };
  if (type === 'tkd-club') m.durationMin = 60;
  return m;
}

// The chooser shown when you open Log without a target.
function renderPicker(root, ctx) {
  const { d } = ctx;
  const open = d.entries.filter((e) => ['pending', 'overdue'].includes(e.status));
  const items = open.map((e) => `<a class="card card-row" style="text-decoration:none" href="#log?due=${encodeURIComponent(e.id)}">
      <div><div class="card-title">${esc(label(e.type))}</div><div class="card-sub">${prettyDate(effectiveDate(e), d.today)}</div></div>
      <span class="chip ${e.status}">${e.status === 'overdue' ? 'Overdue' : 'Due'}</span></a>`);
  if (d.openDebts.length) {
    items.push(`<a class="card card-row" style="text-decoration:none" href="#log?penalty=1"><div><div class="card-title">Penalty workout</div>
      <div class="card-sub">${esc(d.openDebts[0].task)}</div></div><span class="chip missed">Owed</span></a>`);
  }
  root.innerHTML = `<h1>Log</h1>
    ${items.length ? items.join('') : '<div class="card"><div class="card-title">Nothing due right now</div><div class="card-sub">Every scheduled session is logged.</div></div>'}
    <h2>Other</h2>
    <a class="btn block" href="#log?extra=1">Extra session (off-plan)</a>`;
}

function exerciseHtml(ex, i) {
  const sets = (ex.sets || []).map((s, j) => `<div class="set-row">
      <span class="idx">${j + 1}</span>
      <input type="number" inputmode="decimal" step="0.5" min="0" placeholder="kg" aria-label="Set ${j + 1} kg" data-k="exercises.${i}.sets.${j}.kg" value="${esc(s.kg)}">
      <input type="number" inputmode="numeric" step="1" min="0" placeholder="reps" aria-label="Set ${j + 1} reps" data-k="exercises.${i}.sets.${j}.reps" value="${esc(s.reps)}">
      <button type="button" class="icon-btn" data-act="rm-set" data-i="${i}" data-j="${j}" aria-label="Remove set">×</button>
    </div>`).join('');
  return `<div class="exercise">
    <div class="exercise-head">
      <input type="text" placeholder="Exercise" aria-label="Exercise name" data-k="exercises.${i}.name" value="${esc(ex.name)}">
      <button type="button" class="icon-btn" data-act="rm-ex" data-i="${i}" aria-label="Remove exercise">×</button>
    </div>
    <div class="set-row hint"><span></span><span>kg (0 = bodyweight)</span><span>reps</span><span></span></div>
    ${sets}
    <button type="button" class="btn small" data-act="add-set" data-i="${i}">+ Set</button>
  </div>`;
}

function renderForm(root, ctx, model, meta) {
  const parts = partsOf(model);
  const html = [];
  html.push(`<h1>${esc(meta.title)}</h1><p class="secondary">${esc(meta.sub)}</p>`);
  if (model.type === 'extra') {
    html.push(`<div class="seg" role="group" aria-label="Kind">${Object.entries(EXTRA_KINDS).map(([k, v]) =>
      `<button type="button" data-act="kind" data-kind="${k}" aria-pressed="${(model.extraKind || 'gym') === k}">${v}</button>`).join('')}</div>
      <label class="field"><span>Date</span><input type="date" data-k="date" value="${esc(model.date)}" max="${ctx.d.today}"></label>`);
  }
  if (parts.includes('gym')) {
    html.push('<h2>Lifts</h2>');
    (model.exercises || []).forEach((ex, i) => html.push(exerciseHtml(ex, i)));
    html.push('<button type="button" class="btn block" data-act="add-ex">+ Exercise</button>');
  }
  if (parts.includes('run')) {
    html.push(`<h2>Run</h2><div class="grid2">
      <label class="field"><span>Distance (km)</span><input type="number" inputmode="decimal" step="0.01" min="0" data-k="run.distanceKm" value="${esc(model.run?.distanceKm)}"></label>
      <label class="field"><span>Time (min)</span><input type="number" inputmode="decimal" step="0.1" min="0" data-k="run.timeMin" value="${esc(model.run?.timeMin)}"></label></div>
      <label class="check"><input type="checkbox" data-k="run.intervals" ${model.run?.intervals ? 'checked' : ''}> Intervals / sprints</label>`);
  }
  if (parts.includes('tkd')) {
    html.push(`<h2>Taekwondo</h2><label class="field"><span>Focus</span>
      <input type="text" data-k="tkd.focus" placeholder="e.g. sparring, poomsae, kicks" value="${esc(model.tkd?.focus)}"></label>`);
  }
  html.push(`<h2>Session</h2>
    <label class="field"><span>Duration (min)</span><input type="number" inputmode="numeric" min="0" step="5" data-k="durationMin" value="${esc(model.durationMin)}"></label>
    <div class="field"><span class="hint" style="display:block;margin-bottom:5px;font-size:13px;color:var(--text-secondary);font-weight:600">Effort (RPE) — 10 = could not do one more rep</span>
      <div class="rpe" role="group" aria-label="RPE">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) =>
        `<button type="button" data-act="rpe" data-n="${n}" aria-pressed="${model.rpe === n}">${n}</button>`).join('')}</div></div>
    <label class="field" style="margin-top:12px"><span>Notes</span><textarea data-k="notes" placeholder="How did it go? Anything hurt?">${esc(model.notes)}</textarea></label>
    <div class="btn-row">
      <button type="button" class="btn primary block" data-act="save">${model.id ? 'Save changes' : 'Log it'}</button>
      ${model.id ? '<button type="button" class="btn danger block" data-act="delete">Delete</button>' : ''}
    </div>`);
  root.innerHTML = html.join('');
}

function clean(model) {
  const out = { ...model };
  out.durationMin = +model.durationMin || null;
  if (out.exercises) {
    out.exercises = model.exercises
      .map((ex) => ({ name: (ex.name || '').trim(), sets: ex.sets.filter((s) => s.reps !== '' && +s.reps > 0).map((s) => ({ kg: +s.kg || 0, reps: +s.reps })) }))
      .filter((ex) => ex.name && ex.sets.length);
  }
  if (out.run) out.run = { distanceKm: +model.run.distanceKm || 0, timeMin: +model.run.timeMin || 0, intervals: !!model.run.intervals };
  return out;
}

export function renderLog(root, ctx, params) {
  const { d, data, actions } = ctx;
  let model, meta;

  if (params.edit) {
    const s = data.sessions.find((x) => x.id === params.edit);
    if (!s) { root.innerHTML = '<h1>Not found</h1><p class="secondary">That session no longer exists.</p>'; return; }
    model = structuredClone(s);
    if (model.type === 'extra' && !model.extraKind) model.extraKind = model.run ? 'run' : model.exercises ? 'gym' : 'tkd';
    meta = { title: `Edit: ${label(s.type)}`, sub: prettyDate(s.date, d.today) };
  } else if (params.due) {
    const e = d.entries.find((x) => x.id === params.due);
    if (!e) { renderPicker(root, ctx); return; }
    if (e.log) { location.hash = `#log?edit=${encodeURIComponent(e.log.id)}`; return; }
    model = newModel(e.type, e.date, ctx);
    meta = { title: label(e.type), sub: `${prettyDate(effectiveDate(e), d.today)}${e.status === 'overdue' ? ' — late, but it still counts' : ''}` };
  } else if (params.penalty) {
    if (!d.openDebts.length) { renderPicker(root, ctx); return; }
    model = { id: null, date: d.today, type: 'penalty', rpe: null, durationMin: '', notes: '' };
    meta = { title: 'Penalty workout', sub: `Pays: ${d.openDebts[0].task}` };
  } else if (params.extra) {
    model = { id: null, date: d.today, type: 'extra', extraKind: 'gym', rpe: null, durationMin: '', notes: '', exercises: [{ name: '', sets: [{ kg: '', reps: '' }] }] };
    meta = { title: 'Extra session', sub: 'Off-plan. Counts for stats, not for the schedule.' };
  } else {
    renderPicker(root, ctx);
    return;
  }

  const redraw = () => renderForm(root, ctx, model, meta);
  redraw();

  root.oninput = root.onchange = (ev) => {
    const k = ev.target.dataset?.k;
    if (!k) return;
    setPath(model, k, ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value);
  };

  root.onclick = async (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const i = +b.dataset.i, j = +b.dataset.j;
    switch (b.dataset.act) {
      case 'add-set': {
        const sets = model.exercises[i].sets;
        const prev = sets[sets.length - 1] || { kg: '', reps: '' };
        sets.push({ kg: prev.kg, reps: prev.reps });
        return redraw();
      }
      case 'rm-set': model.exercises[i].sets.splice(j, 1); return redraw();
      case 'add-ex': (model.exercises ||= []).push({ name: '', sets: [{ kg: '', reps: '' }] }); return redraw();
      case 'rm-ex': model.exercises.splice(i, 1); return redraw();
      case 'rpe': model.rpe = +b.dataset.n; return redraw();
      case 'kind': {
        model.extraKind = b.dataset.kind;
        if (model.extraKind === 'gym' && !model.exercises) model.exercises = [{ name: '', sets: [{ kg: '', reps: '' }] }];
        if (model.extraKind === 'run' && !model.run) model.run = { distanceKm: '', timeMin: '', intervals: false };
        if (model.extraKind === 'tkd' && !model.tkd) model.tkd = { focus: '' };
        return redraw();
      }
      case 'save': {
        const s = clean(model);
        if (s.type === 'extra') {
          if (s.extraKind !== 'gym') delete s.exercises;
          if (s.extraKind !== 'run') delete s.run;
          if (s.extraKind !== 'tkd') delete s.tkd;
        }
        await actions.saveSession(s);
        location.hash = '#today';
        return;
      }
      case 'delete':
        if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Tap again to delete'; return; }
        await actions.deleteSession(model.id);
        location.hash = '#history';
    }
  };
}
