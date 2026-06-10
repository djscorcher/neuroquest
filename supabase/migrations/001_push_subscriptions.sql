-- NeuroQuest PWA push notifications migration
-- Run in Supabase SQL editor or via: supabase db push

-- Add new columns to profiles (safe to run multiple times — uses IF NOT EXISTS pattern)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notify_prefs jsonb,
  ADD COLUMN IF NOT EXISTS tz           text;

-- Push subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id                     uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint               text NOT NULL UNIQUE,
  p256dh                 text NOT NULL,
  auth                   text NOT NULL,
  tz                     text,
  prefs                  jsonb NOT NULL DEFAULT '{}',
  last_streak_ping_day   text,
  last_boss_ping_boss_key text,
  last_daily_ping_day    text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS push_subscriptions_updated_at ON push_subscriptions;
CREATE TRIGGER push_subscriptions_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: owner-only access
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_all" ON push_subscriptions;
CREATE POLICY "owner_all" ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Index for lookup by user
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON push_subscriptions(user_id);
