// ── CONFIG ─────────────────────────────────────────────────────────────────
export const CONFIG = {
  CYCLE_MS:          72 * 3600 * 1000,
  DEFAULT_PACE:      130,
  MIN_STANDARD_HP:   150,
  TIER_MULT:         { minor: 0.6, standard: 1.0, epic: 1.75 },
  HP_FACTOR:         1.15,
  EMA_ALPHA:         0.4,
  PACE_GROWTH_CAP:   1.25,
  PACE_DECAY_FLOOR:  0.85,
  PACE_MIN:          100,
  FIRST_STRIKE_MULT: 2.0,
  BASE_GEMS:         50,
  GEM_TIER_MULT:     { minor: 0.5, standard: 1.0, epic: 2.25 },
};

// ── Roster ──────────────────────────────────────────────────────────────────
export const BOSSES = [
  {
    id:     'hydra',
    name:   'The Procrastination Hydra',
    flavor: 'Cut one head and two more appear. The only way through is to start.',
  },
  {
    id:     'brain_fog',
    name:   'Brain Fog',
    flavor: 'A grey haze that swallows focus. Clarity is earned task by task.',
  },
  {
    id:     'wyrm',
    name:   'The Doomscroll Wyrm',
    flavor: 'It feeds on stolen minutes. Reclaim them, one quest at a time.',
  },
  {
    id:     'exec_dys',
    name:   'Executive Dysfunction',
    flavor: 'The final wall between intention and action.',
  },
];

