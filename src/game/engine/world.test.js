import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FRESH_STATE, isWalkable, findPath, clearFogInState, defeatInState, occupantAt } from './world.js';
import { AREAS, BLOCKING } from '../data/areas.js';
import { ITEMS } from '../data/items.js';
import { NPCS } from '../data/npcs.js';
import { ENEMIES } from '../data/enemies.js';

const area = AREAS.meadow;

describe('world', () => {
  it('map is a clean 30×20 grid and every object sits on a usable tile', () => {
    assert.equal(area.tiles.length, 20);
    for (const row of area.tiles) assert.equal(row.length, 30);
    const cleared = clearFogInState(FRESH_STATE(area), area.id);
    for (const o of [area.spawn, ...area.pickups, ...area.npcs, ...area.enemies]) {
      assert.ok(!BLOCKING.has(area.tiles[o.y][o.x]), `${JSON.stringify(o)} on blocked tile`);
      assert.ok(isWalkable(area, cleared, o.x, o.y));
    }
    for (const p of area.pickups) assert.ok(ITEMS[p.itemId], p.itemId);
    for (const n of area.npcs) assert.ok(NPCS[n.npcId]);
    for (const e of area.enemies) assert.ok(ENEMIES[e.enemyId]);
  });

  it('fog blocks until cleared', () => {
    const s = FRESH_STATE(area);
    assert.equal(isWalkable(area, s, 25, 10), false);
    assert.equal(isWalkable(area, clearFogInState(s, 'meadow'), 25, 10), true);
  });

  it('can path from spawn to every non-fog pickup', () => {
    const s = FRESH_STATE(area);
    for (const p of area.pickups.filter(p => area.tiles[p.y][p.x] !== 'F')) {
      assert.ok(findPath(area, s, area.spawn, p), p.id);
    }
  });

  it('fog pickups reachable only after the warden falls and fog clears', () => {
    let s = FRESH_STATE(area);
    const target = { x: 25, y: 10 };
    assert.equal(findPath(area, s, area.spawn, target), null);
    s = clearFogInState(defeatInState(s, 'm-warden'), 'meadow');
    assert.ok(findPath(area, s, area.spawn, target));
  });

  it('tapping an NPC walks next to it and flags an interaction', () => {
    const s = FRESH_STATE(area);
    const res = findPath(area, s, area.spawn, { x: 8, y: 5 });
    assert.ok(res.interact);
    const last = res.path.at(-1);
    assert.equal(Math.abs(last.x - 8) + Math.abs(last.y - 5), 1);
    assert.equal(occupantAt(area, s, 8, 5).kind, 'npc');
  });
});
