import { gameDate, daysBetween } from './gameDay.js';

// ── CONFIG ──────────────────────────────────────────────────────────────────
export const CONFIG = {
  DAY_ROLLOVER_HOUR:        3,
  FREEZE_CAP:               3,
  FREEZE_PRICE_GEMS:        75,
  FREE_FREEZE_INTERVAL_DAYS: 7,
  LOGIN_XP:                 5,
  ACTIVE_DAY_XP:            15,
  // Tiers: streak 1-2, 3-6, 7-13, 14+ — escalation hard-caps at tier 3
  LOGIN_GEMS_BY_TIER:       [1, 2, 3, 5],
  ACTIVE_GEMS_BY_TIER:      [3, 5, 8, 12],
};

// ── Milestones ──────────────────────────────────────────────────────────────
const STREAK_MILESTONES = [
  { id: 'streak_7',   streak: 7,   gems: 30,   title: 'Week One Warrior'    },
  { id: 'streak_30',  streak: 30,  gems: 100,  title: 'Monthly Master'      },
  { id: 'streak_100', streak: 100, gems: 300,  title: 'Centurion of Focus'  },
  { id: 'streak_365', streak: 365, gems: 1000, title: 'Year of the Mind'    },
];

const LIFE_MILESTONES = [
  { id: 'life_10',  days: 10,  gems: 20  },
  { id: 'life_50',  days: 50,  gems: 75  },
  { id: 'life_100', days: 100, gems: 150, title: 'Hundred Days Strong' },
  { id: 'life_250', days: 250, gems: 400 },
  { id: 'life_500', days: 500, gems: 800 },
];

const LEVEL_MILESTONES = [
  { id: 'level_5',  level: 5,  gems: 25  },
  { id: 'level_10', level: 10, gems: 50  },
  { id: 'level_25', level: 25, gems: 150 },
  { id: 'level_50', level: 50, gems: 400 },
];

const BOSS_MILESTONES = [
  { id: 'boss_1',  kills: 1,  gems: 15,  title: 'First Blood'  },
  { id: 'boss_10', kills: 10, gems: 75  },
  { id: 'boss_25', kills: 25, gems: 200 },
  { id: 'boss_50', kills: 50, gems: 500, title: 'Bossbreaker'  },
];

// ═══════════════════════════════════════════════════════════════════════════
//  PURE CORE — all functions (state, ...args, now?) → newState
//  No side effects. No Date.now(). No localStorage.
// ═══════════════════════════════════════════════════════════════════════════

export const FRESH_STATE = () => ({
  currentStreak:     0,
  bestStreak:        0,
  lifetimeActiveDays: 0,
  lastSeenDay:       null,
  lastActiveDay:     null,
  todayIsActive:     false,
  freezes:           0,
  lastFreezeRegenDay: null,
  claimedMilestones: [],
  rewardQueue:       [],
  bossKills:         0,
});

function getTier(streak) {
  if (streak >= 14) return 3;
  if (streak >= 7)  return 2;
  if (streak >= 3)  return 1;
  return 0;
}

function milestoneReward(ms, extra = {}) {
  return {
    type:   'streak:milestone',
    id:     ms.id,
    gems:   ms.gems,
    xp:     0,
    title:  ms.title ?? null,
    message: ms.title
      ? `${ms.title} — ${ms.gems} gems!`
      : `Milestone reached — ${ms.gems} gems!`,
    canUpgrade: false,
    ...extra,
  };
}

function addMilestone(state, ms) {
  return {
    ...state,
    claimedMilestones: [...state.claimedMilestones, ms.id],
    rewardQueue:       [...state.rewardQueue, milestoneReward(ms)],
  };
}

function checkMilestones(state, list, key, value) {
  let s = state;
  for (const ms of list) {
    if (value >= ms[key] && !s.claimedMilestones.includes(ms.id)) {
      s = addMilestone(s, ms);
    }
  }
  return s;
}

