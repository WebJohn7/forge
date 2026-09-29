// Forge push Worker (Cloudflare Workers, free tier).
//   GET  /vapid       → { publicKey }                      (public, used to subscribe)
//   POST /subscribe   ← PushSubscription JSON              (Bearer TOKEN)
//   POST /state       ← schedule / logged / debts / verdict (Bearer TOKEN)
//   POST /test        → sends a test notification          (Bearer TOKEN)
//   cron every 15 min → sends whatever reminders are due (see src/reminders.js)
//
// Secrets (npx wrangler secret put …): TOKEN, VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT
// KV binding: FORGE  (keys: sub, state, sent)

import { sendPush } from './webpush.js';
import { dueReminders, pruneSent } from '../src/reminders.js';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS } });

const vapid = (env) => ({
  publicKey: env.VAPID_PUBLIC, privateKey: env.VAPID_PRIVATE, subject: env.VAPID_SUBJECT || 'mailto:forge@example.com',
});

function authorised(req, env) {
  const got = req.headers.get('authorization') || '';
  const want = `Bearer ${env.TOKEN}`;
  if (!env.TOKEN || got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

async function deliver(env, messages) {
  const sub = await env.FORGE.get('sub', 'json');
  if (!sub) return { sent: 0, reason: 'no subscription' };
  let sent = 0;
  for (const m of messages) {
    const res = await sendPush(sub, { title: m.title, body: m.body, tag: m.key, url: './#today' }, vapid(env));
    if (res.status === 404 || res.status === 410) { await env.FORGE.delete('sub'); return { sent, reason: 'subscription expired' }; }
    if (!res.ok) throw new Error(`push service ${res.status}: ${await res.text()}`);
    sent++;
  }
  return { sent };
}

async function tick(env, now = new Date()) {
  const state = (await env.FORGE.get('state', 'json')) || {};
  const sent = new Set((await env.FORGE.get('sent', 'json')) || []);
  const due = dueReminders(state, now, sent);
  if (!due.length) return { sent: 0 };
  const result = await deliver(env, due);
  for (const m of due.slice(0, result.sent)) sent.add(m.key);
  await env.FORGE.put('sent', JSON.stringify(pruneSent(sent, now, 3, state.timeZone)));
  return result;
}

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (req.method === 'GET' && pathname === '/vapid') return json({ publicKey: env.VAPID_PUBLIC });
    if (req.method !== 'POST') return json({ error: 'not found' }, 404);
    if (!authorised(req, env)) return json({ error: 'unauthorised' }, 401);

    try {
      if (pathname === '/subscribe') {
        const sub = await req.json();
        if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return json({ error: 'bad subscription' }, 400);
        await env.FORGE.put('sub', JSON.stringify(sub));
        return json({ ok: true });
      }
      if (pathname === '/state') {
        await env.FORGE.put('state', JSON.stringify(await req.json()));
        return json({ ok: true });
      }
      if (pathname === '/test') {
        return json(await deliver(env, [{ key: 'test', title: 'Forge is watching', body: 'Notifications work. Now go train.' }]));
      }
      if (pathname === '/tick') return json(await tick(env)); // manual run of the cron logic
    } catch (e) {
      return json({ error: String(e.message || e) }, 500);
    }
    return json({ error: 'not found' }, 404);
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(tick(env));
  },
};
