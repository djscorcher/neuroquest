import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateNotifications } from './evaluateNotifications.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

// UTC 2024-01-15T13:00:00Z
// America/New_York (EST, UTC-5): 08:00 AM Jan 15 → hour=8
// Asia/Taipei (UTC+8):           09:00 PM Jan 15 → hour=21
const UTC_MIXED   = new Date('2024-01-15T13:00:00Z').getTime();
const TZ_EASTERN  = 'America/New_York';
const TZ_TAIPEI   = 'Asia/Taipei';

// UTC 2024-01-15T14:05:00Z
// New_York: 09:05 AM Jan 15 → within 15 min of 09:00 daily reminder
// Taipei:   22:05 PM Jan 15 → far from 09:00
const UTC_DAILY   = new Date('2024-01-15T14:05:00Z').getTime();

// UTC 2024-01-15T07:30:00Z — rollover test
// New_York (UTC-5): 02:30 AM Jan 15 → 3h rollback → gameDate = "2024-01-14"
const UTC_ROLLOVER = new Date('2024-01-15T07:30:00Z').getTime();

const BOSS = {
  boss: {
    id:        'hydra',
    name:      'The Procrastination Hydra',
    startsAt:  UTC_MIXED - 48 * 3600 * 1000,
    endsAt:    UTC_MIXED + 2 * 3600 * 1000, // 2h from now — within 4h window
    currentHp: 80,
    maxHp:     150,
  },
};

const STREAK_UNCHECKED = { currentStreak: 5, lastSeenDay: '2024-01-14' };
const STREAK_CHECKED   = { currentStreak: 5, lastSeenDay: '2024-01-15' }; // already checked in Jan 15

const ALL_ON = { streakAtRisk: true, bossExpiry: true, dailyReminder: true, dailyReminderTime: '09:00' };
const ALL_OFF = { streakAtRisk: false, bossExpiry: false, dailyReminder: false };
const EMPTY_PINGS = { lastStreakPingDay: null, lastBossPingKey: null, lastDailyPingDay: null };

// ── Tests ────────────────────────────────────────────────────────────────────

