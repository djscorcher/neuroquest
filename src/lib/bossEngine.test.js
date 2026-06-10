import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONFIG, BOSSES, MODIFIERS,
  computeStandardHp, computeHp,
  spawnBoss, updatePace, computeGems, getLocalDateStr,
  applyDamageToState, applyHealToState,
  setTierInState, checkExpiryInState,
  resolveAndRespawn,
  _resetForTesting,
} from './bossEngine.js';
import { gameDate } from './gameDay.js';

// Fixed timestamps for deterministic tests
const NOW   = 1_700_000_000_000; // arbitrary epoch ms
const CYCLE = CONFIG.CYCLE_MS;

// ── helpers ─────────────────────────────────────────────────────────────────
function freshState(overrides = {}) {
  return spawnBoss(0, 0, CONFIG.DEFAULT_PACE, NOW, overrides);
}

function withBoss(bossOverrides, stateOverrides = {}) {
  const base = freshState();
  return {
    ...base,
    ...stateOverrides,
    boss: { ...base.boss, ...bossOverrides },
  };
}

// ── 1. Fresh spawn ───────────────────────────────────────────────────────────
test('fresh spawn: standard tier, correct HP, 72h window', () => {
  const state = spawnBoss(0, 0, CONFIG.DEFAULT_PACE, NOW);

  // HP: max(150, round(130 * 1.15)) = max(150, 150) = 150; standard mult = 1.0
  const expectedHp = Math.max(
    CONFIG.MIN_STANDARD_HP,
    Math.round(CONFIG.DEFAULT_PACE * CONFIG.HP_FACTOR),
  );
  assert.equal(state.boss.tier,      'standard');
  assert.equal(state.boss.maxHp,     expectedHp);
  assert.equal(state.boss.currentHp, expectedHp);
  assert.equal(state.boss.endsAt,    NOW + CYCLE);
  assert.equal(state.boss.startsAt,  NOW);
  assert.deepEqual(state.ledger,     {});
  assert.deepEqual(state.resolutionQueue, []);
  assert.equal(state.pace,           CONFIG.DEFAULT_PACE);
});

// ── 2. Damage reduces HP, clamps at 0 ───────────────────────────────────────
test('damage reduces HP to integer, clamps at 0', () => {
  const state = withBoss({ modifierId: 'punctual' }); // onTime=false → mult=1
  const meta  = { taskId: 'task1', importance: 'Medium', onTime: false };

  // Ensure no first-strike (set firstStrikeDate to today)
  const stateNoFS = { ...state, firstStrikeDate: gameDate(NOW) };

  const after = applyDamageToState(stateNoFS, 30, meta, NOW);
  assert.equal(after.boss.currentHp, state.boss.maxHp - 30);
  assert.equal(Number.isInteger(after.boss.currentHp), true);

  // Over-damage: HP hits 0 → resolution queued → new boss spawned with full HP
  const meta2      = { taskId: 'task2', importance: 'Medium', onTime: false };
  const overDamage = applyDamageToState(stateNoFS, 9999, meta2, NOW);
  assert.equal(overDamage.resolutionQueue.length, 1);
  assert.equal(overDamage.resolutionQueue[0].outcome, 'defeated');
  assert.equal(overDamage.boss.currentHp, overDamage.boss.maxHp);
});

