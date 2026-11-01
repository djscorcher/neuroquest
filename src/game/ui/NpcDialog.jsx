import { NPCS } from '../data/npcs.js';
import { ITEMS } from '../data/items.js';
import { hasAllInState } from '../engine/collection.js';
import { artUrl } from '../art/pixelArt.js';
import { completeNpcQuest } from '../store.js';

// Talk to an NPC: do their quest, fight them for their stuff, or walk away.
export default function NpcDialog({ npcId, collection, world, onFight, onClose, onActivity }) {
  const npc = NPCS[npcId];
  const status = world.npcs[npcId];
  const canGive = !status && hasAllInState(collection, npc.quest.need);
  const needText = Object.entries(npc.quest.need).map(([id, n]) => `${n} ${ITEMS[id].name}`).join(', ');

  let line = npc.quest.ask;
  if (status === 'done') line = npc.quest.thanks;
  if (status === 'robbed') line = '…You already took what you wanted.';

  return (
    <div className="nqw-modal">
      <div className="nqw-card">
        <div className="nqw-row" style={{ alignItems: 'center', marginBottom: 8 }}>
          <img src={artUrl(npc.sprite, 6)} alt="" style={{ imageRendering: 'pixelated' }} />
          <h2 style={{ margin: 0 }}>{npc.name}</h2>
        </div>
        <p>{line}</p>
        {!status && <p className="nqw-dim">Needs: {needText}</p>}
        <div className="nqw-row">
          {canGive && (
            <button className="nqw-btn primary" onClick={() => { onActivity(); completeNpcQuest(npcId); }}>
              Give {needText}
            </button>
          )}
          {!status && <button className="nqw-btn danger" onClick={onFight}>Fight for it</button>}
          <button className="nqw-btn" autoFocus onClick={onClose}>Leave</button>
        </div>
        {status === 'done' && <p className="nqw-dim" style={{ marginTop: 10 }}>{npc.quest.after}</p>}
      </div>
    </div>
  );
}
