import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONFIG, FRESH_STATE,
  checkInState, recordTaskCompletionInState,
  buyFreezeInState, recordLevelInState, recordBossKillInState,
  mergeStreakState,
  _resetForTesting,
} from './streakEngine.js';
import { gameDate, daysBetween } from './gameDay.js';

const NOW    = 1_700_000_000_000; // ~Nov 14 2023 22:13 UTC — well clear of 3 AM boundary
const DAY_MS = 86_400_000;

// ── 1. First-ever check-in ────────────────────────────────────────────────────
test('first-ever check-in: streak=1, login reward queued', () => {
  const s = checkInState(FRESH_STATE(), NOW);
  assert.equal(s.currentStreak, 1);
  assert.equal(s.bestStreak,    1);
  assert.equal(s.lastSeenDay,   gameDate(NOW));
  assert.equal(s.rewardQueue.length, 1);
  const r = s.rewardQueue[0];
  assert.equal(r.type,       'streak:daily');
  assert.equal(r.xp,         CONFIG.LOGIN_XP);
  assert.equal(r.gems,       CONFIG.LOGIN_GEMS_BY_TIER[0]); // tier 0 (streak 1)
  assert.equal(r.canUpgrade, true);
});

// ── 2. Same-day double check-in ───────────────────────────────────────────────
test('same-day double check-in: idempotent', () => {
  const s1 = checkInState(FRESH_STATE(), NOW);
  const s2 = checkInState(s1, NOW);
  assert.equal(s2 === s1, true); // exact same reference
});

// ── 3. Consecutive day; escalation caps at 14+ ───────────────────────────────
test('consecutive-day streak increments; tier correct; escalation caps at 14+', () => {
  // Day 1 → Day 2: tier 0
  let s = checkInState(FRESH_STATE(), NOW);
  s = checkInState(s, NOW + DAY_MS);
  assert.equal(s.currentStreak, 2);
  const r2 = s.rewardQueue.find(r => r.type === 'streak:daily');
  assert.equal(r2.gems, CONFIG.LOGIN_GEMS_BY_TIER[0]); // tier 0 (streak 1–2)

  // Streak 6 → 7 (crosses into tier 2; milestone also fires — find daily reward specifically)
  let s7 = { ...FRESH_STATE(), currentStreak: 6, lastSeenDay: gameDate(NOW), claimedMilestones: ['streak_7'] };
  s7 = checkInState(s7, NOW + DAY_MS);
  assert.equal(s7.currentStreak, 7);
  const r7 = s7.rewardQueue.find(r => r.type === 'streak:daily');
  assert.equal(r7.gems, CONFIG.LOGIN_GEMS_BY_TIER[2]); // tier 2

  // Streak 13 → 14 (caps at tier 3)
  let s14 = { ...FRESH_STATE(), currentStreak: 13, lastSeenDay: gameDate(NOW), claimedMilestones: ['streak_7'] };
  s14 = checkInState(s14, NOW + DAY_MS);
  assert.equal(s14.currentStreak, 14);
  const r14 = s14.rewardQueue.find(r => r.type === 'streak:daily');
  assert.equal(r14.gems, CONFIG.LOGIN_GEMS_BY_TIER[3]);

  // Streak 49 → 50 — still tier 3 (hard cap)
  let s50 = { ...FRESH_STATE(), currentStreak: 49, lastSeenDay: gameDate(NOW), claimedMilestones: ['streak_7','streak_30'] };
  s50 = checkInState(s50, NOW + DAY_MS);
  assert.equal(s50.currentStreak, 50);
  const r50 = s50.rewardQueue.find(r => r.type === 'streak:daily');
  assert.equal(r50.gems, CONFIG.LOGIN_GEMS_BY_TIER[3]);
});

// ── 4. Gap=2, 1 freeze: shield holds ─────────────────────────────────────────
test('gap of 2 days with 1 freeze: freeze burns, streak intact, shield-held event', () => {
  const s0 = { ...FRESH_STATE(), currentStreak: 5, lastSeenDay: gameDate(NOW), freezes: 1 };
  // Check in 2 days later (gap=2, missed 1 day, 1 freeze available)
  const s = checkInState(s0, NOW + 2 * DAY_MS);
  assert.equal(s.currentStreak, 6);    // intact +1
  assert.equal(s.freezes, 0);           // burned
  const r = s.rewardQueue[s.rewardQueue.length - 1];
  assert.equal(r.type, 'streak:shield_held');
  assert.equal(r.freezesUsed, 1);
});