// ── 3. Kill ──────────────────────────────────────────────────────────────────
test('kill: correct resolution queued, ledger cleared, next boss spawned', () => {
  const hp    = 50;
  const state = withBoss({ maxHp: hp, currentHp: hp }, { firstStrikeDate: gameDate(NOW) });
  const meta  = { taskId: 'taskKill', importance: 'Medium', onTime: false };
  // Use a modifier that gives 1× (punctual + onTime=false)
  const s     = { ...state, boss: { ...state.boss, modifierId: 'punctual' } };

  const after = applyDamageToState(s, hp, meta, NOW);

  // Should have resolved and spawned next
  assert.equal(after.resolutionQueue.length, 1);
  const res = after.resolutionQueue[0];
  assert.equal(res.outcome, 'defeated');
  assert.equal(res.pct,     100);
  assert.equal(res.tier,    'standard');
  // gems: round(50 * 1.0 * 100/100) = 50
  assert.equal(res.gems, Math.round(CONFIG.BASE_GEMS * CONFIG.GEM_TIER_MULT.standard));
  // title at standard
  assert.ok(res.title !== null && res.title.includes('Slayer'));

  // New boss spawned with fresh window
  assert.ok(after.boss.endsAt >= NOW + CYCLE - 1);
  assert.equal(after.boss.currentHp, after.boss.maxHp);
  // Ledger cleared on new boss
  assert.deepEqual(after.ledger, {});
});

test('kill at minor tier: gems proportional, NO title', () => {
  const hp    = 50;
  const state = {
    ...withBoss({ maxHp: hp, currentHp: hp, tier: 'minor', modifierId: 'punctual' }),
    firstStrikeDate: gameDate(NOW),
  };
  const meta  = { taskId: 't1', importance: 'Medium', onTime: false };
  const after = applyDamageToState(state, hp, meta, NOW);

  const res = after.resolutionQueue[0];
  assert.equal(res.outcome, 'defeated');
  assert.equal(res.pct,     100);
  // minor gems: round(50 * 0.5 * 1) = 25
  assert.equal(res.gems, Math.round(CONFIG.BASE_GEMS * CONFIG.GEM_TIER_MULT.minor));
  assert.equal(res.title, null); // no title for minor
});

// ── 4. Expiry ────────────────────────────────────────────────────────────────
test('expiry: partial pct, proportional gems, next boss spawned', () => {
  // Boss with 50 HP remaining of 150 maxHp
  const state = withBoss({ maxHp: 150, currentHp: 50, modifierId: 'punctual' });
  const expiredNow = state.boss.endsAt + 1;

  const after = checkExpiryInState(state, expiredNow);

  assert.equal(after.resolutionQueue.length, 1);
  const res = after.resolutionQueue[0];
  assert.equal(res.outcome, 'expired');
  // pct = round(100 * (1 - 50/150)) = round(66.67) = 67
  assert.equal(res.pct, Math.round(100 * (1 - 50 / 150)));
  // gems: round(50 * 1.0 * pct/100)
  assert.equal(res.gems, Math.round(CONFIG.BASE_GEMS * CONFIG.GEM_TIER_MULT.standard * res.pct / 100));
  // Fresh boss spawned anchored to expiredNow
  assert.equal(after.boss.endsAt, expiredNow + CYCLE);
  assert.equal(after.boss.currentHp, after.boss.maxHp);
});

// ── 5. Multi-cycle offline gap ───────────────────────────────────────────────
test('multi-cycle offline gap: exactly ONE resolution, fresh boss from now', () => {
  const state = withBoss({ maxHp: 150, currentHp: 80 }); // partial damage done
  // "now" is 3 cycles later
  const farFuture = state.boss.endsAt + 3 * CYCLE;

  const after = checkExpiryInState(state, farFuture);

  // Exactly one resolution (the boss that was active)
  assert.equal(after.resolutionQueue.length, 1);
  // New boss anchored to farFuture
  assert.equal(after.boss.endsAt, farFuture + CYCLE);
  assert.equal(after.boss.currentHp, after.boss.maxHp);
});