export function checkInState(state, now) {
  const today = gameDate(now);

  // Same game-day: no-op (idempotent)
  if (state.lastSeenDay === today) return state;

  // ── Free freeze regen ────────────────────────────────────────────────────
  let { freezes, lastFreezeRegenDay } = state;
  if (!lastFreezeRegenDay) {
    lastFreezeRegenDay = today; // start clock on first check-in
  } else if (daysBetween(today, lastFreezeRegenDay) >= CONFIG.FREE_FREEZE_INTERVAL_DAYS) {
    if (freezes < CONFIG.FREEZE_CAP) freezes = freezes + 1;
    lastFreezeRegenDay = today;
  }

  // ── Streak logic ─────────────────────────────────────────────────────────
  let currentStreak = state.currentStreak;
  let bestStreak    = state.bestStreak;
  let newReward;

  if (!state.lastSeenDay) {
    // First ever check-in
    currentStreak = 1;
    bestStreak    = Math.max(bestStreak, 1);
    const tier    = getTier(1);
    newReward = {
      type: 'streak:daily', day: today,
      xp: CONFIG.LOGIN_XP, gems: CONFIG.LOGIN_GEMS_BY_TIER[tier],
      streak: 1, message: 'Day 1 — streak begins!', canUpgrade: true,
    };
  } else {
    const gap    = daysBetween(today, state.lastSeenDay);
    const missed = gap - 1;

    if (gap === 1 || freezes >= missed) {
      // Consecutive day OR all missed days covered by freezes
      const froze = gap === 1 ? 0 : missed;
      freezes = freezes - froze;
      currentStreak = currentStreak + 1;
      bestStreak    = Math.max(bestStreak, currentStreak);
      const tier    = getTier(currentStreak);
      newReward = froze > 0
        ? {
            type: 'streak:shield_held', day: today,
            xp: CONFIG.LOGIN_XP, gems: CONFIG.LOGIN_GEMS_BY_TIER[tier],
            streak: currentStreak, freezesUsed: froze,
            message: `Your shield held. ${currentStreak}-day streak intact.`,
            canUpgrade: true,
          }
        : {
            type: 'streak:daily', day: today,
            xp: CONFIG.LOGIN_XP, gems: CONFIG.LOGIN_GEMS_BY_TIER[tier],
            streak: currentStreak, message: `Day ${currentStreak} — streak continues!`,
            canUpgrade: true,
          };
    } else {
      // Not enough freezes: burn all, reset
      bestStreak    = Math.max(bestStreak, currentStreak);
      freezes       = 0;
      currentStreak = 1;
      newReward = {
        type: 'streak:comeback', day: today,
        xp: CONFIG.LOGIN_XP, gems: CONFIG.LOGIN_GEMS_BY_TIER[0],
        streak: 1, bestStreak,
        message: `Best: ${bestStreak} — new run starts today.`,
        canUpgrade: true,
      };
    }
  }

  let s = {
    ...state,
    currentStreak,
    bestStreak,
    lastSeenDay:       today,
    todayIsActive:     false, // reset for the new game-day
    freezes,
    lastFreezeRegenDay,
    rewardQueue: [...state.rewardQueue, newReward],
  };

  return checkMilestones(s, STREAK_MILESTONES, 'streak', currentStreak);
}

export function recordTaskCompletionInState(state, now) {
  const today = gameDate(now);

  // Idempotent: only first task of each game-day has effect
  if (state.lastActiveDay === today) return state;

  const lifetimeActiveDays = state.lifetimeActiveDays + 1;
  const tier = getTier(state.currentStreak);

  // Upgrade today's queued daily reward if still in queue; otherwise queue delta
  const queueIdx = state.rewardQueue.findIndex(r => r.canUpgrade && r.day === today);
  let rewardQueue;
  if (queueIdx >= 0) {
    rewardQueue = state.rewardQueue.map((r, i) => i !== queueIdx ? r : {
      ...r,
      xp:         CONFIG.ACTIVE_DAY_XP,
      gems:       CONFIG.ACTIVE_GEMS_BY_TIER[tier],
      canUpgrade: false,
    });
  } else {
    const dXp   = CONFIG.ACTIVE_DAY_XP   - CONFIG.LOGIN_XP;
    const dGems = CONFIG.ACTIVE_GEMS_BY_TIER[tier] - CONFIG.LOGIN_GEMS_BY_TIER[tier];
    rewardQueue = [...state.rewardQueue, {
      type:   'streak:active', day: today,
      xp:     dXp, gems: dGems,
      streak: state.currentStreak,
      message: 'First quest of the day — active bonus!',
      canUpgrade: false,
    }];
  }

  let s = { ...state, todayIsActive: true, lastActiveDay: today, lifetimeActiveDays, rewardQueue };
  return checkMilestones(s, LIFE_MILESTONES, 'days', lifetimeActiveDays);
}

export function buyFreezeInState(state) {
  if (state.freezes >= CONFIG.FREEZE_CAP) {
    return { state, ok: false, cost: CONFIG.FREEZE_PRICE_GEMS };
  }
  return { state: { ...state, freezes: state.freezes + 1 }, ok: true, cost: CONFIG.FREEZE_PRICE_GEMS };
}

export function recordLevelInState(state, level) {
  return checkMilestones(state, LEVEL_MILESTONES, 'level', level);
}

export function recordBossKillInState(state) {
  const bossKills = (state.bossKills ?? 0) + 1;
  let s = { ...state, bossKills };
  return checkMilestones(s, BOSS_MILESTONES, 'kills', bossKills);
}

