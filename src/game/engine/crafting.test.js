import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FRESH_STATE, addItemInState, countOf, bookProgress, equipInState } from './collection.js';
import { combineInState, keepOriginalInState, pairKey } from './crafting.js';
import { nameOptions } from './naming.js';
import { ITEMS, ITEM_LIST } from '../data/items.js';
import { RECIPES } from '../data/recipes.js';

const withItems = (...ids) => ids.reduce((s, id) => addItemInState(s, id), FRESH_STATE());

describe('collection + crafting', () => {
  it('recipe hit spends materials, adds result, marks it new once', () => {
    let s = withItems('ember', 'feather');
    let r = combineInState(s, 'feather', 'ember', RECIPES, ITEMS); // order doesn't matter
    assert.deepEqual(r.result, { type: 'recipe', itemId: 'spark', isNew: true });
    assert.equal(countOf(r.state, 'ember'), 0);
    assert.equal(countOf(r.state, 'spark'), 1);
    s = addItemInState(addItemInState(r.state, 'ember'), 'feather');
    r = combineInState(s, 'ember', 'feather', RECIPES, ITEMS);
    assert.equal(r.result.isNew, false);
  });

  it('pets/magic/accessories are never consumed', () => {
    const s = withItems('ember', 'mothling');
    const kept = keepOriginalInState(s, 'ember', 'mothling', 'Mothburn', ITEMS, 1);
    assert.equal(countOf(kept.state, 'mothling'), 1);
    assert.equal(countOf(kept.state, 'ember'), 0);
    assert.equal(kept.state.originals[0].name, 'Mothburn');
  });

  it('non-recipe pair asks keep/erase without spending; missing items refused', () => {
    const s = withItems('dewdrop', 'pebble');
    const r = combineInState(s, 'dewdrop', 'pebble', RECIPES, ITEMS);
    assert.equal(r.result.type, 'original');
    assert.equal(r.state, s);
    assert.equal(combineInState(s, 'dewdrop', 'ember', RECIPES, ITEMS).result.type, 'missing');
    assert.equal(combineInState(withItems('pebble'), 'pebble', 'pebble', RECIPES, ITEMS).result.type, 'missing');
  });

  it('book progress counts discovered catalog items even after use', () => {
    const s = combineInState(withItems('ember', 'feather'), 'ember', 'feather', RECIPES, ITEMS).state;
    assert.deepEqual(bookProgress(s, ITEM_LIST), { found: 3, total: ITEM_LIST.length });
  });

  it('equip toggles, 1 pet slot, respects limits and ownership', () => {
    let s = withItems('mothling', 'cinderpup', 'spark');
    s = equipInState(s, ITEMS.mothling);
    s = equipInState(s, ITEMS.cinderpup);
    assert.equal(s.equipped.pet, 'cinderpup');
    s = equipInState(s, ITEMS.spark);
    assert.deepEqual(s.equipped.magic, ['spark']);
    s = equipInState(s, ITEMS.spark);
    assert.deepEqual(s.equipped.magic, []);
    assert.equal(equipInState(s, ITEMS.gust), s); // not owned
  });

  it('every recipe uses real items and pairs are unique', () => {
    const keys = new Set();
    for (const r of RECIPES) {
      for (const id of [r.a, r.b, r.result]) assert.ok(ITEMS[id], id);
      keys.add(pairKey(r.a, r.b));
    }
    assert.equal(keys.size, RECIPES.length);
  });
});

describe('naming originals', () => {
  it('gives both / halves / pieces, deterministic in either order', () => {
    const o1 = nameOptions(ITEMS.ember, ITEMS.feather);
    const o2 = nameOptions(ITEMS.feather, ITEMS.ember);
    assert.equal(o1.both, 'Ember Feather');
    assert.equal(o1.halves, 'Embther');
    assert.equal(o1.pieces, o2.pieces);
    assert.ok(o1.pieces.length > 0);
  });
});
