import { ITEM_LIST, CATEGORIES } from '../data/items.js';
import { bookProgress, countOf } from '../engine/collection.js';
import { artUrl, originalUrl } from '../art/pixelArt.js';

const LABEL = { material: 'Materials', pet: 'Pets', magic: 'Magic', accessory: 'Accessories' };

// Collection book: discovered items show; undiscovered ones are silhouettes.
export default function CollectionBook({ collection, onDraw }) {
  const { found, total } = bookProgress(collection, ITEM_LIST);
  return (
    <div>
      <p className="nqw-dim">{found} / {total} discovered</p>
      {CATEGORIES.map(cat => (
        <section key={cat} style={{ marginBottom: 12 }}>
          <h3 className="nqw-dim" style={{ margin: '8px 0' }}>{LABEL[cat]}</h3>
          <div className="nqw-grid">
            {ITEM_LIST.filter(i => i.category === cat).map(item => {
              const known = collection.discovered.includes(item.id);
              return (
                <div key={item.id} className={`nqw-cell ${known ? '' : 'unknown'}`}>
                  <img src={artUrl(item.sprite)} alt="" />
                  <span>{known ? item.name : '???'}</span>
                  {known && <span className="count">×{countOf(collection, item.id)}</span>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
      <section>
        <h3 className="nqw-dim" style={{ margin: '8px 0' }}>Your originals</h3>
        {collection.originals.length === 0
          ? <p className="nqw-dim">Combine things that don't match a recipe to invent your own.</p>
          : (
            <div className="nqw-grid">
              {collection.originals.map(o => (
                <button key={o.id} className="nqw-cell" onClick={() => onDraw?.(o)} title="Draw it">
                  <img src={originalUrl(o.pixels)} alt="" />
                  <span>{o.name}</span>
                  <span className="count">✏️ draw</span>
                </button>
              ))}
            </div>
          )}
      </section>
    </div>
  );
}
