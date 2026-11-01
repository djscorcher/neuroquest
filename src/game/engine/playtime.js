import { gameDate } from '../../lib/gameDay.js';
import {
  PLAYTIME_BY_DIFFICULTY, HABIT_PLAYTIME, HABIT_DAILY_CAP, DAY_CLEARED_BONUS,
} from '../../config/balance.js';

// ═══════════════════════════════════════════════════════════════════════════
//  PURE CORE — playtime ledger. Real tasks grant minutes; the world spends
//  them only while the player is actively doing something.
// ═══════════════════════════════════════════════════════════════════════════

const MIN = 60_000;
const LEDGER_CAP = 200;

export const FRESH_STATE = () => ({
  balanceMs:         0,
  ledger:            [],    // newest first: { source, minutes, at }
  habitDay:          null,  // game-day the habit counter belongs to
  habitMinutesToday: 0,
  dayClearedOn:      null,  // game-day the Day Cleared bonus was paid
});

function credit(state, source, minutes, now) {
  if (minutes <= 0) return state;
  return {
    ...state,
    balanceMs: state.balanceMs + minutes * MIN,
    ledger: [{ source, minutes, at: now }, ...state.ledger].slice(0, LEDGER_CAP),
  };
}

export function grantForTaskInState(state, difficulty, now) {
  return credit(state, 'task', PLAYTIME_BY_DIFFICULTY[difficulty] ?? PLAYTIME_BY_DIFFICULTY.Easy, now);
}

// Habits pay a little each, capped per game-day so 30 tiny habits can't farm time.
export function grantForHabitInState(state, now) {
  const day = gameDate(now);
  const usedToday = state.habitDay === day ? state.habitMinutesToday : 0;
  const minutes = Math.min(HABIT_PLAYTIME, HABIT_DAILY_CAP - usedToday);
  const next = { ...state, habitDay: day, habitMinutesToday: usedToday + Math.max(0, minutes) };
  return credit(next, 'habit', minutes, now);
}

// Paid at most once per game-day.
export function grantDayClearedInState(state, now) {
  const day = gameDate(now);
  if (state.dayClearedOn === day) return state;
  return credit({ ...state, dayClearedOn: day }, 'dayCleared', DAY_CLEARED_BONUS, now);
}

// Drains the balance only while active (moving, battling, crafting).
export function tickInState(state, elapsedMs, isActive) {
  if (!isActive || elapsedMs <= 0 || state.balanceMs <= 0) return state;
  return { ...state, balanceMs: Math.max(0, state.balanceMs - elapsedMs) };
}

export const isOutOfTime = (state) => state.balanceMs <= 0;

export const formatPlaytime = (ms) => {
  const totalSec = Math.ceil(Math.max(0, ms) / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};
