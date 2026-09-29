// Browser-only. Tiny hand-rolled SVG charts: single-series line and bars, each with a
// touch/hover tooltip. One series per chart, so no legend — the card title names it.

import { daysBetween } from '../schedule.js';

const W = 340, H = 170, PAD = { l: 34, r: 10, t: 14, b: 22 };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shortDate = (iso) => { const [, m, d] = iso.split('-'); return `${+d}.${+m}.`; };

function niceDomain(lo, hi) {
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.12;
  return [lo - pad, hi + pad];
}

function ticks(lo, hi, n = 4) {
  const step = (hi - lo) / n;
  const mag = 10 ** Math.floor(Math.log10(step));
  const nice = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step) || step;
  const out = [];
  for (let v = Math.ceil(lo / nice) * nice; v <= hi + 1e-9; v += nice) out.push(+v.toFixed(6));
  return out;
}

function mount(svg, tipsAt) {
  const wrap = document.createElement('div');
  wrap.className = 'chart';
  wrap.innerHTML = `${svg}<div class="tooltip"></div>`;
  const el = wrap.querySelector('svg');
  const tip = wrap.querySelector('.tooltip');
  const cross = el.querySelector('.cross');
  const move = (ev) => {
    const r = el.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * W;
    const hit = tipsAt(x);
    if (!hit) return hide();
    tip.innerHTML = hit.html;
    tip.style.left = `${(hit.x / W) * 100}%`;
    tip.style.top = `${(hit.y / H) * 100}%`;
    tip.classList.add('on');
    if (cross) { cross.setAttribute('x1', hit.x); cross.setAttribute('x2', hit.x); cross.style.display = ''; }
  };
  const hide = () => { tip.classList.remove('on'); if (cross) cross.style.display = 'none'; };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerdown', move);
  el.addEventListener('pointerleave', hide);
  return wrap;
}

function empty(msg) {
  const d = document.createElement('div');
  d.className = 'chart-empty';
  d.textContent = msg;
  return d;
}

// points: [{ x: 'YYYY-MM-DD', y: number, tip?: string }]
export function lineChart(points, { ref = null, fmt = (v) => v, emptyMsg = 'No data yet.', invert = false } = {}) {
  if (!points.length) return empty(emptyMsg);
  const x0 = points[0].x, span = Math.max(1, daysBetween(x0, points[points.length - 1].x));
  const ys = points.map((p) => p.y).concat(ref ? [ref.y] : []);
  let [lo, hi] = niceDomain(Math.min(...ys), Math.max(...ys));
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const sx = (iso) => PAD.l + (points.length === 1 ? iw / 2 : (daysBetween(x0, iso) / span) * iw);
  // invert: lower is better (pace) — draw it so "up" still means "better".
  const sy = (v) => PAD.t + (invert ? (v - lo) / (hi - lo) : (hi - v) / (hi - lo)) * ih;
  const pts = points.map((p) => ({ ...p, px: sx(p.x), py: sy(p.y) }));

  const grid = ticks(lo, hi).map((v) => `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${sy(v)}" y2="${sy(v)}"/>`).join('');
  const yLabels = ticks(lo, hi).map((v) => `<text x="${PAD.l - 6}" y="${sy(v) + 4}" text-anchor="end">${esc(fmt(v))}</text>`).join('');
  const xLabels = [pts[0], pts[pts.length - 1]].filter((p, i, a) => i === 0 || p !== a[0])
    .map((p, i) => `<text x="${p.px}" y="${H - 5}" text-anchor="${i === 0 ? 'start' : 'end'}">${shortDate(p.x)}</text>`).join('');
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.px.toFixed(1)},${p.py.toFixed(1)}`).join('');
  const dots = pts.length <= 40 ? pts.map((p) => `<circle class="dot" cx="${p.px}" cy="${p.py}" r="4"/>`).join('') : '';
  const refLine = ref ? `<line class="ref" x1="${PAD.l}" x2="${W - PAD.r}" y1="${sy(ref.y)}" y2="${sy(ref.y)}"/>
    <text class="ref-label" x="${W - PAD.r}" y="${sy(ref.y) - 5}" text-anchor="end">${esc(ref.label)}</text>` : '';
  const last = pts[pts.length - 1];
  const lastLabel = `<text class="value-label" x="${Math.min(last.px, W - PAD.r)}" y="${last.py - 9}" text-anchor="end">${esc(fmt(last.y))}</text>`;

  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart, ${pts.length} points, latest ${esc(fmt(last.y))}">
    <g class="grid">${grid}</g><g class="axis">${yLabels}${xLabels}</g>${refLine}
    <line class="cross" y1="${PAD.t}" y2="${H - PAD.b}" style="display:none"/>
    <path class="series" d="${path}"/>${dots}${lastLabel}</svg>`;

  return mount(svg, (x) => {
    let best = null;
    for (const p of pts) if (!best || Math.abs(p.px - x) < Math.abs(best.px - x)) best = p;
    return best && { x: best.px, y: best.py - 8, html: `${shortDate(best.x)} · <b>${esc(best.tip || fmt(best.y))}</b>` };
  });
}

