import webpush from 'npm:web-push@3';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { evaluateNotifications } from '../_shared/evaluateNotifications.js';

const VAPID_SUBJECT       = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@neuroquest.app';
const VAPID_PUBLIC_KEY    = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY   = Deno.env.get('VAPID_PRIVATE_KEY')!;
const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

Deno.serve(async () => {
  try {
    // Load all push subscriptions
    const { data: subs, error: subErr } = await supabase
      .from('push_subscriptions')
      .select('*');
    if (subErr) throw subErr;
    if (!subs?.length) return ok({ sent: 0 });

    // Load profiles for all subscribed users in one query
    const userIds = [...new Set(subs.map((s: any) => s.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, boss_state, streak_state')
      .in('id', userIds);

    const profileMap: Record<string, any> = {};
    for (const p of profiles ?? []) profileMap[p.id] = p;

    const now        = Date.now();
    const toDelete:  string[] = [];
    let   totalSent  = 0;

    for (const sub of subs as any[]) {
      const profile = profileMap[sub.user_id];
      if (!profile) continue;

      let bossState   = null;
      let streakState = null;
      try { bossState   = JSON.parse(profile.boss_state   ?? 'null'); } catch {}
      try { streakState = JSON.parse(profile.streak_state ?? 'null'); } catch {}

      const lastPings = {
        lastStreakPingDay: sub.last_streak_ping_day,
        lastBossPingKey:   sub.last_boss_ping_boss_key,
        lastDailyPingDay:  sub.last_daily_ping_day,
      };

      const prefs = sub.prefs ?? {};
      const tz    = sub.tz;
      if (!tz) continue;

      const notifications = evaluateNotifications(bossState, streakState, prefs, lastPings, now, tz);

      for (const notif of notifications) {
        const { _pingUpdate, ...payload } = notif;
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(payload),
          );
          totalSent++;
          if (_pingUpdate) {
            await supabase
              .from('push_subscriptions')
              .update({ ..._pingUpdate, updated_at: new Date().toISOString() })
              .eq('endpoint', sub.endpoint);
          }
        } catch (err: any) {
          // 404 / 410 = endpoint no longer valid → delete it
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            toDelete.push(sub.endpoint);
          } else {
            console.error('[send-notifications] push error:', err?.message ?? err);
          }
        }
      }
    }

    // Clean up dead subscriptions
    for (const ep of toDelete) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', ep);
    }

    return ok({ sent: totalSent, deleted: toDelete.length });
  } catch (err) {
    console.error('[send-notifications] fatal:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});

function ok(body: object) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