describe('evaluateNotifications', () => {

  // 1. streakAtRisk fires correctly
  it('streakAtRisk fires at hour ≥ 21 with unchecked streak ≥ 2', () => {
    const notifs = evaluateNotifications(null, STREAK_UNCHECKED, ALL_ON, EMPTY_PINGS, UTC_MIXED, TZ_TAIPEI);
    const streakNotif = notifs.find(n => n.type === 'streakAtRisk');
    assert.ok(streakNotif, 'should fire streak notification');
    assert.ok(streakNotif.body.includes('5-day streak'));
    assert.ok(streakNotif._pingUpdate.last_streak_ping_day);
  });

  // 2. streakAtRisk does NOT fire before 21:00
  it('streakAtRisk does not fire before 21:00 local', () => {
    // New York at UTC_MIXED is 8:00 AM — hour=8 < 21
    const notifs = evaluateNotifications(null, STREAK_UNCHECKED, ALL_ON, EMPTY_PINGS, UTC_MIXED, TZ_EASTERN);
    assert.equal(notifs.filter(n => n.type === 'streakAtRisk').length, 0);
  });

  // 3. streakAtRisk does NOT fire if already checked in today
  it('streakAtRisk does not fire if user already checked in this game-day', () => {
    // Taipei: gameDate at UTC_MIXED = "2024-01-15"; lastSeenDay = "2024-01-15" → checked in
    const notifs = evaluateNotifications(null, STREAK_CHECKED, ALL_ON, EMPTY_PINGS, UTC_MIXED, TZ_TAIPEI);
    assert.equal(notifs.filter(n => n.type === 'streakAtRisk').length, 0);
  });

  // 4. streakAtRisk does NOT fire if streak < 2
  it('streakAtRisk does not fire for streak < 2', () => {
    const lowStreak = { currentStreak: 1, lastSeenDay: '2024-01-14' };
    const notifs = evaluateNotifications(null, lowStreak, ALL_ON, EMPTY_PINGS, UTC_MIXED, TZ_TAIPEI);
    assert.equal(notifs.filter(n => n.type === 'streakAtRisk').length, 0);
  });

  // 5. streakAtRisk does NOT fire if already pinged today
  it('streakAtRisk does not fire if already pinged today (dedup)', () => {
    const pings = { ...EMPTY_PINGS, lastStreakPingDay: '2024-01-15' };
    const notifs = evaluateNotifications(null, STREAK_UNCHECKED, ALL_ON, pings, UTC_MIXED, TZ_TAIPEI);
    assert.equal(notifs.filter(n => n.type === 'streakAtRisk').length, 0);
  });

  // 6. bossExpiry fires within 4h window at HP > 0
  it('bossExpiry fires when boss is within 4h of expiry with HP > 0', () => {
    const notifs = evaluateNotifications(BOSS, null, ALL_ON, EMPTY_PINGS, UTC_MIXED, TZ_EASTERN);
    const bossNotif = notifs.find(n => n.type === 'bossExpiry');
    assert.ok(bossNotif, 'should fire boss notification');
    assert.ok(bossNotif.body.includes('Procrastination Hydra'));
  });

  // 7. bossExpiry does NOT fire at HP = 0
  it('bossExpiry does not fire when boss HP is 0', () => {
    const deadBoss = { boss: { ...BOSS.boss, currentHp: 0 } };
    const notifs = evaluateNotifications(deadBoss, null, ALL_ON, EMPTY_PINGS, UTC_MIXED, TZ_EASTERN);
    assert.equal(notifs.filter(n => n.type === 'bossExpiry').length, 0);
  });

  // 8. bossExpiry dedupes by boss key
  it('bossExpiry does not fire if already pinged for this boss instance', () => {
    const bossKey = `${BOSS.boss.id}-${BOSS.boss.startsAt}`;
    const pings = { ...EMPTY_PINGS, lastBossPingKey: bossKey };
    const notifs = evaluateNotifications(BOSS, null, ALL_ON, pings, UTC_MIXED, TZ_EASTERN);
    assert.equal(notifs.filter(n => n.type === 'bossExpiry').length, 0);
  });

  // 9. bossExpiry does NOT fire outside the 4h window
  it('bossExpiry does not fire when boss has more than 4h remaining', () => {
    const farBoss = { boss: { ...BOSS.boss, endsAt: UTC_MIXED + 5 * 3600 * 1000 } };
    const notifs = evaluateNotifications(farBoss, null, ALL_ON, EMPTY_PINGS, UTC_MIXED, TZ_EASTERN);
    assert.equal(notifs.filter(n => n.type === 'bossExpiry').length, 0);
  });

  // 10. dailyReminder fires in time window (New York at UTC_DAILY = 09:05)
  it('dailyReminder fires when local time is within 15 min of reminder time', () => {
    const notifs = evaluateNotifications(null, STREAK_UNCHECKED, ALL_ON, EMPTY_PINGS, UTC_DAILY, TZ_EASTERN);
    const dr = notifs.find(n => n.type === 'dailyReminder');
    assert.ok(dr, 'should fire daily reminder for New York at 09:05');
  });

  // 11. dailyReminder does NOT fire outside window (Taipei at UTC_DAILY = 22:05)
  it('dailyReminder does not fire when local time is far from reminder time', () => {
    const notifs = evaluateNotifications(null, STREAK_UNCHECKED, ALL_ON, EMPTY_PINGS, UTC_DAILY, TZ_TAIPEI);
    assert.equal(notifs.filter(n => n.type === 'dailyReminder').length, 0);
  });

  // 12. dailyReminder does NOT fire if opted out
  it('dailyReminder does not fire when pref is off', () => {
    const prefs = { ...ALL_ON, dailyReminder: false };
    const notifs = evaluateNotifications(null, STREAK_UNCHECKED, prefs, EMPTY_PINGS, UTC_DAILY, TZ_EASTERN);
    assert.equal(notifs.filter(n => n.type === 'dailyReminder').length, 0);
  });

  // 13. tz handling — same UTC produces different results (Detroit vs Taipei)
  it('tz handling: same UTC instant fires streak for Taipei but not New York', () => {
    const notifsEast   = evaluateNotifications(null, STREAK_UNCHECKED, ALL_ON, EMPTY_PINGS, UTC_MIXED, TZ_EASTERN);
    const notifsTaipei = evaluateNotifications(null, STREAK_UNCHECKED, ALL_ON, EMPTY_PINGS, UTC_MIXED, TZ_TAIPEI);
    assert.equal(notifsEast.filter(n => n.type === 'streakAtRisk').length, 0, 'New York at 8AM: should not fire');
    assert.equal(notifsTaipei.filter(n => n.type === 'streakAtRisk').length, 1, 'Taipei at 9PM: should fire');
  });

  // 14. 3 AM rollover: at 2:30 AM local, game-day is still "yesterday"
  it('3 AM rollover: at 2:30 AM local in New York, gameDate is previous calendar day', () => {
    // UTC_ROLLOVER = 2024-01-15T07:30Z → New York = 2024-01-15 02:30 AM
    // 3h rollback → 2024-01-14 23:30 local → gameDate = "2024-01-14"
    // Streak lastSeenDay = "2024-01-14" → user IS considered checked in for this game-day
    const notifs = evaluateNotifications(null, STREAK_UNCHECKED, ALL_ON, EMPTY_PINGS, UTC_ROLLOVER, TZ_EASTERN);
    // STREAK_UNCHECKED.lastSeenDay = "2024-01-14" = gameDate at UTC_ROLLOVER in New York
    // → checkedIn = true → streakAtRisk should NOT fire (regardless of hour)
    assert.equal(notifs.filter(n => n.type === 'streakAtRisk').length, 0,
      '2:30 AM local is still game-day Jan 14; lastSeenDay matches; no risk notification');
  });

  // 15. Nothing fires when all prefs off
  it('no notifications fire when all prefs are off', () => {
    const notifs = evaluateNotifications(BOSS, STREAK_UNCHECKED, ALL_OFF, EMPTY_PINGS, UTC_MIXED, TZ_TAIPEI);
    assert.equal(notifs.length, 0);
  });

  // 16. Returns empty array for null/missing tz or prefs
  it('returns empty array for missing tz or prefs', () => {
    assert.deepEqual(evaluateNotifications(null, null, null, null, UTC_MIXED, null), []);
    assert.deepEqual(evaluateNotifications(null, null, null, null, UTC_MIXED, ''), []);
  });

});