// bars: [{ label, value (number|null), tip? }]
export function barChart(bars, { fmt = (v) => v, max = null, emptyMsg = 'No data yet.' } = {}) {
  if (!bars.some((b) => b.value != null)) return empty(emptyMsg);
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const top = max ?? Math.max(...bars.map((b) => b.value || 0), 1);
  const slot = iw / bars.length, bw = Math.max(6, slot - 6);
  const sy = (v) => PAD.t + ih - (v / top) * ih;
  const grid = ticks(0, top, 3).map((v) => `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${sy(v)}" y2="${sy(v)}"/>`).join('');
  const yLabels = ticks(0, top, 3).map((v) => `<text x="${PAD.l - 6}" y="${sy(v) + 4}" text-anchor="end">${esc(fmt(v))}</text>`).join('');
  const rects = bars.map((b, i) => {
    const x = PAD.l + i * slot + (slot - bw) / 2;
    if (b.value == null) return `<rect class="bar empty" x="${x}" y="${sy(0) - 3}" width="${bw}" height="3" rx="1.5"/>`;
    const h = Math.max(2, sy(0) - sy(b.value));
    const r = Math.min(4, bw / 2, h);
    // rounded top, square baseline
    return `<path class="bar" d="M${x},${sy(0)} V${sy(0) - h + r} q0,-${r} ${r},-${r} H${x + bw - r} q${r},0 ${r},${r} V${sy(0)} Z"/>`;
  }).join('');
  const xLabels = bars.map((b, i) => (i === 0 || i === bars.length - 1 ? `<text x="${PAD.l + i * slot + slot / 2}" y="${H - 5}" text-anchor="middle">${esc(b.label)}</text>` : '')).join('');
  const lastIdx = bars.map((b) => b.value != null).lastIndexOf(true);
  const lb = bars[lastIdx];
  const lastLabel = `<text class="value-label" x="${PAD.l + lastIdx * slot + slot / 2}" y="${sy(lb.value) - 6}" text-anchor="middle">${esc(fmt(lb.value))}</text>`;
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart, ${bars.length} bars">
    <g class="grid">${grid}</g><g class="axis">${yLabels}${xLabels}</g>${rects}${lastLabel}</svg>`;
  return mount(svg, (x) => {
    const i = Math.max(0, Math.min(bars.length - 1, Math.floor((x - PAD.l) / slot)));
    const b = bars[i];
    const cx = PAD.l + i * slot + slot / 2;
    return { x: cx, y: b.value == null ? sy(0) - 8 : sy(b.value) - 8,
      html: `${esc(b.label)} · <b>${esc(b.tip || (b.value == null ? 'no data' : fmt(b.value)))}</b>` };
  });
}
