import { addItemInState, removeItemInState, countOf, addOriginalInState } from './collection.js';

// Order-independent key for a pair of item ids.
export const pairKey = (a, b) => [a, b].sort().join('+');

export function findRecipe(recipes, a, b) {
  const key = pairKey(a, b);
  return recipes.find(r => pairKey(r.a, r.b) === key) ?? null;
}

// Only materials are used up; pets, magic and accessories are never consumed.
const consumes = (item) => item?.category === 'material';

function haveIngredients(state, a, b) {
  if (a === b) return countOf(state, a) >= 2;
  return countOf(state, a) >= 1 && countOf(state, b) >= 1;
}

function spend(state, items, a, b) {
  let s = state;
  for (const id of [a, b]) {
    if (consumes(items[id])) s = removeItemInState(s, id, 1).state;
  }
  return s;
}

// Try combining a + b.
//   recipe hit  → ingredients spent, result added, { type: 'recipe', itemId, isNew }
//   no recipe   → nothing spent yet, { type: 'original' }; caller asks keep or erase
//   missing     → { type: 'missing' }
export function combineInState(state, a, b, recipes, items) {
  if (!haveIngredients(state, a, b)) return { state, result: { type: 'missing' } };
  const recipe = findRecipe(recipes, a, b);
  if (!recipe) return { state, result: { type: 'original', a, b } };
  const isNew = !state.discovered.includes(recipe.result);
  const next = addItemInState(spend(state, items, a, b), recipe.result, 1);
  return { state: next, result: { type: 'recipe', itemId: recipe.result, isNew } };
}

// Player chose "keep" on an original: spend the ingredients and save it.
export function keepOriginalInState(state, a, b, name, items, now) {
  if (!haveIngredients(state, a, b)) return { state, original: null };
  return addOriginalInState(spend(state, items, a, b), { a, b, name }, now);
}
