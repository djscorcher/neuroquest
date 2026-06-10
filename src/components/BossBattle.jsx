import { useState, useEffect, useRef } from "react";
import { getBossState, subscribeBoss, setTier, MODIFIERS } from "../lib/bossEngine.js";

const TIER_LABEL = { minor: "MINOR", standard: "STANDARD", epic: "EPIC" };

function fmtCountdown(ms) {
  if (ms <= 0) return "00:00:00";
  const totalSec = Math.floor(ms / 1000);
  const h   = Math.floor(totalSec / 3600);
  const m   = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  const p   = n => String(n).padStart(2, "0");
  if (h >= 48) {
    const d = Math.floor(h / 24), rh = h % 24;
    return `${d}d ${p(rh)}h`;
  }
  return `${p(h)}:${p(m)}:${p(sec)}`;
}

function getLocalDateStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── Toast ──────────────────────────────────────────────────────────────────
function BossToast({ resolution, onClose, t }) {
  if (!resolution) return null;
  const isVictory = resolution.outcome === "defeated";
  const accentColor = isVictory ? t.secondary : t.primary;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 210,
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "72px 16px 0", pointerEvents: "auto", cursor: "pointer",
      }}
      onClick={onClose}
    >
      <div style={{
        background: t.card, backdropFilter: "blur(24px)",
        border: `1px solid ${accentColor}88`,
        borderRadius: 14, padding: "20px 24px",
        maxWidth: 360, width: "100%",
        animation: "scaleIn 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards",
        textAlign: "center", boxShadow: `0 0 24px ${accentColor}44`,
      }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>
          {isVictory ? "🏆" : "⚡"}
        </div>

        {isVictory ? (
          <>
            <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 13, fontWeight: 700, color: t.secondary, letterSpacing: "0.1em", marginBottom: 8 }}>
              {resolution.boss.name.toUpperCase()} DEFEATED!
            </div>
            <div style={{ fontFamily: "'Exo 2',sans-serif", fontSize: 12, color: t.accent, marginBottom: resolution.title ? 6 : 0 }}>
              +{resolution.gems} gems earned
            </div>
            {resolution.title && (
              <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, color: t.secondary, letterSpacing: "0.08em", marginTop: 4 }}>
                ✦ Title: &ldquo;{resolution.title}&rdquo;
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 13, fontWeight: 700, color: t.primary, letterSpacing: "0.08em", marginBottom: 8 }}>
              {resolution.pct}% PROGRESS!
            </div>
            <div style={{ fontFamily: "'Exo 2',sans-serif", fontSize: 12, color: t.accent, lineHeight: 1.55 }}>
              You dealt {resolution.pct}% to {resolution.boss.name}!
              {" "}+{resolution.gems} gems · A new challenger approaches.
            </div>
          </>
        )}

        <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 8, color: `${t.accent}55`, letterSpacing: "0.12em", marginTop: 14 }}>
          TAP TO DISMISS
        </div>
      </div>
    </div>
  );
}

