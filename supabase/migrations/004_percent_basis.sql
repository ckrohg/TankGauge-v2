-- Percent basis for refill/alert thresholds.
-- 'relative' = % of historical max fill (default), 'absolute' = raw gauge %.
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS percent_basis text NOT NULL DEFAULT 'relative';
