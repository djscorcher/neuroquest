import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FRESH_STATE, grantForTaskInState, grantForHabitInState, grantDayClearedInState,
  tickInState, isOutOfTime, formatPlaytime,
} from './playtime.js';

const MIN = 60_000;
const NOW = new Date(2026, 10, 1, 15, 0).getTime(); // 3pm local, mid game-day

describe('playtime', () => {
  it('tasks grant minutes by difficulty', () => {
    let s = FRESH_STATE();
    s = grantForTaskInState(s, 'Easy', NOW);
    s = grantForTaskInState(s, 'Medium', NOW);
    s = grantForTaskInState(s, 'Hard', NOW);
    assert.equal(s.balanceMs, (5 + 15 + 30) * MIN);
    assert.equal(s.ledger.length, 3);
    assert.equal(s.ledger[0].minutes, 30); // newest first
  });

  it('unknown difficulty falls back to Easy', () => {
    assert.equal(grantForTaskInState(FRESH_STATE(), 'Weird', NOW).balanceMs, 5 * MIN);
  });

  it('habits pay 2 each, capped at 10 per game-day, reset next day', () => {
    let s = FRESH_STATE();
    for (let i = 0; i < 8; i++) s = grantForHabitInState(s, NOW);
    assert.equal(s.balanceMs, 10 * MIN);
    s = grantForHabitInState(s, NOW + 24 * 3600 * 1000);
    assert.equal(s.balanceMs, 12 * MIN);
  });

  it('Day Cleared pays once per game-day', () => {
    let s = grantDayClearedInState(FRESH_STATE(), NOW);
    s = grantDayClearedInState(s, NOW + 1000);
    assert.equal(s.balanceMs, 10 * MIN);
    s = grantDayClearedInState(s, NOW + 24 * 3600 * 1000);
    assert.equal(s.balanceMs, 20 * MIN);
  });

  it('clock only drains while active, never below zero', () => {
    let s = grantForTaskInState(FRESH_STATE(), 'Easy', NOW);
    assert.equal(tickInState(s, 30_000, false), s);       // idle: unchanged
    s = tickInState(s, 30_000, true);
    assert.equal(s.balanceMs, 5 * MIN - 30_000);
    s = tickInState(s, 10 * MIN, true);
    assert.equal(s.balanceMs, 0);
    assert.ok(isOutOfTime(s));
  });

  it('formats as m:ss', () => {
    assert.equal(formatPlaytime(5 * MIN), '5:00');
    assert.equal(formatPlaytime(61_500), '1:02');
    assert.equal(formatPlaytime(-5), '0:00');
  });
});
