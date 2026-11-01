// ═══════════════════════════════════════════════════════════════════════════
//  PURE CORE — what the player owns, what they've ever discovered (for the
//  collection book silhouettes), and their originals.
// ═══════════════════════════════════════════════════════════════════════════

export const FRESH_STATE = () => ({
  owned:      {},   // itemId → count
  discovered: [],   // itemIds ever obtained (book fills in, even if later used up)
  originals:  [],   // { id, a, b, name, pixels, createdAt }
  equipped:   { pet: null, magic: [], accessories: [] },
});

export const countOf = (state, itemId) => state.owned[itemId] ?? 0;

export function addItemInState(state, itemId, n = 1) {
  const discovered = state.discovered.includes(itemId) ? state.discovered : [...state.discovered, itemId];
  return { ...state, owned: { ...state.owned, [itemId]: countOf(state, itemId) + n }, discovered };
}

export function removeItemInState(state, itemId, n = 1) {
  const have = countOf(state, itemId);
  if (have < n) return { state, ok: false };
  const owned = { ...state.owned };
  if (have - n === 0) delete owned[itemId]; else owned[itemId] = have - n;
  return { state: { ...state, owned }, ok: true };
}

export function hasAllInState(state, need) {
  return Object.entries(need).every(([id, n]) => countOf(state, id) >= n);
}

// Book progress: discovered real items out of the whole catalog (originals don't count).
export function bookProgress(state, itemList) {
  const ids = new Set(itemList.map(i => i.id));
  return { found: state.discovered.filter(id => ids.has(id)).length, total: ids.size };
}

// Loadout: 1 pet slot, magic and accessories capped by caller-provided limits.
export function equipInState(state, item, limits = { magic: 3, accessories: 2 }) {
  if (countOf(state, item.id) < 1) return state;
  const eq = state.equipped;
  if (item.category === 'pet') return { ...state, equipped: { ...eq, pet: eq.pet === item.id ? null : item.id } };
  const key = item.category === 'magic' ? 'magic' : item.category === 'accessory' ? 'accessories' : null;
  if (!key) return state;
  const list = eq[key];
  if (list.includes(item.id)) return { ...state, equipped: { ...eq, [key]: list.filter(id => id !== item.id) } };
  if (list.length >= limits[key]) return state;
  return { ...state, equipped: { ...eq, [key]: [...list, item.id] } };
}

export function addOriginalInState(state, { a, b, name }, now) {
  const original = { id: `orig-${now}`, a, b, name, pixels: null, createdAt: now };
  return { state: { ...state, originals: [...state.originals, original] }, original };
}

export function updateOriginalInState(state, id, patch) {
  return { ...state, originals: state.originals.map(o => (o.id === id ? { ...o, ...patch } : o)) };
}
