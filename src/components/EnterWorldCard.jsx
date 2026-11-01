import { useEffect, useState, lazy, Suspense } from 'react';
import { getGameState, subscribeGame, respawnEnemies } from '../game/store.js';
import { formatPlaytime } from '../game/engine/playtime.js';

// The world (Phaser + game UI) is a separate chunk, loaded only when entered,
// so the quest screen stays fast on low-end Chromebooks.
const WorldScreen = lazy(() => import('../game/WorldScreen.jsx'));

export function EnterWorldCard({ tasks, t }) {
  const [balanceMs, setBalanceMs] = useState(() => getGameState().playtime.balanceMs);
  const [open, setOpen] = useState(false);

  useEffect(() => subscribeGame(e => setBalanceMs(e.state.playtime.balanceMs)), []);

  return (
    <>
      <div style={{ background:t.card,backdropFilter:'blur(16px)',border:`1px solid ${t.border}`,borderRadius:14,padding:'14px 18px',marginBottom:16,display:'flex',alignItems:'center',gap:12 }}>
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ fontFamily:"'Orbitron',monospace",fontSize:8,color:t.primary,letterSpacing:'0.1em' }}>PLAYTIME</div>
          <div style={{ fontFamily:"'Orbitron',monospace",fontSize:22,fontWeight:900,color:t.secondary,lineHeight:1.2,textShadow:`0 0 16px ${t.secondary}` }}>⏳ {formatPlaytime(balanceMs)}</div>
          <div style={{ fontFamily:"'Exo 2',sans-serif",fontSize:12,color:t.accent }}>Finish quests to earn time in the world</div>
        </div>
        <button onClick={() => { respawnEnemies(); setOpen(true); }} style={{ fontFamily:"'Orbitron',monospace",fontSize:10,letterSpacing:'0.08em',padding:'12px 16px',borderRadius:10,cursor:'pointer',border:`1px solid ${t.primary}`,background:`${t.primary}22`,color:t.primary,minHeight:44 }}>
          ENTER WORLD ▸
        </button>
      </div>
      {open && (
        <Suspense fallback={<div style={{ position:'fixed',inset:0,zIndex:1000,background:'#05070f',color:'#9a94b0',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Orbitron',monospace" }}>Entering the fog…</div>}>
          <WorldScreen tasks={tasks} onExit={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
