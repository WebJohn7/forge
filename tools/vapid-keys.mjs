// Prints a fresh VAPID key pair and a token for the push Worker.
// Run: node tools/vapid-keys.mjs   — then store each value with `npx wrangler secret put <NAME>`.
// The token is typed by hand on the phone, so it is 5 groups of 5 lowercase letters/digits
// (~125 bits) instead of a long base64 string.
import { generateVapidKeys } from '../worker/webpush.js';

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // 32 chars, no l/1/o/0 look-alikes

function makeToken(groups = 5, size = 5) {
  const bytes = crypto.getRandomValues(new Uint8Array(groups * size));
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]); // 256 % 32 = 0 → unbiased
  return Array.from({ length: groups }, (_, i) => chars.slice(i * size, (i + 1) * size).join('')).join('-');
}

const { publicKey, privateKey } = await generateVapidKeys();
console.log(`VAPID_PUBLIC=${publicKey}`);
console.log(`VAPID_PRIVATE=${privateKey}`);
console.log(`TOKEN=${makeToken()}`);
console.log('\nKeep VAPID_PRIVATE and TOKEN secret. The TOKEN also goes into Forge → Settings → Notifications.');
