// Item catalog. Everything collectible lives here as data. `sprite` is a key
// the renderer looks up, so real art can replace placeholders without code changes.
// `pieces` feed the original-naming generator (adjective / noun / prefix / suffix).

export const CATEGORIES = ['material', 'pet', 'magic', 'accessory'];

export const ITEMS = {
  // ── Materials (picked up in the world, used up by crafting) ──────────────
  ember:    { id: 'ember',    name: 'Ember',    category: 'material', sprite: 'ember',
              pieces: { adj: 'Blazing',  noun: 'Flame',  prefix: 'Pyro',  suffix: 'burn' } },
  feather:  { id: 'feather',  name: 'Feather',  category: 'material', sprite: 'feather',
              pieces: { adj: 'Feathered', noun: 'Plume', prefix: 'Aero',  suffix: 'wing' } },
  dewdrop:  { id: 'dewdrop',  name: 'Dewdrop',  category: 'material', sprite: 'dewdrop',
              pieces: { adj: 'Misty',    noun: 'Dew',    prefix: 'Aqua',  suffix: 'drip' } },
  pebble:   { id: 'pebble',   name: 'Pebble',   category: 'material', sprite: 'pebble',
              pieces: { adj: 'Stony',    noun: 'Stone',  prefix: 'Geo',   suffix: 'rock' } },
  moonmoss: { id: 'moonmoss', name: 'Moonmoss', category: 'material', sprite: 'moonmoss',
              pieces: { adj: 'Lunar',    noun: 'Moss',   prefix: 'Luna',  suffix: 'bloom' } },
  glowcap:  { id: 'glowcap',  name: 'Glowcap',  category: 'material', sprite: 'glowcap',
              pieces: { adj: 'Glowing',  noun: 'Cap',    prefix: 'Lumi',  suffix: 'shroom' } },

  // ── Pets (fight beside you) ──────────────────────────────────────────────
  mothling:  { id: 'mothling',  name: 'Mothling',   category: 'pet', sprite: 'mothling',
               stats: { hp: 14, atk: 3 },
               pieces: { adj: 'Fluttering', noun: 'Moth', prefix: 'Moth', suffix: 'flit' } },
  cinderpup: { id: 'cinderpup', name: 'Cinder Pup', category: 'pet', sprite: 'cinderpup',
               stats: { hp: 18, atk: 4 },
               pieces: { adj: 'Smoldering', noun: 'Pup', prefix: 'Cinder', suffix: 'paw' } },

  // ── Magic (your attacks) ─────────────────────────────────────────────────
  spark: { id: 'spark', name: 'Spark', category: 'magic', sprite: 'spark',
           stats: { damage: 9 },
           pieces: { adj: 'Crackling', noun: 'Spark', prefix: 'Volt', suffix: 'zap' } },
  mend:  { id: 'mend',  name: 'Mend',  category: 'magic', sprite: 'mend',
           stats: { heal: 10 },
           pieces: { adj: 'Soothing', noun: 'Balm', prefix: 'Vita', suffix: 'mend' } },
  gust:  { id: 'gust',  name: 'Gust',  category: 'magic', sprite: 'gust',
           stats: { damage: 6, defBreak: 1 },
           pieces: { adj: 'Howling', noun: 'Gale', prefix: 'Zephyr', suffix: 'gust' } },

  // ── Accessories (buffs while equipped) ───────────────────────────────────
  lanterncharm: { id: 'lanterncharm', name: 'Lantern Charm', category: 'accessory', sprite: 'lanterncharm',
                  stats: { def: 2 },
                  pieces: { adj: 'Shining', noun: 'Lantern', prefix: 'Lux', suffix: 'glow' } },
  feathercloak: { id: 'feathercloak', name: 'Feather Cloak', category: 'accessory', sprite: 'feathercloak',
                  stats: { hp: 10 },
                  pieces: { adj: 'Drifting', noun: 'Cloak', prefix: 'Veil', suffix: 'drift' } },
  fangring:     { id: 'fangring', name: 'Fang Ring', category: 'accessory', sprite: 'fangring',
                  stats: { atk: 2 },
                  pieces: { adj: 'Fanged', noun: 'Fang', prefix: 'Fang', suffix: 'bite' } },
};

export const ITEM_LIST = Object.values(ITEMS);
export const getItem = (id) => ITEMS[id] ?? null;
