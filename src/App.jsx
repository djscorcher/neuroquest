import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { fetchUserData, syncProfile, syncList, syncAllLists, insertActivityEvent } from "./supabaseSync";
import FriendsModal from "./FriendsModal";
import { NotifySettings } from "./components/NotifySettings.jsx";
import { InstallCard } from "./components/InstallCard.jsx";
import BossBattle from "./components/BossBattle.jsx";
import { StreakCard, StreakToast } from "./components/StreakCard.jsx";
import { TrialPanel, TrialToast } from "./components/TrialPanel.jsx";
import {
  isTrialRunning as trialIsRunning,
  recordTrialTask as trialRecordTask,
  completeCheck as trialCompleteCheck,
  abandonTrial as trialAbandon,
  consumeRewards as trialConsumeRewards,
  getTrialState,
  subscribeTrial,
  CONFIG as TRIAL_CONFIG,
} from "./lib/trialEngine.js";
import { applyBossDamage, applyBossHeal, consumeResolutions, subscribeBoss } from "./lib/bossEngine.js";
import {
  checkIn as streakCheckIn,
  recordTaskCompletion as streakTaskDone,
  recordLevel as streakRecordLevel,
  recordBossKill as streakBossKill,
  consumeRewards as streakConsumeRewards,
  getStreakState,
  buyFreeze as streakBuyFreeze,
} from "./lib/streakEngine.js";

// ── Constants ──────────────────────────────────────────────────────────────
const DIFFICULTY_BASE       = { Easy: 10, Medium: 25, Hard: 50 };
const IMPORTANCE_MULT       = { Low: 1.0, Medium: 1.25, High: 1.5, Critical: 2.0 };
const MAX_TIMING_BONUS_RATE = 1.0;
const XP_PER_LEVEL = 100;

const IMPORTANCE = {
  Low:      { label: "Low",      color: "#7eb8ff" },
  Medium:   { label: "Medium",   color: "#00b4ff" },
  High:     { label: "High",     color: "#ffb454" },
  Critical: { label: "Critical", color: "#ff5050" },
};
const IMPORTANCE_ORDER = ["Low", "Medium", "High", "Critical"];

const TIMER_MISS_PENALTY = 10;
const DUE_MISS_PENALTY   = 15;

const RANKS = [
  { min:1,  label:"RECRUIT"   }, { min:5,  label:"WARRIOR"   },
  { min:10, label:"VETERAN"   }, { min:20, label:"ELITE"      },
  { min:35, label:"CHAMPION"  }, { min:50, label:"LEGEND"     },
];
const getRank = lvl => [...RANKS].reverse().find(r=>lvl>=r.min)?.label ?? "RECRUIT";

const computeXp = (task, now) => {
  const core = (DIFFICULTY_BASE[task.difficulty] ?? 10) * (IMPORTANCE_MULT[task.importance] ?? 1.0);
  const hasTimer = task.scheduleType === "timer" && task.timerDeadline && task.timerSeconds;
  const hasDue   = task.scheduleType === "due"   && task.dueDate;
  let timerFrac = null, dueFrac = null;
  if (hasTimer) {
    const rem = task.timerDeadline - now;
    timerFrac = rem > 0 ? Math.min(1, rem / (task.timerSeconds * 1000)) : 0;
  }
  if (hasDue) {
    if (now >= task.dueDate) {
      dueFrac = 0;
    } else {
      const created = task.createdAt ?? (task.dueDate - 7 * 24 * 60 * 60 * 1000);
      const window  = task.dueDate - created;
      dueFrac = window > 0 ? Math.min(1, (task.dueDate - now) / window) : 0;
    }
  }
  let frac = 0;
  if (timerFrac !== null && dueFrac !== null) frac = (timerFrac + dueFrac) / 2;
  else if (timerFrac !== null) frac = timerFrac;
  else if (dueFrac !== null)   frac = dueFrac;
  frac = Math.min(1, Math.max(0, frac));
  return Math.round(core + core * MAX_TIMING_BONUS_RATE * frac);
};

const THEMES = {
  techboy: {
    name: "Tech Boy",
    primary:"#00b4ff", secondary:"#00dcb4", accent:"#7eb8ff",
    bg:"#020d1f", bgGrad:"radial-gradient(ellipse at 20% 20%, #001a3a 0%, #020d1f 60%)",
    card:"rgba(0,20,50,0.7)", cardHover:"rgba(0,40,80,0.7)",
    border:"rgba(0,180,255,0.25)", grid:"rgba(0,180,255,0.04)",
    orb1:"#00b4ff22", orb2:"#00dcb422", danger:"#ff6060",
  },
  sciencegirl: {
    name: "Science Girl",
    primary:"#b44fff", secondary:"#00e676", accent:"#d49fff",
    bg:"#0d0118", bgGrad:"radial-gradient(ellipse at 20% 20%, #1a003a 0%, #0d0118 60%)",
    card:"rgba(30,0,60,0.7)", cardHover:"rgba(50,0,90,0.7)",
    border:"rgba(180,79,255,0.25)", grid:"rgba(180,79,255,0.04)",
    orb1:"#b44fff22", orb2:"#00e67622", danger:"#ff6090",
  },
};

const DIFF_COLORS = (t) => ({
  Easy:   { bg:`rgba(0,230,118,0.12)`, border:t.secondary, text:t.secondary },
  Medium: { bg:`rgba(0,180,255,0.12)`, border:t.primary,   text:t.primary   },
  Hard:   { bg:`rgba(180,0,255,0.15)`, border:t.accent,    text:t.accent    },
});

const computeStreak = (completed) => {
  const days = new Set(completed.filter(t=>t.completedAt).map(t=>new Date(t.completedAt).toLocaleDateString()));
  if (!days.size) return 0;
  const today = new Date().toLocaleDateString();
  const yesterday = new Date(Date.now()-86400000).toLocaleDateString();
  let cursor = days.has(today) ? new Date() : days.has(yesterday) ? new Date(Date.now()-86400000) : null;
  if (!cursor) return 0;
  let streak = 0;
  while (days.has(cursor.toLocaleDateString())) { streak++; cursor = new Date(cursor.getTime()-86400000); }
  return streak;
};

const defaultQuest = (over={}) => ({
  id: Date.now()+Math.random(),
  createdAt: Date.now(),
  title: "", difficulty: "Medium", importance: "Medium",
  scheduleType: "none",
  timerDeadline: null, timerSeconds: null, timerMissed: false,
  dueDate: null, repeat: "none", repeatEvery: 2,
  ...over,
});

const GOAL_TASKS = {
  School:   [
    { title:"Complete today's homework", difficulty:"Medium", importance:"High"   },
    { title:"Study for 30 minutes",      difficulty:"Easy",   importance:"Medium" },
    { title:"Organize your notes",       difficulty:"Easy",   importance:"Low"    },
  ],
  Health:   [
    { title:"Exercise for 20 minutes",   difficulty:"Medium", importance:"Medium" },
    { title:"Drink 8 glasses of water",  difficulty:"Easy",   importance:"Low"    },
    { title:"Sleep before midnight",     difficulty:"Easy",   importance:"Medium" },
  ],
  Creative: [
    { title:"Work on a creative project",   difficulty:"Medium", importance:"Medium" },
    { title:"Draw or write for 15 minutes", difficulty:"Easy",   importance:"Low"    },
  ],
  Social:   [
    { title:"Reach out to a friend",  difficulty:"Easy",   importance:"Low"    },
    { title:"Meet someone new today", difficulty:"Medium", importance:"Medium" },
  ],
  Personal: [
    { title:"Clean your room",        difficulty:"Medium", importance:"Low"    },
    { title:"Read for 20 minutes",    difficulty:"Easy",   importance:"Low"    },
    { title:"Journal for 10 minutes", difficulty:"Easy",   importance:"Medium" },
  ],
};

const TIPS = [
  "Complete quests to earn XP and level up!",
  "Hard quests give 5x the XP of Easy ones.",
  "A quest can have a timer OR a due date — pick one when you add it.",
  "Beat a due date early for bonus XP. Critical quests reward the most.",
  "Miss a timer or a deadline and the quest is lost to the Missed log — with an XP hit.",
  "Repeating quests respawn automatically, even if you miss one.",
  "Consistency beats intensity — complete something every day.",
];

// ── Music Tracks ──────────────────────────────────────────────────────────
const TRACKS = [
  {
    id:     "honored",
    name:   "Honored",
    artist: "DJ",
    url:    "https://raw.githubusercontent.com/djscorcher/honored/main/Honored%20all%20together%20.m4a",
    type:   "audio",
  },
  {
    id:     "arise",
    name:   "Arise",
    artist: "DJ",
    url:    null,
    type:   "audio",
  },
  {
    id:     "neural_drift",
    name:   "Neural Drift",
    artist: "NeuroQuest",
    url:    null,
    type:   "procedural",
  },
];

// ── Music Player Hook ─────────────────────────────────────────────────────
// Single <audio> element. Playing/error state is driven by the element's real
// events so the UI can never lie about what's actually happening.
function useMusicPlayer() {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted,   setMuted]   = useState(false);
  const [volume,  setVolume]  = useState(0.6);
  const [trackId, setTrackId] = useState("honored");
  const [error,   setError]   = useState(false);
  const [progress, setProgress] = useState({ cur:0, dur:0 });

  const currentTrack = TRACKS.find(tr => tr.id === trackId) || TRACKS[0];
  const isAudio = currentTrack.type === "audio" && !!currentTrack.url;

  // Create the audio element once and wire up event-driven state.
  useEffect(() => {
    const a = new Audio();
    a.loop = true;
    a.preload = "auto";
    audioRef.current = a;
    const onPlay  = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onErr   = () => { setError(true); setPlaying(false); };
    const onTime  = () => setProgress({ cur: a.currentTime || 0, dur: isFinite(a.duration) ? a.duration : 0 });
    a.addEventListener("play", onPlay);
    a.addEventListener("playing", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onPause);
    a.addEventListener("error", onErr);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onTime);
    return () => {
      a.pause(); a.removeAttribute("src"); a.load();
      a.removeEventListener("play", onPlay);
      a.removeEventListener("playing", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onPause);
      a.removeEventListener("error", onErr);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onTime);
    };
  }, []);

  // Keep the element's volume in sync.
  useEffect(() => { if (audioRef.current) audioRef.current.volume = muted ? 0 : volume; }, [muted, volume]);

  const ensureSrc = (track) => {
    const a = audioRef.current;
    if (!a) return null;
    if (track.type === "audio" && track.url) {
      if (a.getAttribute("src") !== track.url) { a.src = track.url; a.load(); }
      return a;
    }
    return null;
  };

  const startMusic = useCallback(() => {
    const a = audioRef.current;
    if (!a || !isAudio) return;
    setError(false);
    ensureSrc(currentTrack);
    a.play().catch(() => {});           // if blocked, the 'play' event simply never fires
  }, [isAudio, currentTrack]);

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a || !isAudio) return;
    if (a.paused) { setError(false); ensureSrc(currentTrack); a.play().catch(() => {}); }
    else a.pause();
  }, [isAudio, currentTrack]);

  const toggleMute   = useCallback(() => setMuted(m => !m), []);
  const changeVolume = useCallback((v) => { setVolume(v); if (v > 0) setMuted(false); }, []);

  const seek = useCallback((delta) => {
    const a = audioRef.current;
    if (!a || !isAudio || !isFinite(a.duration)) return;
    a.currentTime = Math.min(Math.max(0, a.currentTime + delta), a.duration);
  }, [isAudio]);

  const seekTo = useCallback((sec) => {
    const a = audioRef.current;
    if (!a || !isAudio || !isFinite(a.duration)) return;
    a.currentTime = Math.min(Math.max(0, sec), a.duration);
  }, [isAudio]);

  const switchTrack = useCallback((id) => {
    const track = TRACKS.find(tr => tr.id === id);
    if (!track) return;
    const a = audioRef.current;
    const wasPlaying = a && !a.paused;
    setError(false);
    setProgress({ cur:0, dur:0 });
    setTrackId(id);
    if (track.type === "audio" && track.url) {
      ensureSrc(track);
      if (wasPlaying && a) a.play().catch(() => {});
    } else if (a) {
      a.pause(); a.removeAttribute("src"); a.load();  // stop any current playback cleanly
    }
  }, []);

  return { playing, muted, volume, trackId, currentTrack, isAudio, error, progress,
           startMusic, togglePlay, toggleMute, changeVolume, seek, seekTo, switchTrack };
}