// ── 5. Gap=3, 1 freeze: reset, bestStreak preserved, lifetime untouched ──────
test('gap of 3 days with 1 freeze: streak resets to 1, bestStreak preserved', () => {
  const s0 = {
    ...FRESH_STATE(),
    currentStreak: 10, bestStreak: 10, lifetimeActiveDays: 20,
    lastSeenDay: gameDate(NOW), freezes: 1,
  };
  // gap=3, missed 2 days — 1 freeze not enough
  const s = checkInState(s0, NOW + 3 * DAY_MS);
  assert.equal(s.currentStreak,      1);  // reset
  assert.equal(s.bestStreak,         10); // preserved
  assert.equal(s.freezes,            0);  // burned
  assert.equal(s.lifetimeActiveDays, 20); // untouched
  const r = s.rewardQueue[s.rewardQueue.length - 1];
  assert.equal(r.type, 'streak:comeback');
  assert.equal(r.bestStreak, 10);
  // Message must not contain negative language
  assert.ok(!r.message.includes('lost'));
  assert.ok(!r.message.includes('failed'));
  assert.ok(!r.message.includes('broken'));
});

// ── 6. Active day: upgrade, idempotency, lifetimeActiveDays +1 once ──────────
test('active day: first task upgrades reward; second no-op; lifetimeActiveDays +1 once', () => {
  const s0 = checkInState(FRESH_STATE(), NOW);
  assert.equal(s0.rewardQueue[0].xp,  CONFIG.LOGIN_XP);
  assert.equal(s0.rewardQueue[0].canUpgrade, true);

  // First task → upgrade in place
  const s1 = recordTaskCompletionInState(s0, NOW);
  assert.equal(s1.todayIsActive,      true);
  assert.equal(s1.lifetimeActiveDays, 1);
  assert.equal(s1.rewardQueue.length, 1);          // still 1 item
  assert.equal(s1.rewardQueue[0].xp,  CONFIG.ACTIVE_DAY_XP); // upgraded
  assert.equal(s1.rewardQueue[0].canUpgrade, false);

  // Second task → no-op (same reference)
  const s2 = recordTaskCompletionInState(s1, NOW);
  assert.equal(s2 === s1, true);
  assert.equal(s2.lifetimeActiveDays, 1);
});

// ── 6b. Active-day delta when login reward already consumed ──────────────────
test('active-day delta queued when login reward already consumed', () => {
  const s0 = checkInState(FRESH_STATE(), NOW);
  // Simulate consuming the daily reward (clear queue)
  const s1 = { ...s0, rewardQueue: [] };

  const s2 = recordTaskCompletionInState(s1, NOW);
  assert.equal(s2.rewardQueue.length, 1);
  const r = s2.rewardQueue[0];
  assert.equal(r.type, 'streak:active');
  assert.equal(r.xp,   CONFIG.ACTIVE_DAY_XP - CONFIG.LOGIN_XP);
  assert.equal(r.gems, CONFIG.ACTIVE_GEMS_BY_TIER[getTier(0)] - CONFIG.LOGIN_GEMS_BY_TIER[getTier(0)]);
});

// ── 7. 3 AM rollover ─────────────────────────────────────────────────────────
test('3 AM rollover: task at 1:30 AM credits previous game-day', () => {
  const jan14_6pm  = new Date(2024, 0, 14, 18, 0, 0).getTime(); // Jan 14 6 PM
  const jan15_1_30 = new Date(2024, 0, 15, 1, 30, 0).getTime(); // Jan 15 1:30 AM → still Jan 14 game-day
  const jan15_3_01 = new Date(2024, 0, 15, 3,  1, 0).getTime(); // Jan 15 3:01 AM → Jan 15 game-day

  assert.equal(gameDate(jan14_6pm),  gameDate(jan15_1_30)); // same game-day
  assert.notEqual(gameDate(jan14_6pm), gameDate(jan15_3_01));

  // Check-in at 6 PM Jan 14 → first task at 1:30 AM Jan 15 upgrades same-day reward
  const s0 = checkInState(FRESH_STATE(), jan14_6pm);
  const s1 = recordTaskCompletionInState(s0, jan15_1_30);
  assert.equal(s1.rewardQueue[0].xp,  CONFIG.ACTIVE_DAY_XP); // upgraded (same game-day)
  assert.equal(s1.todayIsActive, true);
});