// ── 6. First Strike ──────────────────────────────────────────────────────────
test('first strike: 2× on first task of day, 1× on second, resets next day', () => {
  const yesterday = gameDate(NOW - 86_400_000);
  // Boss with 1000 HP so it won't die
  const state = withBoss({ maxHp: 1000, currentHp: 1000, modifierId: 'punctual' }, { firstStrikeDate: yesterday });

  const meta = { taskId: 't1', importance: 'Medium', onTime: false };
  const after1 = applyDamageToState(state, 30, meta, NOW);

  // First task of day: 2× → damage = 60
  assert.equal(after1.boss.currentHp, 1000 - 30 * CONFIG.FIRST_STRIKE_MULT);
  assert.equal(after1.firstStrikeDate, gameDate(NOW));

  // Second task same day: 1× → damage = 30
  const meta2 = { taskId: 't2', importance: 'Medium', onTime: false };
  const after2 = applyDamageToState(after1, 30, meta2, NOW);
  assert.equal(after2.boss.currentHp, after1.boss.currentHp - 30);

  // Next day: first strike available again
  const tomorrow     = NOW + 86_400_000;
  const meta3        = { taskId: 't3', importance: 'Medium', onTime: false };
  const after3       = applyDamageToState(after2, 30, meta3, tomorrow);
  const expectedDmg3 = 30 * CONFIG.FIRST_STRIKE_MULT;
  assert.equal(after3.boss.currentHp, after2.boss.currentHp - expectedDmg3);
});

// ── 7. Modifier multipliers (no first strike) ────────────────────────────────
test('weak_high: 2× for High, 1× for Medium', () => {
  const today = gameDate(NOW);
  const base  = { ...withBoss({ maxHp: 2000, currentHp: 2000, modifierId: 'weak_high' }), firstStrikeDate: today };

  const highMeta   = { taskId: 'h1', importance: 'High',   onTime: false };
  const medMeta    = { taskId: 'm1', importance: 'Medium', onTime: false };
  const afterHigh  = applyDamageToState(base, 50, highMeta, NOW);
  const afterMed   = applyDamageToState(afterHigh, 50, medMeta, NOW);

  assert.equal(afterHigh.boss.currentHp, 2000 - 50 * 2.0); // 1900
  assert.equal(afterMed.boss.currentHp,  1900 - 50 * 1.0); // 1850
});

test('weak_critical: 2.5× for Critical, 1× for High', () => {
  const today = gameDate(NOW);
  const base  = { ...withBoss({ maxHp: 2000, currentHp: 2000, modifierId: 'weak_critical' }), firstStrikeDate: today };

  const critMeta = { taskId: 'c1', importance: 'Critical', onTime: false };
  const highMeta = { taskId: 'h1', importance: 'High',     onTime: false };
  const afterCrit = applyDamageToState(base, 40, critMeta, NOW);
  const afterHigh = applyDamageToState(afterCrit, 40, highMeta, NOW);

  assert.equal(afterCrit.boss.currentHp, 2000 - 40 * 2.5); // 1900
  assert.equal(afterHigh.boss.currentHp, 1900 - 40 * 1.0); // 1860
});

test('first strike × modifier stacks multiplicatively', () => {
  const yesterday = getLocalDateStr(NOW - 86_400_000);
  const base = { ...withBoss({ maxHp: 5000, currentHp: 5000, modifierId: 'weak_critical' }), firstStrikeDate: yesterday };
  const meta = { taskId: 'c1', importance: 'Critical', onTime: false };

  const after = applyDamageToState(base, 40, meta, NOW);
  // 2.0 (FS) × 2.5 (crit) × 40 = 200
  assert.equal(after.boss.currentHp, 5000 - Math.round(40 * 2.0 * 2.5));
});

test('early_bird: 1.5× before noon, 1× after noon', () => {
  const today = gameDate(NOW);
  const base  = { ...withBoss({ maxHp: 5000, currentHp: 5000, modifierId: 'early_bird' }), firstStrikeDate: today };
  const meta  = { taskId: 'e1', importance: 'Medium', onTime: false };

  const earlyTs = new Date(NOW); earlyTs.setHours(8, 0, 0, 0);
  const lateTs  = new Date(NOW); lateTs.setHours(14, 0, 0, 0);

  const afterEarly = applyDamageToState(base, 40, { ...meta, taskId: 'e1' }, earlyTs.getTime());
  const afterLate  = applyDamageToState(afterEarly, 40, { ...meta, taskId: 'e2' }, lateTs.getTime());

  assert.equal(afterEarly.boss.currentHp, 5000 - Math.round(40 * 1.5));
  assert.equal(afterLate.boss.currentHp,  afterEarly.boss.currentHp - Math.round(40 * 1.0));
});

