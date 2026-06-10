// Canonical copy of src/lib/evaluateNotifications.js for use in Deno Edge Functions.
// Keep in sync with the src version (both are pure functions with identical logic).

const ROLLOVER_HOUR = 3;

function gameDateTz(nowMs, tz) {
  const shifted = new Date(nowMs - ROLLOVER_HOUR * 3600 * 1000);
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

export function evaluateNotifications(bossState, streakState, prefs, lastPings, nowUtc, tz) {
  if (!tz || !prefs) return [];

  const out     = [];
  const gameDay = gameDateTz(nowUtc, tz);
  const hour    = localHour(nowUtc, tz);

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

  if (prefs.bossExpiry && bossState?.boss) {
    const { boss } = bossState;
    const timeLeft    = boss.endsAt - nowUtc;
    const bossKey     = `${boss.id}-${boss.startsAt}`;
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

  if (prefs.dailyReminder) {
    const [rh, rm]    = (prefs.dailyReminderTime ?? '09:00').split(':').map(Number);
    const reminderMin  = rh * 60 + rm;
    const localMin     = localMinuteOfDay(nowUtc, tz);
    const checkedIn    = streakState?.lastSeenDay === gameDay;
    const alreadySent  = lastPings?.lastDailyPingDay === gameDay;
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
