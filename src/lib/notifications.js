// Client-side push subscription management.
// Only called for signed-in users; guests never reach this code.

function urlBase64ToUint8Array(b64) {
  const padding = '='.repeat((4 - b64.length % 4) % 4);
  const base64  = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// Returns { ok, reason } — reason: 'unsupported' | 'denied' | 'error'
export async function requestAndSubscribe(vapidPublicKey, supabase, userId, prefs, tz) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'unsupported' };
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    return { ok: false, reason: 'denied' };
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    const json = sub.toJSON();
    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id:  userId,
      endpoint: json.endpoint,
      p256dh:   json.keys.p256dh,
      auth:     json.keys.auth,
      tz,
      prefs,
    }, { onConflict: 'endpoint' });
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    console.error('[push] subscribe error:', err);
    return { ok: false, reason: 'error' };
  }
}

export async function unsubscribeAll(supabase, userId) {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg      = await navigator.serviceWorker.ready;
    const sub      = await reg.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await supabase.from('push_subscriptions').delete()
      .eq('user_id', userId).eq('endpoint', endpoint);
  } catch (err) {
    console.error('[push] unsubscribe error:', err);
  }
}

export async function updateSubscriptionPrefs(supabase, userId, prefs, tz) {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await supabase.from('push_subscriptions')
      .update({ prefs, tz })
      .eq('user_id', userId)
      .eq('endpoint', sub.endpoint);
  } catch {}
}
