import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getGameState, resolveBattle, respawnEnemies, resetWorld, grantTaskPlaytime, pickUp } from './store.js';
import { AREAS } from './data/areas.js';

describe('store: respawn + reset', () => {
  it('foglings come back on re-entry, the warden does not; reset keeps playtime', () => {
    resolveBattle({ id: 'm-fogling-1', enemyId: 'fogling' }, 'win');
    resolveBattle({ id: 'm-warden', enemyId: 'fogwarden' }, 'win');
    assert.ok(getGameState().world.defeated['m-fogling-1']);

    respawnEnemies();
    const { world } = getGameState();
    assert.equal(world.defeated['m-fogling-1'], undefined);
    assert.ok(world.defeated['m-warden']);
    assert.ok(world.fogCleared.meadow);

    grantTaskPlaytime('Easy');
    pickUp(AREAS.meadow.pickups[0]);
    const before = getGameState().playtime.balanceMs;
    resetWorld();
    const after = getGameState();
    assert.equal(after.playtime.balanceMs, before);
    assert.deepEqual(after.world.defeated, {});
    assert.deepEqual(after.collection.owned, {});
  });
});
