import { useState, useEffect, useRef, useCallback } from "react";
import {
  CONFIG,
  startTrial,
  pauseTrial,
  resumeTrial,
  completeCheck,
  abandonTrial,
  isTrialRunning,
  subscribeTrial,
  getTrialState,
} from "../lib/trialEngine.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function pad(n) { return String(Math.max(0, Math.floor(n))).padStart(2, '0'); }

function fmtCountdown(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${pad(m)}:${pad(s)}`;
}

function fmtFocusedMin(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (m === 0) return `${s}s`;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function focusedElapsed(active, now) {
  if (!active) return 0;
  const wallEnd = active.pausedAt !== null ? active.pausedAt : now;
  return Math.max(0, (wallEnd - active.startedAt) - active.pausedTotalMs);
}

function getRemainingMs(active, now) {
  if (!active) return 0;
  return Math.max(0, active.durationMs - focusedElapsed(active, now));
}

// ── TrialToast ────────────────────────────────────────────────────────────────

export function TrialToast({ toasts, t }) {
  if (!toasts.length) return null;
  const toast = toasts[0];
  const isComplete = toast.type === 'trial:complete';
  const color = isComplete ? t.primary : t.secondary;

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, pointerEvents: 'none',
      animation: 'slideIn 0.4s ease',
      maxWidth: 360, width: 'calc(100% - 32px)',
    }}>
      <div style={{
        background: `${t.card}ee`, backdropFilter: 'blur(16px)',
        border: `1px solid ${color}66`, borderRadius: 14, padding: '14px 20px',
        boxShadow: `0 0 32px ${color}44`,
      }}>
        <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, color, letterSpacing: '0.15em', marginBottom: 4 }}>
          {isComplete ? 'FOCUS SPRINT COMPLETE' : 'FOCUS SPRINT ENDED'}
        </div>
        <div style={{ fontFamily: "'Exo 2',sans-serif", fontSize: 13, color: '#c0d8f0', lineHeight: 1.5 }}>
          {toast.message}
        </div>
        {(toast.xp > 0 || toast.gems > 0) && (
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            {toast.xp > 0 && (
              <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, color: t.secondary }}>
                +{toast.xp} XP
              </span>
            )}
            {toast.gems > 0 && (
              <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, color: '#a78bfa' }}>
                +{toast.gems} gems
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Launcher ──────────────────────────────────────────────────────────────────

function Launcher({ tasks, onStart, t }) {
  const [selectedMin, setSelectedMin] = useState(CONFIG.DEFAULT_PRESET_MIN);
  const [custom, setCustom]           = useState('');
  const [useCustom, setUseCustom]     = useState(false);
  const [pinnedTaskId, setPinnedTaskId] = useState(null);

  const activeMin = useCustom
    ? Math.min(120, Math.max(1, Number(custom) || CONFIG.DEFAULT_PRESET_MIN))
    : selectedMin;

  function handleStart() {
    const durationMs = activeMin * 60 * 1000;
    onStart(durationMs, pinnedTaskId);
  }

  return (
    <div style={{
      background: t.card, backdropFilter: 'blur(16px)',
      border: `1px solid ${t.border}`, borderRadius: 14, padding: '18px 20px',
      marginBottom: 16, boxShadow: `0 0 20px ${t.primary}22`,
    }}>
      <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, color: t.primary, letterSpacing: '0.2em', marginBottom: 12 }}>
        TIME TRIAL — FOCUS SPRINT
      </div>

      {/* Preset chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {CONFIG.PRESETS_MIN.map(min => (
          <button
            key={min}
            onClick={() => { setSelectedMin(min); setUseCustom(false); }}
            style={{
              padding: '7px 14px', fontFamily: "'Orbitron',monospace", fontSize: 9,
              letterSpacing: '0.1em', borderRadius: 8, cursor: 'pointer', transition: 'all 0.2s',
              border: `1px solid ${(!useCustom && selectedMin === min) ? t.primary : t.border}`,
              background: (!useCustom && selectedMin === min) ? `${t.primary}22` : 'transparent',
              color: (!useCustom && selectedMin === min) ? t.primary : t.accent,
            }}
          >
            {min} MIN{min === CONFIG.DEFAULT_PRESET_MIN ? ' ⚡' : ''}
          </button>
        ))}
        <button
          onClick={() => setUseCustom(true)}
          style={{
            padding: '7px 14px', fontFamily: "'Orbitron',monospace", fontSize: 9,
            letterSpacing: '0.1em', borderRadius: 8, cursor: 'pointer', transition: 'all 0.2s',
            border: `1px solid ${useCustom ? t.secondary : t.border}`,
            background: useCustom ? `${t.secondary}22` : 'transparent',
            color: useCustom ? t.secondary : t.accent,
          }}
        >
          CUSTOM
        </button>
      </div>

      {/* Custom input */}
      {useCustom && (
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="number" min={1} max={120} value={custom}
            onChange={e => setCustom(e.target.value)}
            placeholder="1–120"
            style={{
              width: 80, padding: '7px 12px', fontFamily: "'Orbitron',monospace", fontSize: 13,
              background: '#0a1929', border: `1px solid ${t.secondary}66`, borderRadius: 8,
              color: '#e0f4ff', outline: 'none',
            }}
          />
          <span style={{ fontFamily: "'Exo 2',sans-serif", fontSize: 12, color: t.accent }}>minutes</span>
        </div>
      )}

      {/* Quest pin (optional) */}
      {tasks.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 8, color: t.accent, letterSpacing: '0.15em', marginBottom: 6 }}>
            PIN A QUEST (OPTIONAL)
          </div>
          <select
            value={pinnedTaskId ?? ''}
            onChange={e => setPinnedTaskId(e.target.value || null)}
            style={{
              width: '100%', padding: '8px 12px', fontFamily: "'Exo 2',sans-serif", fontSize: 12,
              background: '#0a1929', border: `1px solid ${t.border}`, borderRadius: 8,
              color: pinnedTaskId ? '#e0f4ff' : t.accent, outline: 'none', cursor: 'pointer',
            }}
          >
            <option value="">None — open sprint</option>
            {tasks.map(task => (
              <option key={task.id} value={task.id}>{task.title}</option>
            ))}
          </select>
        </div>
      )}

      {/* Start */}
      <button
        onClick={handleStart}
        style={{
          width: '100%', padding: '11px 0', fontFamily: "'Orbitron',monospace", fontSize: 11,
          letterSpacing: '0.15em', borderRadius: 10, cursor: 'pointer',
          background: `linear-gradient(135deg, ${t.primary}33, ${t.primary}11)`,
          border: `1px solid ${t.primary}88`, color: t.primary,
          boxShadow: `0 0 16px ${t.primary}33`, transition: 'all 0.2s',
        }}
      >
        START SPRINT — {activeMin} MIN
      </button>
    </div>
  );
}

// ── FocusScreen ───────────────────────────────────────────────────────────────

function FocusScreen({ trialState, tasks, onTrialStateChange, onAbandon, t }) {
  const { active } = trialState;
  const [now, setNow] = useState(Date.now());
  const tickRef = useRef(null);

  useEffect(() => {
    if (!active || active.pausedAt !== null) {
      clearInterval(tickRef.current);
      return;
    }
    tickRef.current = setInterval(() => {
      const n = Date.now();
      setNow(n);
      // Auto-resolve when focused time reaches duration
      if (focusedElapsed(active, n) >= active.durationMs) {
        clearInterval(tickRef.current);
        completeCheck(n);
        onTrialStateChange(getTrialState());
      }
    }, 500);
    return () => clearInterval(tickRef.current);
  }, [active]);

  useEffect(() => {
    return () => clearInterval(tickRef.current);
  }, []);

  if (!active) return null;

  const isPaused    = active.pausedAt !== null;
  const focused     = focusedElapsed(active, now);
  const remaining   = getRemainingMs(active, now);
  const progress    = Math.min(1, focused / active.durationMs);
  const running     = !isPaused && remaining > 0;

  const pinnedTask  = active.pinnedTaskId
    ? tasks.find(t => String(t.id) === String(active.pinnedTaskId))
    : null;

  function handlePauseResume() {
    if (isPaused) resumeTrial(Date.now());
    else pauseTrial(Date.now());
    onTrialStateChange(getTrialState());
  }

  return (
    <div style={{
      background: t.card, backdropFilter: 'blur(16px)',
      border: `1px solid ${t.border}`, borderRadius: 14, padding: '24px 20px',
      marginBottom: 16, boxShadow: `0 0 28px ${t.primary}33`,
    }}>
      {/* Header */}
      <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, color: t.primary, letterSpacing: '0.2em', marginBottom: 16, textAlign: 'center' }}>
        FOCUS SPRINT IN PROGRESS
      </div>

      {/* Countdown */}
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{
          fontFamily: "'Orbitron',monospace", fontSize: 54, fontWeight: 900,
          color: isPaused ? `${t.secondary}88` : t.secondary,
          textShadow: isPaused ? 'none' : `0 0 24px ${t.secondary}88`,
          letterSpacing: '0.05em', lineHeight: 1, transition: 'all 0.3s',
        }}>
          {fmtCountdown(remaining)}
        </div>
        {isPaused && (
          <div style={{ fontFamily: "'Exo 2',sans-serif", fontSize: 11, color: `${t.accent}88`, marginTop: 4 }}>
            paused
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, background: `${t.primary}22`, borderRadius: 2, marginBottom: 16, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 2, transition: 'width 0.5s linear',
          width: `${Math.round(progress * 100)}%`,
          background: isPaused
            ? `${t.secondary}55`
            : `linear-gradient(90deg, ${t.primary}, ${t.secondary})`,
        }} />
      </div>

      {/* Buff indicator */}
      <div style={{
        textAlign: 'center', marginBottom: 16,
        fontFamily: "'Orbitron',monospace", fontSize: 9, letterSpacing: '0.15em',
        color: running ? t.primary : `${t.primary}44`,
        transition: 'color 0.3s',
      }}>
        ⚔ {CONFIG.TRIAL_DAMAGE_MULT}× BOSS DAMAGE ACTIVE
        {isPaused && <span style={{ fontSize: 8, color: `${t.accent}55` }}> — paused</span>}
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 16 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 8, color: t.accent, letterSpacing: '0.15em' }}>FOCUSED</div>
          <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 14, color: '#e0f4ff' }}>{fmtFocusedMin(focused)}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 8, color: t.accent, letterSpacing: '0.15em' }}>QUESTS DONE</div>
          <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 14, color: '#e0f4ff' }}>{active.tasksCompleted}</div>
        </div>
      </div>

      {/* Pinned quest */}
      {pinnedTask && (
        <div style={{
          background: `${t.primary}0d`, border: `1px solid ${t.primary}33`,
          borderRadius: 10, padding: '10px 14px', marginBottom: 16,
        }}>
          <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 8, color: t.accent, letterSpacing: '0.15em', marginBottom: 4 }}>
            PINNED QUEST
          </div>
          <div style={{ fontFamily: "'Exo 2',sans-serif", fontSize: 13, color: '#c0d8f0' }}>
            {pinnedTask.title}
          </div>
        </div>
      )}

      {/* NEURAL DRIFT AUDIO MOUNT POINT
          Future ambient audio player ("Neural Drift" track) goes here.
          Props needed: isPlaying=running, trackId="neural_drift"
          Example: <NeuralDriftPlayer isPlaying={running} />
      */}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={handlePauseResume}
          style={{
            flex: 2, padding: '10px 0', fontFamily: "'Orbitron',monospace", fontSize: 10,
            letterSpacing: '0.12em', borderRadius: 9, cursor: 'pointer', transition: 'all 0.2s',
            border: `1px solid ${t.primary}66`,
            background: isPaused ? `${t.primary}22` : `${t.primary}11`,
            color: t.primary,
          }}
        >
          {isPaused ? '▶ RESUME' : '⏸ PAUSE'}
        </button>
        <button
          onClick={() => onAbandon()}
          style={{
            flex: 1, padding: '10px 0', fontFamily: "'Orbitron',monospace", fontSize: 9,
            letterSpacing: '0.1em', borderRadius: 9, cursor: 'pointer', transition: 'all 0.2s',
            border: `1px solid ${t.border}`, background: 'transparent', color: `${t.accent}88`,
          }}
        >
          END EARLY
        </button>
      </div>
    </div>
  );
}

// ── TrialPanel (exported) ─────────────────────────────────────────────────────

export function TrialPanel({ trialState, tasks, onTrialStateChange, onAbandon, t }) {
  const active = trialState?.active ?? null;

  if (active) {
    return (
      <FocusScreen
        trialState={trialState}
        tasks={tasks}
        onTrialStateChange={onTrialStateChange}
        onAbandon={onAbandon}
        t={t}
      />
    );
  }

  return (
    <Launcher
      tasks={tasks}
      onStart={(durationMs, pinnedTaskId) => {
        const result = startTrial(durationMs, pinnedTaskId, Date.now());
        if (result.ok) onTrialStateChange(result.state);
      }}
      t={t}
    />
  );
}
