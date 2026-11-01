import { useEffect, useRef, useState, useCallback } from 'react';
import PhaserGame from './phaser/PhaserGame.jsx';
import { EventBus } from './phaser/EventBus.js';
import { getGameState, subscribeGame, tickPlaytime, flushGame, moveTo } from './store.js';
import { formatPlaytime } from './engine/playtime.js';
import { ENEMIES } from './data/enemies.js';
import { NPCS } from './data/npcs.js';
import { getArea } from './data/areas.js';
import { IDLE_TIMEOUT_MS } from '../config/balance.js';
import { artUrl } from './art/pixelArt.js';
import CollectionBook from './ui/CollectionBook.jsx';
import Bag from './ui/Bag.jsx';
import CraftPanel from './ui/CraftPanel.jsx';
import Journal from './ui/Journal.jsx';
import SpriteMaker from './ui/SpriteMaker.jsx';
import BattlePanel from './ui/BattlePanel.jsx';
import NpcDialog from './ui/NpcDialog.jsx';
import './ui/game.css';

const TICK_MS = 250;
const TABS = [['bag', 'Bag'], ['craft', 'Craft'], ['book', 'Book'], ['journal', 'Journal']];

// Full-screen world. Phaser draws the map; everything else is React on top.
// Playtime drains only while the player is actively doing something.
export default function WorldScreen({ tasks, onExit }) {
  const [game, setGame] = useState(getGameState);
  const [panel, setPanel] = useState(null);       // menu tab or null
  const [npcId, setNpcId] = useState(null);
  const [fight, setFight] = useState(null);       // { placement, enemyDef }
  const [drawing, setDrawing] = useState(null);   // original being drawn
  const [doorPrompt, setDoorPrompt] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [idle, setIdle] = useState(false);
  const lastActivity = useRef(0); // clock stays paused until the first input
  const fightRef = useRef(null);
  const blockingRef = useRef(false);

  const outOfTime = game.playtime.balanceMs <= 0;
  // Finish the current step first: a battle in progress always plays out
  const timeUp = outOfTime && !fight;
  const blocking = !!(panel || npcId || fight || drawing || doorPrompt || timeUp);

  const markActive = useCallback(() => { lastActivity.current = Date.now(); }, []);

  useEffect(() => subscribeGame(e => { if (e.type !== 'game:move') setGame(e.state); }), []);

  // Tell Phaser when overlays should freeze movement
  useEffect(() => {
    fightRef.current = fight;
  }, [fight]);
  useEffect(() => {
    blockingRef.current = blocking;
    EventBus.emit('lock-input', blocking);
  }, [blocking]);

  // Playtime clock
  useEffect(() => {
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const active = !!fightRef.current || now - lastActivity.current < IDLE_TIMEOUT_MS;
      tickPlaytime(now - last, active);
      setIdle(!active);
      last = now;
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Phaser → React events
  useEffect(() => {
    const onActivity = () => markActive();
    const onPickup = ({ item }) => {
      const id = `${Date.now()}-${Math.random()}`;
      setToasts(t => [...t, { id, item }]);
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2400);
    };
    const onInteract = (occ) => {
      markActive();
      if (occ.kind === 'npc') setNpcId(occ.npcId);
      if (occ.kind === 'enemy') setFight({ placement: { id: occ.id, enemyId: occ.enemyId }, enemyDef: ENEMIES[occ.enemyId] });
    };
    const onDoor = () => setDoorPrompt(true);
    // The scene may start after our first lock message; resend it
    const onReady = () => EventBus.emit('lock-input', blockingRef.current);
    EventBus.on('scene-ready', onReady);
    EventBus.on('activity', onActivity);
    EventBus.on('pickup', onPickup);
    EventBus.on('interact', onInteract);
    EventBus.on('door', onDoor);
    return () => {
      EventBus.off('activity', onActivity);
      EventBus.off('pickup', onPickup);
      EventBus.off('interact', onInteract);
      EventBus.off('door', onDoor);
      EventBus.off('scene-ready', onReady);
    };
  }, [markActive]);

  const exit = () => { flushGame(); onExit(); };

  const stayOutside = () => {
    // Step back off the door so it doesn't fire again immediately
    const spawn = getArea(game.world.areaId).spawn;
    moveTo(spawn);
    EventBus.emit('world-refresh');
    setDoorPrompt(false);
  };

  const endFight = () => {
    setFight(null);
    EventBus.emit('world-refresh');
  };

  const minutesLeft = game.playtime.balanceMs / 60000;

  return (
    <div className="nqw" role="application" aria-label="NeuroQuest world">
      <PhaserGame />

      <div className="nqw-hud">
        <div className={`nqw-clock ${idle ? 'paused' : ''} ${minutesLeft < 2 ? 'low' : ''}`} aria-live="off">
          ⏳ {formatPlaytime(game.playtime.balanceMs)}
          <small>{idle ? 'paused' : 'playtime'}</small>
        </div>
        <div className="nqw-row">
          <button className="nqw-btn" onClick={() => { markActive(); setPanel(p => (p ? null : 'bag')); }}>☰ Menu</button>
        </div>
      </div>

      <div className="nqw-toasts">
        {toasts.map(t => (
          <div key={t.id} className="nqw-toast"><img src={artUrl(t.item.sprite)} alt="" /> Found {t.item.name}</div>
        ))}
      </div>

      {panel && (
        <div className="nqw-sheet" role="dialog" aria-label="Menu">
          <div className="nqw-sheet-head">
            <div className="nqw-tabs">
              {TABS.map(([key, label]) => (
                <button key={key} className={`nqw-btn ${panel === key ? 'active' : ''}`} onClick={() => { markActive(); setPanel(key); }}>{label}</button>
              ))}
            </div>
            <div className="nqw-row">
              <button className="nqw-btn" onClick={() => setPanel(null)}>Close</button>
              <button className="nqw-btn danger" onClick={exit}>Leave</button>
            </div>
          </div>
          {panel === 'bag' && <Bag collection={game.collection} />}
          {panel === 'craft' && outOfTime && <p className="nqw-dim">Out of playtime. Finish a task to craft again.</p>}
          {panel === 'craft' && !outOfTime && <CraftPanel collection={game.collection} onActivity={markActive} onDraw={setDrawing} />}
          {panel === 'book' && <CollectionBook collection={game.collection} onDraw={setDrawing} />}
          {panel === 'journal' && <Journal tasks={tasks} />}
        </div>
      )}

      {npcId && (
        <NpcDialog
          npcId={npcId} collection={game.collection} world={game.world} onActivity={markActive}
          onClose={() => setNpcId(null)}
          onFight={() => {
            const enemyDef = ENEMIES[NPCS[npcId].fightAs];
            setNpcId(null);
            setFight({ placement: { npcId }, enemyDef });
          }}
        />
      )}

      {fight && <BattlePanel placement={fight.placement} enemyDef={fight.enemyDef} onActivity={markActive} onDone={endFight} />}

      {drawing && <SpriteMaker original={drawing} onActivity={markActive} onClose={() => setDrawing(null)} />}

      {doorPrompt && !timeUp && (
        <div className="nqw-modal">
          <div className="nqw-card">
            <h2>Home</h2>
            <p>Head inside and go back to your quests?</p>
            <div className="nqw-row">
              <button className="nqw-btn primary" autoFocus onClick={exit}>Go inside</button>
              <button className="nqw-btn" onClick={stayOutside}>Stay out</button>
            </div>
          </div>
        </div>
      )}

      {timeUp && !panel && !drawing && (
        <div className="nqw-modal">
          <div className="nqw-card">
            <h2>Out of playtime</h2>
            <p>Finish a task in real life to earn more. Your collection is always free to look at.</p>
            <div className="nqw-row">
              <button className="nqw-btn primary" autoFocus onClick={exit}>Go home</button>
              <button className="nqw-btn" onClick={() => setPanel('book')}>Collection</button>
              <button className="nqw-btn" onClick={() => setPanel('journal')}>Journal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
