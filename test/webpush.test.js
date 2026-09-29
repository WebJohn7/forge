import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptPayload, vapidAuthHeader, generateVapidKeys, b64url } from '../worker/webpush.js';

const enc = new TextEncoder();
const concat = (...p) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}

// Plays the browser's role: a subscription key pair, and RFC 8291 decryption.
async function browserSide() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const keys = { p256dh: b64url.encode(pub), auth: b64url.encode(auth) };
  async function decrypt(body) {
    const salt = body.slice(0, 16);
    const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0);
    const idlen = body[20];
    const asPub = body.slice(21, 21 + idlen);
    const cipher = body.slice(21 + idlen);
    const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, kp.privateKey, 256));
    const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), pub, asPub), 32);
    const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
    const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
    const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher));
    return { rs, idlen, delimiter: plain[plain.length - 1], text: new TextDecoder().decode(plain.slice(0, -1)) };
  }
  return { keys, decrypt };
}

test('aes128gcm payload round-trips through RFC 8291 decryption', async () => {
  const b = await browserSide();
  const msg = JSON.stringify({ title: 'Today: Run', body: 'Log it or it counts as a miss. ✓' });
  const out = await b.decrypt(await encryptPayload(msg, b.keys));
  assert.equal(out.text, msg);
  assert.equal(out.rs, 4096);
  assert.equal(out.idlen, 65);
  assert.equal(out.delimiter, 2);
});

test('VAPID JWT verifies against the public key and carries the right claims', async () => {
  const keys = await generateVapidKeys();
  assert.equal(b64url.decode(keys.publicKey).length, 65);
  const header = await vapidAuthHeader('https://web.push.apple.com/abc123', { ...keys, subject: 'mailto:x@example.com' }, 1_800_000_000);
  const m = header.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/);
  assert.ok(m, header);
  const claims = JSON.parse(new TextDecoder().decode(b64url.decode(m[2])));
  assert.deepEqual(claims, { aud: 'https://web.push.apple.com', exp: 1_800_000_000 + 43200, sub: 'mailto:x@example.com' });
  assert.equal(m[4], keys.publicKey);
  const pub = await crypto.subtle.importKey('raw', b64url.decode(keys.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64url.decode(m[3]), enc.encode(`${m[1]}.${m[2]}`));
  assert.ok(ok);
});
