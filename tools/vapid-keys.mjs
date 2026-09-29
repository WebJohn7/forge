// Prints a fresh VAPID key pair and a random token for the push Worker.
// Run: node tools/vapid-keys.mjs   — then store each value with `npx wrangler secret put <NAME>`.
import { generateVapidKeys } from '../worker/webpush.js';

const { publicKey, privateKey } = await generateVapidKeys();
const token = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('base64url');
console.log(`VAPID_PUBLIC=${publicKey}`);
console.log(`VAPID_PRIVATE=${privateKey}`);
console.log(`TOKEN=${token}`);
console.log('\nKeep VAPID_PRIVATE and TOKEN secret. The TOKEN also goes into Forge → Settings → Notifications.');