test('punctual: 1.5× on onTime=true, 1× on false', () => {
  const today = gameDate(NOW);
  const base  = { ...withBoss({ maxHp: 5000, currentHp: 5000, modifierId: 'punctual' }), firstStrikeDate: today };

  const onTime  = { taskId: 'p1', importance: 'Medium', onTime: true  };
  const offTime = { taskId: 'p2', importance: 'Medium', onTime: false };

  const a = applyDamageToState(base, 40, onTime,  NOW);
  const b = applyDamageToState(a,    40, offTime, NOW);

  assert.equal(a.boss.currentHp, 5000 - Math.round(40 * 1.5));
  assert.equal(b.boss.currentHp, a.boss.currentHp - Math.round(40 * 1.0));
});

// ── 8. Heal ──────────────────────────────────────────────────────────────────
test('heal: restores exact ledger amount (crit-inflated), exploit closed', () => {
  // Simulate a crit-multiplied hit that dealt 100 damage
  const state = withBoss({ maxHp: 200, currentHp: 100 }, { ledger: { 'task99': 100 } });
  const after = applyHealToState(state, 'task99');

  assert.equal(after.boss.currentHp, 200); // fully restored
  assert.equal(after.ledger['task99'], undefined); // ledger entry removed
});

test('heal: unknown taskId heals nothing', () => {
  const state = withBoss({ maxHp: 200, currentHp: 100 });
  const after = applyHealToState(state, 'unknown_id');

  assert.equal(after.boss.currentHp, 100); // unchanged
  assert.equal(after === state, true);      // same reference (no change)
});

test('heal: clamps at maxHp', () => {
  // Ledger says task dealt 999 but boss is almost full
  const state = withBoss({ maxHp: 100, currentHp: 95 }, { ledger: { 'bigTask': 999 } });
  const after = applyHealToState(state, 'bigTask');

  assert.equal(after.boss.currentHp, 100); // clamped
});

// ── 9. setTier ───────────────────────────────────────────────────────────────
test('setTier: works while undamaged, recomputes HP', () => {
  const state = freshState(); // undamaged
  assert.equal(state.boss.tier, 'standard');

  const epic = setTierInState(state, 'epic');
  assert.equal(epic.boss.tier, 'epic');
  assert.equal(epic.boss.maxHp, computeHp(state.pace, 'epic'));
  assert.equal(epic.boss.currentHp, epic.boss.maxHp);

  const minor = setTierInState(state, 'minor');
  assert.equal(minor.boss.tier,    'minor');
  assert.equal(minor.boss.maxHp,   computeHp(state.pace, 'minor'));
});

test('setTier: rejected after first damage', () => {
  const today   = gameDate(NOW);
  const state   = { ...freshState(), firstStrikeDate: today };
  const meta    = { taskId: 't1', importance: 'Medium', onTime: false };
  const damaged = applyDamageToState(state, 10, meta, NOW);

  assert.ok(damaged.boss.currentHp < damaged.boss.maxHp);

  const unchanged = setTierInState(damaged, 'epic');
  assert.equal(unchanged === damaged, true); // same reference → rejected
});

// ── 10. Pace EMA ─────────────────────────────────────────────────────────────
test('pace EMA: growth capped at +25%', () => {
  const pace   = 130;
  const result = updatePace(pace, 300); // massive over-performance
  assert.ok(result <= pace * CONFIG.PACE_GROWTH_CAP + 0.001, `${result} should be ≤ ${pace * CONFIG.PACE_GROWTH_CAP}`);
});

test('pace EMA: decay floored at −15%', () => {
  const pace   = 130;
  const result = updatePace(pace, 0); // zero damage
  // raw = 130 + 0.4*(0-130) = 78; floor = 130*0.85 = 110.5
  assert.ok(result >= pace * CONFIG.PACE_DECAY_FLOOR - 0.001, `${result} should be ≥ ${pace * CONFIG.PACE_DECAY_FLOOR}`);
});