// ── 8. Free freeze regen ──────────────────────────────────────────────────────
test('free freeze regen: +1 after 7 days, respects FREEZE_CAP, regen day updates', () => {
  const day0 = gameDate(NOW);
  const day6 = gameDate(NOW + 6 * DAY_MS);
  const day7 = gameDate(NOW + 7 * DAY_MS);

  // Consecutive daily check-ins days 1–6: no regen yet (< 7 days since lastFreezeRegenDay)
  let s = { ...FRESH_STATE(), currentStreak: 5, lastSeenDay: day0, lastFreezeRegenDay: day0 };
  s = checkInState(s, NOW + DAY_MS); // day 1 → 2
  assert.equal(s.freezes, 0);

  // Day 6: still < 7 days from regen day (day0), no regen
  s = { ...s, lastSeenDay: day0, currentStreak: 1 }; // reset to simplify
  s = checkInState(s, NOW + 6 * DAY_MS);
  assert.equal(s.freezes, 0);

  // Day 7: exactly 7 days since lastFreezeRegenDay=day0 → +1 freeze
  const sPre7 = { ...FRESH_STATE(), currentStreak: 1, lastSeenDay: day6, lastFreezeRegenDay: day0 };
  const sRegen = checkInState(sPre7, NOW + 7 * DAY_MS);
  assert.equal(sRegen.freezes, 1);
  assert.equal(sRegen.lastFreezeRegenDay, day7);

  // At FREEZE_CAP: regen fires but freezes stay capped (no overflow)
  const sPreCap = { ...FRESH_STATE(), currentStreak: 1, lastSeenDay: day6,
    freezes: CONFIG.FREEZE_CAP, lastFreezeRegenDay: day0 };
  const sCap = checkInState(sPreCap, NOW + 7 * DAY_MS);
  assert.equal(sCap.freezes, CONFIG.FREEZE_CAP); // unchanged
  assert.equal(sCap.lastFreezeRegenDay, day7);    // regen day still updates
});

// ── 9. buyFreeze ──────────────────────────────────────────────────────────────
test('buyFreeze: rejected at cap; succeeds below cap', () => {
  const atCap = { ...FRESH_STATE(), freezes: CONFIG.FREEZE_CAP };
  const { state: s1, ok: ok1 } = buyFreezeInState(atCap);
  assert.equal(ok1,      false);
  assert.equal(s1.freezes, CONFIG.FREEZE_CAP);

  const below = { ...FRESH_STATE(), freezes: 1 };
  const { state: s2, ok: ok2, cost } = buyFreezeInState(below);
  assert.equal(ok2,        true);
  assert.equal(s2.freezes, 2);
  assert.equal(cost,       CONFIG.FREEZE_PRICE_GEMS);
});

// ── 10. Milestones: fire once, no replay, level + boss-kill ──────────────────
test('milestone fires exactly once; no double-pay on replay; level and boss-kill milestones work', () => {
  // Streak 7 milestone
  let s = { ...FRESH_STATE(), currentStreak: 6, lastSeenDay: gameDate(NOW) };
  s = checkInState(s, NOW + DAY_MS); // streak → 7
  assert.ok(s.claimedMilestones.includes('streak_7'));
  const msQ = s.rewardQueue.find(r => r.id === 'streak_7');
  assert.ok(msQ);
  assert.equal(msQ.gems, 30);

  // Replay the same transition (simulate restore): milestone must NOT re-fire
  const sReplay = { ...s, rewardQueue: [], lastSeenDay: gameDate(NOW + DAY_MS) };
  const sNext   = checkInState(sReplay, NOW + 2 * DAY_MS); // streak → 8
  const doubled = sNext.claimedMilestones.filter(id => id === 'streak_7');
  assert.equal(doubled.length, 1);
  assert.equal(sNext.rewardQueue.find(r => r.id === 'streak_7'), undefined);

  // Level milestone
  let ls = recordLevelInState(FRESH_STATE(), 10);
  assert.ok(ls.claimedMilestones.includes('level_10'));
  ls = recordLevelInState(ls, 10); // replay
  assert.equal(ls.claimedMilestones.filter(id => id === 'level_10').length, 1);

  // Boss-kill milestone
  let bs = recordBossKillInState(FRESH_STATE());
  assert.ok(bs.claimedMilestones.includes('boss_1'));
  bs = recordBossKillInState(bs);
  assert.equal(bs.claimedMilestones.filter(id => id === 'boss_1').length, 1);
});

