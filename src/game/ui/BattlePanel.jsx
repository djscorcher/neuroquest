import { useState, useEffect, useRef } from 'react';
import { startBattle, battleReducer } from '../engine/combat.js';
import { currentLoadout, resolveBattle } from '../store.js';
import { ITEMS } from '../data/items.js';
import { artUrl } from '../art/pixelArt.js';

const pct = (hp, max) => `${Math.max(0, (hp / max) * 100)}%`;

// Turn-based fight. Buttons or keys 1–9 for actions. When it ends, results are
// applied through the store and `onDone(outcome, loot)` closes the panel.
export default function BattlePanel({ placement, enemyDef, onActivity, onDone }) {
  const [battle, setBattle] = useState(() => startBattle(currentLoadout(), enemyDef, Date.now() >>> 0));
  const [result, setResult] = useState(null);
  const logRef = useRef(null);

  const actions = [
    { label: 'Attack', act: { type: 'attack' } },
    ...battle.magic.map(m => ({ label: m.name, act: { type: 'magic', id: m.id } })),
    { label: 'Defend', act: { type: 'defend' } },
    { label: 'Run', act: { type: 'flee' } },
  ];

  const doAction = (act) => {
    if (battle.outcome) return;
    onActivity();
    const next = battleReducer(battle, act);
    setBattle(next);
    if (next.outcome) setResult({ outcome: next.outcome, ...resolveBattle(placement, next.outcome) });
  };

  useEffect(() => {
    const onKey = (e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= actions.length) doAction(actions[n - 1].act);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, [battle.log.length]);

  const { player, pet, enemy } = battle;
  return (
    <div className="nqw-modal">
      <div className="nqw-card nqw-battle">
        <div className="fighters">
          <div className="nqw-fighter">
            <img src={artUrl('player', 6)} alt="" />
            <span>You {player.hp}/{player.maxHp}</span>
            <div className="nqw-bar"><div style={{ width: pct(player.hp, player.maxHp) }} /></div>
            {pet && <>
              <img src={artUrl(ITEMS[pet.id].sprite, 4)} alt="" style={{ width: 32, height: 32, opacity: pet.hp > 0 ? 1 : 0.3 }} />
              <span>{pet.name} {pet.hp}/{pet.maxHp}</span>
              <div className="nqw-bar"><div style={{ width: pct(pet.hp, pet.maxHp) }} /></div>
            </>}
          </div>
          <div className="nqw-fighter">
            <img src={artUrl(enemyDef.sprite, 6)} alt="" />
            <span>{enemy.name} {enemy.hp}/{enemy.maxHp}</span>
            <div className="nqw-bar enemy"><div style={{ width: pct(enemy.hp, enemy.maxHp) }} /></div>
          </div>
        </div>
        <div className="nqw-log" ref={logRef} aria-live="polite">
          {battle.log.map((line, i) => <div key={i}>{line}</div>)}
        </div>
        {!result ? (
          <div className="nqw-row">
            {actions.map((a, i) => (
              <button key={a.label} className={`nqw-btn ${i === 0 ? 'primary' : ''}`} onClick={() => doAction(a.act)}>
                <span className="nqw-dim">{i + 1}</span> {a.label}
              </button>
            ))}
          </div>
        ) : (
          <div>
            {result.outcome === 'win' && <>
              <h2>Victory!</h2>
              {result.loot.length > 0 && <p>You got: {result.loot.map(id => ITEMS[id].name).join(', ')}</p>}
              {result.clearedFog && <p>The fog begins to lift…</p>}
            </>}
            {result.outcome === 'lose' && <><h2>You black out…</h2><p>You wake up at home. You kept everything.</p></>}
            {result.outcome === 'fled' && <h2>You got away.</h2>}
            <button className="nqw-btn primary" autoFocus onClick={() => onDone(result.outcome)}>Continue</button>
          </div>
        )}
      </div>
    </div>
  );
}
