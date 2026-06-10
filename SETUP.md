# NeuroQuest PWA + Push Notifications — Setup Guide

These are manual steps Claude Code cannot do for you (they involve secrets, live cloud services, and a deployed URL).

---

## 1. Add real logo images (required for icons)

Before generating icons, add your actual logo PNGs:
- `public/branding/logo-dark.png` — the primary icon source (square, 512×512 or larger recommended)
- `public/branding/logo-light.png` — used in light contexts

Then run the icon generator:
```
node scripts/generate-icons.mjs
```

Commit the outputs (`public/pwa-*.png`, `public/apple-touch-icon.png`, `public/favicon.ico`).

---

## 2. Generate VAPID keys

```
npx web-push generate-vapid-keys
```

You'll get output like:
```
Public Key: BExample...
Private Key: AnotherExample...
```

---

## 3. Add the public key to your environment

**Local `.env`** (already has the placeholder):
```
VITE_VAPID_PUBLIC_KEY=<paste public key here>
```

**Vercel** (for production):
- Go to Vercel → your project → Settings → Environment Variables
- Add `VITE_VAPID_PUBLIC_KEY` = `<public key>`
- Redeploy

---

## 4. Add secrets to Supabase

```
supabase secrets set VAPID_PUBLIC_KEY="<public key>"
supabase secrets set VAPID_PRIVATE_KEY="<private key>"
supabase secrets set VAPID_SUBJECT="mailto:your@email.com"
```

**Never commit the private key.** It lives only in Supabase secrets.

---

## 5. Run the database migration

In the Supabase dashboard → SQL Editor, run the contents of:
```
supabase/migrations/001_push_subscriptions.sql
```

Or if you have the Supabase CLI linked to the project:
```
supabase db push
```

This creates the `push_subscriptions` table and adds `notify_prefs` + `tz` columns to `profiles`.

---

## 6. Deploy the Edge Function

```
supabase functions deploy send-notifications
```

Verify it deployed:
```
supabase functions list
```

---

## 7. Schedule the cron (every 15 minutes)

**Option A — Supabase Dashboard (easiest):**
1. Go to Supabase dashboard → Edge Functions → `send-notifications`
2. Click "Schedule" and set the cron expression: `*/15 * * * *`

**Option B — pg_cron + pg_net (SQL Editor):**
```sql
-- Enable extensions if not already
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the function call every 15 minutes
SELECT cron.schedule(
  'send-neuroquest-notifications',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://daynsxpdixvfkdnbumwi.supabase.co/functions/v1/send-notifications',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);
```

> **Note:** For Option B, store your service role key using `ALTER DATABASE postgres SET app.service_role_key = '...'` or use a fixed anon key since the Edge Function validates via VAPID, not auth.

---

## 8. Vercel redeploy

After adding the `VITE_VAPID_PUBLIC_KEY` env var, trigger a redeploy:
- Push any commit to `main`, OR
- Go to Vercel → Deployments → Redeploy

---

## 9. End-to-end test (requires HTTPS — use Vercel preview URL)

Push notifications require HTTPS. Localhost works for SW installation and the install card, but not for real push. Use the Vercel preview URL for end-to-end testing.

1. Open the Vercel preview URL in Chrome on Android (or Chrome desktop)
2. Sign in to your account
3. Go to STATS tab → "REMINDERS & ALERTS"
4. Toggle "Streak at risk" ON → browser permission dialog appears → Allow
5. Check Supabase → Table Editor → `push_subscriptions` — a row should appear for your user
6. In Supabase → Edge Functions → `send-notifications` → Invoke manually (or wait for cron)
7. If conditions are met (streak ≥ 2, hour ≥ 21, not checked in), a push notification should arrive
8. Clicking the notification should open the app
9. Toggle all notifications OFF → the row should disappear from `push_subscriptions`

**iOS note:** Web push on iOS requires:
- iOS 16.4+
- Safari (not Chrome on iOS)
- The app must be **installed** (Add to Home Screen) before push works
- After installing, visit the app from Home Screen, then enable alerts in settings

---

## Files created by this feature

| File | Purpose |
|------|---------|
| `scripts/generate-icons.mjs` | Generates PWA icons from logo-dark.png — run once after adding logos |
| `src/sw.js` | Custom service worker (precache, offline, push events) |
| `src/lib/evaluateNotifications.js` | Pure notification trigger logic (Node + browser) |
| `src/lib/evaluateNotifications.test.js` | 16 unit tests |
| `src/lib/notifications.js` | Client push subscription management |
| `src/components/NotifySettings.jsx` | Settings UI (Stats tab) |
| `src/components/InstallCard.jsx` | Install prompt card |
| `supabase/migrations/001_push_subscriptions.sql` | DB migration |
| `supabase/functions/send-notifications/index.ts` | Edge Function (Deno) |
| `supabase/functions/_shared/evaluateNotifications.js` | Shared pure function for Edge Function |
| `vite.config.js` | Updated with vite-plugin-pwa |
| `SETUP.md` | This file |