// ── 11. mergeStreakState ──────────────────────────────────────────────────────
test('mergeStreakState: max/union/latest; no double-pay milestone', () => {
  const local = {
    ...FRESH_STATE(),
    currentStreak: 10, bestStreak: 10, lifetimeActiveDays: 20,
    lastSeenDay: '2024-01-10', freezes: 2,
    claimedMilestones: ['streak_7'],
    rewardQueue: [{ type: 'streak:milestone', id: 'streak_7', gems: 30, xp: 0, title: 'Week One Warrior', canUpgrade: false }],
  };
  const remote = {
    ...FRESH_STATE(),
    currentStreak: 8, bestStreak: 12, lifetimeActiveDays: 22,
    lastSeenDay: '2024-01-09', freezes: 3,
    claimedMilestones: ['streak_7'],
    rewardQueue: [{ type: 'streak:milestone', id: 'streak_7', gems: 30, xp: 0, title: 'Week One Warrior', canUpgrade: false }],
  };

  const m = mergeStreakState(local, remote);
  assert.equal(m.currentStreak,      10);            // max
  assert.equal(m.bestStreak,         12);            // max
  assert.equal(m.lifetimeActiveDays, 22);            // max
  assert.equal(m.lastSeenDay,        '2024-01-10'); // latest
  assert.equal(m.freezes, Math.min(3, CONFIG.FREEZE_CAP)); // max, capped
  assert.ok(m.claimedMilestones.includes('streak_7'));
  assert.equal(m.rewardQueue.filter(r => r.id === 'streak_7').length, 1); // deduplicated
});

// ── 12. Corrupt localStorage → graceful fresh state, no throw ────────────────
test('corrupt localStorage: fresh state, no throw', () => {
  _resetForTesting();

  const savedLS = typeof global.localStorage !== 'undefined' ? global.localStorage : undefined;
  global.localStorage = {
    getItem:    () => '{ CORRUPT !!! {{{',
    setItem:    () => {},
    removeItem: () => {},
  };
  _resetForTesting();

  let caught = false;
  let s;
  try {
    s = checkInState(FRESH_STATE(), NOW);
  } catch {
    caught = true;
  }
  assert.equal(caught, false);
  assert.equal(s.currentStreak, 1);

  if (savedLS !== undefined) global.localStorage = savedLS;
  else delete global.localStorage;
  _resetForTesting();
});

// ── 13. DST transition still counts as one game-day ──────────────────────────
test('DST transition: daysBetween counts calendar days, not wall-clock hours', () => {
  // US spring-forward: March 10, 2024 (2 AM → 3 AM, only 23 wall-clock hours between Mar 9–10 midnight)
  // daysBetween uses calendar arithmetic → must still return 1
  assert.equal(daysBetween('2024-03-10', '2024-03-09'),  1);
  assert.equal(daysBetween('2024-03-09', '2024-03-10'), -1);

  // Full check-in cycle across the DST boundary
  const mar9_4pm  = new Date(2024, 2, 9,  16, 0, 0).getTime();
  const mar10_4pm = new Date(2024, 2, 10, 16, 0, 0).getTime();

  let s = checkInState(FRESH_STATE(), mar9_4pm);
  s     = checkInState(s, mar10_4pm);
  assert.equal(s.currentStreak, 2); // consecutive — DST didn't confuse the count
});

// ── helpers used only in tests ────────────────────────────────────────────────
function getTier(streak) {
  if (streak >= 14) return 3;
  if (streak >= 7)  return 2;
  if (streak >= 3)  return 1;
  return 0;
}
