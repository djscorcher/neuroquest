// ═══════════════════════════════════════════════════════════════════════════
//  IMPURE SHELL — one saved game state { playtime, collection, world } in
//  localStorage + an event bus. React and Phaser both read/write through here;
//  all rules live in the pure engines.
// ═══════════════════════════════════════════════════════════════════════════
import * as PT from './engine/playtime.js';
import * as COL from './engine/collection.js';
import * as WORLD from './engine/world.js';
import { combineInState, keepOriginalInState } from './engine/crafting.js';
import { lootFor } from './engine/combat.js';
import { ITEMS } from './data/items.js';
import { RECIPES } from './data/recipes.js';
import { NPCS } from './data/npcs.js';
import { ENEMIES } from './data/enemies.js';
import { AREAS } from './data/areas.js';

const LS_KEY = 'nq_game_v1';
const START_AREA = AREAS.meadow;
const _subscribers = new Set();
let _state = null;

const FRESH = () => ({
  playtime:   PT.FRESH_STATE(),
  collection: COL.FRESH_STATE(),
  world:      WORLD.FRESH_STATE(START_AREA),
});

function _load() {
  try {
    const raw = typeof localStorage !== 'undefined' && localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    const f = FRESH();
    return {
      playtime:   { ...f.playtime,   ...p.playtime },
      collection: { ...f.collection, ...p.collection, equipped: { ...f.collection.equipped, ...p.collection?.equipped } },
      world:      { ...f.world,      ...p.world },
    };
  } catch {
    return null;
  }
}

function _save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(_state)); } catch { /* storage full or blocked */ }
}

function _get() {
  if (!_state) _state = _load() ?? FRESH();
  return _state;
}

// Ticks fire many times a second, so they skip saving; everything else saves.
function _set(next, { save = true, event = 'game:update' } = {}) {
  _state = next;
  if (save) _save();
  _subscribers.forEach(fn => { try { fn({ type: event, state: next }); } catch { /* subscriber error */ } });
}

export function subscribeGame(fn) {
  _subscribers.add(fn);
  return () => _subscribers.delete(fn);
}
export const getGameState = () => _get();
export const flushGame = () => _save();

// ── Playtime ────────────────────────────────────────────────────────────────
export function grantTaskPlaytime(difficulty, now = Date.now()) {
  const s = _get();
  _set({ ...s, playtime: PT.grantForTaskInState(s.playtime, difficulty, now) });
}
export function grantDayCleared(now = Date.now()) {
  const s = _get();
  const playtime = PT.grantDayClearedInState(s.playtime, now);
  if (playtime !== s.playtime) _set({ ...s, playtime });
}
export function tickPlaytime(elapsedMs, isActive) {
  const s = _get();
  const playtime = PT.tickInState(s.playtime, elapsedMs, isActive);
  if (playtime !== s.playtime) _set({ ...s, playtime }, { save: false, event: 'game:tick' });
}

// ── World ───────────────────────────────────────────────────────────────────
export function moveTo(pos) {
  const s = _get();
  _set({ ...s, world: WORLD.moveInState(s.world, pos) }, { save: false, event: 'game:move' });
}
export function pickUp(pickup) {
  const s = _get();
  if (s.world.picked[pickup.id]) return;
  _set({
    ...s,
    world: WORLD.pickUpInState(s.world, pickup.id),
    collection: COL.addItemInState(s.collection, pickup.itemId, 1),
  });
}

// NPC quest: hand over the needed items, get the reward.
export function completeNpcQuest(npcId) {
  const s = _get();
  const npc = NPCS[npcId];
  if (!npc || s.world.npcs[npcId] || !COL.hasAllInState(s.collection, npc.quest.need)) return false;
  let collection = s.collection;
  for (const [id, n] of Object.entries(npc.quest.need)) collection = COL.removeItemInState(collection, id, n).state;
  for (const id of npc.quest.reward) collection = COL.addItemInState(collection, id, 1);
  _set({ ...s, collection, world: WORLD.setNpcInState(s.world, npcId, 'done') });
  return true;
}

// Battle finished. Wins grant loot (and clear fog for wardens); losses send you home.
// `placement` is { id, enemyId } for world enemies or { npcId } for fighting an NPC.
export function resolveBattle(placement, outcome) {
  const s = _get();
  const enemyId = placement.enemyId ?? NPCS[placement.npcId]?.fightAs;
  const enemy = ENEMIES[enemyId];
  if (outcome === 'lose') {
    _set({ ...s, world: WORLD.respawnInState(s.world, START_AREA) });
    return { loot: [] };
  }
  if (outcome !== 'win' || !enemy) return { loot: [] };
  const loot = lootFor(enemy, s.collection.discovered);
  let collection = s.collection;
  for (const id of loot) collection = COL.addItemInState(collection, id, 1);
  let world = s.world;
  if (placement.id) world = WORLD.defeatInState(world, placement.id);
  if (placement.npcId) world = WORLD.setNpcInState(world, placement.npcId, 'robbed');
  if (enemy.clearsFog) world = WORLD.clearFogInState(world, world.areaId);
  _set({ ...s, collection, world });
  return { loot, clearedFog: !!enemy.clearsFog };
}

// ── Collection / crafting ───────────────────────────────────────────────────
export function combine(a, b) {
  const s = _get();
  const { state, result } = combineInState(s.collection, a, b, RECIPES, ITEMS);
  if (state !== s.collection) _set({ ...s, collection: state });
  return result;
}
export function keepOriginal(a, b, name, now = Date.now()) {
  const s = _get();
  const { state, original } = keepOriginalInState(s.collection, a, b, name, ITEMS, now);
  if (original) _set({ ...s, collection: state });
  return original;
}
export function updateOriginal(id, patch) {
  const s = _get();
  _set({ ...s, collection: COL.updateOriginalInState(s.collection, id, patch) });
}
export function equip(itemId) {
  const s = _get();
  const item = ITEMS[itemId];
  if (item) _set({ ...s, collection: COL.equipInState(s.collection, item) });
}

// Loadout as full item objects, for starting a battle.
export function currentLoadout() {
  const eq = _get().collection.equipped;
  return {
    pet: eq.pet ? ITEMS[eq.pet] : null,
    magic: eq.magic.map(id => ITEMS[id]).filter(Boolean),
    accessories: eq.accessories.map(id => ITEMS[id]).filter(Boolean),
  };
}
