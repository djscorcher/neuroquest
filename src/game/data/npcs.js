// NPCs: do their quest for a reward, or fight them (`fightAs` enemy id) to take it.
export const NPCS = {
  wren: {
    id: 'wren', name: 'Wren', sprite: 'wren', fightAs: 'wren',
    quest: {
      need: { glowcap: 2 },
      reward: ['mothling'],
      ask:   'The fog ate my lantern. Bring me 2 Glowcaps and my Mothling will go with you.',
      thanks: 'You found them! Take good care of Mothling.',
      after: 'Psst. Try a pebble with a glowcap. Trust me.',
    },
  },
};
