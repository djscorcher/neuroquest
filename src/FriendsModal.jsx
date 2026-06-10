import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

const XP_PER_LEVEL = 100;
const toLevel = xp => Math.floor((xp ?? 0) / XP_PER_LEVEL) + 1;

const timeAgo = (iso) => {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

export default function FriendsModal({ open, onClose, userId, t }) {
  const [tab, setTab] = useState('friends');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [addCode, setAddCode] = useState('');
  const [addMsg, setAddMsg] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    const [myProfRes, fsRes] = await Promise.all([
      supabase.from('profiles').select('friend_code').eq('id', userId).single(),
      supabase.from('friendships').select('*').or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
    ]);

    const myCode = myProfRes.data?.friend_code ?? '';
    const fs = fsRes.data ?? [];
    const accepted = fs.filter(f => f.status === 'accepted');
    const incoming = fs.filter(f => f.status === 'pending' && f.addressee_id === userId);
    const outgoing = fs.filter(f => f.status === 'pending' && f.requester_id === userId);

    const allIds = [...new Set([
      ...accepted.map(f => f.requester_id === userId ? f.addressee_id : f.requester_id),
      ...incoming.map(f => f.requester_id),
      ...outgoing.map(f => f.addressee_id),
    ])];

    let profiles = {};
    if (allIds.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, player_name, xp, streak, completed_count, friend_code')
        .in('id', allIds);
      (profs ?? []).forEach(p => { profiles[p.id] = p; });
    }

    const friendIds = accepted.map(f => f.requester_id === userId ? f.addressee_id : f.requester_id);
    let events = [];
    if (friendIds.length) {
      const { data: evts } = await supabase
        .from('activity_events')
        .select('*')
        .in('user_id', friendIds)
        .order('created_at', { ascending: false })
        .limit(30);
      events = evts ?? [];
    }

    setData({ myCode, accepted, incoming, outgoing, profiles, events });
    setLoading(false);
  }, [userId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const sendRequest = async () => {
    const code = addCode.trim().toUpperCase();
    if (!code) return;
    setAddMsg('');

    const { data: found } = await supabase.rpc('find_profile_by_friend_code', { code });
    if (!found?.length) { setAddMsg('No player found with that code.'); return; }

    const targetId = found[0].id;
    if (targetId === userId) { setAddMsg("That's your own code!"); return; }

    const all = [...(data?.accepted ?? []), ...(data?.incoming ?? []), ...(data?.outgoing ?? [])];
    const existing = all.find(f => f.requester_id === targetId || f.addressee_id === targetId);

    if (existing?.status === 'accepted') { setAddMsg('Already friends!'); return; }
    if (existing?.status === 'pending' && existing.requester_id === userId) { setAddMsg('Request already sent.'); return; }
    if (existing?.status === 'pending' && existing.requester_id === targetId) {
      // They already sent us a request — just accept it
      await supabase.from('friendships').update({ status: 'accepted' }).eq('id', existing.id);
      setAddMsg('Friend request accepted!');
      setAddCode('');
      await load();
      return;
    }

    const { error } = await supabase.from('friendships').insert({ requester_id: userId, addressee_id: targetId });
    if (error) { setAddMsg('Could not send request. Try again.'); return; }
    setAddMsg('Request sent!');
    setAddCode('');
    await load();
  };

  const accept  = async (id) => { await supabase.from('friendships').update({ status: 'accepted' }).eq('id', id); await load(); };
  const decline = async (id) => { await supabase.from('friendships').delete().eq('id', id); await load(); };
  const remove  = async (id) => { await supabase.from('friendships').delete().eq('id', id); setConfirmRemove(null); await load(); };

  if (!open) return null;

  const incomingCount = data?.incoming?.length ?? 0;

  const card       = { background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, padding: '14px 16px', marginBottom: 10, backdropFilter: 'blur(8px)' };
  const dangerBtn  = { padding: '5px 12px', fontFamily: "'Orbitron',monospace", fontSize: 8, background: 'rgba(255,80,80,0.15)', border: '1px solid rgba(255,80,80,0.4)', borderRadius: 6, color: '#ff6060', cursor: 'pointer', letterSpacing: '0.05em' };
  const ghostBtn   = { padding: '5px 12px', fontFamily: "'Orbitron',monospace", fontSize: 8, background: 'transparent', border: `1px solid ${t.border}`, borderRadius: 6, color: t.accent, cursor: 'pointer', letterSpacing: '0.05em' };
  const primaryBtn = { padding: '5px 12px', fontFamily: "'Orbitron',monospace", fontSize: 8, background: `${t.primary}22`, border: `1px solid ${t.primary}66`, borderRadius: 6, color: t.primary, cursor: 'pointer', letterSpacing: '0.05em' };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ width: '100%', maxWidth: 460, maxHeight: '85vh', display: 'flex', flexDirection: 'column', background: t.card, backdropFilter: 'blur(24px)', border: `1px solid ${t.border}`, borderRadius: 16, animation: 'scaleIn 0.2s ease forwards' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 20px 0' }}>
          <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 13, fontWeight: 700, color: t.secondary, letterSpacing: '0.1em' }}>FRIENDS</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: t.accent, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, padding: '12px 20px' }}>
          {[
            ['friends',  'FRIENDS'],
            ['requests', incomingCount ? `REQUESTS (${incomingCount})` : 'REQUESTS'],
            ['add',      'ADD'],
          ].map(([k, lbl]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{ flex: 1, padding: '8px 0', fontFamily: "'Orbitron',monospace", fontSize: 8, letterSpacing: '0.05em', border: `1px solid ${tab === k ? t.primary : t.border}`, borderRadius: 8, cursor: 'pointer', background: tab === k ? `${t.primary}22` : 'transparent', color: tab === k ? t.primary : t.accent, transition: 'all 0.2s' }}>
              {lbl}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>

          {loading && (
            <div style={{ textAlign: 'center', padding: 40, fontFamily: "'Orbitron',monospace", fontSize: 11, color: t.accent, opacity: 0.5 }}>LOADING...</div>
          )}

          {/* ── ADD ── */}
          {!loading && tab === 'add' && (
            <div>
              <div style={{ ...card, marginBottom: 20 }}>
                <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, color: t.accent, letterSpacing: '0.1em', marginBottom: 8 }}>YOUR FRIEND CODE</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 22, fontWeight: 700, color: t.secondary, letterSpacing: '0.25em' }}>{data?.myCode ?? '—'}</div>
                  <button onClick={() => navigator.clipboard?.writeText(data?.myCode ?? '')} style={ghostBtn}>COPY</button>
                </div>
                <div style={{ fontFamily: "'Exo 2',sans-serif", fontSize: 11, color: `${t.accent}77`, marginTop: 8 }}>Share this with friends so they can add you.</div>
              </div>

              <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, color: t.accent, letterSpacing: '0.1em', marginBottom: 8 }}>ADD BY CODE</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  value={addCode}
                  onChange={e => { setAddCode(e.target.value.toUpperCase()); setAddMsg(''); }}
                  onKeyDown={e => e.key === 'Enter' && addCode.length >= 6 && sendRequest()}
                  placeholder="Enter 8-character code..."
                  maxLength={8}
                  style={{ flex: 1, background: `${t.primary}11`, border: `1px solid ${t.primary}44`, borderRadius: 8, padding: '10px 14px', color: '#e0f0ff', fontFamily: "'Orbitron',monospace", fontSize: 13, letterSpacing: '0.2em', outline: 'none' }}
                />
                <button onClick={sendRequest} disabled={addCode.length < 6}
                  style={{ ...primaryBtn, padding: '10px 18px', fontSize: 9, opacity: addCode.length < 6 ? 0.4 : 1, cursor: addCode.length < 6 ? 'default' : 'pointer' }}>
                  SEND
                </button>
              </div>
              {addMsg && (
                <div style={{ fontFamily: "'Exo 2',sans-serif", fontSize: 12, color: addMsg.includes('sent') || addMsg.includes('accepted') ? t.secondary : t.danger, padding: '4px 0' }}>
                  {addMsg}
                </div>
              )}
            </div>
          )}

          {/* ── REQUESTS ── */}
          {!loading && tab === 'requests' && (
            <div>
              {incomingCount === 0 && (data?.outgoing?.length ?? 0) === 0 && (
                <div style={{ textAlign: 'center', padding: 40, fontFamily: "'Exo 2',sans-serif", fontSize: 13, color: `${t.accent}66` }}>No pending requests.</div>
              )}

              {incomingCount > 0 && (
                <>
                  <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, color: t.primary, letterSpacing: '0.1em', marginBottom: 10 }}>INCOMING</div>
                  {data.incoming.map(f => {
                    const p = data.profiles[f.requester_id];
                    return (
                      <div key={f.id} style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 13, fontWeight: 700, color: '#e0f4ff' }}>{p?.player_name ?? '...'}</div>
                          <div style={{ fontFamily: "'Exo 2',sans-serif", fontSize: 11, color: t.accent, marginTop: 3 }}>
                            Level {toLevel(p?.xp ?? 0)} · {p?.xp ?? 0} XP
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => accept(f.id)} style={primaryBtn}>ACCEPT</button>
                          <button onClick={() => decline(f.id)} style={dangerBtn}>DECLINE</button>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {(data?.outgoing?.length ?? 0) > 0 && (
                <>
                  <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, color: `${t.accent}77`, letterSpacing: '0.1em', margin: '16px 0 10px' }}>SENT</div>
                  {data.outgoing.map(f => {
                    const p = data.profiles[f.addressee_id];
                    return (
                      <div key={f.id} style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 13, fontWeight: 700, color: '#e0f4ff' }}>{p?.player_name ?? '...'}</div>
                          <div style={{ fontFamily: "'Exo 2',sans-serif", fontSize: 11, color: `${t.accent}55`, marginTop: 3 }}>Pending...</div>
                        </div>
                        <button onClick={() => decline(f.id)} style={dangerBtn}>CANCEL</button>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* ── FRIENDS ── */}
          {!loading && tab === 'friends' && (
            <div>
              {(data?.accepted?.length ?? 0) === 0 && (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, color: `${t.primary}44`, letterSpacing: '0.15em', marginBottom: 8 }}>NO FRIENDS YET</div>
                  <div style={{ fontFamily: "'Exo 2',sans-serif", fontSize: 13, color: `${t.accent}66` }}>Share your code in the ADD tab to connect.</div>
                </div>
              )}
              {(data?.accepted ?? []).map(f => {
                const fid = f.requester_id === userId ? f.addressee_id : f.requester_id;
                const p = data.profiles[fid];
                const recentEvents = (data.events ?? []).filter(e => e.user_id === fid).slice(0, 5);
                return (
                  <div key={f.id} style={card}>
                    {/* Friend header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: recentEvents.length ? 10 : 0 }}>
                      <div>
                        <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 14, fontWeight: 700, color: '#e0f4ff' }}>{p?.player_name ?? '...'}</div>
                        <div style={{ fontFamily: "'Exo 2',sans-serif", fontSize: 11, color: t.accent, marginTop: 4, display: 'flex', gap: 12 }}>
                          <span>Lv {toLevel(p?.xp ?? 0)}</span>
                          <span>{p?.xp ?? 0} XP</span>
                          <span>🔥 {p?.streak ?? 0}d streak</span>
                          <span>✓ {p?.completed_count ?? 0}</span>
                        </div>
                      </div>
                      {confirmRemove === f.id ? (
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button onClick={() => remove(f.id)} style={dangerBtn}>YES</button>
                          <button onClick={() => setConfirmRemove(null)} style={ghostBtn}>NO</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmRemove(f.id)} style={ghostBtn}>REMOVE</button>
                      )}
                    </div>

                    {/* Activity feed — no task content, XP + time only */}
                    {recentEvents.length > 0 && (
                      <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 8 }}>
                        {recentEvents.map(e => (
                          <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontFamily: "'Exo 2',sans-serif", fontSize: 11 }}>
                            <span style={{ color: `${t.accent}88` }}>Completed a quest</span>
                            <span style={{ color: t.secondary, flexShrink: 0, marginLeft: 8 }}>+{e.xp_earned} XP · {timeAgo(e.created_at)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
