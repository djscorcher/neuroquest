// Hidden recipes: two ingredients → one result. Order doesn't matter.
// Players find these by experimenting; NPCs and mysteries drop hints.
export const RECIPES = [
  { a: 'ember',   b: 'feather',  result: 'spark',        hint: 'Fire on a feather crackles like lightning.' },
  { a: 'dewdrop', b: 'moonmoss', result: 'mend',         hint: 'Moonlit moss soaked in dew can close a wound.' },
  { a: 'pebble',  b: 'glowcap',  result: 'lanterncharm', hint: 'A glowing cap set in stone never goes dark.' },
  { a: 'feather', b: 'moonmoss', result: 'feathercloak', hint: 'Feathers woven with moss make a cloak that drifts.' },
  { a: 'ember',   b: 'pebble',   result: 'cinderpup',    hint: 'Warm a stone long enough and something wakes up.' },
];