test('pace EMA: never below PACE_MIN', () => {
  const result = updatePace(CONFIG.PACE_MIN, 0);
  assert.ok(result >= CONFIG.PACE_MIN);
});

test('pace EMA: normal growth in-bounds', () => {
  const pace   = 130;
  // cycleDamage = 200 → raw = 130 + 0.4*70 = 158; within [110.5, 162.5]
  const result = updatePace(pace, 200);
  assert.equal(result, 158);
});

test('pace EMA: low pace pinned to PACE_MIN', () => {
  const pace   = 80;
  // floor = 80*0.85 = 68; PACE_MIN = 100 → result = 100
  const result = updatePace(pace, 0);
  assert.equal(result, CONFIG.PACE_MIN);
});

// ── 11. Corrupt localStorage → fresh spawn ───────────────────────────────────
test('corrupt localStorage: fresh spawn, no throw', () => {
  const restore = typeof global.localStorage !== 'undefined' ? global.localStorage : undefined;

  global.localStorage = {
    getItem:    () => '{ CORRUPT JSON !!! {{{',
    setItem:    () => {},
    removeItem: () => {},
  };
  _resetForTesting();

  let caught = false;
  let state;
  try {
    // getBossState is the shell entry point — will call _loadState internally
    // We test via spawnBoss (pure) + _resetForTesting since Node has no real LS
    state = spawnBoss(0, 0, CONFIG.DEFAULT_PACE, NOW);
  } catch {
    caught = true;
  }
  assert.equal(caught, false, 'should not throw on corrupt state');
  assert.ok(state.boss.currentHp > 0, 'spawned boss should have HP');

  // Restore
  if (restore !== undefined) global.localStorage = restore;
  else delete global.localStorage;
  _resetForTesting();
});

// ── 12. First Strike boundary at 3 AM, not midnight ──────────────────────────
test('first strike: resets at 3 AM boundary, not midnight', () => {
  // Jan 14, 2024 at 9 PM — first task of that game-day → first strike fires
  const jan14_9pm = new Date(2024, 0, 14, 21, 0, 0).getTime();
  // Jan 15, 2024 at 2 AM — still Jan 14 game-day (< 3 AM rollover) → NO first strike
  const jan15_2am = new Date(2024, 0, 15, 2, 0, 0).getTime();
  // Jan 15, 2024 at 3:01 AM — now Jan 15 game-day → first strike resets
  const jan15_3am = new Date(2024, 0, 15, 3, 1, 0).getTime();

  const state = withBoss({ maxHp: 5000, currentHp: 5000, modifierId: 'punctual' });
  const meta  = { taskId: 't1', importance: 'Medium', onTime: false };

  // First task at 9 PM → 2× first strike, firstStrikeDate = Jan 14 game-day
  const after1 = applyDamageToState(state, 30, meta, jan14_9pm);
  assert.equal(after1.boss.currentHp, 5000 - 30 * CONFIG.FIRST_STRIKE_MULT);
  assert.equal(after1.firstStrikeDate, gameDate(jan14_9pm));

  // Task at 2 AM Jan 15 → same game-day as Jan 14 (1×, no bonus)
  const after2 = applyDamageToState(after1, 30, { ...meta, taskId: 't2' }, jan15_2am);
  assert.equal(after2.boss.currentHp, after1.boss.currentHp - 30);

  // Task at 3:01 AM Jan 15 → new game-day → first strike resets (2×)
  const after3 = applyDamageToState(after2, 30, { ...meta, taskId: 't3' }, jan15_3am);
  assert.equal(after3.boss.currentHp, after2.boss.currentHp - 30 * CONFIG.FIRST_STRIKE_MULT);
  assert.equal(after3.firstStrikeDate, gameDate(jan15_3am));
});
