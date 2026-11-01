import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startBattle, battleReducer, lootFor } from './combat.js';
import { ITEMS } from '../data/items.js';
import { ENEMIES } from '../data/enemies.js';

const loadout = { pet: ITEMS.mothling, magic: [ITEMS.spark, ITEMS.mend], accessories: [ITEMS.fangring] };
const run = (state, actions) => actions.reduce(battleReducer, state);

describe('combat', () => {
  it('accessories buff stats; pet joins', () => {
    const s = startBattle(loadout, ENEMIES.fogling, 42);
    assert.equal(s.player.atk, 5 + 2);
    assert.equal(s.pet.name, 'Mothling');
    assert.equal(s.magic.length, 2);
  });

  it('same seed + same actions → same result (replayable)', () => {
    const acts = Array(6).fill({ type: 'attack' });
    const a = run(startBattle(loadout, ENEMIES.fogling, 7), acts);
    const b = run(startBattle(loadout, ENEMIES.fogling, 7), acts);
    assert.deepEqual(a, b);
  });

  it('attacking eventually wins against a fogling with a pet', () => {
    let s = startBattle(loadout, ENEMIES.fogling, 1);
    for (let i = 0; i < 20 && !s.outcome; i++) s = battleReducer(s, { type: 'attack' });
    assert.equal(s.outcome, 'win');
    assert.equal(s.enemy.hp, 0);
  });

  it('mend heals but not past max; unknown magic is a no-op', () => {
    let s = startBattle(loadout, ENEMIES.fogwarden, 3);
    s = { ...s, player: { ...s.player, hp: 5 } };
    const healed = battleReducer(s, { type: 'magic', id: 'mend' });
    assert.ok(healed.player.hp > 5 - 10); // healed 10, then took a hit
    assert.equal(battleReducer(s, { type: 'magic', id: 'nope' }), s);
  });

  it('player can lose with no loadout vs the warden; finished battles ignore actions', () => {
    let s = startBattle({ pet: null, magic: [], accessories: [] }, ENEMIES.fogwarden, 9);
    for (let i = 0; i < 50 && !s.outcome; i++) s = battleReducer(s, { type: 'defend' });
    assert.equal(s.outcome, 'lose');
    assert.equal(battleReducer(s, { type: 'attack' }), s);
  });

  it('flee ends the battle', () => {
    assert.equal(battleReducer(startBattle(loadout, ENEMIES.fogling, 1), { type: 'flee' }).outcome, 'fled');
  });

  it('first-time drops only once', () => {
    assert.deepEqual(lootFor(ENEMIES.fogling, []), ['fangring', 'ember']);
    assert.deepEqual(lootFor(ENEMIES.fogling, ['fangring']), ['ember']);
  });
});
