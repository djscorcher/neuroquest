export const DAY_ROLLOVER_HOUR = 3;

// Returns local "YYYY-MM-DD" string where the day rolls over at rolloverHour (default 3 AM).
// A task at 1:30 AM belongs to the *previous* calendar date's game-day.
export function gameDate(now, rolloverHour = DAY_ROLLOVER_HOUR) {
  const shifted = new Date(now - rolloverHour * 3600 * 1000);
  const y  = shifted.getFullYear();
  const m  = String(shifted.getMonth() + 1).padStart(2, '0');
  const d  = String(shifted.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Whole game-days between two "YYYY-MM-DD" strings (A − B).
// Uses calendar arithmetic so DST ±1h gaps don't shift the count.
export function daysBetween(dateA, dateB) {
  const parse = (s) => {
    const [y, mo, d] = s.split('-').map(Number);
    return new Date(y, mo - 1, d).getTime();
  };
  return Math.round((parse(dateA) - parse(dateB)) / 86400000);
}
