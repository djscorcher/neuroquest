// All tunable game numbers live here, so balance changes never mean hunting through UI code.
// Engine-specific numbers (boss, streak, trial) stay in each engine's CONFIG for now.

// ── Quest XP ────────────────────────────────────────────────────────────────
export const DIFFICULTY_BASE       = { Easy: 10, Medium: 25, Hard: 50 };
export const IMPORTANCE_MULT       = { Low: 1.0, Medium: 1.25, High: 1.5, Critical: 2.0 };
export const MAX_TIMING_BONUS_RATE = 1.0;   // finishing early can add up to +100% XP
export const XP_PER_LEVEL          = 100;

// ── Missed-quest penalties (multiplied by importance) ───────────────────────
export const TIMER_MISS_PENALTY = 10;
export const DUE_MISS_PENALTY   = 15;

// ── Ranks by level ──────────────────────────────────────────────────────────
export const RANKS = [
  { min:1,  label:"RECRUIT"   }, { min:5,  label:"WARRIOR"   },
  { min:10, label:"VETERAN"   }, { min:20, label:"ELITE"      },
  { min:35, label:"CHAMPION"  }, { min:50, label:"LEGEND"     },
];

// ── Playtime (minutes of game time earned from real life) ───────────────────
export const PLAYTIME_BY_DIFFICULTY = { Easy: 5, Medium: 15, Hard: 30 };
export const HABIT_PLAYTIME         = 2;    // per habit checked off
export const HABIT_DAILY_CAP        = 10;   // max habit minutes per game-day
export const DAY_CLEARED_BONUS      = 10;   // finishing every task today
export const IDLE_TIMEOUT_MS        = 10_000; // clock stops after this long with no input

// ── World / combat ──────────────────────────────────────────────────────────
export const PARTY_PET_SLOTS = 1;
export const PLAYER_BASE     = { hp: 30, atk: 5, def: 1 };
