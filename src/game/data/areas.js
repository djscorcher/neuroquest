// Area maps as tile grids (one char per tile). Placeholder for Tiled maps:
// the renderer only needs `tiles` + the object lists, so a Tiled export can replace it.
//   #  tree/wall (blocked)   .  grass   ,  flowers   P  path
//   ~  water (blocked)       H  house (blocked)      D  house door (leaves the world)
//   F  fog (blocked until the area's fog is cleared, then grass)

export const TILE = { WALL: '#', GRASS: '.', FLOWER: ',', PATH: 'P', WATER: '~', HOUSE: 'H', DOOR: 'D', FOG: 'F' };
export const BLOCKING = new Set([TILE.WALL, TILE.WATER, TILE.HOUSE]);

const meadowTiles = [
  '##############################',
  '#.HHHH.....,,......~~#FFFFFFF#',
  '#.HHHH..........,..~~#FFFFFFF#',
  '#.HHDH.............~~#FFFFFFF#',
  '#...P..............~~#FFFFFFF#',
  '#...P.....,,.........FFFFFFF.#',
  '#...PPPPPPPPPPPPPPPPPFFFFFFF.#',
  '#............,.......FFFFFFF.#',
  '#..##..............~~#FFFFFFF#',
  '#..##......,.......~~#FFFFFFF#',
  '#..................~~#FFFFFFF#',
  '#.,..........##....~~#FFFFFFF#',
  '#............##....~~#FFFFFFF#',
  '#.................,~~#FFFFFFF#',
  '###................~~#FFFFFFF#',
  '###.......,........~~#FFFFFFF#',
  '#..................~~#FFFFFFF#',
  '#............,.....~~#FFFFFFF#',
  '#..................~~#FFFFFFF#',
  '##############################',
];

export const AREAS = {
  meadow: {
    id: 'meadow',
    name: 'Hollow Meadow',
    tiles: meadowTiles,
    spawn: { x: 4, y: 4 },
    pickups: [
      { id: 'm-feather-1',  itemId: 'feather',  x: 9,  y: 2 },
      { id: 'm-feather-2',  itemId: 'feather',  x: 14, y: 16 },
      { id: 'm-ember-1',    itemId: 'ember',    x: 16, y: 9 },
      { id: 'm-dewdrop-1',  itemId: 'dewdrop',  x: 18, y: 13 },
      { id: 'm-pebble-1',   itemId: 'pebble',   x: 3,  y: 12 },
      { id: 'm-pebble-2',   itemId: 'pebble',   x: 12, y: 18 },
      { id: 'm-moonmoss-1', itemId: 'moonmoss', x: 7,  y: 17 },
      { id: 'm-glowcap-1',  itemId: 'glowcap',  x: 2,  y: 9 },
      { id: 'm-glowcap-2',  itemId: 'glowcap',  x: 10, y: 14 },
      // Behind the fog
      { id: 'm-moonmoss-2', itemId: 'moonmoss', x: 25, y: 10 },
      { id: 'm-glowcap-3',  itemId: 'glowcap',  x: 24, y: 15 },
      { id: 'm-dewdrop-2',  itemId: 'dewdrop',  x: 27, y: 3 },
    ],
    npcs:    [{ npcId: 'wren', x: 8, y: 5 }],
    enemies: [
      { id: 'm-fogling-1', enemyId: 'fogling',   x: 13, y: 10 },
      { id: 'm-fogling-2', enemyId: 'fogling',   x: 16, y: 15 },
      { id: 'm-warden',    enemyId: 'fogwarden', x: 20, y: 6 },
    ],
  },
};

export const getArea = (id) => AREAS[id] ?? null;
