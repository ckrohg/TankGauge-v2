-- Email notifications: weekly summary + low-level alerts (Resend)
-- Adds per-user notification preferences and state to the settings table.

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS refill_threshold_pct numeric(5,2) NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS low_alert_pct numeric(5,2) NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS weekly_email_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS low_alert_enabled boolean NOT NULL DEFAULT true,
  -- Optional override; when null we fall back to the user's Supabase Auth email.
  ADD COLUMN IF NOT EXISTS notify_email text,
  -- Hysteresis state: set when a low-level alert fires, cleared when level recovers.
  ADD COLUMN IF NOT EXISTS low_alert_sent_at timestamptz,
  -- Dedup guard so a Railway restart near the weekly cron time can't double-send.
  ADD COLUMN IF NOT EXISTS weekly_email_last_sent_at timestamptz;
