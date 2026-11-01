// Seeded RNG (mulberry32). All game randomness goes through here so a seed +
// action log always replays to the same state (needed later for multiplayer).

// Returns [value in 0..1, nextSeed]. Pure: the caller stores nextSeed.
export function nextRandom(seed) {
  let t = (seed + 0x6D2B79F5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  return [value, t];
}

// Integer in [min, max] inclusive. Returns [int, nextSeed].
export function nextInt(seed, min, max) {
  const [v, s] = nextRandom(seed);
  return [min + Math.floor(v * (max - min + 1)), s];
}

// Stable 32-bit hash of a string (FNV-1a), for deterministic per-key choices.
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
