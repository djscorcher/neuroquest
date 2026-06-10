import { gameDate } from './gameDay.js';

// ── CONFIG ──────────────────────────────────────────────────────────────────
export const CONFIG = {
  PRESETS_MIN:          [5, 15, 25, 45],
  DEFAULT_PRESET_MIN:   5,
  TRIAL_DAMAGE_MULT:    1.5,
  COMPLETION_XP_PER_MIN: 0.6,
  COMPLETION_GEMS:      { 5: 1, 15: 2, 25: 3, 45: 5 },
  PARTIAL_CREDIT:       true,
  HISTORY_CAP:          200,
};

// ═══════════════════════════════════════════════════════════════════════════
//  PURE CORE — all functions (state, ...args, now) → newState
//  No side effects. No Date.now(). No localStorage.
// ═══════════════════════════════════════════════════════════════════════════

export const FRESH_STATE = () => ({
  active:          null,
  history:         [],
  lifetimeFocusMs: 0,
  rewardQueue:     [],
});

function gemsForDuration(durationMs) {
  const dMin = durationMs / 60000;
  const presets = CONFIG.PRESETS_MIN;
  let tier = presets[0];
  for (const p of presets) {
    if (dMin >= p) tier = p;
  }
  return CONFIG.COMPLETION_GEMS[tier] ?? 1;
}

function completionXp(durationMs) {
  const dMin = durationMs / 60000;
  return Math.max(3, Math.round(dMin * CONFIG.COMPLETION_XP_PER_MIN));
}

// Returns focused milliseconds elapsed (time running, pauses excluded).
function focusedElapsed(active, now) {
  const wallEnd = active.pausedAt !== null ? active.pausedAt : now;
  return Math.max(0, (wallEnd - active.startedAt) - active.pausedTotalMs);
}

export function isTrialRunningInState(state, now) {
  if (!state.active) return false;
  if (state.active.pausedAt !== null) return false;
  return focusedElapsed(state.active, now) < state.active.durationMs;
}

export function startTrialInState(state, durationMs, pinnedTaskId, now) {
  if (state.active) return { state, ok: false, reason: 'already_active' };
  return {
    state: {
      ...state,
      active: {
        durationMs,
        startedAt:      now,
        pausedAt:       null,
        pausedTotalMs:  0,
        pinnedTaskId:   pinnedTaskId ?? null,
        tasksCompleted: 0,
      },
    },
    ok: true,
  };
}

export function pauseTrialInState(state, now) {
  if (!state.active || state.active.pausedAt !== null) return state;
  return {
    ...state,
    active: { ...state.active, pausedAt: now },
  };
}

export function resumeTrialInState(state, now) {
  if (!state.active || state.active.pausedAt === null) return state;
  const pauseSpan = now - state.active.pausedAt;
  return {
    ...state,
    active: {
      ...state.active,
      pausedAt:      null,
      pausedTotalMs: state.active.pausedTotalMs + pauseSpan,
    },
  };
}

function pushHistory(state, entry) {
  const trimmed = state.history.length >= CONFIG.HISTORY_CAP
    ? state.history.slice(0, CONFIG.HISTORY_CAP - 1)
    : state.history;
  return [entry, ...trimmed];
}

export function completeCheckInState(state, now) {
  if (!state.active) return state;

  const focused = focusedElapsed(state.active, now);
  if (focused < state.active.durationMs) return state;

  const { durationMs, pinnedTaskId, tasksCompleted } = state.active;
  const xp   = completionXp(durationMs);
  const gems = gemsForDuration(durationMs);
  const dMin = Math.round(durationMs / 60000);

  const reward = {
    type:    'trial:complete',
    xp,
    gems,
    message: `Focus sprint complete — ${dMin} min! +${xp} XP, +${gems} gems. Take a breather.`,
    tasksCompleted,
    durationMs,
  };

  const historyEntry = {
    dateKey:        gameDate(now),
    durationMs,
    focusedMs:      durationMs,
    completed:      true,
    tasksCompleted,
  };

  return {
    ...state,
    active:          null,
    history:         pushHistory(state, historyEntry),
    lifetimeFocusMs: state.lifetimeFocusMs + durationMs,
    rewardQueue:     [...state.rewardQueue, reward],
  };
}

