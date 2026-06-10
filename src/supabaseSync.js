import { supabase } from './supabaseClient';

const toDbTask = (task, userId, list, sortOrder) => ({
  id: String(task.id),
  user_id: userId,
  list,
  sort_order: sortOrder,
  title: task.title ?? '',
  difficulty: task.difficulty ?? 'Medium',
  importance: task.importance ?? 'Medium',
  schedule_type: task.scheduleType ?? 'none',
  timer_deadline: task.timerDeadline ?? null,
  timer_seconds: task.timerSeconds ?? null,
  timer_missed: task.timerMissed ?? false,
  due_date: task.dueDate ?? null,
  repeat: task.repeat ?? 'none',
  repeat_every: task.repeatEvery ?? 2,
  created_at_ms: task.createdAt ?? 0,
  completed_at_ms: task.completedAt ?? null,
  awarded_xp: task.awardedXp ?? null,
  timing: task.timing ?? null,
  missed_reason: task.missedReason ?? null,
  penalty: task.penalty ?? null,
});

const fromDbTask = (row) => ({
  id: row.id,
  title: row.title,
  difficulty: row.difficulty,
  importance: row.importance,
  scheduleType: row.schedule_type,
  timerDeadline: row.timer_deadline,
  timerSeconds: row.timer_seconds,
  timerMissed: row.timer_missed,
  dueDate: row.due_date,
  repeat: row.repeat,
  repeatEvery: row.repeat_every,
  createdAt: row.created_at_ms,
  completedAt: row.completed_at_ms,
  awardedXp: row.awarded_xp,
  timing: row.timing,
  missedReason: row.missed_reason,
  penalty: row.penalty,
});

// Returns { profile, tasks, completed, missed } or null on network failure.
// profile is null (not an error) when the user has no row yet.
export const fetchUserData = async (userId) => {
  try {
    const [profRes, tasksRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('tasks').select('*').eq('user_id', userId).order('sort_order'),
    ]);
    // PGRST116 = .single() found no rows — expected for brand-new users
    if (profRes.error && profRes.error.code !== 'PGRST116') return null;
    const rows = tasksRes.data ?? [];
    return {
      profile: profRes.data ?? null,
      tasks:     rows.filter(r => r.list === 'active').map(fromDbTask),
      completed: rows.filter(r => r.list === 'completed').map(fromDbTask),
      missed:    rows.filter(r => r.list === 'missed').map(fromDbTask),
    };
  } catch (_) {
    return null; // offline — caller will fall back to localStorage
  }
};

export const syncProfile = async (userId, { playerName, xp, themeKey, streak = 0, completedCount = 0, gems = 0, titles = [], bossState = null, streakState = null }) => {
  // UPDATE, not upsert — upsert requires INSERT privilege; the profiles RLS only grants
  // UPDATE to the authenticated user. INSERT is handled exclusively by the DB trigger.
  const payload = { player_name: playerName, xp, theme_key: themeKey, streak, completed_count: completedCount, gems };
  if (titles.length)    payload.titles       = titles;
  if (bossState)        payload.boss_state   = bossState;
  if (streakState)      payload.streak_state = streakState; // requires streak_state column in profiles table
  const { error } = await supabase.from('profiles').update(payload).eq('id', userId);
  if (error) console.error('[syncProfile]', error.code, error.message);
};

export const insertActivityEvent = async (userId, xpEarned) => {
  try {
    await supabase.from('activity_events').insert({ user_id: userId, xp_earned: xpEarned });
  } catch (_) {}
};

// Full replace for one list: delete existing rows then insert current items.
// localStorage is the source of truth so a brief gap is fine.
export const syncList = async (userId, list, items) => {
  const rows = items.map((t, i) => toDbTask(t, userId, list, i));
  const { error: delErr } = await supabase.from('tasks').delete().eq('user_id', userId).eq('list', list);
  if (delErr) { console.error('[syncList delete]', list, delErr.message); return; }
  if (!rows.length) return;
  const { error: insErr } = await supabase.from('tasks').insert(rows);
  if (insErr) console.error('[syncList insert]', list, insErr.message);
};

export const syncAllLists = (userId, tasks, completed, missed) =>
  Promise.all([
    syncList(userId, 'active', tasks),
    syncList(userId, 'completed', completed),
    syncList(userId, 'missed', missed),
  ]);
