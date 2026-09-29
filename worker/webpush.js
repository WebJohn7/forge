// Web Push sender with zero dependencies — WebCrypto only, so it runs in a Cloudflare
// Worker and in Node 20+. Implements VAPID (RFC 8292) and aes128gcm payload
// encryption (RFC 8188 / RFC 8291).

const enc = new TextEncoder();

export const b64url = {
  encode(bytes) {
    let s = '';
    for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(str) {
    const pad = '='.repeat((4 - (str.length % 4)) % 4);
    const bin = atob((str + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  },
};

const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

// VAPID keys: public = 65-byte uncompressed P-256 point, private = 32-byte scalar (both base64url).
async function vapidSigningKey(publicKey, privateKey) {
  const pub = b64url.decode(publicKey);
  const jwk = {
    kty: 'EC', crv: 'P-256', d: privateKey,
    x: b64url.encode(pub.slice(1, 33)), y: b64url.encode(pub.slice(33, 65)),
  };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

export async function vapidAuthHeader(endpoint, { publicKey, privateKey, subject }, nowSec = Math.floor(Date.now() / 1000)) {
  const header = b64url.encode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url.encode(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin, exp: nowSec + 12 * 3600, sub: subject,
  })));
  const unsigned = `${header}.${claims}`;
  const key = await vapidSigningKey(publicKey, privateKey);
  // WebCrypto returns the raw r||s form that JWS ES256 expects.
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned));
  return `vapid t=${unsigned}.${b64url.encode(sig)}, k=${publicKey}`;
}

// Encrypt `payload` for a subscription's keys ({ p256dh, auth }). Returns the request body.
export async function encryptPayload(payload, keys, { salt = crypto.getRandomValues(new Uint8Array(16)) } = {}) {
  const uaPublic = b64url.decode(keys.p256dh);
  const authSecret = b64url.decode(keys.auth);

  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const plain = concat(enc.encode(payload), new Uint8Array([2])); // 0x02 = last record, no padding
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plain));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

// Send one notification. Returns the push service's Response (201 = accepted;
// 404/410 = subscription is dead and should be dropped).
export async function sendPush(subscription, message, vapid, { ttl = 3600, urgency = 'high' } = {}) {
  const body = await encryptPayload(JSON.stringify(message), subscription.keys);
  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthHeader(subscription.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: urgency,
    },
    body,
  });
}

// Fresh VAPID key pair as base64url strings.
export async function generateVapidKeys() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  return { publicKey: b64url.encode(pub), privateKey: jwk.d };
}
