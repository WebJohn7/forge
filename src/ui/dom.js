// Browser-only. Small shared helpers for the views.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function prettyDate(iso, today) {
  if (iso === today) return 'Today';
  const d = new Date(`${iso}T12:00:00`);
  const t = new Date(`${today}T12:00:00`);
  const diff = Math.round((d - t) / 86400000);
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export const STATUS_LABEL = {
  done: 'Done', late: 'Late', pending: 'Due', overdue: 'Overdue', missed: 'Missed', upcoming: 'Upcoming',
};

export const chip = (status, label = STATUS_LABEL[status] || status) => `<span class="chip ${esc(status)}">${esc(label)}</span>`;

export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('on'), 2200);
}

// Read "a.0.b"-style paths.
export function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  keys.slice(0, -1).forEach((k, i) => {
    if (o[k] == null) o[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    o = o[k];
  });
  o[keys[keys.length - 1]] = value;
}

export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

export function parseHash() {
  const [name, query = ''] = location.hash.replace(/^#/, '').split('?');
  return { name: name || 'today', params: Object.fromEntries(new URLSearchParams(query)) };
}
