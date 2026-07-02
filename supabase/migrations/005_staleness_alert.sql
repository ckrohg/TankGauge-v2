-- Staleness watchdog: alert once when no new tank_readings row has saved in a
-- long while (default >48h in the scheduler), then re-arm when data resumes.
-- One nullable timestamp is the entire arm/clear hysteresis mechanism, mirroring
-- the low_alert_sent_at pattern from migration 003.
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS staleness_alerted_at timestamptz;
-- NULL  = armed (no active stale episode)
-- set   = alert already sent for the current episode; cleared when data resumes
