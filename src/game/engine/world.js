import { TILE, BLOCKING } from '../data/areas.js';

// ═══════════════════════════════════════════════════════════════════════════
//  PURE CORE — world progress: where you are, what's picked up / beaten,
//  which fog is cleared, NPC quest state. Plus grid helpers for movement.
// ═══════════════════════════════════════════════════════════════════════════

export const FRESH_STATE = (area) => ({
  areaId:    area.id,
  pos:       { ...area.spawn },
  picked:    {},   // pickupId → true
  defeated:  {},   // enemy placement id → true
  fogCleared: {},  // areaId → true
  npcs:      {},   // npcId → 'done' | 'robbed'
});

export const pickUpInState   = (s, id) => ({ ...s, picked:   { ...s.picked,   [id]: true } });
export const defeatInState   = (s, id) => ({ ...s, defeated: { ...s.defeated, [id]: true } });
export const clearFogInState = (s, areaId) => ({ ...s, fogCleared: { ...s.fogCleared, [areaId]: true } });
export const setNpcInState   = (s, npcId, status) => ({ ...s, npcs: { ...s.npcs, [npcId]: status } });
export const moveInState     = (s, pos) => ({ ...s, pos: { x: pos.x, y: pos.y } });
export const respawnInState  = (s, area) => ({ ...s, pos: { ...area.spawn } });

export function tileAt(area, x, y) {
  return area.tiles[y]?.[x] ?? TILE.WALL;
}

export function isWalkable(area, worldState, x, y) {
  const t = tileAt(area, x, y);
  if (BLOCKING.has(t)) return false;
  if (t === TILE.FOG && !worldState.fogCleared[area.id]) return false;
  return true;
}

// Things standing on tiles (NPCs, undefeated enemies) also block movement.
export function occupantAt(area, worldState, x, y) {
  const npc = area.npcs.find(n => n.x === x && n.y === y);
  if (npc) return { kind: 'npc', ...npc };
  const enemy = area.enemies.find(e => e.x === x && e.y === y && !worldState.defeated[e.id]);
  if (enemy) return { kind: 'enemy', ...enemy };
  return null;
}

// Breadth-first path on the 4-way grid, for tap/click-to-move.
// Stops next to an occupied tile so tapping an NPC/enemy walks up to it.
export function findPath(area, worldState, from, to, maxSteps = 400) {
  const key = (x, y) => `${x},${y}`;
  const target = key(to.x, to.y);
  const targetOccupied = !!occupantAt(area, worldState, to.x, to.y);
  const prev = new Map([[key(from.x, from.y), null]]);
  const queue = [from];
  let steps = 0;
  while (queue.length && steps++ < maxSteps * 4) {
    const cur = queue.shift();
    const ck = key(cur.x, cur.y);
    if (ck === target) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, ny = cur.y + dy, nk = key(nx, ny);
      if (prev.has(nk)) continue;
      const isTarget = nk === target;
      if (!isWalkable(area, worldState, nx, ny)) continue;
      if (!isTarget && occupantAt(area, worldState, nx, ny)) continue;
      prev.set(nk, ck);
      queue.push({ x: nx, y: ny });
    }
  }
  if (!prev.has(target)) return null;
  const path = [];
  for (let k = target; k && k !== key(from.x, from.y); k = prev.get(k)) {
    const [x, y] = k.split(',').map(Number);
    path.unshift({ x, y });
  }
  // Don't step onto the NPC/enemy itself — the last step is the interaction
  return { path: targetOccupied ? path.slice(0, -1) : path, interact: targetOccupied };
}
