import { CONFIG } from '../lib/streakEngine.js';

export function StreakCard({ streakState, gems, onBuyFreeze, t }) {
  const { currentStreak, bestStreak, lifetimeActiveDays, freezes, todayIsActive } = streakState;
  const canBuy = gems >= CONFIG.FREEZE_PRICE_GEMS && freezes < CONFIG.FREEZE_CAP;

  return (
    <div style={{ background:t.card,backdropFilter:'blur(16px)',border:`1px solid ${t.border}`,borderRadius:14,padding:'14px 18px',marginBottom:16 }}>
      <div style={{ display:'flex',alignItems:'center',gap:12 }}>

        {/* Flame + streak count */}
        <div style={{ textAlign:'center',minWidth:54,flexShrink:0 }}>
          <div style={{ fontSize:24,lineHeight:1 }}>🔥</div>
          <div style={{ fontFamily:"'Orbitron',monospace",fontSize:22,fontWeight:900,color:t.secondary,lineHeight:1.1,textShadow:`0 0 16px ${t.secondary}` }}>{currentStreak}</div>
          <div style={{ fontFamily:"'Orbitron',monospace",fontSize:7,color:t.accent,letterSpacing:'0.1em',marginTop:2 }}>STREAK</div>
        </div>

        <div style={{ flex:1,minWidth:0 }}>
          {/* Stats row */}
          <div style={{ display:'flex',gap:14,alignItems:'center',marginBottom:8,flexWrap:'wrap' }}>
            <div>
              <div style={{ fontFamily:"'Orbitron',monospace",fontSize:8,color:t.primary,letterSpacing:'0.1em' }}>BEST</div>
              <div style={{ fontFamily:"'Orbitron',monospace",fontSize:14,color:'#e0f4ff' }}>{bestStreak}</div>
            </div>
            <div>
              <div style={{ fontFamily:"'Orbitron',monospace",fontSize:8,color:t.primary,letterSpacing:'0.1em' }}>ACTIVE DAYS</div>
              <div style={{ fontFamily:"'Orbitron',monospace",fontSize:14,color:'#e0f4ff' }}>{lifetimeActiveDays}</div>
            </div>
            {todayIsActive && (
              <span style={{ fontFamily:"'Orbitron',monospace",fontSize:8,color:t.secondary,border:`1px solid ${t.secondary}44`,padding:'2px 8px',borderRadius:99,letterSpacing:'0.08em' }}>
                ✓ ACTIVE
              </span>
            )}
          </div>

          {/* Shields row */}
          <div style={{ display:'flex',alignItems:'center',gap:8,flexWrap:'wrap' }}>
            <div style={{ display:'flex',gap:3,alignItems:'center' }}>
              {Array.from({ length: CONFIG.FREEZE_CAP }, (_, i) => (
                <span key={i} style={{ fontSize:15,opacity:i < freezes ? 1 : 0.25,filter:i < freezes ? `drop-shadow(0 0 4px ${t.primary})` : 'none',transition:'all 0.3s' }}>
                  🛡
                </span>
              ))}
            </div>
            <button
              onClick={onBuyFreeze}
              disabled={!canBuy}
              title={canBuy ? `Buy a shield for ${CONFIG.FREEZE_PRICE_GEMS} gems` : freezes >= CONFIG.FREEZE_CAP ? 'Shields full' : `Need ${CONFIG.FREEZE_PRICE_GEMS} gems`}
              style={{ padding:'4px 10px',fontFamily:"'Orbitron',monospace",fontSize:8,letterSpacing:'0.08em',background:canBuy?`${t.primary}18`:'transparent',border:`1px solid ${canBuy?t.primary:t.border}`,borderRadius:6,cursor:canBuy?'pointer':'default',color:canBuy?t.primary:`${t.accent}44`,transition:'all 0.2s',flexShrink:0 }}>
              +SHIELD {CONFIG.FREEZE_PRICE_GEMS}💎
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StreakToast({ toasts, t }) {
  if (!toasts.length) return null;
  const toast = toasts[0];
  const isComeback  = toast.type === 'streak:comeback';
  const isMilestone = toast.type === 'streak:milestone';
  const isShield    = toast.type === 'streak:shield_held';
  const accentColor = isMilestone ? t.secondary : isShield ? t.accent : t.primary;

  return (
    <div style={{ position:'fixed',bottom:28,left:'50%',transform:'translateX(-50%)',zIndex:250,maxWidth:'min(380px,90vw)',width:'100%',pointerEvents:'none',animation:'slideIn 0.3s ease,fadeOut 3.5s 0.2s ease forwards' }}>
      <div style={{ background:t.card,backdropFilter:'blur(20px)',border:`1px solid ${accentColor}55`,borderRadius:12,padding:'12px 18px',boxShadow:`0 4px 24px rgba(0,0,0,0.5),0 0 16px ${accentColor}22` }}>
        <div style={{ fontFamily:"'Orbitron',monospace",fontSize:9,color:accentColor,letterSpacing:'0.12em',marginBottom:4 }}>
          {isMilestone ? '🏆 MILESTONE' : isShield ? '🛡 SHIELD HELD' : isComeback ? '🔥 NEW RUN' : '🔥 STREAK'}
        </div>
        <div style={{ fontFamily:"'Exo 2',sans-serif",fontSize:13,color:'#e0f0ff',lineHeight:1.4 }}>{toast.message}</div>
        {(toast.xp > 0 || toast.gems > 0) && (
          <div style={{ fontFamily:"'Orbitron',monospace",fontSize:10,color:t.secondary,marginTop:6,display:'flex',gap:10,flexWrap:'wrap' }}>
            {toast.xp   > 0 && <span>+{toast.xp} XP</span>}
            {toast.gems > 0 && <span>+{toast.gems} 💎</span>}
            {toast.title && <span style={{ color:t.accent }}>"{toast.title}" unlocked!</span>}
          </div>
        )}
      </div>
    </div>
  );
}
