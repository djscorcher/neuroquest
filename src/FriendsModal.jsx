import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';

const XP_PER_LEVEL = 100;
const toLevel = xp => Math.floor((xp ?? 0) / XP_PER_LEVEL) + 1;
const timeAgo = iso => {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
};

const NUDGE_PRESETS = [
  "KEEP GOING! 💪",
  "YOU'VE GOT THIS! 🔥",
  "GRIND TIME! ⚡",
  "STAY FOCUSED! 🎯",
  "DON'T GIVE UP! 🛡️",
];

// ── Direct Message Panel ──────────────────────────────────────────────────
function DirectMessagePanel({ userId, friend, t, onBack }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [sending, setSending]   = useState(false);
  const bottomRef = useRef(null);

  // Load conversation + mark incoming as read
  useEffect(() => {
    if (!userId || !friend?.id) return;
    (async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${friend.id},recipient_id.eq.${friend.id}`)
        .order('created_at', { ascending: true });
      setMessages(data ?? []);
      await supabase
        .from('messages')
        .update({ read: true })
        .eq('recipient_id', userId)
        .eq('sender_id', friend.id)
        .eq('read', false);
    })();
  }, [userId, friend?.id]);

  // Scroll to bottom on new messages
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Realtime — incoming messages from this friend
  useEffect(() => {
    if (!userId || !friend?.id) return;
    const ch = supabase
      .channel(`dm-${userId}-${friend.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `recipient_id=eq.${userId}`,
      }, payload => {
        if (payload.new.sender_id !== friend.id) return;
        setMessages(prev => [...prev, payload.new]);
        supabase.from('messages').update({ read: true }).eq('id', payload.new.id).then(() => {});
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [userId, friend?.id]);

  const send = async () => {
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    const temp = {
      id: `t${Date.now()}`, sender_id: userId, recipient_id: friend.id,
      body, created_at: new Date().toISOString(), read: false, _temp: true,
    };
    setMessages(prev => [...prev, temp]);
    setInput('');
    const { data, error } = await supabase
      .from('messages')
      .insert({ sender_id: userId, recipient_id: friend.id, body })
      .select().single();
    setMessages(prev =>
      data ? prev.map(m => m.id === temp.id ? data : m)
           : prev.filter(m => m.id !== temp.id)
    );
    if (error) setInput(body);
    setSending(false);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0 }}>
      {/* Back bar */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 20px', borderBottom:`1px solid ${t.border}`, flexShrink:0 }}>
        <button onClick={onBack} style={{ background:'transparent', border:'none', color:t.primary, cursor:'pointer', fontFamily:"'Orbitron',monospace", fontSize:10, letterSpacing:'0.1em', padding:0 }}>← BACK</button>
        <div style={{ fontFamily:"'Orbitron',monospace", fontSize:12, fontWeight:700, color:'#e0f4ff' }}>{friend.name}</div>
      </div>

      {/* Message list */}
      <div style={{ flex:1, overflowY:'auto', padding:'14px 20px', display:'flex', flexDirection:'column', gap:8 }}>
        {messages.length === 0 && (
          <div style={{ textAlign:'center', padding:'40px 0', fontFamily:"'Exo 2',sans-serif", fontSize:13, color:`${t.accent}66` }}>
            No messages yet — say something!
          </div>
        )}
        {messages.map(msg => {
          const mine = msg.sender_id === userId;
          return (
            <div key={msg.id} style={{ display:'flex', justifyContent:mine ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth:'75%', padding:'9px 13px',
                borderRadius: mine ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                background: mine ? `${t.primary}22` : 'rgba(0,0,0,0.3)',
                border:`1px solid ${mine ? t.primary+'44' : t.border}`,
                fontFamily:"'Exo 2',sans-serif", fontSize:13, color:'#e0f0ff', lineHeight:1.5,
                opacity: msg._temp ? 0.6 : 1, transition:'opacity 0.2s',
              }}>
                {msg.body}
                <div style={{ fontFamily:"'Orbitron',monospace", fontSize:8, color:`${t.accent}77`, marginTop:4, textAlign:mine?'right':'left' }}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}
                  {mine && (msg.read ? ' ✓✓' : ' ✓')}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding:'12px 20px', borderTop:`1px solid ${t.border}`, display:'flex', gap:8, flexShrink:0 }}>
        <input
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Type a message..." maxLength={1000}
          style={{ flex:1, background:`${t.primary}11`, border:`1px solid ${t.primary}44`, borderRadius:8, padding:'10px 14px', color:'#e0f0ff', fontFamily:"'Exo 2',sans-serif", fontSize:13, outline:'none' }}
        />
        <button onClick={send} disabled={!input.trim() || sending}
          style={{ padding:'10px 16px', fontFamily:"'Orbitron',monospace", fontSize:9, letterSpacing:'0.1em', background:input.trim()&&!sending?`${t.primary}22`:'transparent', border:`1px solid ${input.trim()&&!sending?t.primary+'66':t.border}`, borderRadius:8, cursor:input.trim()&&!sending?'pointer':'default', color:input.trim()&&!sending?t.primary:t.accent, opacity:!input.trim()||sending?0.4:1, transition:'all 0.15s' }}>
          SEND
        </button>
      </div>
    </div>
  );
}

// ── FriendsModal ──────────────────────────────────────────────────────────
export default function FriendsModal({ open, onClose, userId, t }) {
  const [tab, setTab]                   = useState('friends');
  const [data, setData]                 = useState(null);
  const [loading, setLoading]           = useState(false);
  const [addCode, setAddCode]           = useState('');
  const [addMsg, setAddMsg]             = useState('');
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [dmFriend, setDmFriend]         = useState(null); // { id, name }
  const [nudgeFriend, setNudgeFriend]   = useState(null); // { id, name }
  const [customNudge, setCustomNudge]   = useState('');

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
        .from('profiles').select('id,player_name,xp,streak,completed_count,friend_code').in('id', allIds);
      (profs ?? []).forEach(p => { profiles[p.id] = p; });
    }
    const friendIds = accepted.map(f => f.requester_id === userId ? f.addressee_id : f.requester_id);
    let events = [];
    if (friendIds.length) {
      const { data: evts } = await supabase
        .from('activity_events').select('*').in('user_id', friendIds)
        .order('created_at', { ascending: false }).limit(30);
      events = evts ?? [];
    }
    setData({ myCode, accepted, incoming, outgoing, profiles, events });
    setLoading(false);
  }, [userId]);

  useEffect(() => { if (open) { load(); setDmFriend(null); } }, [open, load]);

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
      await supabase.from('friendships').update({ status: 'accepted' }).eq('id', existing.id);
      setAddMsg('Friend request accepted!'); setAddCode(''); await load(); return;
    }
    const { error } = await supabase.from('friendships').insert({ requester_id: userId, addressee_id: targetId });
    if (error) { setAddMsg('Could not send request. Try again.'); return; }
    setAddMsg('Request sent!'); setAddCode(''); await load();
  };

  const accept  = async id => { await supabase.from('friendships').update({ status:'accepted' }).eq('id', id); await load(); };
  const decline = async id => { await supabase.from('friendships').delete().eq('id', id); await load(); };
  const remove  = async id => { await supabase.from('friendships').delete().eq('id', id); setConfirmRemove(null); await load(); };

  const sendNudge = async (recipientId, message) => {
    await supabase.from('nudges').insert({ sender_id: userId, recipient_id: recipientId, message });
    setNudgeFriend(null);
    setCustomNudge('');
  };

  if (!open) return null;

  const incomingCount = data?.incoming?.length ?? 0;
  const card       = { background:t.card, border:`1px solid ${t.border}`, borderRadius:12, padding:'14px 16px', marginBottom:10, backdropFilter:'blur(8px)' };
  const dangerBtn  = { padding:'5px 12px', fontFamily:"'Orbitron',monospace", fontSize:8, background:'rgba(255,80,80,0.15)', border:'1px solid rgba(255,80,80,0.4)', borderRadius:6, color:'#ff6060', cursor:'pointer', letterSpacing:'0.05em' };
  const ghostBtn   = { padding:'5px 12px', fontFamily:"'Orbitron',monospace", fontSize:8, background:'transparent', border:`1px solid ${t.border}`, borderRadius:6, color:t.accent, cursor:'pointer', letterSpacing:'0.05em' };
  const primaryBtn = { padding:'5px 12px', fontFamily:"'Orbitron',monospace", fontSize:8, background:`${t.primary}22`, border:`1px solid ${t.primary}66`, borderRadius:6, color:t.primary, cursor:'pointer', letterSpacing:'0.05em' };

  return (
    <div
      style={{ position:'fixed', inset:0, zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.75)', backdropFilter:'blur(4px)', padding:16 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ width:'100%', maxWidth:460, maxHeight:'85vh', display:'flex', flexDirection:'column', background:t.card, backdropFilter:'blur(24px)', border:`1px solid ${t.border}`, borderRadius:16, animation:'scaleIn 0.2s ease forwards', position:'relative', overflow:'hidden' }}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'20px 20px 0', flexShrink:0 }}>
          <div style={{ fontFamily:"'Orbitron',monospace", fontSize:13, fontWeight:700, color:t.secondary, letterSpacing:'0.1em' }}>
            {dmFriend ? `CHAT · ${dmFriend.name}` : 'FRIENDS'}
          </div>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:t.accent, cursor:'pointer', fontSize:18, lineHeight:1, padding:4 }}>✕</button>
        </div>

        {/* DM Panel (replaces tabs) */}
        {dmFriend ? (
          <DirectMessagePanel userId={userId} friend={dmFriend} t={t} onBack={() => setDmFriend(null)} />
        ) : (
          <>
            {/* Tabs */}
            <div style={{ display:'flex', gap:6, padding:'12px 20px', flexShrink:0 }}>
              {[
                ['friends',  'FRIENDS'],
                ['requests', incomingCount ? `REQUESTS (${incomingCount})` : 'REQUESTS'],
                ['add',      'ADD'],
              ].map(([k, lbl]) => (
                <button key={k} onClick={() => setTab(k)}
                  style={{ flex:1, padding:'8px 0', fontFamily:"'Orbitron',monospace", fontSize:8, letterSpacing:'0.05em', border:`1px solid ${tab===k?t.primary:t.border}`, borderRadius:8, cursor:'pointer', background:tab===k?`${t.primary}22`:'transparent', color:tab===k?t.primary:t.accent, transition:'all 0.2s' }}>
                  {lbl}
                </button>
              ))}
            </div>

            {/* Body */}
            <div style={{ flex:1, overflowY:'auto', padding:'0 20px 20px' }}>
              {loading && <div style={{ textAlign:'center', padding:40, fontFamily:"'Orbitron',monospace", fontSize:11, color:t.accent, opacity:0.5 }}>LOADING...</div>}

              {/* ── ADD ── */}
              {!loading && tab === 'add' && (
                <div>
                  <div style={{ ...card, marginBottom:20 }}>
                    <div style={{ fontFamily:"'Orbitron',monospace", fontSize:9, color:t.accent, letterSpacing:'0.1em', marginBottom:8 }}>YOUR FRIEND CODE</div>
                    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                      <div style={{ fontFamily:"'Orbitron',monospace", fontSize:22, fontWeight:700, color:t.secondary, letterSpacing:'0.25em' }}>{data?.myCode ?? '—'}</div>
                      <button onClick={() => navigator.clipboard?.writeText(data?.myCode ?? '')} style={ghostBtn}>COPY</button>
                    </div>
                    <div style={{ fontFamily:"'Exo 2',sans-serif", fontSize:11, color:`${t.accent}77`, marginTop:8 }}>Share this with friends so they can add you.</div>
                  </div>
                  <div style={{ fontFamily:"'Orbitron',monospace", fontSize:9, color:t.accent, letterSpacing:'0.1em', marginBottom:8 }}>ADD BY CODE</div>
                  <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                    <input
                      value={addCode} onChange={e => { setAddCode(e.target.value.toUpperCase()); setAddMsg(''); }}
                      onKeyDown={e => e.key==='Enter' && addCode.length>=6 && sendRequest()}
                      placeholder="Enter 8-character code..." maxLength={8}
                      style={{ flex:1, background:`${t.primary}11`, border:`1px solid ${t.primary}44`, borderRadius:8, padding:'10px 14px', color:'#e0f0ff', fontFamily:"'Orbitron',monospace", fontSize:13, letterSpacing:'0.2em', outline:'none' }}
                    />
                    <button onClick={sendRequest} disabled={addCode.length < 6}
                      style={{ ...primaryBtn, padding:'10px 18px', fontSize:9, opacity:addCode.length<6?0.4:1, cursor:addCode.length<6?'default':'pointer' }}>
                      SEND
                    </button>
                  </div>
                  {addMsg && <div style={{ fontFamily:"'Exo 2',sans-serif", fontSize:12, color:addMsg.includes('sent')||addMsg.includes('accepted')?t.secondary:t.danger, padding:'4px 0' }}>{addMsg}</div>}
                </div>
              )}

              {/* ── REQUESTS ── */}
              {!loading && tab === 'requests' && (
                <div>
                  {incomingCount===0 && (data?.outgoing?.length??0)===0 && (
                    <div style={{ textAlign:'center', padding:40, fontFamily:"'Exo 2',sans-serif", fontSize:13, color:`${t.accent}66` }}>No pending requests.</div>
                  )}
                  {incomingCount > 0 && (
                    <>
                      <div style={{ fontFamily:"'Orbitron',monospace", fontSize:9, color:t.primary, letterSpacing:'0.1em', marginBottom:10 }}>INCOMING</div>
                      {data.incoming.map(f => {
                        const p = data.profiles[f.requester_id];
                        return (
                          <div key={f.id} style={{ ...card, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                            <div>
                              <div style={{ fontFamily:"'Orbitron',monospace", fontSize:13, fontWeight:700, color:'#e0f4ff' }}>{p?.player_name ?? '...'}</div>
                              <div style={{ fontFamily:"'Exo 2',sans-serif", fontSize:11, color:t.accent, marginTop:3 }}>Level {toLevel(p?.xp??0)} · {p?.xp??0} XP</div>
                            </div>
                            <div style={{ display:'flex', gap:6 }}>
                              <button onClick={() => accept(f.id)} style={primaryBtn}>ACCEPT</button>
                              <button onClick={() => decline(f.id)} style={dangerBtn}>DECLINE</button>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                  {(data?.outgoing?.length??0) > 0 && (
                    <>
                      <div style={{ fontFamily:"'Orbitron',monospace", fontSize:9, color:`${t.accent}77`, letterSpacing:'0.1em', margin:'16px 0 10px' }}>SENT</div>
                      {data.outgoing.map(f => {
                        const p = data.profiles[f.addressee_id];
                        return (
                          <div key={f.id} style={{ ...card, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                            <div>
                              <div style={{ fontFamily:"'Orbitron',monospace", fontSize:13, fontWeight:700, color:'#e0f4ff' }}>{p?.player_name ?? '...'}</div>
                              <div style={{ fontFamily:"'Exo 2',sans-serif", fontSize:11, color:`${t.accent}55`, marginTop:3 }}>Pending...</div>
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
                  {(data?.accepted?.length??0) === 0 && (
                    <div style={{ textAlign:'center', padding:40 }}>
                      <div style={{ fontFamily:"'Orbitron',monospace", fontSize:11, color:`${t.primary}44`, letterSpacing:'0.15em', marginBottom:8 }}>NO FRIENDS YET</div>
                      <div style={{ fontFamily:"'Exo 2',sans-serif", fontSize:13, color:`${t.accent}66` }}>Share your code in the ADD tab to connect.</div>
                    </div>
                  )}
                  {(data?.accepted ?? []).map(f => {
                    const fid = f.requester_id === userId ? f.addressee_id : f.requester_id;
                    const p = data.profiles[fid];
                    const recentEvents = (data.events ?? []).filter(e => e.user_id === fid).slice(0, 5);
                    return (
                      <div key={f.id} style={card}>
                        {/* Friend header row */}
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                          <div>
                            <div style={{ fontFamily:"'Orbitron',monospace", fontSize:14, fontWeight:700, color:'#e0f4ff' }}>{p?.player_name ?? '...'}</div>
                            <div style={{ fontFamily:"'Exo 2',sans-serif", fontSize:11, color:t.accent, marginTop:4, display:'flex', gap:12 }}>
                              <span>Lv {toLevel(p?.xp??0)}</span>
                              <span>{p?.xp??0} XP</span>
                              <span>🔥 {p?.streak??0}d streak</span>
                              <span>✓ {p?.completed_count??0}</span>
                            </div>
                          </div>
                          {confirmRemove === f.id ? (
                            <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                              <button onClick={() => remove(f.id)} style={dangerBtn}>YES</button>
                              <button onClick={() => setConfirmRemove(null)} style={ghostBtn}>NO</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmRemove(f.id)} style={ghostBtn}>REMOVE</button>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div style={{ display:'flex', gap:6, marginBottom: recentEvents.length ? 10 : 0 }}>
                          <button
                            onClick={() => setDmFriend({ id: fid, name: p?.player_name ?? 'FRIEND' })}
                            style={{ ...primaryBtn, padding:'6px 12px' }}
                          >
                            ✉ MSG
                          </button>
                          <button
                            onClick={() => setNudgeFriend({ id: fid, name: p?.player_name ?? 'FRIEND' })}
                            style={{ ...primaryBtn, padding:'6px 12px' }}
                          >
                            ⚡ NUDGE
                          </button>
                        </div>

                        {/* Activity feed */}
                        {recentEvents.length > 0 && (
                          <div style={{ borderTop:`1px solid ${t.border}`, paddingTop:8 }}>
                            {recentEvents.map(e => (
                              <div key={e.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'3px 0', fontFamily:"'Exo 2',sans-serif", fontSize:11 }}>
                                <span style={{ color:`${t.accent}88` }}>Completed a quest</span>
                                <span style={{ color:t.secondary, flexShrink:0, marginLeft:8 }}>+{e.xp_earned} XP · {timeAgo(e.created_at)}</span>
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
          </>
        )}

        {/* ── Nudge Picker Overlay ── */}
        {nudgeFriend && (
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.88)', borderRadius:16, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', zIndex:10, padding:20 }}>
            <div style={{ width:'100%', maxWidth:340 }}>
              <div style={{ fontFamily:"'Orbitron',monospace", fontSize:12, fontWeight:700, color:t.secondary, letterSpacing:'0.1em', marginBottom:4, textAlign:'center' }}>SEND NUDGE</div>
              <div style={{ fontFamily:"'Exo 2',sans-serif", fontSize:12, color:t.accent, marginBottom:16, textAlign:'center' }}>to {nudgeFriend.name}</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:14 }}>
                {NUDGE_PRESETS.map(msg => (
                  <button key={msg} onClick={() => sendNudge(nudgeFriend.id, msg)}
                    style={{ padding:'10px 14px', fontFamily:"'Exo 2',sans-serif", fontSize:13, background:`${t.primary}0d`, border:`1px solid ${t.border}`, borderRadius:8, color:'#e0f0ff', cursor:'pointer', textAlign:'left', transition:'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background=`${t.primary}22`; e.currentTarget.style.borderColor=t.primary+'66'; }}
                    onMouseLeave={e => { e.currentTarget.style.background=`${t.primary}0d`; e.currentTarget.style.borderColor=t.border; }}>
                    {msg}
                  </button>
                ))}
              </div>
              <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                <input
                  value={customNudge}
                  onChange={e => setCustomNudge(e.target.value.slice(0, 200))}
                  onKeyDown={e => e.key==='Enter' && customNudge.trim() && sendNudge(nudgeFriend.id, customNudge.trim())}
                  placeholder="Custom message..."
                  style={{ flex:1, background:`${t.primary}11`, border:`1px solid ${t.primary}44`, borderRadius:8, padding:'10px 12px', color:'#e0f0ff', fontFamily:"'Exo 2',sans-serif", fontSize:13, outline:'none' }}
                />
                <button
                  onClick={() => customNudge.trim() && sendNudge(nudgeFriend.id, customNudge.trim())}
                  disabled={!customNudge.trim()}
                  style={{ padding:'10px 14px', fontFamily:"'Orbitron',monospace", fontSize:9, letterSpacing:'0.1em', background:customNudge.trim()?`${t.primary}22`:'transparent', border:`1px solid ${customNudge.trim()?t.primary+'66':t.border}`, borderRadius:8, cursor:customNudge.trim()?'pointer':'default', color:customNudge.trim()?t.primary:t.accent, opacity:customNudge.trim()?1:0.4 }}>
                  SEND
                </button>
              </div>
              <button
                onClick={() => { setNudgeFriend(null); setCustomNudge(''); }}
                style={{ width:'100%', padding:'8px 0', fontFamily:"'Orbitron',monospace", fontSize:9, background:'transparent', border:`1px solid ${t.border}`, borderRadius:8, color:t.accent, cursor:'pointer', letterSpacing:'0.1em' }}>
                CANCEL
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
