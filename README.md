# NeuroQuest

A planner + game for ADHD students. Real tasks earn progress in the game, so getting stuff done is what powers play.

**Status:** being reworked from a gamified to-do list into a planner hub with a walkable 2D collecting world behind it. Real tasks earn **playtime**. Works on phones, school Chromebooks and computers.

## Stack
- React 19 + Vite 8, installable PWA (`vite-plugin-pwa`, custom service worker in `src/sw.js`)
- Supabase: auth, `profiles` / `tasks` / social tables, Realtime sync, Edge Function for push notifications
- Deployed on Vercel from `main`

## Run it
```
npm install
npm run dev        # local dev server
npm test           # engine unit tests (node --test)
npm run build      # production build
npm run lint
```
Needs a `.env` with the Supabase URL/anon key and `VITE_VAPID_PUBLIC_KEY` (never commit it). Push notification setup is in [SETUP.md](SETUP.md).

## Where things live
| Path | What |
|---|---|
| `src/App.jsx` | Main app: screens, task logic, sync wiring |
| `src/config/balance.js` | All tunable game numbers (XP, penalties, ranks) |
| `src/lib/*Engine.js` | Pure game rules (boss, streak, focus sprint) with `*.test.js` beside them |
| `src/supabaseSync.js` | Read/write between local state and Supabase |
| `src/components/` | Boss, streak, sprint, notification and install UI |
| `supabase/` | Migrations and the `send-notifications` Edge Function |

## Working rules
- Game rules go in pure, tested engines (`now` passed in, no React) and are called from the UI.
- Balance numbers go in `src/config/balance.js`, not inline.
- One feature branch per phase; merge to `main` only after the phase is verified.