export function abandonTrialInState(state, now) {
  if (!state.active) return state;

  const focused = focusedElapsed(state.active, now);
  const { durationMs, tasksCompleted } = state.active;
  const share     = focused / durationMs;
  const baseXp    = completionXp(durationMs);
  const partialXp = Math.floor(baseXp * share);
  const focusMin  = Math.round(focused / 60000);

  const reward = {
    type:    'trial:partial',
    xp:      partialXp,
    gems:    0,
    message: focusMin >= 1
      ? `You focused for ${focusMin} minute${focusMin !== 1 ? 's' : ''} — that counts. +${partialXp} XP`
      : `Every moment of focus counts. +${partialXp} XP`,
    tasksCompleted,
    durationMs,
    focusedMs: focused,
  };

  const historyEntry = {
    dateKey:        gameDate(now),
    durationMs,
    focusedMs:      focused,
    completed:      false,
    tasksCompleted,
  };

  return {
    ...state,
    active:          null,
    history:         pushHistory(state, historyEntry),
    lifetimeFocusMs: state.lifetimeFocusMs + focused,
    rewardQueue:     [...state.rewardQueue, reward],
  };
}

export function recordTrialTaskInState(state) {
  if (!state.active) return state;
  return {
    ...state,
    active: { ...state.active, tasksCompleted: state.active.tasksCompleted + 1 },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  IMPURE SHELL — localStorage persistence + event bus
// ═══════════════════════════════════════════════════════════════════════════

const LS_KEY       = 'nq_trial_v1';
const _subscribers = new Set();
let   _state       = null;

function _loadState() {
  try {
    const raw = typeof localStorage !== 'undefined' && localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p.lifetimeFocusMs !== 'number') return null;
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

function _set(newState, eventType = 'trial:update') {
  _state = newState;
  _saveState(newState);
  _emit({ type: eventType, state: newState });
}

export function subscribeTrial(fn) {
  _subscribers.add(fn);
  return () => _subscribers.delete(fn);
}

export function getTrialState() {
  return _get();
}

export function isTrialRunning(now = Date.now()) {
  return isTrialRunningInState(_get(), now);
}

export function startTrial(durationMs, pinnedTaskId = null, now = Date.now()) {
  const result = startTrialInState(_get(), durationMs, pinnedTaskId, now);
  if (result.ok) _set(result.state);
  return result;
}

export function pauseTrial(now = Date.now()) {
  const state    = _get();
  const newState = pauseTrialInState(state, now);
  if (newState !== state) _set(newState);
  return newState;
}

export function resumeTrial(now = Date.now()) {
  const state    = _get();
  const newState = resumeTrialInState(state, now);
  if (newState !== state) _set(newState);
  return newState;
}

export function completeCheck(now = Date.now()) {
  const state    = _get();
  const newState = completeCheckInState(state, now);
  if (newState !== state) _set(newState, 'trial:resolved');
  return newState;
}

export function abandonTrial(now = Date.now()) {
  const state    = _get();
  const newState = abandonTrialInState(state, now);
  if (newState !== state) _set(newState, 'trial:resolved');
  return newState;
}

export function recordTrialTask() {
  const state    = _get();
  const newState = recordTrialTaskInState(state);
  if (newState !== state) _set(newState);
  return newState;
}

export function consumeRewards() {
  const state = _get();
  const queue = [...state.rewardQueue];
  if (queue.length > 0) {
    _state = { ...state, rewardQueue: [] };
    _saveState(_state);
  }
  return queue;
}

export function _resetForTesting() {
  _state = null;
}
