import { ITEMS } from '../data/items.js';
import { artUrl } from '../art/pixelArt.js';
import { equip } from '../store.js';

// What you're carrying + your loadout (1 pet, up to 3 magic, 2 accessories).
export default function Bag({ collection }) {
  const owned = Object.entries(collection.owned).map(([id, n]) => ({ item: ITEMS[id], n })).filter(x => x.item);
  const eq = collection.equipped;
  const isOn = (id) => eq.pet === id || eq.magic.includes(id) || eq.accessories.includes(id);
  const gear = owned.filter(x => x.item.category !== 'material');
  const mats = owned.filter(x => x.item.category === 'material');
  return (
    <div>
      <p className="nqw-dim">Tap to equip. Your loadout is what you fight with: 1 pet, up to 3 magic, 2 accessories.</p>
      <div className="nqw-grid" style={{ marginBottom: 14 }}>
        {gear.length === 0 && <p className="nqw-dim">No gear yet. Help Wren, beat foglings, or craft.</p>}
        {gear.map(({ item, n }) => (
          <button key={item.id} className={`nqw-cell ${isOn(item.id) ? 'equipped' : ''}`} onClick={() => equip(item.id)} aria-pressed={isOn(item.id)}>
            <img src={artUrl(item.sprite)} alt="" />
            <span>{item.name}</span>
            <span className="count">{isOn(item.id) ? 'equipped' : `×${n}`}</span>
          </button>
        ))}
      </div>
      <h3 className="nqw-dim">Materials</h3>
      <div className="nqw-grid">
        {mats.length === 0 && <p className="nqw-dim">Explore to find materials.</p>}
        {mats.map(({ item, n }) => (
          <div key={item.id} className="nqw-cell">
            <img src={artUrl(item.sprite)} alt="" />
            <span>{item.name}</span>
            <span className="count">×{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