// Merge two streak states (for guest→account or multi-device conflicts).
// Takes max of numeric counters, union of milestones, latest of day fields.
// Deduplicates milestone rewards. Gem balances reconcile via player-state sync.
export function mergeStreakState(local, remote) {
  if (!local && !remote) return FRESH_STATE();
  if (!local) return { ...FRESH_STATE(), ...remote };
  if (!remote) return { ...FRESH_STATE(), ...local };

  const claimedMilestones = [...new Set([
    ...(local.claimedMilestones  ?? []),
    ...(remote.claimedMilestones ?? []),
  ])];

  const latestDay = (a, b) => (!a ? b : !b ? a : a > b ? a : b);

  // Merge reward queues; dedupe milestone rewards by id
  const seenMs = new Set();
  const rewardQueue = [
    ...(local.rewardQueue  ?? []),
    ...(remote.rewardQueue ?? []),
  ].filter(r => {
    if (r.type !== 'streak:milestone') return true;
    if (seenMs.has(r.id)) return false;
    seenMs.add(r.id);
    return true;
  });

  return {
    currentStreak:      Math.max(local.currentStreak  ?? 0, remote.currentStreak  ?? 0),
    bestStreak:         Math.max(local.bestStreak      ?? 0, remote.bestStreak      ?? 0),
    lifetimeActiveDays: Math.max(local.lifetimeActiveDays ?? 0, remote.lifetimeActiveDays ?? 0),
    lastSeenDay:        latestDay(local.lastSeenDay,        remote.lastSeenDay),
    lastActiveDay:      latestDay(local.lastActiveDay,      remote.lastActiveDay),
    todayIsActive:      (local.todayIsActive ?? false) || (remote.todayIsActive ?? false),
    freezes:            Math.min(Math.max(local.freezes ?? 0, remote.freezes ?? 0), CONFIG.FREEZE_CAP),
    lastFreezeRegenDay: latestDay(local.lastFreezeRegenDay, remote.lastFreezeRegenDay),
    claimedMilestones,
    rewardQueue,
    bossKills:          Math.max(local.bossKills ?? 0, remote.bossKills ?? 0),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  IMPURE SHELL — localStorage persistence + event bus
// ═══════════════════════════════════════════════════════════════════════════

const LS_KEY       = 'nq_streak_v1';
const _subscribers = new Set();
let   _state       = null;

function _loadState() {
  try {
    const raw = typeof localStorage !== 'undefined' && localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p.currentStreak !== 'number') return null;
    return { ...FRESH_STATE(), ...p };
  } catch {
    return null;
  }
}

function _saveState(state) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    }
  } catch {}
}

function _emit(event) {
  _subscribers.forEach(fn => { try { fn(event); } catch {} });
}

function _get() {
  if (!_state) _state = _loadState() ?? FRESH_STATE();
  return _state;
}

function _set(newState) {
  _state = newState;
  _saveState(newState);
  _emit({ type: 'streak:update', state: newState });
}

export function subscribeStreak(fn) {
  _subscribers.add(fn);
  return () => _subscribers.delete(fn);
}

export function getStreakState() {
  return _get();
}

export function checkIn(now = Date.now()) {
  const state    = _get();
  const newState = checkInState(state, now);
  if (newState !== state) _set(newState);
  return newState;
}

export function recordTaskCompletion(now = Date.now()) {
  const state    = _get();
  const newState = recordTaskCompletionInState(state, now);
  if (newState !== state) _set(newState);
  return newState;
}

export function buyFreeze() {
  const result = buyFreezeInState(_get());
  if (result.ok) _set(result.state);
  return { ok: result.ok, cost: result.cost };
}

export function recordLevel(level) {
  const state    = _get();
  const newState = recordLevelInState(state, level);
  if (newState !== state) _set(newState);
  return newState;
}

export function recordBossKill() {
  const state    = _get();
  const newState = recordBossKillInState(state);
  if (newState !== state) _set(newState);
  return newState;
}

// FIFO drain — caller credits XP/gems/titles and shows toasts.
export function consumeRewards() {
  const state = _get();
  const queue = [...state.rewardQueue];
  if (queue.length > 0) {
    _state = { ...state, rewardQueue: [] };
    _saveState(_state);
  }
  return queue;
}

// Merge remote state (JSON string from Supabase) into local and persist.
export function loadRemoteState(rawJson) {
  try {
    const remote = JSON.parse(rawJson);
    if (!remote || typeof remote !== 'object') return;
    const merged = mergeStreakState(_get(), remote);
    _set(merged);
  } catch {}
}

// Test helper
export function _resetForTesting() {
  _state = null;
}
