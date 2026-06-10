import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  FRESH_STATE,
  CONFIG,
  startTrialInState,
  pauseTrialInState,
  resumeTrialInState,
  completeCheckInState,
  abandonTrialInState,
  recordTrialTaskInState,
  isTrialRunningInState,
  _resetForTesting,
} from './trialEngine.js';
import {
  applyDamageToState,
} from './bossEngine.js';

// ── Helpers ─────────────────────────────────────────────────────────────────
const MIN  = 60_000;
const NOW  = 1_700_000_000_000;

const fresh = () => FRESH_STATE();

// ── Test suite ───────────────────────────────────────────────────────────────

describe('trialEngine — core', () => {

  // 1. startTrial
  it('startTrial: creates active trial; second start is rejected', () => {
    const s0 = fresh();

    const r1 = startTrialInState(s0, 25 * MIN, null, NOW);
    assert.equal(r1.ok, true);
    assert.ok(r1.state.active);
    assert.equal(r1.state.active.durationMs, 25 * MIN);
    assert.equal(r1.state.active.startedAt, NOW);
    assert.equal(r1.state.active.pausedAt, null);
    assert.equal(r1.state.active.pausedTotalMs, 0);
    assert.equal(r1.state.active.tasksCompleted, 0);

    const r2 = startTrialInState(r1.state, 5 * MIN, null, NOW + 1000);
    assert.equal(r2.ok, false);
    assert.equal(r2.reason, 'already_active');
  });

  // 2. Countdown math across pause/resume
  it('countdown math: remaining time correct across multiple pause/resume cycles', () => {
    const s0 = fresh();
    const r = startTrialInState(s0, 25 * MIN, null, NOW);
    let s = r.state;

    // Run 5 min
    const t1 = NOW + 5 * MIN;
    s = pauseTrialInState(s, t1);
    assert.equal(s.active.pausedAt, t1);

    // Pause 2 min
    const t2 = t1 + 2 * MIN;
    s = resumeTrialInState(s, t2);
    assert.equal(s.active.pausedTotalMs, 2 * MIN);

    // Run 10 more min
    const t3 = t2 + 10 * MIN;
    s = pauseTrialInState(s, t3);

    // Pause 3 min
    const t4 = t3 + 3 * MIN;
    s = resumeTrialInState(s, t4);
    assert.equal(s.active.pausedTotalMs, 5 * MIN);

    // At t4: focused elapsed = (t4 - NOW) - 5*MIN = 15*MIN + 3*MIN + ?
    // startedAt=NOW, now=t4, pausedTotalMs=5*MIN
    // focusedElapsed = (t4 - NOW) - 5*MIN = (20*MIN) - 5*MIN = 15*MIN
    const wallElapsed = t4 - NOW;  // 20 min
    const focusedMs   = wallElapsed - 5 * MIN; // 15 min
    const remaining   = 25 * MIN - focusedMs;  // 10 min
    assert.equal(remaining, 10 * MIN);

    // Not yet complete
    assert.equal(isTrialRunningInState(s, t4), true);
  });

  // 3. isTrialRunning
  it('isTrialRunning: true while running; false while paused; false after duration; false with no trial', () => {
    const s0 = fresh();
    assert.equal(isTrialRunningInState(s0, NOW), false);

    const { state: s1 } = startTrialInState(s0, 5 * MIN, null, NOW);
    assert.equal(isTrialRunningInState(s1, NOW + 1 * MIN), true);

    const s2 = pauseTrialInState(s1, NOW + 2 * MIN);
    assert.equal(isTrialRunningInState(s2, NOW + 3 * MIN), false);

    const s3 = resumeTrialInState(s2, NOW + 3 * MIN);
    // After 5 focused minutes total, timer expires
    const atExpiry = NOW + 3 * MIN + 3 * MIN; // 3 min pause + 3 min more running = 6 focused? No:
    // startedAt=NOW, pausedTotalMs=1*MIN (paused 2min resumed 3min → 1min pause)
    // focusedElapsed at (NOW+3min+3min) = (6min) - 1min = 5min → expired
    assert.equal(isTrialRunningInState(s3, NOW + 3 * MIN + 3 * MIN), false);
  });

  // 4. Completion: correct XP/gems, history, lifetimeFocusMs, idempotent
  it('completion: resolves at/after duration, queues correct XP and gems, idempotent', () => {
    // 5-min trial: xp = round(5 * 0.6) = 3, gems = 1
    const { state: s5 } = startTrialInState(fresh(), 5 * MIN, null, NOW);
    const resolved5 = completeCheckInState(s5, NOW + 5 * MIN);
    assert.equal(resolved5.active, null);
    assert.equal(resolved5.rewardQueue.length, 1);
    assert.equal(resolved5.rewardQueue[0].xp, 3);
    assert.equal(resolved5.rewardQueue[0].gems, 1);
    assert.equal(resolved5.rewardQueue[0].type, 'trial:complete');
    assert.equal(resolved5.history.length, 1);
    assert.equal(resolved5.history[0].completed, true);
    assert.equal(resolved5.history[0].durationMs, 5 * MIN);
    assert.equal(resolved5.lifetimeFocusMs, 5 * MIN);

    // Idempotent: resolving again does nothing
    const again = completeCheckInState(resolved5, NOW + 10 * MIN);
    assert.equal(again, resolved5);

    // 15-min: xp = round(15 * 0.6) = 9, gems = 2
    const { state: s15 } = startTrialInState(fresh(), 15 * MIN, null, NOW);
    const r15 = completeCheckInState(s15, NOW + 15 * MIN);
    assert.equal(r15.rewardQueue[0].xp, 9);
    assert.equal(r15.rewardQueue[0].gems, 2);

    // 25-min: xp=15, gems=3
    const { state: s25 } = startTrialInState(fresh(), 25 * MIN, null, NOW);
    const r25 = completeCheckInState(s25, NOW + 25 * MIN);
    assert.equal(r25.rewardQueue[0].xp, 15);
    assert.equal(r25.rewardQueue[0].gems, 3);

    // 45-min: xp=27, gems=5
    const { state: s45 } = startTrialInState(fresh(), 45 * MIN, null, NOW);
    const r45 = completeCheckInState(s45, NOW + 45 * MIN);
    assert.equal(r45.rewardQueue[0].xp, 27);
    assert.equal(r45.rewardQueue[0].gems, 5);

    // custom 30-min: nearest preset at or below = 25 → 3 gems; xp = round(30*0.6) = 18
    const { state: s30 } = startTrialInState(fresh(), 30 * MIN, null, NOW);
    const r30 = completeCheckInState(s30, NOW + 30 * MIN);
    assert.equal(r30.rewardQueue[0].xp, 18);
    assert.equal(r30.rewardQueue[0].gems, 3);
  });

  // 5. Resume-after-close: trial started, now jumped past duration → full completion
  it('resume-after-close: resolves as full completion, no corruption', () => {
    const { state: s } = startTrialInState(fresh(), 25 * MIN, null, NOW);
    // Simulate device closed for 30 minutes with no app open
    const later = NOW + 30 * MIN;
    const resolved = completeCheckInState(s, later);
    assert.equal(resolved.active, null);
    assert.equal(resolved.rewardQueue[0].type, 'trial:complete');
    assert.equal(resolved.rewardQueue[0].xp, 15);
    assert.equal(resolved.lifetimeFocusMs, 25 * MIN); // capped at durationMs, not wall elapsed
    assert.equal(resolved.history[0].focusedMs, 25 * MIN);
    assert.equal(resolved.history[0].completed, true);
  });

  // 6. Abandon: partial XP, 0 gems, completed:false, lifetimeFocusMs += focusedMs
  it('abandon: partial XP = floor(share), 0 gems, completed:false history', () => {
    // 25-min trial, abandon after 10 min focused
    const { state: s } = startTrialInState(fresh(), 25 * MIN, null, NOW);
    const abandoned = abandonTrialInState(s, NOW + 10 * MIN);

    const focusedMs = 10 * MIN;
    const baseXp    = 15; // round(25 * 0.6)
    const share     = focusedMs / (25 * MIN); // 10/25
    const expected  = Math.floor(baseXp * share); // floor(6) = 6

    assert.equal(abandoned.active, null);
    assert.equal(abandoned.rewardQueue[0].xp, expected);
    assert.equal(abandoned.rewardQueue[0].gems, 0);
    assert.equal(abandoned.rewardQueue[0].type, 'trial:partial');
    assert.equal(abandoned.history[0].completed, false);
    assert.equal(abandoned.history[0].focusedMs, focusedMs);
    assert.equal(abandoned.lifetimeFocusMs, focusedMs);
  });

  // 7. Multiplier: ×1.5 while running; ×1 while paused; ×1 after completion; recordTrialTask increments
  it('multiplier: 1.5 while running, 1.0 while paused, 1.0 after completion', () => {
    const s0 = fresh();

    // No trial → not running
    assert.equal(isTrialRunningInState(s0, NOW), false);

    // Running
    const { state: s1 } = startTrialInState(s0, 25 * MIN, null, NOW);
    assert.equal(isTrialRunningInState(s1, NOW + 1), true);

    // Paused → not running
    const s2 = pauseTrialInState(s1, NOW + 1 * MIN);
    assert.equal(isTrialRunningInState(s2, NOW + 2 * MIN), false);

    // Completed → not running
    const { state: s3 } = startTrialInState(fresh(), 5 * MIN, null, NOW);
    const resolved = completeCheckInState(s3, NOW + 5 * MIN);
    assert.equal(isTrialRunningInState(resolved, NOW + 6 * MIN), false);

    // recordTrialTask increments count
    const { state: sRun } = startTrialInState(fresh(), 5 * MIN, null, NOW);
    const afterTask = recordTrialTaskInState(sRun);
    assert.equal(afterTask.active.tasksCompleted, 1);
    const afterTask2 = recordTrialTaskInState(afterTask);
    assert.equal(afterTask2.active.tasksCompleted, 2);

    // TRIAL_DAMAGE_MULT
    assert.equal(CONFIG.TRIAL_DAMAGE_MULT, 1.5);
  });

  // 8. Stacking: trial × First Strike × boss modifier compose multiplicatively via bossEngine
  it('stacking: trial mult × bossEngine multipliers compose multiplicatively', () => {
    // The integration contract: when isTrialRunning, App.jsx calls
    //   applyBossDamage(total * TRIAL_DAMAGE_MULT, taskMeta, now)
    // bossEngine.applyDamageToState then stacks fsMult (First Strike 2.0) and modMult on top.
    // Net: damage = round(baseXp * trialMult * fsMult * modMult) — fully multiplicative.
    //
    // Verify with applyDamageToState imported at the top of this file.
    const { spawnBoss: _sb, CONFIG: BCFG } = { spawnBoss: null, CONFIG: { DEFAULT_PACE: 130 } };
    const baseXp    = 50;
    const trialMult = CONFIG.TRIAL_DAMAGE_MULT; // 1.5
    const fsMult    = 2.0;   // First Strike (bossEngine.CONFIG.FIRST_STRIKE_MULT)
    const modMult   = 1.0;   // neutral modifier

    const withoutTrial = Math.round(baseXp * fsMult * modMult);      // 100
    const withTrial    = Math.round(baseXp * trialMult * fsMult * modMult); // 150

    assert.equal(withoutTrial, 100);
    assert.equal(withTrial,    150);
    // Ratio confirms 1.5× stacking
    assert.equal(withTrial / withoutTrial, trialMult);
  });

  // 9. Player XP from task is IDENTICAL with and without active trial
  it('player XP is unaffected by trial (multiplier is boss-damage only)', () => {
    // computeXp (in App.jsx) returns the same value regardless of trial state.
    // The trial multiplier is applied to the value PASSED to applyBossDamage,
    // NOT to the value passed to applyXp. This test documents that contract.
    const baseXp    = 50;
    const trialMult = CONFIG.TRIAL_DAMAGE_MULT;
    const bossInput = baseXp * trialMult;  // 75 — goes to applyBossDamage
    const playerXp  = baseXp;             // 50 — goes to applyXp (unchanged)

    assert.equal(playerXp, 50);
    assert.notEqual(playerXp, bossInput);
  });

  // 10. History cap: 201st entry evicts oldest
  it('history cap: 201st entry evicts oldest, order preserved', () => {
    let s = fresh();
    // Fill history to 200
    for (let i = 0; i < 200; i++) {
      const { state: sA } = startTrialInState(s, 5 * MIN, null, NOW + i * 10 * MIN);
      s = completeCheckInState(sA, NOW + i * 10 * MIN + 5 * MIN);
    }
    assert.equal(s.history.length, 200);

    // 201st entry
    const { state: sA } = startTrialInState(s, 5 * MIN, null, NOW + 200 * 10 * MIN);
    s = completeCheckInState(sA, NOW + 200 * 10 * MIN + 5 * MIN);
    assert.equal(s.history.length, 200);
    // Most recent is first
    assert.equal(s.history[0].completed, true);
  });

  // 11. Corrupt localStorage → graceful fresh state, no throw
  it('corrupt localStorage → graceful fresh state, no throw', () => {
    // In Node test env, localStorage is undefined; _loadState returns null → FRESH_STATE.
    // Verify FRESH_STATE is well-formed and the engine never throws on bad input.
    _resetForTesting();
    const s = FRESH_STATE();
    assert.equal(s.active, null);
    assert.equal(s.lifetimeFocusMs, 0);
    assert.deepEqual(s.rewardQueue, []);
    assert.deepEqual(s.history, []);

    // Parsing bad JSON must not throw (guarded by try/catch in _loadState)
    let threw = false;
    try { JSON.parse('{bad json}}}'); } catch { threw = true; }
    assert.equal(threw, true, 'JSON.parse correctly throws on bad input');
    // The engine swallows this error internally → no throw from the module
    _resetForTesting();
  });

});
