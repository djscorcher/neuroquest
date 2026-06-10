// Pure notification-trigger evaluator — runs in Node (tests), browser, and Deno (Edge Function).
// No side effects. No Date.now(). No external imports.

const ROLLOVER_HOUR = 3;

function gameDateTz(nowMs, tz) {
  // Mirror the app's 3 AM game-day rollover in the user's local timezone.
  const shifted = new Date(nowMs - ROLLOVER_HOUR * 3600 * 1000);
  // en-CA locale yields YYYY-MM-DD format from Intl.DateTimeFormat.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(shifted);
}

function localMinuteOfDay(nowMs, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(nowMs));
  const h = parseInt(parts.find(p => p.type === 'hour').value, 10);
  const m = parseInt(parts.find(p => p.type === 'minute').value, 10);
  return h * 60 + m;
}

function localHour(nowMs, tz) {
  return Math.floor(localMinuteOfDay(nowMs, tz) / 60);
}

/**
 * Evaluate which notifications should fire for a user.
 *
 * @param {object|null} bossState   - Parsed nq_boss_v1 JSON
 * @param {object|null} streakState - Parsed nq_streak_v1 JSON
 * @param {object}      prefs       - User's notifyPrefs (streakAtRisk, bossExpiry, dailyReminder, ...)
 * @param {object}      lastPings   - { lastStreakPingDay, lastBossPingKey, lastDailyPingDay }
 * @param {number}      nowUtc      - Current time as ms epoch (UTC)
 * @param {string}      tz          - IANA timezone string e.g. "America/New_York"
 * @returns {Array<{type, title, body, tag, url, _pingUpdate}>}
 */
export function evaluateNotifications(bossState, streakState, prefs, lastPings, nowUtc, tz) {
  if (!tz || !prefs) return [];

  const out     = [];
  const gameDay = gameDateTz(nowUtc, tz);
  const hour    = localHour(nowUtc, tz);

  // ── streakAtRisk ───────────────────────────────────────────────────────────
  // Fire when: local hour ≥ 21, streak ≥ 2, user hasn't checked in today's game-day,
  // and we haven't already sent this today.
  if (prefs.streakAtRisk) {
    const streak     = streakState?.currentStreak ?? 0;
    const checkedIn  = streakState?.lastSeenDay === gameDay;
    const alreadySent = lastPings?.lastStreakPingDay === gameDay;
    if (hour >= 21 && streak >= 2 && !checkedIn && !alreadySent) {
      out.push({
        type:  'streakAtRisk',
        title: 'NeuroQuest',
        body:  `Your ${streak}-day streak — one quick check-in keeps it safe 🛡`,
        tag:   'streak-at-risk',
        url:   '/',
        _pingUpdate: { last_streak_ping_day: gameDay },
      });
    }
  }

  // ── bossExpiry ─────────────────────────────────────────────────────────────
  // Fire when: boss endsAt is within 4h, HP > 0, not already pinged for this boss.
  if (prefs.bossExpiry && bossState?.boss) {
    const { boss } = bossState;
    const timeLeft = boss.endsAt - nowUtc;
    const bossKey  = `${boss.id}-${boss.startsAt}`;
    const alreadySent = lastPings?.lastBossPingKey === bossKey;
    if (timeLeft > 0 && timeLeft <= 4 * 3600 * 1000 && boss.currentHp > 0 && !alreadySent) {
      const hoursLeft = Math.ceil(timeLeft / 3600000);
      const hpPct     = Math.round(100 * boss.currentHp / boss.maxHp);
      out.push({
        type:  'bossExpiry',
        title: 'NeuroQuest',
        body:  `${boss.name} escapes in ${hoursLeft}h — ${hpPct}% HP left.`,
        tag:   'boss-expiry',
        url:   '/',
        _pingUpdate: { last_boss_ping_boss_key: bossKey },
      });
    }
  }

  // ── dailyReminder ──────────────────────────────────────────────────────────
  // Fire when: opted in, local time within ±14 min of reminder time, no check-in today.
  if (prefs.dailyReminder) {
    const [rh, rm]   = (prefs.dailyReminderTime ?? '09:00').split(':').map(Number);
    const reminderMin = rh * 60 + rm;
    const localMin    = localMinuteOfDay(nowUtc, tz);
    const checkedIn   = streakState?.lastSeenDay === gameDay;
    const alreadySent = lastPings?.lastDailyPingDay === gameDay;
    if (Math.abs(localMin - reminderMin) < 15 && !checkedIn && !alreadySent) {
      out.push({
        type:  'dailyReminder',
        title: 'NeuroQuest',
        body:  "Today's quests are waiting.",
        tag:   'daily-reminder',
        url:   '/',
        _pingUpdate: { last_daily_ping_day: gameDay },
      });
    }
  }

  return out;
}
