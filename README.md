# Forge

Personal training tracker for iPhone. A web app (PWA): no App Store, no cost.

- **Enforced week:** Mon run + TKD club 18:00, Tue lower body, Wed TKD club, Thu rest,
  Fri upper body, Sat TKD at home, Sun full body + TKD.
- **Consequences:** a session not logged by 23:59 can still be logged until 12:00 the next day
  (marked *late*); after that it's a **miss** → penalty workout added to your debt, streak reset
  and frozen until the debt is paid, discipline score −15 (and −2/day per unpaid penalty).
- **Honest feedback:** rules engine on your log — stalled/regressing lifts, volume spikes,
  RPE too high/low, run pace, missing intervals, weight vs the 69 kg category, skipped-session
  patterns. Offline, free.
- **Stats:** discipline score, streak, debt, adherence, e1RM per lift, weekly volume,
  bodyweight, run pace.
- **Notifications** (optional): via a free Cloudflare Worker.

## 1. Put it online (GitHub Pages, free)

1. Create a GitHub repo (e.g. `forge`), push this folder to it.
2. Repo → **Settings → Pages** → Source: *Deploy from a branch* → `main` / `/ (root)` → Save.
3. After ~1 minute it's live at `https://<your-username>.github.io/forge/`.

## 2. Install on the iPhone

1. Open that URL in **Safari** (not Chrome — only Safari can install web apps on iOS).
2. Share button → **Add to Home Screen** → Add.
3. Open Forge **from the Home Screen icon** from now on. The rules start counting from the
   first day you open it.

Data is stored on the phone only. Use **Settings → Export JSON** now and then and save the
file to iCloud Drive / Files.

## 3. Notifications (optional, free)

iPhone web push needs iOS 16.4+ and the app opened from the Home Screen. A small
Cloudflare Worker sends the reminders (06:30 morning session, 07:00 unpaid/unlogged,
17:15 club days, 21:00 not logged yet, Sunday 20:00 weekly verdict).

1. Create a free account at <https://dash.cloudflare.com/sign-up> (no card needed).
2. In a terminal, from this folder:
   ```powershell
   node tools/vapid-keys.mjs            # prints VAPID_PUBLIC, VAPID_PRIVATE, TOKEN — keep them
   cd worker
   npx wrangler login                   # opens the browser once
   npx wrangler kv namespace create FORGE
   ```
   Paste the printed `id` into `worker/wrangler.toml` (replace `PASTE_KV_NAMESPACE_ID_HERE`).
3. Store the secrets (each command asks for the value):
   ```powershell
   npx wrangler secret put VAPID_PUBLIC
   npx wrangler secret put VAPID_PRIVATE
   npx wrangler secret put TOKEN
   npx wrangler secret put VAPID_SUBJECT   # e.g. mailto:you@yourmail.com
   npx wrangler deploy
   ```
   It prints the Worker URL, e.g. `https://forge-push.<you>.workers.dev`.
4. On the iPhone: Forge → **Settings → Notifications** → paste the Worker URL and TOKEN →
   **Save & enable** → allow notifications → **Send test**.

Free-tier usage: ~100 cron runs/day and a handful of KV writes — far below the limits.

## Develop

```powershell
npm test                  # node --test — pure logic + push crypto + worker, no deps
py -m http.server 8138    # then http://localhost:8138/  (serve over http, not file://)
node tools/make-icons.mjs # regenerate icons
```
