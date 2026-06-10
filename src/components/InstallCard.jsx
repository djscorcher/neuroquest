import { useState } from "react";

function isIOS() {
  return /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
}

function isInStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

export function InstallCard({ deferredPrompt, onDismiss, t }) {
  const [installed, setInstalled] = useState(false);
  const ios = isIOS();

  if (installed || isInStandalone()) return null;

  async function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    onDismiss(); // hide card regardless of outcome
  }

  return (
    <div style={{
      background: t.card, backdropFilter: 'blur(16px)',
      border: `1px solid ${t.primary}44`, borderRadius: 14, padding: '16px 18px',
      marginBottom: 16, boxShadow: `0 0 20px ${t.primary}22`,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, color: t.primary, letterSpacing: '0.15em' }}>
          INSTALL NEUROQUEST
        </div>
        <button
          onClick={onDismiss}
          style={{ background: 'transparent', border: 'none', color: `${t.accent}66`, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}
          aria-label="Dismiss"
        >×</button>
      </div>

      <div style={{ fontFamily: "'Exo 2',sans-serif", fontSize: 13, color: '#c0d8f0', lineHeight: 1.5 }}>
        Install NeuroQuest to protect your streak and get boss alerts.
      </div>

      {ios ? (
        <div style={{ fontFamily: "'Exo 2',sans-serif", fontSize: 12, color: t.accent, lineHeight: 1.6 }}>
          Tap <strong style={{ color: '#e0f4ff' }}>Share</strong> in Safari, then{' '}
          <strong style={{ color: '#e0f4ff' }}>Add to Home Screen</strong>.
          <div style={{ marginTop: 4, fontSize: 11, color: `${t.accent}66` }}>
            iOS 16.4+ required for push alerts.
          </div>
        </div>
      ) : (
        <button
          onClick={handleInstall}
          style={{
            padding: '10px 0', fontFamily: "'Orbitron',monospace", fontSize: 10,
            letterSpacing: '0.15em', borderRadius: 9, cursor: 'pointer',
            background: `linear-gradient(135deg, ${t.primary}33, ${t.primary}11)`,
            border: `1px solid ${t.primary}66`, color: t.primary,
            transition: 'all 0.2s',
          }}
        >
          ADD TO HOME SCREEN
        </button>
      )}
    </div>
  );
}
