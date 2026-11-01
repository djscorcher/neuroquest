import { useState } from 'react';
import { ITEMS } from '../data/items.js';
import { artUrl } from '../art/pixelArt.js';
import { nameOptions } from '../engine/naming.js';
import { combine, keepOriginal } from '../store.js';

// Pick two things you own and combine them. Recipes are secret: a match makes
// a real item; anything else can be kept as your own named original.
export default function CraftPanel({ collection, onActivity, onDraw }) {
  const [picked, setPicked] = useState([]);
  const [result, setResult] = useState(null);   // recipe / original / missing / kept
  const [nameChoice, setNameChoice] = useState('pieces');
  const [custom, setCustom] = useState('');

  const owned = Object.entries(collection.owned).map(([id, n]) => ({ item: ITEMS[id], n })).filter(x => x.item);

  const toggle = (id) => {
    onActivity();
    setResult(null);
    setPicked(p => {
      if (p.length === 1 && p[0] === id && (collection.owned[id] ?? 0) >= 2) return [id, id]; // same item twice
      if (p.includes(id)) return p.filter(x => x !== id);
      return p.length >= 2 ? [p[1], id] : [...p, id];
    });
  };

  const doCombine = () => {
    onActivity();
    const [a, b] = picked;
    const r = combine(a, b);
    setResult(r);
    if (r.type === 'original') { setNameChoice('pieces'); setCustom(''); }
    if (r.type === 'recipe') setPicked([]);
  };

  const options = result?.type === 'original' ? nameOptions(ITEMS[result.a], ITEMS[result.b]) : null;
  const finalName = nameChoice === 'custom' ? custom.trim() : options?.[nameChoice];

  const keep = () => {
    onActivity();
    const o = keepOriginal(result.a, result.b, finalName);
    setResult({ type: 'kept', original: o });
    setPicked([]);
  };

  return (
    <div>
      <p className="nqw-dim">Pick two things to combine. Materials get used up; pets, magic and accessories don&apos;t.</p>
      <div className="nqw-grid" style={{ marginBottom: 12 }}>
        {owned.length === 0 && <p className="nqw-dim">Nothing to combine yet.</p>}
        {owned.map(({ item, n }) => (
          <button key={item.id} className={`nqw-cell ${picked.includes(item.id) ? 'selected' : ''}`} onClick={() => toggle(item.id)} aria-pressed={picked.includes(item.id)}>
            <img src={artUrl(item.sprite)} alt="" />
            <span>{item.name}</span>
            <span className="count">×{n}</span>
          </button>
        ))}
      </div>
      <div className="nqw-row" style={{ alignItems: 'center', marginBottom: 12 }}>
        <span>{picked.map(id => ITEMS[id].name).join(' + ') || 'Nothing picked'}</span>
        <button className="nqw-btn primary" disabled={picked.length !== 2} onClick={doCombine}>Combine</button>
      </div>

      {result?.type === 'recipe' && (
        <div className="nqw-card" style={{ textAlign: 'center' }}>
          <img src={artUrl(ITEMS[result.itemId].sprite, 6)} alt="" style={{ imageRendering: 'pixelated' }} />
          <h2>{result.isNew ? 'New discovery!' : 'Made another'} {ITEMS[result.itemId].name}</h2>
        </div>
      )}
      {result?.type === 'missing' && <p className="nqw-dim">You need one of each (or two of the same).</p>}
      {result?.type === 'original' && (
        <div className="nqw-card">
          <h2>✨ Something new… {ITEMS[result.a].name} + {ITEMS[result.b].name}</h2>
          <p className="nqw-dim">That&apos;s not a known recipe. Keep it as your own original, or erase it. Keeping uses up the materials.</p>
          <div className="nqw-names" role="radiogroup" aria-label="Name your original">
            {[['both', options.both, 'both names'], ['halves', options.halves, 'half + half'], ['pieces', options.pieces, 'mixed pieces']].map(([key, val, hint]) => (
              <label key={key}>
                <input type="radio" name="nqw-name" checked={nameChoice === key} onChange={() => setNameChoice(key)} />
                <span style={{ flex: 1 }}>{val}</span><span className="nqw-dim">{hint}</span>
              </label>
            ))}
            <label>
              <input type="radio" name="nqw-name" checked={nameChoice === 'custom'} onChange={() => setNameChoice('custom')} />
              <input type="text" placeholder="Name it yourself…" value={custom} maxLength={24}
                onFocus={() => setNameChoice('custom')} onChange={e => setCustom(e.target.value)} />
            </label>
          </div>
          <div className="nqw-row">
            <button className="nqw-btn primary" disabled={!finalName} onClick={keep}>Keep</button>
            <button className="nqw-btn" onClick={() => { setResult(null); setPicked([]); }}>Erase</button>
          </div>
        </div>
      )}
      {result?.type === 'kept' && (
        <div className="nqw-card">
          <h2>{result.original.name} added to your originals</h2>
          <div className="nqw-row">
            <button className="nqw-btn primary" onClick={() => onDraw(result.original)}>✏️ Draw it</button>
            <button className="nqw-btn" onClick={() => setResult(null)}>Later</button>
          </div>
        </div>
      )}
    </div>
  );
}
