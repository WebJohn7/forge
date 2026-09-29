// Browser-only. Stats: headline numbers, the verdict, the findings, the charts.

import { SCORE } from '../penalties.js';
import { adherenceByWeek, adherencePct, liftNames, liftHistory, weeklyTonnage, runHistory, formatPace, weightAvg7 } from '../stats.js';
import { addDays, effectiveDate } from '../schedule.js';
import { lineChart, barChart } from './charts.js';
import { esc } from './dom.js';

const wkLabel = (iso) => { const [, m, d] = iso.split('-'); return `${+d}.${+m}.`; };

export function renderDashboard(root, { d, data }) {
  const { today, settings } = d;
  const recent = d.entries.filter((e) => effectiveDate(e) >= addDays(today, -27));
  const adh = adherencePct(recent);
  const lifts = liftNames(data.sessions);
  const selected = renderDashboard.lift && lifts.includes(renderDashboard.lift) ? renderDashboard.lift : lifts[0];
  const red = d.score < SCORE.redBelow;

  root.innerHTML = `
    <h1>Stats</h1>
    <div class="tiles">
      <div class="tile hero ${red ? 'bad' : ''}" style="grid-column:1/-1"><div class="tile-label">Discipline score</div>
        <div class="tile-value num">${d.score}</div>
        <div class="tile-note">${d.doneTotal} done · ${d.missedTotal} missed since ${esc(d.startDate)}</div></div>
      <div class="tile"><div class="tile-label">Streak</div><div class="tile-value num">${d.streak}</div><div class="tile-note">best ${d.bestStreak}</div></div>
      <div class="tile ${d.openDebts.length ? 'bad' : ''}"><div class="tile-label">Debt</div><div class="tile-value num">${d.openDebts.length}</div><div class="tile-note">penalties owed</div></div>
      <div class="tile ${adh != null && adh < 80 ? 'bad' : ''}"><div class="tile-label">Adherence</div><div class="tile-value num">${adh ?? '–'}${adh != null ? '<small style="font-size:18px">%</small>' : ''}</div><div class="tile-note">last 4 weeks</div></div>
      <div class="tile"><div class="tile-label">Weight</div><div class="tile-value num">${weightAvg7(data.bodyweight, today) ?? '–'}</div><div class="tile-note">7-day avg · limit ${settings.weightLimit}</div></div>
    </div>

    <h2>Last week</h2>
    <div class="card"><div class="card-title">${esc(d.verdict.headline)}</div>
      ${d.verdict.fixes.length ? `<ol style="margin:8px 0 0;padding-left:20px" class="secondary">${d.verdict.fixes.map((f) => `<li>${esc(f)}</li>`).join('')}</ol>` : ''}</div>

    <h2>Honest feedback</h2>
    ${d.findings.length ? d.findings.map((f) => `<div class="card finding ${f.level}">
      <div class="card-row"><div class="card-title" style="font-size:16px">${esc(f.title)}</div><span class="chip ${f.level}">${f.level === 'bad' ? 'Fix' : f.level === 'warn' ? 'Watch' : 'Good'}</span></div>
      <div class="card-sub">${esc(f.detail)}</div><div class="fix">${esc(f.fix)}</div></div>`).join('')
      : '<div class="card"><div class="card-sub">Log a few sessions and feedback appears here.</div></div>'}

    <h2>Sessions done per week (%)</h2><div class="card" id="c-adh"></div>
    <h2>Discipline score</h2><div class="card" id="c-score"></div>
    <h2>Strength — estimated 1RM</h2><div class="card">
      ${lifts.length ? `<label class="field"><span>Lift</span><select id="lift">${lifts.map((l) => `<option ${l === selected ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>` : ''}
      <div id="c-lift"></div></div>
    <h2>Weekly volume (kg lifted)</h2><div class="card" id="c-vol"></div>
    <h2>Bodyweight</h2><div class="card" id="c-weight"></div>
    <h2>Run pace (min/km)</h2><div class="card" id="c-pace"></div>
  `;

  const put = (id, el) => root.querySelector(id).appendChild(el);

  put('#c-adh', barChart(adherenceByWeek(d.entries, today, 8).map((w) => ({
    label: wkLabel(w.week), value: w.pct, tip: w.due ? `${w.pct} % (${w.done}/${w.due})` : 'no sessions',
  })), { max: 100, fmt: (v) => `${Math.round(v)}` }));

  put('#c-score', lineChart(d.scoreHistory.slice(-60).map((h) => ({ x: h.date, y: h.score })), { fmt: (v) => Math.round(v) }));

  const drawLift = () => {
    const box = root.querySelector('#c-lift');
    box.innerHTML = '';
    box.appendChild(lineChart(selected ? liftHistory(data.sessions, selected).map((p) => ({
      x: p.date, y: p.e1rm, tip: `${p.e1rm} kg (${p.topSet.kg}×${p.topSet.reps})` })) : [],
    { fmt: (v) => Math.round(v), emptyMsg: 'Log a gym session to see strength trends.' }));
  };
  drawLift();
  root.querySelector('#lift')?.addEventListener('change', (ev) => { renderDashboard.lift = ev.target.value; renderDashboard(root, { d, data }); });

  put('#c-vol', barChart(weeklyTonnage(data.sessions, today, 8).map((w) => ({
    label: wkLabel(w.week), value: w.tonnage || null, tip: `${w.tonnage.toLocaleString('en-GB')} kg` })),
  { fmt: (v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : Math.round(v)), emptyMsg: 'No lifting logged yet.' }));

  const bw = data.bodyweight.slice().sort((a, b) => a.date.localeCompare(b.date)).slice(-60);
  put('#c-weight', lineChart(bw.map((b) => ({ x: b.date, y: +b.kg, tip: `${b.kg} kg` })),
    { ref: { y: settings.weightLimit, label: `limit ${settings.weightLimit} kg` }, fmt: (v) => v.toFixed(1), emptyMsg: 'Weigh in on the Today screen.' }));

  put('#c-pace', lineChart(runHistory(data.sessions).filter((r) => !r.intervals).map((r) => ({
    x: r.date, y: r.pace, tip: `${formatPace(r.pace)}/km · ${r.distanceKm} km` })),
  { fmt: formatPace, invert: true, emptyMsg: 'No steady runs logged yet (interval runs are excluded).' }));
}