// ── Modifiers ───────────────────────────────────────────────────────────────
export const MODIFIERS = [
  {
    id:    'weak_high',
    label: 'Weak to High-importance quests — 2× damage',
    desc:  'Tasks of High or Critical importance deal 2× damage.',
  },
  {
    id:    'weak_critical',
    label: 'Critical quests deal 2.5× damage',
    desc:  'Critical tasks deal 2.5× damage.',
  },
  {
    id:    'early_bird',
    label: 'Early Bird — 1.5× damage before noon',
    desc:  'Tasks completed before 12:00 local deal 1.5× damage.',
  },
  {
    id:    'punctual',
    label: 'Punctual — 1.5× damage for on-time tasks',
    desc:  'Tasks with a due date completed on time or early deal 1.5× damage.',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
//  PURE CORE — all functions are (state?, ...args, now?) → newState/value
//  No side effects. No Date.now(). No localStorage.
// ═══════════════════════════════════════════════════════════════════════════

export function computeStandardHp(pace) {
  return Math.max(CONFIG.MIN_STANDARD_HP, Math.round(pace * CONFIG.HP_FACTOR));
}

export function computeHp(pace, tier) {
  return Math.round(computeStandardHp(pace) * CONFIG.TIER_MULT[tier]);
}

export function getLocalDateStr(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function computeModifierMult(modifierId, taskMeta, now) {
  switch (modifierId) {
    case 'weak_high':
      return (taskMeta.importance === 'High' || taskMeta.importance === 'Critical') ? 2.0 : 1.0;
    case 'weak_critical':
      return taskMeta.importance === 'Critical' ? 2.5 : 1.0;
    case 'early_bird':
      return new Date(now).getHours() < 12 ? 1.5 : 1.0;
    case 'punctual':
      return taskMeta.onTime === true ? 1.5 : 1.0;
    default:
      return 1.0;
  }
}

export function updatePace(pace, cycleDamage) {
  const raw     = pace + CONFIG.EMA_ALPHA * (cycleDamage - pace);
  const capped  = Math.min(raw, pace * CONFIG.PACE_GROWTH_CAP);
  const floored = Math.max(capped, pace * CONFIG.PACE_DECAY_FLOOR);
  return Math.max(CONFIG.PACE_MIN, floored);
}

export function computeGems(tier, pct) {
  return Math.round(CONFIG.BASE_GEMS * CONFIG.GEM_TIER_MULT[tier] * pct / 100);
}

export function spawnBoss(cycleIndex, modifierIndex, pace, now) {
  const def  = BOSSES[cycleIndex % BOSSES.length];
  const tier = 'standard';
  const hp   = computeHp(pace, tier);
  return {
    boss: {
      id:          def.id,
      name:        def.name,
      flavor:      def.flavor,
      tier,
      modifierId:  MODIFIERS[modifierIndex % MODIFIERS.length].id,
      cycleIndex,
      maxHp:       hp,
      currentHp:   hp,
      startsAt:    now,
      endsAt:      now + CONFIG.CYCLE_MS,
    },
    pace,
    resolutionQueue: [],
    firstStrikeDate: null,
    ledger:          {},
    modifierIndex,
    cycleIndex,
  };
}

export function resolveAndRespawn(state, outcome, now) {
  const { boss } = state;
  const cycleDamage = boss.maxHp - boss.currentHp;
  const pct = outcome === 'defeated'
    ? 100
    : Math.round(100 * (1 - boss.currentHp / boss.maxHp));
  const gems  = computeGems(boss.tier, pct);
  const title = (outcome === 'defeated' && (boss.tier === 'standard' || boss.tier === 'epic'))
    ? `${boss.name} Slayer`
    : null;

  const resolution = {
    type:    'boss:resolved',
    outcome,
    boss:    { ...boss },
    tier:    boss.tier,
    pct,
    gems,
    title,
  };

  const newPace         = updatePace(state.pace, cycleDamage);
  const newCycleIndex   = state.cycleIndex + 1;
  const newModifierIndex = state.modifierIndex + 1;
  const next = spawnBoss(newCycleIndex, newModifierIndex, newPace, now);

  return {
    ...next,
    resolutionQueue: [...state.resolutionQueue, resolution],
  };
}

export function applyDamageToState(state, taskXp, taskMeta, now) {
  const { boss } = state;

  const todayStr     = getLocalDateStr(now);
  const isFirstStrike = state.firstStrikeDate !== todayStr;
  const fsMult       = isFirstStrike ? CONFIG.FIRST_STRIKE_MULT : 1.0;
  const modMult      = computeModifierMult(boss.modifierId, taskMeta, now);
  const damage       = Math.round(taskXp * fsMult * modMult);
  const newHp        = Math.max(0, boss.currentHp - damage);

  // Ledger: FIFO eviction at 500 entries
  const rawLedger = { ...state.ledger, [taskMeta.taskId]: damage };
  const entries   = Object.entries(rawLedger);
  const newLedger = entries.length > 500
    ? Object.fromEntries(entries.slice(entries.length - 500))
    : rawLedger;

  const updated = {
    ...state,
    boss:            { ...boss, currentHp: newHp },
    firstStrikeDate: isFirstStrike ? todayStr : state.firstStrikeDate,
    ledger:          newLedger,
  };

  return newHp === 0
    ? resolveAndRespawn(updated, 'defeated', now)
    : updated;
}

export function applyHealToState(state, taskId) {
  const healAmount = state.ledger[taskId];
  if (healAmount === undefined) return state;

  const newHp     = Math.min(state.boss.maxHp, state.boss.currentHp + healAmount);
  const newLedger = { ...state.ledger };
  delete newLedger[taskId];

  return {
    ...state,
    boss:   { ...state.boss, currentHp: newHp },
    ledger: newLedger,
  };
}

export function setTierInState(state, tier) {
  if (state.boss.currentHp !== state.boss.maxHp) return state;
  const newHp = computeHp(state.pace, tier);
  return {
    ...state,
    boss: { ...state.boss, tier, maxHp: newHp, currentHp: newHp },
  };
}

export function checkExpiryInState(state, now) {
  if (now <= state.boss.endsAt) return state;
  if (state.boss.currentHp === 0) return state;
  return resolveAndRespawn(state, 'expired', now);
}

// ═══════════════════════════════════════════════════════════════════════════
//  IMPURE SHELL — localStorage persistence + event bus
//  Date.now() is only called here, never in the pure core.
// ═══════════════════════════════════════════════════════════════════════════

const LS_KEY       = 'nq_boss_v1';
const _subscribers = new Set();
let   _state       = null;

function _loadState() {
  try {
    const raw = typeof localStorage !== 'undefined' && localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (
      !p?.boss ||
      typeof p.pace !== 'number' || !isFinite(p.pace) ||
      !isFinite(p.boss.maxHp)   || !isFinite(p.boss.currentHp) ||
      !isFinite(p.boss.endsAt)
    ) return null;
    return p;
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

function _get(now) {
  if (!_state) {
    const loaded = _loadState();
    _state = loaded ?? spawnBoss(0, 0, CONFIG.DEFAULT_PACE, now);
  }
  const checked = checkExpiryInState(_state, now);
  if (checked !== _state) {
    _state = checked;
    _saveState(_state);
  }
  return _state;
}

function _set(newState) {
  _state = newState;
  _saveState(newState);
  _emit({ type: 'boss:update', state: newState });
}

export function subscribeBoss(fn) {
  _subscribers.add(fn);
  return () => _subscribers.delete(fn);
}

export function getBossState(now = Date.now()) {
  return _get(now);
}

export function applyBossDamage(taskXp, taskMeta, now = Date.now()) {
  const state    = _get(now);
  const prev     = state.resolutionQueue.length;
  const newState = applyDamageToState(state, taskXp, taskMeta, now);
  _set(newState);
  if (newState.resolutionQueue.length > prev) {
    const resolution = newState.resolutionQueue[newState.resolutionQueue.length - 1];
    _emit({ ...resolution });
  }
  return newState;
}

export function applyBossHeal(taskId) {
  const now      = Date.now();
  const state    = _get(now);
  const newState = applyHealToState(state, taskId);
  if (newState !== state) _set(newState);
  return newState;
}

export function setTier(tier) {
  const now      = Date.now();
  const state    = _get(now);
  const newState = setTierInState(state, tier);
  if (newState !== state) _set(newState);
  return newState;
}

export function consumeResolutions() {
  const now   = Date.now();
  const state = _get(now);
  const queue = [...state.resolutionQueue];
  if (queue.length > 0) {
    _state = { ...state, resolutionQueue: [] };
    _saveState(_state);
  }
  return queue;
}

// Test helper — resets module-level state for isolated tests
export function _resetForTesting() {
  _state = null;
}