// ── Main card ──────────────────────────────────────────────────────────────
export default function BossBattle({ t, pendingResolutions }) {
  const [bossState, setBossState] = useState(() => getBossState(Date.now()));
  const [now,       setNow]       = useState(() => Date.now());
  const [flashHp,   setFlashHp]   = useState(false);
  const [toast,     setToast]     = useState(null);
  const prevHpRef = useRef(bossState.boss.currentHp);

  // Live countdown
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Subscribe to engine events (boss:update → HP animation; boss:resolved handled by App)
  useEffect(() => {
    return subscribeBoss(event => {
      if (event.type === "boss:update") {
        const newHp = event.state.boss.currentHp;
        if (newHp < prevHpRef.current) {
          setFlashHp(true);
          setTimeout(() => setFlashHp(false), 450);
        }
        prevHpRef.current = newHp;
        setBossState(event.state);
      }
    });
  }, []);

  // Show toast when App passes a new offline/real-time resolution
  useEffect(() => {
    if (!pendingResolutions?.length) return;
    const latest = pendingResolutions[pendingResolutions.length - 1];
    setToast(latest);
    const id = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(id);
  }, [pendingResolutions]);

  const { boss } = bossState;
  const hpPct     = Math.max(0, (boss.currentHp / boss.maxHp) * 100);
  const timeLeft  = Math.max(0, boss.endsAt - now);
  const modifier  = MODIFIERS.find(m => m.id === boss.modifierId);
  const isUndamaged      = boss.currentHp === boss.maxHp;
  const isFirstStrikeReady = bossState.firstStrikeDate !== getLocalDateStr();
  const isUrgent  = timeLeft < 3_600_000;

  const tierColors = { minor: t.accent, standard: t.primary, epic: t.secondary };

  return (
    <>
      <div style={{
        background:       t.card,
        border:           `1px solid ${t.border}`,
        borderLeft:       `3px solid ${t.danger}`,
        borderRadius:     10,
        padding:          "13px 15px",
        marginBottom:     16,
        backdropFilter:   "blur(8px)",
      }}>

        {/* Name + tier badge */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 12, fontWeight: 700, color: t.danger, letterSpacing: "0.07em", marginBottom: 3 }}>
              ⚔️ {boss.name}
            </div>
            <div style={{ fontFamily: "'Exo 2',sans-serif", fontSize: 11, color: t.accent, opacity: 0.7, lineHeight: 1.45 }}>
              {boss.flavor}
            </div>
          </div>
          <span style={{
            fontFamily: "'Orbitron',monospace", fontSize: 7.5, letterSpacing: "0.1em",
            padding: "3px 8px", borderRadius: 99, marginLeft: 10, flexShrink: 0,
            border:      `1px solid ${tierColors[boss.tier]}55`,
            background:  `${tierColors[boss.tier]}18`,
            color:        tierColors[boss.tier],
          }}>
            {TIER_LABEL[boss.tier]}
          </span>
        </div>

        {/* Modifier pill */}
        {modifier && (
          <div style={{
            fontFamily: "'Orbitron',monospace", fontSize: 8, color: t.secondary,
            letterSpacing: "0.05em", marginBottom: 10,
            background: `${t.secondary}0d`, border: `1px solid ${t.secondary}22`,
            borderRadius: 6, padding: "4px 10px",
          }}>
            ✦ {modifier.label}
          </div>
        )}

        {/* HP bar */}
        <div style={{ marginBottom: 9 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 8, color: t.danger, letterSpacing: "0.08em" }}>BOSS HP</span>
            <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 8, color: t.accent }}>{boss.currentHp} / {boss.maxHp}</span>
          </div>
          <div style={{ height: 7, borderRadius: 99, background: `${t.danger}22`, border: `1px solid ${t.danger}33`, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 99,
              width:  `${hpPct}%`,
              background:  `linear-gradient(90deg,${t.danger},#ff8800)`,
              boxShadow:   flashHp ? `0 0 18px ${t.danger}` : `0 0 5px ${t.danger}66`,
              animation:   flashHp ? "shake 0.35s ease" : "none",
              transition:  "width 0.5s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.25s ease",
            }} />
          </div>
        </div>

        {/* Countdown + first-strike row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isUndamaged ? 10 : 0 }}>
          <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 8.5, color: isUrgent ? t.danger : t.accent, letterSpacing: "0.06em" }}>
            {isUrgent ? "⚠️ " : "⏱ "}{fmtCountdown(timeLeft)}
          </span>
          <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 8, letterSpacing: "0.05em", color: isFirstStrikeReady ? t.secondary : `${t.accent}44` }}>
            {isFirstStrikeReady ? "⚡ First Strike ready" : "⚡ used today"}
          </span>
        </div>

        {/* Tier selector — only while undamaged */}
        {isUndamaged && (
          <div style={{ display: "flex", gap: 5 }}>
            {["minor", "standard", "epic"].map(tier => (
              <button
                key={tier}
                onClick={() => setBossState(setTier(tier))}
                style={{
                  flex: 1, padding: "6px 0",
                  fontFamily: "'Orbitron',monospace", fontSize: 7.5, letterSpacing: "0.06em",
                  border:     `1px solid ${boss.tier === tier ? tierColors[tier] : t.border}`,
                  borderRadius: 6, cursor: "pointer",
                  background:  boss.tier === tier ? `${tierColors[tier]}18` : "transparent",
                  color:        boss.tier === tier ? tierColors[tier] : t.accent,
                  transition: "all 0.2s",
                }}
              >
                {TIER_LABEL[tier]}
              </button>
            ))}
          </div>
        )}
      </div>

      <BossToast resolution={toast} onClose={() => setToast(null)} t={t} />
    </>
  );
}
