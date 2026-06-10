import { useState } from "react";
import { supabase } from "../supabaseClient.js";
import {
  requestAndSubscribe,
  unsubscribeAll,
  updateSubscriptionPrefs,
} from "../lib/notifications.js";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '';

function Toggle({ label, desc, checked, disabled, onChange, t }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: `1px solid ${t.border}44` }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "'Exo 2',sans-serif", fontSize: 13, color: disabled ? `${t.accent}55` : '#c0d8f0' }}>{label}</div>
        {desc && <div style={{ fontFamily: "'Exo 2',sans-serif", fontSize: 11, color: `${t.accent}66`, marginTop: 2 }}>{desc}</div>}
      </div>
      <button
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        style={{
          width: 40, height: 22, borderRadius: 11, border: 'none', cursor: disabled ? 'default' : 'pointer',
          background: checked && !disabled ? t.primary : `${t.border}88`,
          position: 'relative', transition: 'background 0.2s', flexShrink: 0,
          opacity: disabled ? 0.4 : 1,
        }}
        aria-checked={checked}
        role="switch"
      >
        <span style={{
          position: 'absolute', top: 3, left: checked ? 21 : 3,
          width: 16, height: 16, borderRadius: '50%',
          background: '#fff', transition: 'left 0.2s',
        }} />
      </button>
    </div>
  );
}

export function NotifySettings({ prefs, onPrefsChange, isLoggedIn, authUser, t }) {
  const [permNote, setPermNote] = useState('');
  const [busy, setBusy]         = useState(false);

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const anyOn = prefs.streakAtRisk || prefs.bossExpiry || prefs.dailyReminder;

  async function handleToggle(key, value) {
    const newPrefs = { ...prefs, [key]: value, tz };
    const wasAnyOn = prefs.streakAtRisk || prefs.bossExpiry || prefs.dailyReminder;
    const nowAnyOn = newPrefs.streakAtRisk || newPrefs.bossExpiry || newPrefs.dailyReminder;

    // Turning a toggle ON → request permission + subscribe
    if (value && !wasAnyOn) {
      if (!VAPID_PUBLIC_KEY) {
        setPermNote('Push not configured — see SETUP.md.');
        return;
      }
      setBusy(true);
      setPermNote('');
      const result = await requestAndSubscribe(VAPID_PUBLIC_KEY, supabase, authUser.id, newPrefs, tz);
      setBusy(false);
      if (!result.ok) {
        if (result.reason === 'denied') {
          setPermNote("Notifications blocked — allow them in your browser settings, then try again.");
        } else if (result.reason === 'unsupported') {
          setPermNote("Your browser doesn't support push notifications.");
        } else {
          setPermNote("Couldn't subscribe — try again.");
        }
        return; // Don't apply the toggle change
      }
    }

    // Turning last toggle OFF → unsubscribe
    if (!nowAnyOn && wasAnyOn) {
      unsubscribeAll(supabase, authUser.id);
    }

    // Already subscribed and just updating which alerts are on → update prefs
    if (wasAnyOn && nowAnyOn) {
      updateSubscriptionPrefs(supabase, authUser.id, newPrefs, tz);
    }

    onPrefsChange(newPrefs);
    setPermNote('');
  }

  function handleTimeChange(time) {
    const newPrefs = { ...prefs, dailyReminderTime: time, tz };
    onPrefsChange(newPrefs);
    if (anyOn) updateSubscriptionPrefs(supabase, authUser.id, newPrefs, tz);
  }

  return (
    <div style={{
      background: t.card, backdropFilter: 'blur(16px)',
      border: `1px solid ${t.border}`, borderRadius: 14, padding: '18px 20px',
      marginTop: 16,
    }}>
      <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, color: t.primary, letterSpacing: '0.2em', marginBottom: 14 }}>
        REMINDERS &amp; ALERTS
      </div>

      {!isLoggedIn && (
        <div style={{ fontFamily: "'Exo 2',sans-serif", fontSize: 12, color: `${t.accent}88`, marginBottom: 10, padding: '10px 14px', background: `${t.primary}0d`, borderRadius: 8, border: `1px solid ${t.primary}22` }}>
          Reminders require a free account — your streak and boss data need to reach the server to trigger alerts.
        </div>
      )}

      <Toggle
        label="Streak at risk"
        desc="A quiet nudge after 9 PM when your streak needs a check-in."
        checked={prefs.streakAtRisk}
        disabled={!isLoggedIn || busy}
        onChange={v => handleToggle('streakAtRisk', v)}
        t={t}
      />
      <Toggle
        label="Boss expiry"
        desc="Alert when your boss escapes within 4 hours."
        checked={prefs.bossExpiry}
        disabled={!isLoggedIn || busy}
        onChange={v => handleToggle('bossExpiry', v)}
        t={t}
      />
      <Toggle
        label="Daily reminder"
        desc="One gentle reminder at a time you choose."
        checked={prefs.dailyReminder}
        disabled={!isLoggedIn || busy}
        onChange={v => handleToggle('dailyReminder', v)}
        t={t}
      />

      {prefs.dailyReminder && isLoggedIn && (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: "'Exo 2',sans-serif", fontSize: 12, color: t.accent }}>Time</span>
          <input
            type="time"
            value={prefs.dailyReminderTime}
            onChange={e => handleTimeChange(e.target.value)}
            style={{
              background: '#0a1929', border: `1px solid ${t.border}`, borderRadius: 7,
              color: '#e0f4ff', padding: '5px 10px', fontFamily: "'Orbitron',monospace",
              fontSize: 12, outline: 'none',
            }}
          />
          <span style={{ fontFamily: "'Exo 2',sans-serif", fontSize: 11, color: `${t.accent}66` }}>local time</span>
        </div>
      )}

      {permNote && (
        <div style={{ marginTop: 10, fontFamily: "'Exo 2',sans-serif", fontSize: 12, color: t.accent, padding: '8px 12px', background: `${t.border}22`, borderRadius: 7 }}>
          {permNote}
        </div>
      )}

      {busy && (
        <div style={{ marginTop: 8, fontFamily: "'Exo 2',sans-serif", fontSize: 11, color: `${t.accent}66` }}>
          Requesting permission…
        </div>
      )}
    </div>
  );
}