// ── Time helpers ──────────────────────────────────────────────────────────
const startOfDay = ts => { const d = new Date(ts); d.setHours(0,0,0,0); return d.getTime(); };
const dayDiff = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / 86400000);
const fmtTime = ms => {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms/1000);
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  const p = n => String(n).padStart(2,"0");
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
};
const fmtClock = s => { if (!isFinite(s) || s < 0) s = 0; const m = Math.floor(s/60), sec = Math.floor(s%60); return `${m}:${String(sec).padStart(2,"0")}`; };
const dateInputValue = ts => { const d = new Date(ts); const p = n => String(n).padStart(2,"0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; };
const dueLabel = (dueDate, now) => {
  const d = dayDiff(dueDate, now);
  if (d === 0) return "due today";
  if (d > 0)  return `due in ${d}d`;
  return `${-d}d overdue`;
};
const REPEAT_LABEL = { daily:"daily", weekly:"weekly", monthly:"monthly", custom:"custom" };
const advanceDue = (ts, repeat, every) => {
  const d = new Date(ts);
  if (repeat === "daily")        d.setDate(d.getDate()+1);
  else if (repeat === "weekly")  d.setDate(d.getDate()+7);
  else if (repeat === "monthly") d.setMonth(d.getMonth()+1);
  else if (repeat === "custom")  d.setDate(d.getDate()+(every||1));
  return d.getTime();
};

// ── Sound ─────────────────────────────────────────────────────────────────
function useSound() {
  const ctx = useRef(null);
  const getCtx = () => { if (!ctx.current) ctx.current = new (window.AudioContext||window.webkitAudioContext)(); return ctx.current; };
  return useCallback((type) => {
    try {
      const c = getCtx();
      const o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination);
      if (type==="complete") {
        o.frequency.setValueAtTime(440,c.currentTime);
        o.frequency.exponentialRampToValueAtTime(880,c.currentTime+0.1);
        g.gain.setValueAtTime(0.15,c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+0.3);
        o.start(); o.stop(c.currentTime+0.3);
      } else if (type==="levelup") {
        [523,659,784,1047].forEach((f,i)=>{
          const o2=c.createOscillator(),g2=c.createGain();
          o2.connect(g2); g2.connect(c.destination);
          o2.frequency.value=f;
          g2.gain.setValueAtTime(0.12,c.currentTime+i*0.1);
          g2.gain.exponentialRampToValueAtTime(0.001,c.currentTime+i*0.1+0.25);
          o2.start(c.currentTime+i*0.1); o2.stop(c.currentTime+i*0.1+0.25);
        });
      } else if (type==="derank") {
        [784,659,523,392].forEach((f,i)=>{
          const o2=c.createOscillator(),g2=c.createGain();
          o2.connect(g2); g2.connect(c.destination);
          o2.type="sawtooth"; o2.frequency.value=f;
          g2.gain.setValueAtTime(0.10,c.currentTime+i*0.12);
          g2.gain.exponentialRampToValueAtTime(0.001,c.currentTime+i*0.12+0.28);
          o2.start(c.currentTime+i*0.12); o2.stop(c.currentTime+i*0.12+0.28);
        });
      } else if (type==="penalty") {
        o.type="sawtooth";
        o.frequency.setValueAtTime(300,c.currentTime);
        o.frequency.exponentialRampToValueAtTime(110,c.currentTime+0.3);
        g.gain.setValueAtTime(0.12,c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+0.3);
        o.start(); o.stop(c.currentTime+0.3);
      } else if (type==="add") {
        o.frequency.setValueAtTime(330,c.currentTime);
        g.gain.setValueAtTime(0.08,c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+0.15);
        o.start(); o.stop(c.currentTime+0.15);
      } else if (type==="delete") {
        o.frequency.setValueAtTime(200,c.currentTime);
        o.frequency.exponentialRampToValueAtTime(100,c.currentTime+0.15);
        g.gain.setValueAtTime(0.08,c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+0.15);
        o.start(); o.stop(c.currentTime+0.15);
      } else if (type==="nudge") {
        [523,784,1047,1319].forEach((f,i)=>{
          const o2=c.createOscillator(),g2=c.createGain();
          o2.connect(g2); g2.connect(c.destination);
          o2.type="sine"; o2.frequency.value=f;
          g2.gain.setValueAtTime(0.1,c.currentTime+i*0.09);
          g2.gain.exponentialRampToValueAtTime(0.001,c.currentTime+i*0.09+0.3);
          o2.start(c.currentTime+i*0.09); o2.stop(c.currentTime+i*0.09+0.3);
        });
      }
    } catch {}
  }, []);
}

// ── Shared UI ─────────────────────────────────────────────────────────────
function LevelUpFlash({ show, level, t }) {
  if (!show) return null;
  return (
    <div style={{ position:"fixed",inset:0,zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none",flexDirection:"column",gap:12 }}>
      <div style={{ fontFamily:"'Orbitron',monospace",fontWeight:900,fontSize:"clamp(2rem,8vw,4rem)",color:t.secondary,textShadow:`0 0 40px ${t.secondary},0 0 80px ${t.primary}`,letterSpacing:"0.15em",animation:"scaleIn 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards,fadeOut 1.8s ease forwards" }}>⬆ LEVEL UP!</div>
      <div style={{ fontFamily:"'Orbitron',monospace",fontSize:"clamp(0.9rem,3vw,1.3rem)",color:t.primary,letterSpacing:"0.2em",animation:"fadeOut 1.8s 0.2s ease forwards" }}>LEVEL {level} — {getRank(level)}</div>
    </div>
  );
}

function DerankFlash({ show, level, t }) {
  if (!show) return null;
  return (
    <div style={{ position:"fixed",inset:0,zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none",flexDirection:"column",gap:12 }}>
      <div style={{ fontFamily:"'Orbitron',monospace",fontWeight:900,fontSize:"clamp(2rem,8vw,4rem)",color:t.danger,textShadow:`0 0 40px ${t.danger},0 0 80px #ff0000`,letterSpacing:"0.15em",animation:"shake 0.5s ease,fadeOut 1.8s ease forwards" }}>⬇ RANK LOST</div>
      <div style={{ fontFamily:"'Orbitron',monospace",fontSize:"clamp(0.9rem,3vw,1.3rem)",color:t.danger,letterSpacing:"0.2em",animation:"fadeOut 1.8s 0.2s ease forwards" }}>LEVEL {level} — {getRank(level)}</div>
    </div>
  );
}

function NudgeFlash({ nudge, t }) {
  if (!nudge) return null;
  return (
    <div style={{ position:"fixed",inset:0,zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none",flexDirection:"column",gap:16 }}>
      <div style={{ fontFamily:"'Orbitron',monospace",fontWeight:900,fontSize:"clamp(1.6rem,7vw,3rem)",color:t.secondary,textShadow:`0 0 40px ${t.secondary},0 0 80px ${t.primary}`,letterSpacing:"0.12em",animation:"scaleIn 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards,fadeOut 2.2s ease forwards",textAlign:"center",padding:"0 16px",maxWidth:"85vw" }}>{nudge.message}</div>
      <div style={{ fontFamily:"'Orbitron',monospace",fontSize:"clamp(0.65rem,2.5vw,0.9rem)",color:t.primary,letterSpacing:"0.2em",animation:"fadeOut 2.2s 0.3s ease forwards" }}>from {nudge.senderName}</div>
    </div>
  );
}

function XPPopup({ popups, t }) {
  return (
    <div style={{ position:"fixed",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:150 }}>
      {popups.map(p=>{
        const positive = p.xp >= 0;
        const color = positive ? t.secondary : t.danger;
        return (
          <div key={p.id} style={{ position:"absolute",left:p.x,top:p.y,fontFamily:"'Orbitron',monospace",fontWeight:700,fontSize:18,color,textShadow:`0 0 12px ${color}`,animation:"floatUp 1.2s ease forwards",whiteSpace:"nowrap" }}>{positive?"+":""}{p.xp} XP</div>
        );
      })}
    </div>
  );
}

function XPBar({ xp, t }) {
  const current = xp % XP_PER_LEVEL;
  const pct = (current / XP_PER_LEVEL) * 100;
  return (
    <div style={{ marginTop:8 }}>
      <div style={{ display:"flex",justifyContent:"space-between",marginBottom:6 }}>
        <span style={{ fontFamily:"'Orbitron',monospace",fontSize:11,color:t.accent,letterSpacing:"0.1em" }}>XP {current} / {XP_PER_LEVEL}</span>
        <span style={{ fontFamily:"'Orbitron',monospace",fontSize:11,color:t.secondary,letterSpacing:"0.1em" }}>TOTAL {xp} XP</span>
      </div>
      <div style={{ height:10,borderRadius:99,background:`${t.primary}22`,border:`1px solid ${t.primary}44`,overflow:"hidden" }}>
        <div style={{ height:"100%",borderRadius:99,width:`${pct}%`,background:`linear-gradient(90deg,${t.primary},${t.secondary})`,boxShadow:`0 0 12px ${t.primary}`,transition:"width 0.6s cubic-bezier(0.34,1.56,0.64,1)" }} />
      </div>
    </div>
  );
}

function Dropdown({ value, onChange, options, t }) {
  return (
    <select value={value} onChange={e=>onChange(e.target.value)}
      style={{ width:"100%",appearance:"auto",background:`${t.primary}11`,border:`1px solid ${t.primary}44`,borderRadius:8,padding:"10px 10px",color:"#e0f0ff",fontFamily:"'Exo 2',sans-serif",fontSize:13,outline:"none",colorScheme:"dark",cursor:"pointer" }}>
      {options.map(o=>(
        <option key={o.value} value={o.value} style={{ background:t.bg,color:"#e0f0ff" }}>{o.label}</option>
      ))}
    </select>
  );
}

function FieldLabel({ children, t }) {
  return <div style={{ fontFamily:"'Orbitron',monospace",fontSize:9,color:t.primary,letterSpacing:"0.15em",marginBottom:6 }}>{children}</div>;
}

// ── Music Bar ─────────────────────────────────────────────────────────────
function MusicBar({ music, t }) {
  const { playing, muted, volume, trackId, currentTrack, isAudio, error, progress,
          togglePlay, toggleMute, changeVolume, seek, seekTo, switchTrack } = music;
  const [expanded, setExpanded] = useState(false);

  const ctrl = (enabled, extra={}) => ({
    width:30, height:30, borderRadius:6,
    border:`1px solid ${enabled?t.primary:t.border}`,
    background: enabled?`${t.primary}11`:"transparent",
    cursor: enabled?"pointer":"default",
    color: enabled?t.primary:`${t.primary}33`,
    fontSize:12, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
    transition:"all 0.2s", ...extra,
  });
  const canPlay = isAudio && !error;
  const canSeek = canPlay && progress.dur > 0;

  return (
    <div style={{ background:t.card,backdropFilter:"blur(16px)",border:`1px solid ${t.border}`,borderRadius:10,padding:"10px 14px",marginBottom:16 }}>
      <div style={{ display:"flex",alignItems:"center",gap:8 }}>
        <button onClick={togglePlay} disabled={!canPlay} title={canPlay?(playing?"Pause":"Play"):(error?"Couldn't load track":"Track unavailable")} style={ctrl(canPlay)}>{playing?"⏸":"▶"}</button>
        <button onClick={()=>seek(-10)} disabled={!canSeek} title="Rewind 10s" style={ctrl(canSeek)}>⏮</button>
        <button onClick={()=>seek(10)}  disabled={!canSeek} title="Forward 10s" style={ctrl(canSeek)}>⏭</button>
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ fontFamily:"'Orbitron',monospace",fontSize:8,color:error?t.danger:t.primary,letterSpacing:"0.12em",marginBottom:1 }}>
            {error ? "LOAD FAILED" : (playing ? "▶ NOW PLAYING" : "MUSIC")}
          </div>
          <div style={{ fontFamily:"'Exo 2',sans-serif",fontSize:12,color:isAudio?"#e0f0ff":t.accent,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",opacity:isAudio?1:0.5 }}>
            {currentTrack.name}{!isAudio?" — coming soon":""}
          </div>
        </div>
        <button onClick={toggleMute} title={muted?"Unmute":"Mute"} style={ctrl(true,{ color:muted?t.danger:t.accent, border:`1px solid ${t.border}`, background:"transparent" })}>{muted?"🔇":"🔊"}</button>
        <button onClick={()=>setExpanded(x=>!x)} title="Music settings" style={{ width:24,height:24,borderRadius:4,border:`1px solid ${expanded?t.primary:t.border}`,background:expanded?`${t.primary}11`:"transparent",color:expanded?t.primary:t.accent,cursor:"pointer",fontSize:9,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>{expanded?"▲":"▼"}</button>
      </div>

      {/* Seek bar */}
      <div style={{ display:"flex",alignItems:"center",gap:8,marginTop:8,opacity:canSeek?1:0.35 }}>
        <span style={{ fontFamily:"'Orbitron',monospace",fontSize:8,color:t.accent,width:32,textAlign:"right" }}>{fmtClock(progress.cur)}</span>
        <input type="range" min={0} max={progress.dur||1} step={1} value={Math.min(progress.cur, progress.dur||0)}
          onChange={e=>seekTo(Number(e.target.value))} disabled={!canSeek}
          style={{ flex:1,accentColor:t.primary,cursor:canSeek?"pointer":"default" }} />
        <span style={{ fontFamily:"'Orbitron',monospace",fontSize:8,color:t.accent,width:32 }}>{fmtClock(progress.dur)}</span>
      </div>

      {expanded && (
        <div style={{ marginTop:12,display:"flex",flexDirection:"column",gap:12,animation:"slideIn 0.15s ease",borderTop:`1px solid ${t.border}`,paddingTop:12 }}>
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            <span style={{ fontFamily:"'Orbitron',monospace",fontSize:8,color:t.primary,letterSpacing:"0.12em",width:52 }}>VOLUME</span>
            <input type="range" min={0} max={1} step={0.05} value={muted?0:volume}
              onChange={e=>changeVolume(Number(e.target.value))}
              style={{ flex:1,accentColor:t.primary,cursor:"pointer" }} />
          </div>
          <div>
            <div style={{ fontFamily:"'Orbitron',monospace",fontSize:8,color:t.primary,letterSpacing:"0.12em",marginBottom:6 }}>TRACKS</div>
            <div style={{ display:"flex",flexDirection:"column",gap:4 }}>
              {TRACKS.map(tr=>{
                const avail = tr.type==="audio" && !!tr.url;
                const active = trackId===tr.id;
                return (
                  <button key={tr.id} onClick={()=>avail&&switchTrack(tr.id)}
                    style={{ display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:7,border:`1px solid ${active?t.primary:t.border}`,background:active?`${t.primary}18`:"transparent",cursor:avail?"pointer":"default",opacity:avail?1:0.4,textAlign:"left",transition:"all 0.15s" }}>
                    <span style={{ fontFamily:"'Orbitron',monospace",fontSize:10,color:active?t.primary:t.accent,width:14 }}>{active&&playing?"▶":""}</span>
                    <span style={{ fontFamily:"'Exo 2',sans-serif",fontSize:13,color:active?"#e0f0ff":t.accent,flex:1 }}>{tr.name}</span>
                    <span style={{ fontFamily:"'Orbitron',monospace",fontSize:8,color:t.accent,opacity:0.6 }}>{tr.artist}</span>
                    {!avail&&<span style={{ fontFamily:"'Orbitron',monospace",fontSize:7,color:t.accent,border:`1px solid ${t.border}`,padding:"1px 5px",borderRadius:4 }}>SOON</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Loading Screen ────────────────────────────────────────────────────────
function LoadingScreen({ onDone, t }) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("logo");
  useEffect(()=>{ const t1=setTimeout(()=>setPhase("bar"),800); return()=>clearTimeout(t1); },[]);
  useEffect(()=>{
    if(phase!=="bar")return;
    let p=0;
    const iv=setInterval(()=>{ p+=Math.random()*18+4; if(p>=100){p=100;clearInterval(iv);setTimeout(onDone,400);} setProgress(Math.min(p,100)); },120);
    return()=>clearInterval(iv);
  },[phase]);
  const MODULES=["QUEST ENGINE","REWARD SYSTEM","XP MATRIX","RANK PROTOCOL","USER INTERFACE"];
  return (
    <div style={{ position:"fixed",inset:0,background:t.bgGrad,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",zIndex:500,gap:32 }}>
      <div style={{ position:"absolute",inset:0,backgroundImage:`linear-gradient(${t.grid} 1px,transparent 1px),linear-gradient(90deg,${t.grid} 1px,transparent 1px)`,backgroundSize:"60px 60px",animation:"gridMove 4s linear infinite",pointerEvents:"none" }} />
      <div style={{ position:"absolute",top:-120,left:-80,width:400,height:400,borderRadius:"50%",background:`radial-gradient(circle,${t.orb1} 0%,transparent 70%)`,pointerEvents:"none" }} />
      <div style={{ position:"absolute",bottom:-100,right:-60,width:300,height:300,borderRadius:"50%",background:`radial-gradient(circle,${t.orb2} 0%,transparent 70%)`,pointerEvents:"none" }} />
      <div style={{ textAlign:"center",animation:"scaleIn 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards",position:"relative",zIndex:1 }}>
        <div style={{ fontFamily:"'Orbitron',monospace",fontWeight:900,fontSize:"clamp(2.5rem,10vw,5rem)",color:t.secondary,textShadow:`0 0 40px ${t.secondary},0 0 80px ${t.primary}`,letterSpacing:"0.1em",lineHeight:1 }}>NEURO</div>
        <div style={{ fontFamily:"'Orbitron',monospace",fontWeight:900,fontSize:"clamp(2.5rem,10vw,5rem)",color:t.primary,textShadow:`0 0 40px ${t.primary}`,letterSpacing:"0.1em",lineHeight:1 }}>QUEST</div>
        <div style={{ fontFamily:"'Exo 2',sans-serif",fontSize:13,color:t.accent,letterSpacing:"0.3em",marginTop:10,opacity:0.8 }}>GAMIFY YOUR LIFE</div>
      </div>
      {phase==="bar"&&(
        <div style={{ width:"min(320px,80vw)",position:"relative",zIndex:1 }}>
          <div style={{ height:6,borderRadius:99,background:`${t.primary}22`,border:`1px solid ${t.primary}44`,overflow:"hidden",marginBottom:12 }}>
            <div style={{ height:"100%",borderRadius:99,width:`${progress}%`,background:`linear-gradient(90deg,${t.primary},${t.secondary})`,boxShadow:`0 0 12px ${t.primary}`,transition:"width 0.15s ease" }} />
          </div>
          <div style={{ display:"flex",flexDirection:"column",gap:4 }}>
            {MODULES.map((m,i)=>(
              <div key={m} style={{ display:"flex",alignItems:"center",gap:8,opacity:progress>(i)*18?1:0.2,transition:"opacity 0.3s" }}>
                <span style={{ fontFamily:"'Orbitron',monospace",fontSize:9,color:t.secondary }}>✓</span>
                <span style={{ fontFamily:"'Orbitron',monospace",fontSize:9,color:t.accent,letterSpacing:"0.1em" }}>{m}</span>
              </div>
            ))}
          </div>
          <div style={{ fontFamily:"'Orbitron',monospace",fontSize:10,color:t.primary,textAlign:"right",marginTop:8,letterSpacing:"0.1em" }}>{Math.round(progress)}%</div>
        </div>
      )}
    </div>
  );
}

// ── Name Screen ───────────────────────────────────────────────────────────
function NameScreen({ onNext, t }) {
  const [name, setName] = useState("");
  const submit = () => { if(name.trim().length>=2) onNext(name.trim().toUpperCase()); };
  return (
    <div style={{ position:"fixed",inset:0,background:t.bgGrad,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",zIndex:400,padding:24 }}>
      <div style={{ position:"absolute",inset:0,backgroundImage:`linear-gradient(${t.grid} 1px,transparent 1px),linear-gradient(90deg,${t.grid} 1px,transparent 1px)`,backgroundSize:"60px 60px",animation:"gridMove 4s linear infinite",pointerEvents:"none" }} />
      <div style={{ position:"relative",zIndex:1,width:"100%",maxWidth:420,animation:"slideIn 0.4s ease" }}>
        <div style={{ textAlign:"center",marginBottom:36 }}>
          <div style={{ fontFamily:"'Orbitron',monospace",fontWeight:900,fontSize:28,color:t.secondary,textShadow:`0 0 24px ${t.secondary}`,letterSpacing:"0.1em" }}>WELCOME, HERO</div>
          <div style={{ fontFamily:"'Exo 2',sans-serif",fontSize:14,color:t.accent,marginTop:8 }}>What should we call you?</div>
        </div>
        <div style={{ background:t.card,backdropFilter:"blur(16px)",border:`1px solid ${t.border}`,borderRadius:16,padding:"28px 24px" }}>
          <FieldLabel t={t}>PLAYER NAME</FieldLabel>
          <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}
            placeholder="Enter your name..." maxLength={20} autoFocus
            style={{ width:"100%",background:`${t.primary}11`,border:`1px solid ${t.primary}55`,borderRadius:8,padding:"13px 16px",color:"#e0f0ff",fontFamily:"'Orbitron',monospace",fontSize:16,outline:"none",marginBottom:20,letterSpacing:"0.05em",transition:"border-color 0.2s" }}
            onFocus={e=>e.target.style.borderColor=t.primary}
            onBlur={e=>e.target.style.borderColor=`${t.primary}55`} />
          <button onClick={submit} disabled={name.trim().length<2}
            style={{ width:"100%",padding:"13px 0",fontFamily:"'Orbitron',monospace",fontSize:12,letterSpacing:"0.15em",background:name.trim().length>=2?`linear-gradient(135deg,${t.primary},${t.secondary})`:`${t.primary}22`,border:"none",borderRadius:8,cursor:name.trim().length>=2?"pointer":"default",color:name.trim().length>=2?t.bg:"#3a5060",fontWeight:700,transition:"all 0.2s",boxShadow:name.trim().length>=2?`0 0 20px ${t.primary}66`:"none" }}>
            CONTINUE →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Goals Screen ──────────────────────────────────────────────────────────
function GoalsScreen({ playerName, onNext, t }) {
  const [selected, setSelected] = useState([]);
  const goals = Object.keys(GOAL_TASKS);
  const ICONS = { School:"📚", Health:"💪", Creative:"🎨", Social:"🤝", Personal:"🌱" };
  const toggle = g => setSelected(prev=>prev.includes(g)?prev.filter(x=>x!==g):[...prev,g]);
  const submit = () => { const tasks=selected.flatMap(g=>GOAL_TASKS[g].map(tk=>defaultQuest(tk))); onNext(tasks); };
  return (
    <div style={{ position:"fixed",inset:0,background:t.bgGrad,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",zIndex:400,padding:24,overflowY:"auto" }}>
      <div style={{ position:"absolute",inset:0,backgroundImage:`linear-gradient(${t.grid} 1px,transparent 1px),linear-gradient(90deg,${t.grid} 1px,transparent 1px)`,backgroundSize:"60px 60px",animation:"gridMove 4s linear infinite",pointerEvents:"none" }} />
      <div style={{ position:"relative",zIndex:1,width:"100%",maxWidth:480,animation:"slideIn 0.4s ease" }}>
        <div style={{ textAlign:"center",marginBottom:28 }}>
          <div style={{ fontFamily:"'Orbitron',monospace",fontWeight:900,fontSize:22,color:t.secondary,textShadow:`0 0 20px ${t.secondary}`,letterSpacing:"0.08em" }}>HELLO, {playerName}</div>
          <div style={{ fontFamily:"'Exo 2',sans-serif",fontSize:15,color:t.accent,marginTop:8 }}>What are your goals? We'll generate starter quests for you.</div>
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20 }}>
          {goals.map(g=>{
            const sel=selected.includes(g);
            return (
              <button key={g} onClick={()=>toggle(g)}
                style={{ padding:"18px 16px",background:sel?`${t.primary}22`:t.card,border:`2px solid ${sel?t.primary:t.border}`,borderRadius:12,cursor:"pointer",textAlign:"center",transition:"all 0.2s",boxShadow:sel?`0 0 16px ${t.primary}55`:"none",backdropFilter:"blur(8px)" }}>
                <div style={{ fontSize:28,marginBottom:8 }}>{ICONS[g]}</div>
                <div style={{ fontFamily:"'Orbitron',monospace",fontSize:11,color:sel?t.primary:t.accent,letterSpacing:"0.1em" }}>{g.toUpperCase()}</div>
                <div style={{ fontFamily:"'Exo 2',sans-serif",fontSize:11,color:t.accent,marginTop:4,opacity:0.7 }}>{GOAL_TASKS[g].length} starter quests</div>
              </button>
            );
          })}
        </div>
        <button onClick={submit}
          style={{ width:"100%",padding:"13px 0",fontFamily:"'Orbitron',monospace",fontSize:12,letterSpacing:"0.15em",background:`linear-gradient(135deg,${t.primary},${t.secondary})`,border:"none",borderRadius:8,cursor:"pointer",color:t.bg,fontWeight:700,boxShadow:`0 0 20px ${t.primary}66`,transition:"all 0.2s" }}>
          {selected.length===0?"SKIP — START EMPTY":`START WITH ${selected.reduce((n,g)=>n+GOAL_TASKS[g].length,0)} QUESTS →`}
        </button>
      </div>
    </div>
  );
}

// ── Theme Picker ──────────────────────────────────────────────────────────
function ThemePicker({ current, onChange, t }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position:"relative" }}>
      <button onClick={()=>setOpen(o=>!o)}
        style={{ padding:"8px 14px",fontFamily:"'Orbitron',monospace",fontSize:9,letterSpacing:"0.1em",background:t.card,border:`1px solid ${t.border}`,borderRadius:8,cursor:"pointer",color:t.primary }}>
        🎨 THEME
      </button>
      {open&&(
        <div style={{ position:"absolute",right:0,top:40,background:t.card,border:`1px solid ${t.border}`,borderRadius:10,padding:8,zIndex:50,backdropFilter:"blur(16px)",minWidth:160 }}>
          {Object.entries(THEMES).map(([key,theme])=>(
            <button key={key} onClick={()=>{onChange(key);setOpen(false);}}
              style={{ display:"block",width:"100%",padding:"10px 14px",fontFamily:"'Orbitron',monospace",fontSize:9,letterSpacing:"0.1em",background:current===key?`${theme.primary}22`:"transparent",border:current===key?`1px solid ${theme.primary}`:"1px solid transparent",borderRadius:7,cursor:"pointer",color:current===key?theme.primary:t.accent,textAlign:"left",marginBottom:4 }}>
              {theme.name.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Quest Form ────────────────────────────────────────────────────────────
function QuestForm({ form, setForm, onSubmit, onCancel, editing, t, inputRef }) {
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const totalSecs=(Number(form.h)||0)*3600+(Number(form.m)||0)*60+(Number(form.s)||0);
  const canSubmit=form.title.trim().length>0&&(form.schedule!=="timer"||totalSecs>0)&&(form.schedule!=="due"||!!form.dueDate);
  const numStyle={ width:"100%",background:`${t.primary}11`,border:`1px solid ${t.primary}44`,borderRadius:8,padding:"9px 8px",color:"#e0f0ff",fontFamily:"'Orbitron',monospace",fontSize:14,outline:"none",textAlign:"center" };
  return (
    <div style={{ background:t.card,backdropFilter:"blur(16px)",border:`1px solid ${editing?t.secondary:t.border}`,borderRadius:14,padding:"18px 20px",marginBottom:20,boxShadow:editing?`0 0 20px ${t.secondary}44`:"none",transition:"all 0.2s" }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
        <div style={{ fontFamily:"'Orbitron',monospace",fontSize:9,color:editing?t.secondary:t.primary,letterSpacing:"0.2em" }}>{editing?"EDIT QUEST":"NEW QUEST"}</div>
        {editing&&<button onClick={onCancel} style={{ fontFamily:"'Orbitron',monospace",fontSize:9,letterSpacing:"0.1em",background:"transparent",border:`1px solid ${t.border}`,borderRadius:6,padding:"4px 10px",color:t.accent,cursor:"pointer" }}>CANCEL</button>}
      </div>
      <input ref={inputRef} value={form.title} onChange={e=>set("title",e.target.value)} onKeyDown={e=>e.key==="Enter"&&canSubmit&&onSubmit()} placeholder="Enter quest name..."
        style={{ width:"100%",background:`${t.primary}11`,border:`1px solid ${t.primary}44`,borderRadius:8,padding:"11px 14px",color:"#e0f0ff",fontFamily:"'Exo 2',sans-serif",fontSize:15,outline:"none",marginBottom:14,transition:"border-color 0.2s" }}
        onFocus={e=>e.target.style.borderColor=t.primary} onBlur={e=>e.target.style.borderColor=`${t.primary}44`} />
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14 }}>
        <div><FieldLabel t={t}>DIFFICULTY</FieldLabel><Dropdown value={form.difficulty} onChange={v=>set("difficulty",v)} t={t} options={[{value:"Easy",label:"Easy"},{value:"Medium",label:"Medium"},{value:"Hard",label:"Hard"}]} /></div>
        <div><FieldLabel t={t}>IMPORTANCE</FieldLabel><Dropdown value={form.importance} onChange={v=>set("importance",v)} t={t} options={IMPORTANCE_ORDER.map(k=>({value:k,label:IMPORTANCE[k].label}))} /></div>
        <div><FieldLabel t={t}>SCHEDULE</FieldLabel><Dropdown value={form.schedule} onChange={v=>set("schedule",v)} t={t} options={[{value:"none",label:"None"},{value:"timer",label:"Timer"},{value:"due",label:"Due date"}]} /></div>
      </div>
      {form.schedule==="timer"&&(
        <div style={{ marginBottom:14,animation:"slideIn 0.2s ease" }}>
          <FieldLabel t={t}>COUNTDOWN</FieldLabel>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10 }}>
            {[["h","hrs"],["m","min"],["s","sec"]].map(([k,lbl])=>(
              <div key={k}><input type="number" min={0} value={form[k]} onChange={e=>set(k,e.target.value)} style={numStyle}/><div style={{ fontFamily:"'Exo 2',sans-serif",fontSize:11,color:t.accent,textAlign:"center",marginTop:4,opacity:0.7 }}>{lbl}</div></div>
            ))}
          </div>
        </div>
      )}
      {form.schedule==="due"&&(
        <div style={{ marginBottom:14,animation:"slideIn 0.2s ease" }}>
          <FieldLabel t={t}>DUE DATE</FieldLabel>
          <input type="date" value={form.dueDate} onChange={e=>set("dueDate",e.target.value)}
            style={{ width:"100%",background:`${t.primary}11`,border:`1px solid ${t.primary}44`,borderRadius:8,padding:"10px 12px",color:"#e0f0ff",fontFamily:"'Exo 2',sans-serif",fontSize:14,outline:"none",colorScheme:"dark",marginBottom:12 }} />
          <FieldLabel t={t}>REPEAT</FieldLabel>
          <Dropdown value={form.repeat} onChange={v=>set("repeat",v)} t={t} options={[{value:"none",label:"No repeat"},{value:"daily",label:"Daily"},{value:"weekly",label:"Weekly"},{value:"monthly",label:"Monthly"},{value:"custom",label:"Custom"}]} />
          {form.repeat==="custom"&&(
            <div style={{ display:"flex",gap:8,alignItems:"center",marginTop:10 }}>
              <span style={{ fontFamily:"'Exo 2',sans-serif",fontSize:13,color:t.accent }}>Every</span>
              <input type="number" min={1} value={form.repeatEvery} onChange={e=>set("repeatEvery",Math.max(1,Math.round(Number(e.target.value)||1)))}
                style={{ width:64,background:`${t.primary}11`,border:`1px solid ${t.primary}44`,borderRadius:8,padding:"8px 10px",color:"#e0f0ff",fontFamily:"'Orbitron',monospace",fontSize:14,outline:"none",textAlign:"center" }} />
              <span style={{ fontFamily:"'Exo 2',sans-serif",fontSize:13,color:t.accent }}>days</span>
            </div>
          )}
        </div>
      )}
      <button onClick={onSubmit} disabled={!canSubmit}
        style={{ width:"100%",padding:"12px 0",fontFamily:"'Orbitron',monospace",fontSize:11,letterSpacing:"0.12em",background:canSubmit?`linear-gradient(135deg,${t.primary},${t.secondary})`:`${t.primary}22`,border:"none",borderRadius:8,cursor:canSubmit?"pointer":"default",color:canSubmit?t.bg:"#3a5060",fontWeight:700,boxShadow:canSubmit?`0 0 16px ${t.primary}66`:"none",transition:"all 0.2s" }}>
        {editing?"SAVE CHANGES":"ADD QUEST"}
      </button>
    </div>
  );
}

// ── Quest Cards ───────────────────────────────────────────────────────────
function QuestCard({ task, now, onComplete, onDelete, onEdit, onMove, isFirst, isLast, t }) {
  const dc=DIFF_COLORS(t)[task.difficulty];
  const imp=IMPORTANCE[task.importance]||IMPORTANCE.Medium;
  const remaining=task.scheduleType==="timer"&&task.timerDeadline?task.timerDeadline-now:0;
  const overdue=task.scheduleType==="due"&&task.dueDate&&dayDiff(task.dueDate,now)<0;
  const leftBorder=overdue?t.danger:dc.border;
  const hasChips=task.scheduleType==="timer"||task.scheduleType==="due";
  return (
    <div style={{ background:t.card,border:`1px solid ${leftBorder}33`,borderLeft:`3px solid ${leftBorder}`,borderRadius:10,padding:"12px 14px",marginBottom:10,backdropFilter:"blur(8px)",transition:"background 0.2s" }}
      onMouseEnter={e=>e.currentTarget.style.background=t.cardHover} onMouseLeave={e=>e.currentTarget.style.background=t.card}>
      <div style={{ display:"flex",alignItems:"center",gap:10 }}>
        <button onClick={e=>onComplete(task.id,e)} style={{ width:26,height:26,borderRadius:6,flexShrink:0,border:`2px solid ${dc.border}`,background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:dc.text,fontSize:14,transition:"all 0.2s" }}
          onMouseEnter={e=>{e.currentTarget.style.background=dc.bg;e.currentTarget.style.boxShadow=`0 0 12px ${dc.border}`;}}
          onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.boxShadow="none";}}>✓</button>
        <div title={imp.label+" importance"} style={{ width:9,height:9,borderRadius:"50%",flexShrink:0,background:imp.color,boxShadow:`0 0 8px ${imp.color}` }} />
        <div style={{ flex:1,minWidth:0,fontFamily:"'Exo 2',sans-serif",color:"#e0f0ff",fontSize:15,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{task.title}</div>
        <span style={{ fontFamily:"'Orbitron',monospace",fontSize:10,letterSpacing:"0.08em",color:dc.text,background:dc.bg,border:`1px solid ${dc.border}55`,padding:"3px 8px",borderRadius:99,flexShrink:0 }}>{task.difficulty}</span>
        <span style={{ fontFamily:"'Orbitron',monospace",fontSize:11,color:dc.text,minWidth:36,textAlign:"right",flexShrink:0 }}>+{computeXp(task,now)}</span>
        <div style={{ display:"flex",gap:3,flexShrink:0 }}>
          {[["↑",!isFirst,()=>onMove(task.id,-1)],["↓",!isLast,()=>onMove(task.id,1)]].map(([icon,active,fn])=>(
            <button key={icon} onClick={fn} disabled={!active} style={{ width:22,height:22,borderRadius:4,border:`1px solid ${t.border}`,background:"transparent",color:active?t.accent:"#1a3050",cursor:active?"pointer":"default",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center" }}>{icon}</button>
          ))}
          <button onClick={()=>onEdit(task)} style={{ width:22,height:22,borderRadius:4,border:`1px solid ${t.border}`,background:"transparent",color:t.accent,cursor:"pointer",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center" }}>✎</button>
          <button onClick={()=>onDelete(task.id)} style={{ width:22,height:22,borderRadius:4,border:"1px solid rgba(255,80,80,0.3)",background:"transparent",color:t.danger,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center" }}>✕</button>
        </div>
      </div>
      {hasChips&&(
        <div style={{ display:"flex",flexWrap:"wrap",gap:6,marginTop:9,paddingLeft:36 }}>
          {task.scheduleType==="timer"&&task.timerDeadline&&(<span style={{ fontFamily:"'Orbitron',monospace",fontSize:10,letterSpacing:"0.06em",padding:"3px 9px",borderRadius:99,border:`1px solid ${t.secondary}66`,background:`${t.secondary}1a`,color:t.secondary }}>⏱ {fmtTime(remaining)}</span>)}
          {task.scheduleType==="due"&&task.dueDate&&(<span style={{ fontFamily:"'Orbitron',monospace",fontSize:10,letterSpacing:"0.06em",padding:"3px 9px",borderRadius:99,border:`1px solid ${overdue?t.danger:t.primary}66`,background:`${overdue?t.danger:t.primary}1a`,color:overdue?t.danger:t.primary }}>📅 {dueLabel(task.dueDate,now)}</span>)}
          {task.scheduleType==="due"&&task.repeat&&task.repeat!=="none"&&(<span style={{ fontFamily:"'Orbitron',monospace",fontSize:10,letterSpacing:"0.06em",padding:"3px 9px",borderRadius:99,border:`1px solid ${t.accent}66`,background:`${t.accent}1a`,color:t.accent }}>🔁 {task.repeat==="custom"?`every ${task.repeatEvery}d`:REPEAT_LABEL[task.repeat]}</span>)}
        </div>
      )}
    </div>
  );
}

function CompletedCard({ task, t }) {
  const dc=DIFF_COLORS(t)[task.difficulty];
  const awarded=task.awardedXp??DIFFICULTY_BASE[task.difficulty];
  return (
    <div style={{ display:"flex",alignItems:"center",gap:12,background:`${t.card.replace("0.7","0.4")}`,border:`1px solid ${t.primary}1a`,borderRadius:10,padding:"11px 14px",marginBottom:8,opacity:0.7 }}>
      <div style={{ width:22,height:22,borderRadius:5,flexShrink:0,background:dc.bg,border:`2px solid ${dc.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:dc.text }}>✓</div>
      <div style={{ flex:1,minWidth:0,fontFamily:"'Exo 2',sans-serif",color:t.accent,fontSize:14,textDecoration:"line-through",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{task.title}</div>
      {task.timing==="early"&&<span style={{ fontFamily:"'Orbitron',monospace",fontSize:9,color:t.secondary,border:`1px solid ${t.secondary}55`,padding:"2px 6px",borderRadius:99,flexShrink:0 }}>EARLY</span>}
      <span style={{ fontFamily:"'Orbitron',monospace",fontSize:10,color:dc.text,background:dc.bg,border:`1px solid ${dc.border}55`,padding:"2px 7px",borderRadius:99,flexShrink:0 }}>{task.difficulty}</span>
      <span style={{ fontFamily:"'Orbitron',monospace",fontSize:11,color:dc.text,flexShrink:0 }}>+{awarded}</span>
    </div>
  );
}

function MissedCard({ task, onDelete, t }) {
  return (
    <div style={{ display:"flex",alignItems:"center",gap:10,background:`${t.danger}0d`,border:`1px solid ${t.danger}33`,borderLeft:`3px solid ${t.danger}`,borderRadius:10,padding:"11px 14px",marginBottom:8 }}>
      <span style={{ fontSize:15,flexShrink:0 }}>💀</span>
      <div style={{ flex:1,minWidth:0 }}>
        <div style={{ fontFamily:"'Exo 2',sans-serif",color:"#e0f0ff",fontSize:14,opacity:0.8,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{task.title}</div>
        <div style={{ fontFamily:"'Orbitron',monospace",fontSize:8,color:t.danger,letterSpacing:"0.1em",marginTop:3 }}>{task.missedReason==="timer"?"TIMER EXPIRED":"DEADLINE PASSED"}</div>
      </div>
      <span style={{ fontFamily:"'Orbitron',monospace",fontSize:11,color:t.danger,flexShrink:0 }}>-{task.penalty}</span>
      <button onClick={()=>onDelete(task.id)} style={{ width:22,height:22,borderRadius:4,border:`1px solid ${t.danger}44`,background:"transparent",color:t.danger,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>✕</button>
    </div>
  );
}

// ── Stats Tab ─────────────────────────────────────────────────────────────
function StatsTab({ xp, level, tasks, completed, missed, t, onReset, isLoggedIn }) {
  const [resetConfirm, setResetConfirm] = useState(false);
  const easyCt=completed.filter(x=>x.difficulty==="Easy").length;
  const medCt=completed.filter(x=>x.difficulty==="Medium").length;
  const hardCt=completed.filter(x=>x.difficulty==="Hard").length;
  const earlyCt=completed.filter(x=>x.timing==="early").length;
  const onTimeCt=completed.filter(x=>x.timing==="ontime").length;
  const topDiff=completed.length?(easyCt>=medCt&&easyCt>=hardCt?"Easy":medCt>=hardCt?"Medium":"Hard"):"—";
  const stats=[{label:"TOTAL XP",value:xp},{label:"LEVEL",value:level},{label:"RANK",value:getRank(level)},{label:"COMPLETED",value:completed.length},{label:"PENDING",value:tasks.length},{label:"MISSED",value:missed.length},{label:"EARLY",value:earlyCt},{label:"ON TIME",value:onTimeCt},{label:"TOP DIFF",value:topDiff},{label:"EASY",value:easyCt},{label:"MEDIUM",value:medCt},{label:"HARD",value:hardCt}];
  return (
    <div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10 }}>
        {stats.map(s=>(
          <div key={s.label} style={{ background:t.card,border:`1px solid ${t.border}`,borderRadius:10,padding:"14px 12px",textAlign:"center",backdropFilter:"blur(8px)" }}>
            <div style={{ fontFamily:"'Orbitron',monospace",fontSize:9,color:t.primary,letterSpacing:"0.1em",marginBottom:6 }}>{s.label}</div>
            <div style={{ fontFamily:"'Orbitron',monospace",fontSize:16,fontWeight:700,color:"#e0f4ff" }}>{s.value}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop:20,textAlign:"center" }}>
        {resetConfirm ? (
          <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:10 }}>
            <span style={{ fontFamily:"'Exo 2',sans-serif",fontSize:13,color:t.accent }}>
              {isLoggedIn ? "Wipe all XP, quests, and progress? Your account stays." : "Clear all local progress and start fresh?"}
            </span>
            <div style={{ display:"flex",gap:10 }}>
              <button onClick={onReset} style={{ padding:"7px 16px",fontFamily:"'Orbitron',monospace",fontSize:10,background:"rgba(255,80,80,0.2)",border:"1px solid #ff6060",borderRadius:7,color:"#ff6060",cursor:"pointer" }}>YES, RESET</button>
              <button onClick={()=>setResetConfirm(false)} style={{ padding:"7px 16px",fontFamily:"'Orbitron',monospace",fontSize:10,background:"transparent",border:`1px solid ${t.border}`,borderRadius:7,color:t.accent,cursor:"pointer" }}>CANCEL</button>
            </div>
          </div>
        ) : (
          <button onClick={()=>setResetConfirm(true)} style={{ padding:"8px 20px",fontFamily:"'Orbitron',monospace",fontSize:10,background:"transparent",border:"1px solid rgba(255,80,80,0.3)",borderRadius:8,color:"#ff6060",cursor:"pointer",letterSpacing:"0.1em" }}>NEW RUN</button>
        )}
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────
const BLANK_FORM={title:"",difficulty:"Medium",importance:"Medium",schedule:"none",h:0,m:25,s:0,dueDate:"",repeat:"none",repeatEvery:2};

// ── Auth Modal ────────────────────────────────────────────────────────────
function AuthModal({ open, onClose, guestXp, t }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  if (!open) return null;

  const reset = () => { setEmail(""); setPassword(""); setError(""); setLoading(false); };

  const handleSignUp = async () => {
    if (!email.trim() || password.length < 6) return;
    setLoading(true); setError("");
    const { error: authErr } = await supabase.auth.signUp({ email, password });
    if (authErr) { setError(authErr.message); setLoading(false); return; }
    setLoading(false); reset(); onClose();
  };

  const handleSignIn = async () => {
    if (!email.trim() || !password) return;
    setLoading(true); setError("");
    let resolvedEmail = email.trim();
    if (!resolvedEmail.includes("@")) {
      const { data: found, error: rpcErr } = await supabase.rpc("get_email_by_username", { username_input: resolvedEmail });
      if (rpcErr || !found) { setError("No account found for that username."); setLoading(false); return; }
      resolvedEmail = found;
    }
    const { error: authErr } = await supabase.auth.signInWithPassword({ email: resolvedEmail, password });
    if (authErr) {
      const msg = authErr.message.toLowerCase();
      if (msg.includes("email not confirmed") || msg.includes("not confirmed")) {
        setError("Please confirm your email first — check your inbox for a link from Supabase.");
      } else {
        setError(authErr.message);
      }
      setLoading(false); return;
    }
    setLoading(false); reset(); onClose();
  };

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: "https://daynsxpdixvfkdnbumwi.supabase.co/auth/v1/callback" },
    });
  };

  const isSignUp = mode === "signup";
  const canSubmit = isSignUp
    ? email.trim() && password.length >= 6
    : email.trim() && password.length >= 1;

  const inp = { width:"100%",background:`${t.primary}11`,border:`1px solid ${t.primary}44`,borderRadius:8,padding:"11px 14px",color:"#e0f0ff",fontFamily:"'Exo 2',sans-serif",fontSize:14,outline:"none",marginBottom:12 };
  const primaryBtn = { width:"100%",padding:"12px 0",fontFamily:"'Orbitron',monospace",fontSize:11,letterSpacing:"0.12em",border:"none",borderRadius:8,fontWeight:700,marginBottom:10,transition:"all 0.2s" };

  return (
    <div style={{ position:"fixed",inset:0,zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.75)",backdropFilter:"blur(4px)",padding:16 }}
      onClick={e=>e.target===e.currentTarget&&(reset(),onClose())}>
      <div style={{ width:"100%",maxWidth:400,background:t.card,backdropFilter:"blur(24px)",border:`1px solid ${t.border}`,borderRadius:16,padding:"28px 24px",animation:"scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1) forwards" }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20 }}>
          <div style={{ fontFamily:"'Orbitron',monospace",fontSize:13,fontWeight:700,color:t.secondary,letterSpacing:"0.1em" }}>{isSignUp?"CREATE ACCOUNT":"SIGN IN"}</div>
          <button onClick={()=>{reset();onClose();}} style={{ background:"transparent",border:"none",color:t.accent,cursor:"pointer",fontSize:18,lineHeight:1,padding:4 }}>✕</button>
        </div>

        <div style={{ display:"flex",gap:6,marginBottom:20 }}>
          {[["signin","SIGN IN"],["signup","CREATE ACCOUNT"]].map(([m,lbl])=>(
            <button key={m} onClick={()=>setMode(m)} style={{ flex:1,padding:"9px 0",fontFamily:"'Orbitron',monospace",fontSize:8,letterSpacing:"0.05em",border:`1px solid ${mode===m?t.primary:t.border}`,borderRadius:8,cursor:"pointer",background:mode===m?`${t.primary}22`:"transparent",color:mode===m?t.primary:t.accent,transition:"all 0.2s" }}>{lbl}</button>
          ))}
        </div>

        <FieldLabel t={t}>{isSignUp ? "EMAIL" : "EMAIL OR USERNAME"}</FieldLabel>
        <input type={isSignUp ? "email" : "text"} value={email} onChange={e=>setEmail(e.target.value)} placeholder={isSignUp ? "Enter your email..." : "Email or player name..."} style={inp}/>
        <FieldLabel t={t}>PASSWORD</FieldLabel>
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder={isSignUp?"At least 6 characters...":"Enter your password..."}
          style={{...inp,marginBottom:16}} onKeyDown={e=>e.key==="Enter"&&canSubmit&&(isSignUp?handleSignUp():handleSignIn())}/>

        {error&&<div style={{ fontFamily:"'Exo 2',sans-serif",fontSize:12,color:t.danger,marginBottom:12,padding:"8px 12px",background:`${t.danger}11`,border:`1px solid ${t.danger}33`,borderRadius:7 }}>{error}</div>}

        <button onClick={isSignUp?handleSignUp:handleSignIn} disabled={!canSubmit||loading}
          style={{ ...primaryBtn,background:canSubmit&&!loading?`linear-gradient(135deg,${t.primary},${t.secondary})`:`${t.primary}22`,cursor:canSubmit&&!loading?"pointer":"default",color:canSubmit&&!loading?t.bg:"#3a5060",boxShadow:canSubmit&&!loading?`0 0 16px ${t.primary}66`:"none" }}>
          {loading?"...":(isSignUp?"CREATE ACCOUNT →":"SIGN IN →")}
        </button>

        <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:10 }}>
          <div style={{ flex:1,height:1,background:t.border }}/><span style={{ fontFamily:"'Exo 2',sans-serif",fontSize:11,color:t.accent,opacity:0.6 }}>OR</span><div style={{ flex:1,height:1,background:t.border }}/>
        </div>

        <button onClick={handleGoogle}
          style={{ width:"100%",padding:"11px 0",fontFamily:"'Orbitron',monospace",fontSize:10,letterSpacing:"0.1em",background:"transparent",border:`1px solid ${t.border}`,borderRadius:8,cursor:"pointer",color:t.accent,display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all 0.2s" }}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=t.primary;e.currentTarget.style.color=t.primary;}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.color=t.accent;}}>
          <span style={{ fontSize:15,fontWeight:700 }}>G</span>CONTINUE WITH GOOGLE
        </button>

        {isSignUp&&<div style={{ fontFamily:"'Exo 2',sans-serif",fontSize:11,color:t.accent,textAlign:"center",marginTop:12,opacity:0.7 }}>Your current progress ({guestXp} XP) will be carried over.</div>}
      </div>
    </div>
  );
}

// ── Multiplayer Row ────────────────────────────────────────────────────────
function MultiplayerRow({ isGuest, t, onFriends }) {
  const label = isGuest ? "Create an account to unlock social features" : "Connect with other players";
  const locked  = { flex:1,padding:"9px 0",fontFamily:"'Orbitron',monospace",fontSize:8.5,letterSpacing:"0.06em",border:`1px solid ${t.border}`,borderRadius:8,cursor:"default",background:"transparent",color:`${t.accent}55`,opacity:0.55 };
  const active  = { flex:1,padding:"9px 0",fontFamily:"'Orbitron',monospace",fontSize:8.5,letterSpacing:"0.06em",border:`1px solid ${t.primary}66`,borderRadius:8,cursor:"pointer",background:`${t.primary}11`,color:t.primary,transition:"all 0.2s" };
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ display:"flex",gap:6 }}>
        <button style={isGuest?locked:active} disabled={isGuest} onClick={isGuest?undefined:onFriends}>
          {isGuest?"🔒 FRIENDS":"FRIENDS"}
        </button>
        <button style={locked} disabled>🔒 GUILD</button>
        <button style={locked} disabled>🔒 LEADERBOARD</button>
      </div>
      <div style={{ textAlign:"center",marginTop:5,fontFamily:"'Exo 2',sans-serif",fontSize:10,color:`${t.accent}55`,letterSpacing:"0.05em" }}>{label}</div>
    </div>
  );
}

export default function App() {
  const [screen,setScreen]=useState("loading");
  const [playerName,setPlayerName]=useState(()=>localStorage.getItem("nq_playerName")||"HERO");
  const [themeKey,setThemeKey]=useState(()=>localStorage.getItem("nq_themeKey")||"techboy");
  const [xp,setXp]=useState(()=>{try{return JSON.parse(localStorage.getItem("nq_xp"))||0;}catch{return 0;}});
  const [tasks,setTasks]=useState(()=>{try{return JSON.parse(localStorage.getItem("nq_tasks"))||[];}catch{return [];}});
  const [completed,setCompleted]=useState(()=>{try{return JSON.parse(localStorage.getItem("nq_completed"))||[];}catch{return [];}});
  const [missed,setMissed]=useState(()=>{try{return JSON.parse(localStorage.getItem("nq_missed"))||[];}catch{return [];}});
  const [form,setForm]=useState(BLANK_FORM);
  const [editingId,setEditingId]=useState(null);
  const [showLevelUp,setShowLevelUp]=useState(false);
  const [showDerank,setShowDerank]=useState(false);
  const [tab,setTab]=useState("active");
  const [popups,setPopups]=useState([]);
  const [tip]=useState(()=>TIPS[Math.floor(Math.random()*TIPS.length)]);
  const [clearConfirm,setClearConfirm]=useState(null);
  const [now,setNow]=useState(()=>Date.now());
  const [authUser,setAuthUser]=useState(null);
  const [profile,setProfile]=useState(null);
  const [showAuthModal,setShowAuthModal]=useState(false);
  const [deleteConfirm,setDeleteConfirm]=useState(false);
  const [deleteError,setDeleteError]=useState("");
  const [showFriendsModal,setShowFriendsModal]=useState(false);
  const [nudgeQueue,setNudgeQueue]=useState([]);
  const [activeNudge,setActiveNudge]=useState(null);
  const [gems,setGems]=useState(()=>{try{return JSON.parse(localStorage.getItem("nq_gems"))||0;}catch{return 0;}});
  const [titles,setTitles]=useState(()=>{try{return JSON.parse(localStorage.getItem("nq_titles"))||[];}catch{return [];}});
  const [bossResolutions,setBossResolutions]=useState([]);
  const [streakState,setStreakState]=useState(()=>getStreakState());
  const [streakToasts,setStreakToasts]=useState([]);
  const [trialState,setTrialState]=useState(()=>getTrialState());
  const [trialToasts,setTrialToasts]=useState([]);
  const FRESH_NOTIFY_PREFS=()=>({streakAtRisk:true,bossExpiry:true,dailyReminder:false,dailyReminderTime:'09:00',tz:Intl.DateTimeFormat().resolvedOptions().timeZone});
  const [notifyPrefs,setNotifyPrefs]=useState(()=>{try{const s=localStorage.getItem('nq_notify_prefs');return s?{...FRESH_NOTIFY_PREFS(),...JSON.parse(s)}:FRESH_NOTIFY_PREFS();}catch{return FRESH_NOTIFY_PREFS();}});
  const [deferredPrompt,setDeferredPrompt]=useState(null);
  const [showInstallCard,setShowInstallCard]=useState(false);
  const [isOnline,setIsOnline]=useState(()=>navigator.onLine);
  const inputRef=useRef();
  const prevXpRef=useRef(0);
  const syncTimers=useRef({});
  const lastLocalChangeRef=useRef(0);
  // Always-current snapshot of local state for use inside async callbacks
  const localState=useRef({});
  localState.current={playerName,xp,themeKey,tasks,completed,missed};
  const play=useSound();
  const music=useMusicPlayer();
  const t=THEMES[themeKey];
  const level=Math.floor(xp/XP_PER_LEVEL)+1;
  const applyXp=delta=>setXp(prev=>Math.max(0,prev+delta));

  useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id);},[]);
  useEffect(()=>{localStorage.setItem("nq_playerName",playerName);},[playerName]);
  useEffect(()=>{localStorage.setItem("nq_themeKey",themeKey);},[themeKey]);
  useEffect(()=>{localStorage.setItem("nq_xp",JSON.stringify(xp));},[xp]);
  useEffect(()=>{localStorage.setItem("nq_tasks",JSON.stringify(tasks));},[tasks]);
  useEffect(()=>{localStorage.setItem("nq_completed",JSON.stringify(completed));},[completed]);
  useEffect(()=>{localStorage.setItem("nq_missed",JSON.stringify(missed));},[missed]);
  useEffect(()=>{localStorage.setItem("nq_gems",JSON.stringify(gems));},[gems]);
  useEffect(()=>{localStorage.setItem("nq_titles",JSON.stringify(titles));},[titles]);
  useEffect(()=>{localStorage.setItem("nq_notify_prefs",JSON.stringify(notifyPrefs));},[notifyPrefs]);
  useEffect(()=>{ if(screen==="game") music.startMusic(); },[screen]);

  // Nudge queue — show one at a time, mark seen, then advance
  useEffect(()=>{
    if(activeNudge||!nudgeQueue.length)return;
    const next=nudgeQueue[0];
    setActiveNudge(next);
    play("nudge");
    supabase.from('nudges').update({seen:true}).eq('id',next.id).then(()=>{});
    const timer=setTimeout(()=>{setActiveNudge(null);setNudgeQueue(prev=>prev.slice(1));},2500);
    return()=>clearTimeout(timer);
  },[nudgeQueue,activeNudge,play]);
  useEffect(()=>{
    if(!streakToasts.length)return;
    const t=setTimeout(()=>setStreakToasts(prev=>prev.slice(1)),3800);
    return()=>clearTimeout(t);
  },[streakToasts]);
  useEffect(()=>{
    if(!trialToasts.length)return;
    const t=setTimeout(()=>setTrialToasts(prev=>prev.slice(1)),4500);
    return()=>clearTimeout(t);
  },[trialToasts]);

  // Capture install prompt + track online state
  useEffect(()=>{
    const onPrompt=e=>{e.preventDefault();setDeferredPrompt(e);};
    const onOnline=()=>setIsOnline(true);
    const onOffline=()=>setIsOnline(false);
    window.addEventListener('beforeinstallprompt',onPrompt);
    window.addEventListener('online',onOnline);
    window.addEventListener('offline',onOffline);
    return()=>{
      window.removeEventListener('beforeinstallprompt',onPrompt);
      window.removeEventListener('online',onOnline);
      window.removeEventListener('offline',onOffline);
    };
  },[]);

  // Show install card after engagement trigger (first boss kill OR streak ≥ 3), dismissal persists 14 days
  useEffect(()=>{
    if(showInstallCard)return;
    const dismissed=localStorage.getItem('nq_install_dismissed');
    if(dismissed&&Date.now()-Number(dismissed)<14*86400*1000)return;
    const bossDead=bossResolutions.some(r=>r.outcome==='defeated');
    const streakOk=(streakState?.currentStreak??0)>=3;
    if(bossDead||streakOk)setShowInstallCard(true);
  },[bossResolutions,streakState]);

  const handleNotifyPrefsChange=newPrefs=>{setNotifyPrefs({...newPrefs,tz:Intl.DateTimeFormat().resolvedOptions().timeZone});};
  const handleInstallDismiss=()=>{localStorage.setItem('nq_install_dismissed',String(Date.now()));setShowInstallCard(false);setDeferredPrompt(null);};

  useEffect(()=>{
    const prevLv=Math.floor(prevXpRef.current/XP_PER_LEVEL)+1;
    if(level>prevLv){
      setShowLevelUp(true);play("levelup");setTimeout(()=>setShowLevelUp(false),1800);
      streakRecordLevel(level);
      const sr=streakConsumeRewards();
      sr.forEach(r=>{if(r.xp>0)applyXp(r.xp);if(r.gems>0)setGems(g=>g+r.gems);if(r.title)setTitles(ts=>[...ts,r.title]);});
      if(sr.length)setStreakToasts(prev=>[...prev,...sr]);
      setStreakState(getStreakState());
    }
    else if(level<prevLv){setShowDerank(true);play("derank");setTimeout(()=>setShowDerank(false),1800);}
    prevXpRef.current=xp;
  },[xp]);

  useEffect(()=>{
    if(screen!=="game")return;
    const expired=tasks.filter(tk=>(tk.scheduleType==="timer"&&tk.timerDeadline&&now>=tk.timerDeadline)||(tk.scheduleType==="due"&&tk.dueDate&&now>tk.dueDate));
    if(!expired.length)return;
    let penalty=0;
    const records=[],respawns=[],removeIds=new Set();
    expired.forEach(tk=>{
      const mult=IMPORTANCE_MULT[tk.importance]??1;
      const reason=tk.scheduleType==="timer"?"timer":"due";
      const p=Math.round((reason==="timer"?TIMER_MISS_PENALTY:DUE_MISS_PENALTY)*mult);
      penalty+=p; records.push({...tk,missedReason:reason,penalty:p}); removeIds.add(tk.id);
      if(reason==="due"&&tk.repeat&&tk.repeat!=="none") respawns.push(defaultQuest({...tk,dueDate:advanceDue(tk.dueDate,tk.repeat,tk.repeatEvery),timerMissed:false}));
      applyBossHeal(String(tk.id));
    });
    setTasks(prev=>[...prev.filter(x=>!removeIds.has(x.id)),...respawns]);
    setMissed(prev=>[...records,...prev]);
    applyXp(-penalty); play("penalty");
  },[now,tasks,screen]);

  // Pull the canonical Supabase state and overwrite local — called on login and on tab focus
  const refreshFromCloud = useCallback(async () => {
    if (!authUser) return;
    // Skip if a local mutation happened in the last 2.5s — the write-through sync hasn't
    // finished yet, so pulling now would roll back the local change before it reaches Supabase
    if (Date.now() - lastLocalChangeRef.current < 2500) return;
    const data = await fetchUserData(authUser.id);
    if (!data?.profile) return; // offline or no profile yet
    setProfile(data.profile);
    setPlayerName(data.profile.player_name);
    setXp(data.profile.xp);
    setThemeKey(data.profile.theme_key);
    setTasks(data.tasks);
    setCompleted(data.completed);
    setMissed(data.missed);
  }, [authUser]);

  // Re-sync whenever the tab/window regains focus so diverged devices converge
  useEffect(()=>{
    const handleFocus=()=>{
      streakCheckIn(Date.now());
      const sr=streakConsumeRewards();
      sr.forEach(r=>{if(r.xp>0)applyXp(r.xp);if(r.gems>0)setGems(g=>g+r.gems);if(r.title)setTitles(ts=>[...ts,r.title]);});
      if(sr.length)setStreakToasts(prev=>[...prev,...sr]);
      setStreakState(getStreakState());
      refreshFromCloud();
    };
    const onFocus   = () => handleFocus();
    const onVisible = () => { if (document.visibilityState === 'visible') handleFocus(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshFromCloud]);

  // Auth state listener — hydrates from Supabase on login, migrates localStorage on first sync
  useEffect(()=>{
    const { data:{ subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!session?.user) { setAuthUser(null); setProfile(null); return; }

      // Token rotation — user ID is unchanged, no hydration needed, and calling setAuthUser
      // here would trigger write-through effects before SIGNED_IN hydration finishes, pushing
      // stale localStorage state (e.g. HERO/0) to Supabase and overwriting the real profile.
      if (event === 'TOKEN_REFRESHED') return;

      const uid = session.user.id;
      const data = await fetchUserData(uid);
      if (!data) { setAuthUser(session.user); return; } // offline: show logged-in UI, keep localStorage

      const ls = localState.current;
      if (!data.profile) {
        // Trigger race: DB trigger normally creates the profile row synchronously, but if it
        // hasn't landed yet, INSERT directly. syncProfile uses UPDATE and won't create a new row.
        const { error: insErr } = await supabase.from('profiles').insert({
          id: uid, player_name: ls.playerName, xp: ls.xp, theme_key: ls.themeKey,
        });
        if (insErr) console.error('[auth] profile insert failed:', insErr.message);
        await syncAllLists(uid, ls.tasks, ls.completed, ls.missed);
        setProfile({ id: uid, player_name: ls.playerName, xp: ls.xp, theme_key: ls.themeKey });
      } else {
        // Trigger-created default: name=HERO, xp=0, AND no task rows whatsoever.
        // Requiring empty task rows prevents triggering on real accounts with low progress
        // or partially synced profiles where the profile row exists but task sync was incomplete.
        const isDefaultProfile = data.profile.player_name === 'HERO'
          && data.profile.xp === 0
          && !data.tasks.length && !data.completed.length && !data.missed.length;
        const hasLocalProgress = ls.playerName !== 'HERO' || ls.xp > 0 || ls.tasks.length || ls.completed.length || ls.missed.length;
        if (isDefaultProfile && hasLocalProgress) {
          await syncProfile(uid, { playerName: ls.playerName, xp: ls.xp, themeKey: ls.themeKey });
          await syncAllLists(uid, ls.tasks, ls.completed, ls.missed);
          setProfile({ id: uid, player_name: ls.playerName, xp: ls.xp, theme_key: ls.themeKey });
        } else {
          setProfile(data.profile);
          setPlayerName(data.profile.player_name);
          setXp(data.profile.xp);
          setThemeKey(data.profile.theme_key);
          const hasCloud = data.tasks.length || data.completed.length || data.missed.length;
          if (!hasCloud && (ls.tasks.length || ls.completed.length || ls.missed.length)) {
            await syncAllLists(uid, ls.tasks, ls.completed, ls.missed);
          } else {
            setTasks(data.tasks);
            setCompleted(data.completed);
            setMissed(data.missed);
          }
        }
      }
      // Set authUser LAST — sync effects gate on authUser; firing them after hydration
      // guarantees they capture cloud state, not the stale localStorage values
      setAuthUser(session.user);
    });
    return () => subscription.unsubscribe();
  },[]);

  // On login: fire any nudges that arrived while the user was offline
  useEffect(()=>{
    if(!authUser?.id)return;
    (async()=>{
      const {data:unseen}=await supabase
        .from('nudges').select('id,message,sender_id')
        .eq('recipient_id',authUser.id).eq('seen',false)
        .order('created_at',{ascending:true});
      if(!unseen?.length)return;
      const senderIds=[...new Set(unseen.map(n=>n.sender_id))];
      const {data:senders}=await supabase.from('profiles').select('id,player_name').in('id',senderIds);
      const nameMap={};
      (senders??[]).forEach(s=>{nameMap[s.id]=s.player_name;});
      setNudgeQueue(prev=>{
        const existingIds=new Set(prev.map(n=>n.id));
        return [...prev,...unseen.filter(n=>!existingIds.has(n.id)).map(n=>({id:n.id,message:n.message,senderName:nameMap[n.sender_id]??"FRIEND"}))];
      });
    })();
  },[authUser?.id]);

  // On mount: streak check-in + boss resolutions → credit gems/titles → surface for toast
  useEffect(()=>{
    // Integration point 1: check-in + consume streak rewards
    streakCheckIn(Date.now());
    const sr=streakConsumeRewards();
    sr.forEach(r=>{if(r.xp>0)applyXp(r.xp);if(r.gems>0)setGems(g=>g+r.gems);if(r.title)setTitles(ts=>[...ts,r.title]);});
    if(sr.length)setStreakToasts(prev=>[...prev,...sr]);
    setStreakState(getStreakState());

    // Boss resolutions (integration point 4: fire streakBossKill on defeated)
    const offline=consumeResolutions();
    offline.forEach(r=>{
      setGems(p=>p+r.gems);if(r.title)setTitles(p=>[...p,r.title]);
      if(r.outcome==='defeated'){
        streakBossKill();
        const bsr=streakConsumeRewards();
        bsr.forEach(br=>{if(br.xp>0)applyXp(br.xp);if(br.gems>0)setGems(g=>g+br.gems);if(br.title)setTitles(ts=>[...ts,br.title]);});
        if(bsr.length)setStreakToasts(prev=>[...prev,...bsr]);
      }
    });
    if(offline.length)setBossResolutions(offline);

    // Integration point 3: trial completeCheck on mount (resolves any trial that finished while app was closed)
    trialCompleteCheck(Date.now());
    const tr=trialConsumeRewards();
    tr.forEach(r=>{if(r.xp>0)applyXp(r.xp);if(r.gems>0)setGems(g=>g+r.gems);});
    if(tr.length)setTrialToasts(prev=>[...prev,...tr]);
    setTrialState(getTrialState());

    const unsubBoss=subscribeBoss(e=>{
      if(e.type!=='boss:resolved')return;
      setGems(p=>p+e.gems);
      if(e.title)setTitles(p=>[...p,e.title]);
      if(e.outcome==='defeated'){
        streakBossKill();
        const bsr=streakConsumeRewards();
        bsr.forEach(br=>{if(br.xp>0)applyXp(br.xp);if(br.gems>0)setGems(g=>g+br.gems);if(br.title)setTitles(ts=>[...ts,br.title]);});
        if(bsr.length)setStreakToasts(prev=>[...prev,...bsr]);
      }
      setBossResolutions(prev=>[...prev,e]);
    });
    const unsubTrial=subscribeTrial(e=>{
      if(e.type!=='trial:resolved')return;
      const tq=trialConsumeRewards();
      tq.forEach(r=>{if(r.xp>0)applyXp(r.xp);if(r.gems>0)setGems(g=>g+r.gems);});
      if(tq.length)setTrialToasts(prev=>[...prev,...tq]);
      setTrialState(getTrialState());
    });
    return()=>{unsubBoss();unsubTrial();};
  },[]);

  // Realtime subscription — pushes DB changes instantly to this client so multi-device
  // state converges without polling. recency guard in refreshFromCloud blocks echo from
  // our own writes so we don't pull back data we just pushed.
  useEffect(()=>{
    if (!authUser) return;
    const channel = supabase
      .channel(`user-sync-${authUser.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${authUser.id}` },
        () => refreshFromCloud()
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${authUser.id}` },
        () => refreshFromCloud()
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'nudges', filter: `recipient_id=eq.${authUser.id}` },
        async (payload) => {
          const {data:sender}=await supabase.from('profiles').select('player_name').eq('id',payload.new.sender_id).single();
          setNudgeQueue(prev=>{
            if(prev.some(n=>n.id===payload.new.id))return prev;
            return [...prev,{id:payload.new.id,message:payload.new.message,senderName:sender?.player_name??"FRIEND"}];
          });
        }
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  },[authUser, refreshFromCloud]);

  // Fallback poll — Realtime handles instant sync; this catches websocket disconnects / missed events.
  useEffect(()=>{
    if (!authUser) return;
    const id = setInterval(()=>refreshFromCloud(), 30000);
    return ()=>clearInterval(id);
  },[authUser, refreshFromCloud]);

  // Write-through: sync profile + each task list to Supabase on any change.
  // Bumping lastLocalChangeRef here prevents refreshFromCloud from pulling stale data
  // during the sync window. Profile and completed use 150ms (carry XP — need fast push);
  // tasks and missed use 800ms (lower urgency, higher write volume).
  useEffect(()=>{
    if (!authUser) return;
    lastLocalChangeRef.current = Date.now();
    clearTimeout(syncTimers.current.profile);
    const streak=computeStreak(completed);
    syncTimers.current.profile = setTimeout(()=>syncProfile(authUser.id,{playerName,xp,themeKey,streak,completedCount:completed.length,gems,titles,bossState:localStorage.getItem('nq_boss_v1'),streakState:localStorage.getItem('nq_streak_v1'),trialState:localStorage.getItem('nq_trial_v1'),notifyPrefs,tz:Intl.DateTimeFormat().resolvedOptions().timeZone}),150);
  },[playerName,xp,themeKey,completed,authUser]);
  useEffect(()=>{
    if (!authUser) return;
    lastLocalChangeRef.current = Date.now();
    clearTimeout(syncTimers.current.tasks);
    syncTimers.current.tasks = setTimeout(()=>syncList(authUser.id,'active',tasks),800);
  },[tasks,authUser]);
  useEffect(()=>{
    if (!authUser) return;
    lastLocalChangeRef.current = Date.now();
    clearTimeout(syncTimers.current.completed);
    syncTimers.current.completed = setTimeout(()=>syncList(authUser.id,'completed',completed),150);
  },[completed,authUser]);
  useEffect(()=>{
    if (!authUser) return;
    lastLocalChangeRef.current = Date.now();
    clearTimeout(syncTimers.current.missed);
    syncTimers.current.missed = setTimeout(()=>syncList(authUser.id,'missed',missed),800);
  },[missed,authUser]);

  const buildFromForm=()=>{
    const q={title:form.title.trim(),difficulty:form.difficulty,importance:form.importance,scheduleType:form.schedule,timerDeadline:null,timerSeconds:null,timerMissed:false,dueDate:null,repeat:"none",repeatEvery:Math.max(1,Math.round(Number(form.repeatEvery)||1))};
    if(form.schedule==="timer"){const secs=(Number(form.h)||0)*3600+(Number(form.m)||0)*60+(Number(form.s)||0);q.timerSeconds=secs;q.timerDeadline=Date.now()+secs*1000;}
    else if(form.schedule==="due"){if(form.dueDate){const[y,mo,d]=form.dueDate.split("-").map(Number);q.dueDate=new Date(y,mo-1,d,23,59,59).getTime();}q.repeat=form.repeat;}
    return q;
  };
  const resetForm=()=>{setForm(BLANK_FORM);setEditingId(null);};
  const submitForm=()=>{
    if(!form.title.trim())return;
    const built=buildFromForm();
    if(editingId){setTasks(prev=>prev.map(x=>x.id===editingId?{...x,...built}:x));}
    else{setTasks(prev=>[...prev,{id:Date.now()+Math.random(),createdAt:Date.now(),...built}]);play("add");}
    resetForm(); inputRef.current?.focus();
  };
  const startEdit=task=>{
    const f={title:task.title,difficulty:task.difficulty,importance:task.importance,schedule:task.scheduleType||"none",h:0,m:25,s:0,dueDate:task.dueDate?dateInputValue(task.dueDate):"",repeat:task.repeat||"none",repeatEvery:task.repeatEvery||2};
    if(task.scheduleType==="timer"&&task.timerDeadline){const remain=Math.max(0,Math.round((task.timerDeadline-Date.now())/1000));f.h=Math.floor(remain/3600);f.m=Math.floor((remain%3600)/60);f.s=remain%60;}
    setForm(f);setEditingId(task.id);window.scrollTo({top:0,behavior:"smooth"});
  };
  const completeTask=(id,e)=>{
    const task=tasks.find(x=>x.id===id);if(!task)return;
    const total=computeXp(task,Date.now());
    let timing="none";
    if(task.scheduleType==="due"&&task.dueDate){const d=dayDiff(task.dueDate,Date.now());if(d>0)timing="early";else timing="ontime";}
    const rect=e?.currentTarget?.getBoundingClientRect?.();
    if(rect){const popup={id:Date.now(),xp:total,x:rect.left+rect.width/2-20,y:rect.top-10};setPopups(prev=>[...prev,popup]);setTimeout(()=>setPopups(prev=>prev.filter(p=>p.id!==popup.id)),1200);}
    const repeats=task.scheduleType==="due"&&task.repeat&&task.repeat!=="none";
    if(repeats){const next=defaultQuest({...task,dueDate:task.dueDate?advanceDue(task.dueDate,task.repeat,task.repeatEvery):null,timerMissed:false});setTasks(prev=>[...prev.filter(x=>x.id!==id),next]);}
    else setTasks(prev=>prev.filter(x=>x.id!==id));
    if(editingId===id)resetForm();
    setCompleted(prev=>[{...task,awardedXp:total,timing,completedAt:Date.now()},...prev]);
  play("complete");applyXp(total);
  if(authUser) insertActivityEvent(authUser.id,total);
  // Integration point 1: apply trial damage multiplier when a sprint is running (boss damage only; player XP unchanged)
  const now_t=Date.now();
  const trialRunning=trialIsRunning(now_t);
  const bossDmg=trialRunning?Math.round(total*TRIAL_CONFIG.TRIAL_DAMAGE_MULT):total;
  if(trialRunning){trialRecordTask();setTrialState(getTrialState());}
  applyBossDamage(bossDmg,{taskId:String(task.id),importance:task.importance,completedAt:now_t,dueAt:task.dueDate??null,onTime:timing==="early"||timing==="ontime"},now_t);
  // Integration point 2: streak task completion
  streakTaskDone(Date.now());
  const sr=streakConsumeRewards();
  sr.forEach(r=>{if(r.xp>0)applyXp(r.xp);if(r.gems>0)setGems(g=>g+r.gems);if(r.title)setTitles(ts=>[...ts,r.title]);});
  if(sr.length)setStreakToasts(prev=>[...prev,...sr]);
  setStreakState(getStreakState());
  };
  const deleteTask=id=>{setTasks(prev=>prev.filter(x=>x.id!==id));if(editingId===id)resetForm();play("delete");};
  const handleBuyFreeze=()=>{const res=streakBuyFreeze();if(res.ok){setGems(g=>Math.max(0,g-res.cost));setStreakState(getStreakState());};};
  const handleAbandonTrial=()=>{trialAbandon(Date.now());const tq=trialConsumeRewards();tq.forEach(r=>{if(r.xp>0)applyXp(r.xp);if(r.gems>0)setGems(g=>g+r.gems);});if(tq.length)setTrialToasts(prev=>[...prev,...tq]);setTrialState(getTrialState());};
  const deleteMissed=id=>{setMissed(prev=>prev.filter(x=>x.id!==id));play("delete");};
  const handleDeleteAccount = async () => {
    setDeleteError("");
    const { error } = await supabase.rpc("delete_user");
    if (error) { setDeleteError(error.message); return; }
    await supabase.auth.signOut();
    setDeleteConfirm(false);
  };

  const moveTask=(id,dir)=>setTasks(prev=>{const i=prev.findIndex(x=>x.id===id);if(i<0)return prev;const ni=i+dir;if(ni<0||ni>=prev.length)return prev;const arr=[...prev];[arr[i],arr[ni]]=[arr[ni],arr[i]];return arr;});

  const resetProgress = async () => {
    ['nq_playerName','nq_themeKey','nq_xp','nq_tasks','nq_completed','nq_missed','nq_onboarded'].forEach(k=>localStorage.removeItem(k));
    if (authUser) {
      await supabase.from('tasks').delete().eq('user_id', authUser.id);
      await supabase.from('profiles').update({ player_name:'HERO', xp:0, theme_key:'techboy' }).eq('id', authUser.id);
    }
    setPlayerName('HERO'); setThemeKey('techboy'); setXp(0);
    setTasks([]); setCompleted([]); setMissed([]);
    setScreen('name');
  };

  const TABS=[["active",`QUESTS (${tasks.length})`],["missed",`MISSED (${missed.length})`],["done",`DONE (${completed.length})`],["stats","STATS"]];

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Exo+2:wght@300;400;600&display=swap');*{box-sizing:border-box;margin:0;padding:0;}body{background:#020d1f;}@keyframes fadeOut{0%{opacity:1}60%{opacity:1}100%{opacity:0}}@keyframes scaleIn{from{transform:scale(0.5);opacity:0}to{transform:scale(1);opacity:1}}@keyframes gridMove{from{background-position:0 0}to{background-position:0 60px}}@keyframes floatUp{0%{transform:translateY(0);opacity:1}100%{transform:translateY(-60px);opacity:0}}@keyframes slideIn{from{transform:translateY(12px);opacity:0}to{transform:translateY(0);opacity:1}}@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}input::placeholder{color:#2a5070;}::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-thumb{background:#00b4ff44;border-radius:2px;}input[type=range]{height:4px;}`}</style>

      {screen==="loading"&&<LoadingScreen onDone={()=>setScreen(localStorage.getItem("nq_onboarded")?"game":"name")} t={t}/>}
      {screen==="name"&&<NameScreen onNext={n=>{setPlayerName(n);setScreen("goals");}} t={t}/>}
      {screen==="goals"&&<GoalsScreen playerName={playerName} onNext={starter=>{setTasks(starter);localStorage.setItem("nq_onboarded","1");setScreen("game");}} t={t}/>}

      {screen==="game"&&(
        <>
          <LevelUpFlash show={showLevelUp} level={level} t={t}/>
          <DerankFlash show={showDerank} level={level} t={t}/>
          <NudgeFlash nudge={activeNudge} t={t}/>
          <XPPopup popups={popups} t={t}/>
          <StreakToast toasts={streakToasts} t={t}/>
          <TrialToast toasts={trialToasts} t={t}/>
          {!isOnline&&<div style={{ position:"fixed",top:0,left:0,right:0,zIndex:9999,background:"rgba(255,180,50,0.12)",borderBottom:"1px solid rgba(255,180,50,0.3)",textAlign:"center",padding:"6px",fontFamily:"'Orbitron',monospace",fontSize:9,color:"#ffb454",letterSpacing:"0.15em" }}>OFFLINE — changes sync on reconnect</div>}
          <div style={{ minHeight:"100vh",background:t.bgGrad,fontFamily:"'Exo 2',sans-serif",position:"relative",overflow:"hidden" }}>
            <div style={{ position:"fixed",inset:0,pointerEvents:"none",zIndex:0,backgroundImage:`linear-gradient(${t.grid} 1px,transparent 1px),linear-gradient(90deg,${t.grid} 1px,transparent 1px)`,backgroundSize:"60px 60px",animation:"gridMove 4s linear infinite" }}/>
            <div style={{ position:"fixed",top:-120,left:-80,width:400,height:400,borderRadius:"50%",background:`radial-gradient(circle,${t.orb1} 0%,transparent 70%)`,pointerEvents:"none",zIndex:0 }}/>
            <div style={{ position:"fixed",bottom:-100,right:-60,width:300,height:300,borderRadius:"50%",background:`radial-gradient(circle,${t.orb2} 0%,transparent 70%)`,pointerEvents:"none",zIndex:0 }}/>
            <div style={{ position:"relative",zIndex:1,maxWidth:640,margin:"0 auto",padding:"24px 16px 48px" }}>

              {/* Header */}
              <div style={{ background:t.card,backdropFilter:"blur(16px)",border:`1px solid ${t.border}`,borderRadius:16,padding:"20px 24px",marginBottom:20,boxShadow:`0 0 24px ${t.primary}33` }}>
                <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:4 }}>
                  <div>
                    <div style={{ fontFamily:"'Orbitron',monospace",fontSize:9,color:t.primary,letterSpacing:"0.2em",marginBottom:2 }}>PLAYER</div>
                    <div style={{ fontFamily:"'Orbitron',monospace",fontSize:22,fontWeight:900,color:"#e0f4ff",letterSpacing:"0.05em" }}>{playerName}</div>
                    <div style={{ fontFamily:"'Orbitron',monospace",fontSize:9,color:t.accent,letterSpacing:"0.15em",marginTop:2 }}>{getRank(level)}</div>
                  </div>
                  <div style={{ display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8 }}>
                    <ThemePicker current={themeKey} onChange={setThemeKey} t={t}/>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontFamily:"'Orbitron',monospace",fontSize:9,color:t.secondary,letterSpacing:"0.2em",marginBottom:2 }}>LEVEL</div>
                      <div style={{ fontFamily:"'Orbitron',monospace",fontSize:40,fontWeight:900,color:t.secondary,lineHeight:1,textShadow:`0 0 20px ${t.secondary}` }}>{level}</div>
                    </div>
                  </div>
                </div>
                <XPBar xp={xp} t={t}/>
                <div style={{ marginTop:10,display:"flex",justifyContent:"flex-end",alignItems:"center",gap:8 }}>
                  {authUser ? (
                    <div style={{ display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6 }}>
                      <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                        <span style={{ fontFamily:"'Orbitron',monospace",fontSize:9,color:t.accent,letterSpacing:"0.1em" }}>{profile?.player_name||authUser.email?.split("@")[0]?.toUpperCase()}</span>
                        <button onClick={()=>supabase.auth.signOut()} style={{ padding:"5px 12px",fontFamily:"'Orbitron',monospace",fontSize:8,letterSpacing:"0.1em",background:"transparent",border:`1px solid ${t.border}`,borderRadius:6,cursor:"pointer",color:t.accent,transition:"all 0.2s" }}>SIGN OUT</button>
                        <button onClick={()=>setDeleteConfirm(true)} style={{ padding:"5px 12px",fontFamily:"'Orbitron',monospace",fontSize:8,letterSpacing:"0.1em",background:"transparent",border:"1px solid rgba(255,80,80,0.35)",borderRadius:6,cursor:"pointer",color:t.danger,transition:"all 0.2s" }}>DELETE ACCOUNT</button>
                      </div>
                      {deleteConfirm&&(
                        <div style={{ display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6 }}>
                          <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                            <span style={{ fontFamily:"'Exo 2',sans-serif",fontSize:11,color:t.danger }}>Delete your account permanently?</span>
                            <button onClick={handleDeleteAccount} style={{ padding:"4px 12px",fontFamily:"'Orbitron',monospace",fontSize:8,background:"rgba(255,80,80,0.2)",border:"1px solid #ff6060",borderRadius:6,color:"#ff6060",cursor:"pointer" }}>YES, DELETE</button>
                            <button onClick={()=>{setDeleteConfirm(false);setDeleteError("");}} style={{ padding:"4px 12px",fontFamily:"'Orbitron',monospace",fontSize:8,background:"transparent",border:`1px solid ${t.border}`,borderRadius:6,color:t.accent,cursor:"pointer" }}>CANCEL</button>
                          </div>
                          {deleteError&&<span style={{ fontFamily:"'Exo 2',sans-serif",fontSize:10,color:t.danger }}>{deleteError}</span>}
                        </div>
                      )}
                    </div>
                  ) : (
                    <button onClick={()=>setShowAuthModal(true)} style={{ padding:"6px 14px",fontFamily:"'Orbitron',monospace",fontSize:8,letterSpacing:"0.1em",background:`${t.primary}11`,border:`1px solid ${t.primary}44`,borderRadius:7,cursor:"pointer",color:t.primary,transition:"all 0.2s" }}>SIGN IN / CREATE ACCOUNT</button>
                  )}
                </div>
              </div>

              {/* Music Bar */}
              <MusicBar music={music} t={t}/>

              {/* Multiplayer (locked placeholder) */}
              <MultiplayerRow isGuest={!authUser} t={t} onFriends={()=>setShowFriendsModal(true)}/>

              {/* Tip */}
              <div style={{ background:`${t.primary}0d`,border:`1px solid ${t.primary}22`,borderRadius:10,padding:"10px 16px",marginBottom:20,display:"flex",gap:10,alignItems:"center" }}>
                <span style={{ fontSize:16 }}>💡</span>
                <span style={{ fontFamily:"'Exo 2',sans-serif",fontSize:13,color:t.accent }}>{tip}</span>
              </div>

              {showInstallCard&&<InstallCard deferredPrompt={deferredPrompt} onDismiss={handleInstallDismiss} t={t}/>}
              <QuestForm form={form} setForm={setForm} onSubmit={submitForm} onCancel={resetForm} editing={!!editingId} t={t} inputRef={inputRef}/>

              <div style={{ display:"flex",gap:6,marginBottom:16 }}>
                {TABS.map(([key,label])=>(
                  <button key={key} onClick={()=>setTab(key)} style={{ flex:1,padding:"10px 0",fontFamily:"'Orbitron',monospace",fontSize:8.5,letterSpacing:"0.05em",border:`1px solid ${tab===key?t.primary:t.border}`,borderRadius:8,cursor:"pointer",background:tab===key?`${t.primary}22`:"transparent",color:tab===key?t.primary:t.accent,opacity:tab===key?1:0.5,transition:"all 0.2s",whiteSpace:"nowrap" }}>{label}</button>
                ))}
              </div>

              <div style={{ animation:"slideIn 0.25s ease" }}>
                {tab==="active"&&(<><BossBattle t={t} pendingResolutions={bossResolutions}/><StreakCard streakState={streakState} gems={gems} onBuyFreeze={handleBuyFreeze} t={t}/><TrialPanel trialState={trialState} tasks={tasks} onTrialStateChange={setTrialState} onAbandon={handleAbandonTrial} t={t}/>{tasks.length===0?<div style={{ textAlign:"center",padding:"48px 0" }}><div style={{ fontFamily:"'Orbitron',monospace",fontSize:12,color:`${t.primary}44`,letterSpacing:"0.15em",marginBottom:8 }}>NO ACTIVE QUESTS</div><div style={{ fontFamily:"'Exo 2',sans-serif",fontSize:13,color:`${t.accent}66` }}>Add your first quest above to get started!</div></div>:tasks.map((task,i)=><QuestCard key={task.id} task={task} now={now} t={t} onComplete={completeTask} onDelete={deleteTask} onEdit={startEdit} onMove={moveTask} isFirst={i===0} isLast={i===tasks.length-1}/>)}</>)}

                {tab==="missed"&&(missed.length===0?<div style={{ textAlign:"center",padding:"48px 0" }}><div style={{ fontFamily:"'Orbitron',monospace",fontSize:12,color:`${t.primary}44`,letterSpacing:"0.15em",marginBottom:8 }}>NOTHING MISSED</div><div style={{ fontFamily:"'Exo 2',sans-serif",fontSize:13,color:`${t.accent}66` }}>Beat your timers and deadlines to keep this empty.</div></div>:<>{missed.map((task,i)=><MissedCard key={`${task.id}-${i}`} task={task} onDelete={deleteMissed} t={t}/>)}<div style={{ marginTop:16,textAlign:"center" }}>{clearConfirm==="missed"?<div style={{ display:"flex",gap:10,justifyContent:"center" }}><span style={{ fontFamily:"'Exo 2',sans-serif",fontSize:13,color:t.accent,alignSelf:"center" }}>Clear missed log?</span><button onClick={()=>{setMissed([]);setClearConfirm(null);}} style={{ padding:"7px 16px",fontFamily:"'Orbitron',monospace",fontSize:10,background:"rgba(255,80,80,0.2)",border:"1px solid #ff6060",borderRadius:7,color:"#ff6060",cursor:"pointer" }}>YES</button><button onClick={()=>setClearConfirm(null)} style={{ padding:"7px 16px",fontFamily:"'Orbitron',monospace",fontSize:10,background:"transparent",border:`1px solid ${t.border}`,borderRadius:7,color:t.accent,cursor:"pointer" }}>NO</button></div>:<button onClick={()=>setClearConfirm("missed")} style={{ padding:"8px 20px",fontFamily:"'Orbitron',monospace",fontSize:10,background:"transparent",border:"1px solid rgba(255,80,80,0.3)",borderRadius:8,color:"#ff6060",cursor:"pointer",letterSpacing:"0.1em" }}>CLEAR LOG</button>}</div></>)}

                {tab==="done"&&(completed.length===0?<div style={{ textAlign:"center",padding:"48px 0" }}><div style={{ fontFamily:"'Orbitron',monospace",fontSize:12,color:`${t.primary}44`,letterSpacing:"0.15em",marginBottom:8 }}>NO COMPLETED QUESTS YET</div><div style={{ fontFamily:"'Exo 2',sans-serif",fontSize:13,color:`${t.accent}66` }}>Complete your first quest to see it here.</div></div>:<>{completed.map((task,i)=><CompletedCard key={`${task.id}-${i}`} task={task} t={t}/>)}<div style={{ marginTop:16,textAlign:"center" }}>{clearConfirm==="done"?<div style={{ display:"flex",gap:10,justifyContent:"center" }}><span style={{ fontFamily:"'Exo 2',sans-serif",fontSize:13,color:t.accent,alignSelf:"center" }}>Clear all completed?</span><button onClick={()=>{setCompleted([]);setClearConfirm(null);}} style={{ padding:"7px 16px",fontFamily:"'Orbitron',monospace",fontSize:10,background:"rgba(255,80,80,0.2)",border:"1px solid #ff6060",borderRadius:7,color:"#ff6060",cursor:"pointer" }}>YES</button><button onClick={()=>setClearConfirm(null)} style={{ padding:"7px 16px",fontFamily:"'Orbitron',monospace",fontSize:10,background:"transparent",border:`1px solid ${t.border}`,borderRadius:7,color:t.accent,cursor:"pointer" }}>NO</button></div>:<button onClick={()=>setClearConfirm("done")} style={{ padding:"8px 20px",fontFamily:"'Orbitron',monospace",fontSize:10,background:"transparent",border:"1px solid rgba(255,80,80,0.3)",borderRadius:8,color:"#ff6060",cursor:"pointer",letterSpacing:"0.1em" }}>CLEAR LOG</button>}</div></>)}

                {tab==="stats"&&<><StatsTab xp={xp} level={level} tasks={tasks} completed={completed} missed={missed} t={t} onReset={resetProgress} isLoggedIn={!!authUser}/><NotifySettings prefs={notifyPrefs} onPrefsChange={handleNotifyPrefsChange} isLoggedIn={!!authUser} authUser={authUser} t={t}/></>}
              </div>
            </div>
          </div>
        </>
      )}
      <AuthModal open={showAuthModal} onClose={()=>setShowAuthModal(false)} guestXp={xp} t={t}/>
      <FriendsModal open={showFriendsModal} onClose={()=>setShowFriendsModal(false)} userId={authUser?.id} t={t}/>
    </>
  );
}