// Opposing-group enemies. Visible in the world; the player chooses to fight.
// `drops` are granted on a win: `first` only the first time, `always` every time.
export const ENEMIES = {
  fogling: {
    id: 'fogling', name: 'Fogling', sprite: 'fogling',
    stats: { hp: 16, atk: 4, def: 0 },
    drops: { first: ['fangring'], always: ['ember'] },
  },
  fogwarden: {
    id: 'fogwarden', name: 'Fog Warden', sprite: 'fogwarden',
    stats: { hp: 34, atk: 6, def: 2 },
    drops: { first: ['gust'], always: [] },
    clearsFog: true,
  },
  // Used when the player fights the NPC instead of doing her quest.
  wren: {
    id: 'wren', name: 'Wren', sprite: 'wren',
    stats: { hp: 20, atk: 3, def: 1 },
    drops: { first: ['mothling'], always: [] },
  },
};
