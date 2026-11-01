import { hashString } from './rng.js';
import { pairKey } from './crafting.js';

// Name suggestions for an original made from items a + b (no AI).
//   both   — names back to back: "Ember Feather"
//   halves — first half of A + second half of B: "Emther"
//   pieces — hand-written name pieces mixed by a pattern picked from the pair,
//            so the same combo always suggests the same name
export function nameOptions(itemA, itemB) {
  const a = itemA.name, b = itemB.name;
  const both = `${a} ${b}`;
  const halves = cap(a.slice(0, Math.ceil(a.length / 2)) + b.slice(Math.floor(b.length / 2)).toLowerCase());

  // Sort by id so A+B and B+A suggest the same pieces name
  const [x, y] = [itemA, itemB].sort((p, q) => p.id.localeCompare(q.id));
  const pa = x.pieces, pb = y.pieces;
  const patterns = [
    () => cap(pa.prefix + pb.suffix),         // "Pyrowing"
    () => `${pa.adj} ${pb.noun}`,              // "Blazing Plume"
    () => `${pa.noun} of ${pb.noun}`,          // "Flame of Plume"
  ];
  const pieces = patterns[hashString(pairKey(itemA.id, itemB.id)) % patterns.length]();

  return { both, halves, pieces };
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
