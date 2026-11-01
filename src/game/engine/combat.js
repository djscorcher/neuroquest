import { nextInt } from './rng.js';
import { PLAYER_BASE } from '../../config/balance.js';

// ═══════════════════════════════════════════════════════════════════════════
//  PURE CORE — turn-based battle reducer. (state, action) → state.
//  One player action resolves a full round: player → pet → enemy.
//  Your collection is your loadout: pet fights beside you, magic = attacks,
//  accessories = stat buffs.
// ═══════════════════════════════════════════════════════════════════════════

// loadout: { pet: item|null, magic: item[], accessories: item[] }
export function startBattle(loadout, enemyDef, seed) {
  const buff = { hp: 0, atk: 0, def: 0 };
  for (const acc of loadout.accessories ?? []) {
    for (const k of Object.keys(buff)) buff[k] += acc.stats?.[k] ?? 0;
  }
  const maxHp = PLAYER_BASE.hp + buff.hp;
  const pet = loadout.pet
    ? { id: loadout.pet.id, name: loadout.pet.name, hp: loadout.pet.stats.hp, maxHp: loadout.pet.stats.hp, atk: loadout.pet.stats.atk }
    : null;
  return {
    seed,
    round: 0,
    player: { hp: maxHp, maxHp, atk: PLAYER_BASE.atk + buff.atk, def: PLAYER_BASE.def + buff.def, defending: false },
    pet,
    magic: (loadout.magic ?? []).map(m => ({ id: m.id, name: m.name, ...m.stats })),
    enemy: { id: enemyDef.id, name: enemyDef.name, hp: enemyDef.stats.hp, maxHp: enemyDef.stats.hp, atk: enemyDef.stats.atk, def: enemyDef.stats.def },
    log: [`A wild ${enemyDef.name} blocks your way!`],
    outcome: null, // 'win' | 'lose' | 'fled'
  };
}

function roll(s, min, max) {
  const [v, seed] = nextInt(s.seed, min, max);
  s.seed = seed;
  return v;
}

const hit = (s, atk, def) => Math.max(1, atk - def + roll(s, 0, 2));

export function battleReducer(state, action) {
  if (state.outcome) return state;
  // Work on a copy; nested objects are cloned before mutation.
  const s = { ...state, player: { ...state.player }, pet: state.pet && { ...state.pet }, enemy: { ...state.enemy }, log: [...state.log] };
  s.round += 1;
  s.player.defending = false;

  // ── Player turn ──
  if (action.type === 'attack') {
    const d = hit(s, s.player.atk, s.enemy.def);
    s.enemy.hp -= d;
    s.log.push(`You hit ${s.enemy.name} for ${d}.`);
  } else if (action.type === 'magic') {
    const m = s.magic.find(x => x.id === action.id);
    if (!m) return state;
    if (m.heal) {
      const before = s.player.hp;
      s.player.hp = Math.min(s.player.maxHp, s.player.hp + m.heal);
      s.log.push(`${m.name} heals you for ${s.player.hp - before}.`);
    }
    if (m.damage) {
      if (m.defBreak) s.enemy.def = Math.max(0, s.enemy.def - m.defBreak);
      const d = m.damage + roll(s, 0, 2);
      s.enemy.hp -= d;
      s.log.push(`${m.name} hits ${s.enemy.name} for ${d}.`);
    }
  } else if (action.type === 'defend') {
    s.player.defending = true;
    s.log.push('You brace yourself.');
  } else if (action.type === 'flee') {
    s.outcome = 'fled';
    s.log.push('You slip away.');
    return s;
  } else {
    return state;
  }

  if (s.enemy.hp <= 0) return win(s);

  // ── Pet turn ──
  if (s.pet && s.pet.hp > 0) {
    const d = hit(s, s.pet.atk, s.enemy.def);
    s.enemy.hp -= d;
    s.log.push(`${s.pet.name} strikes for ${d}.`);
    if (s.enemy.hp <= 0) return win(s);
  }

  // ── Enemy turn: targets the pet 1 time in 3 when it's standing ──
  const targetPet = s.pet && s.pet.hp > 0 && roll(s, 1, 3) === 1;
  if (targetPet) {
    const d = hit(s, s.enemy.atk, 0);
    s.pet.hp = Math.max(0, s.pet.hp - d);
    s.log.push(`${s.enemy.name} hits ${s.pet.name} for ${d}.${s.pet.hp === 0 ? ` ${s.pet.name} is knocked out!` : ''}`);
  } else {
    let d = hit(s, s.enemy.atk, s.player.def);
    if (s.player.defending) d = Math.max(1, Math.floor(d / 2));
    s.player.hp = Math.max(0, s.player.hp - d);
    s.log.push(`${s.enemy.name} hits you for ${d}.`);
    if (s.player.hp === 0) {
      s.outcome = 'lose';
      s.log.push('You black out...');
    }
  }
  return s;
}

function win(s) {
  s.enemy.hp = 0;
  s.outcome = 'win';
  s.log.push(`${s.enemy.name} fades into the fog!`);
  return s;
}

// Loot for a win: `first` drops only if never discovered, `always` every time.
export function lootFor(enemyDef, discovered) {
  const first = (enemyDef.drops?.first ?? []).filter(id => !discovered.includes(id));
  return [...first, ...(enemyDef.drops?.always ?? [])];
}
