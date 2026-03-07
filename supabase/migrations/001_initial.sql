-- TankGauge schema for Supabase
-- Users are managed by Supabase Auth (auth.users table)
-- This schema stores application data linked to auth.users.id

-- Settings per user
CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scraping_frequency text NOT NULL DEFAULT 'twice-daily',
  schedule_window text,
  schedule_offset_minutes integer,
  schedule_seed integer,
  tankfarm_username text,
  tankfarm_password text,
  last_scraped_at timestamptz,
  consecutive_failures integer NOT NULL DEFAULT 0,
  last_failure_reason text,
  last_failure_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Tank readings
CREATE TABLE IF NOT EXISTS tank_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level_percentage decimal(5,2) NOT NULL,
  remaining_gallons decimal(10,2) NOT NULL,
  tank_capacity decimal(10,2) NOT NULL,
  price_per_gallon decimal(10,2),
  tankfarm_last_update timestamptz,
  scraped_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tank_readings_user_scraped ON tank_readings(user_id, scraped_at DESC);

-- Deliveries
CREATE TABLE IF NOT EXISTS deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delivery_date timestamptz NOT NULL,
  amount_gallons decimal(10,2) NOT NULL,
  price_per_gallon decimal(10,2) NOT NULL,
  total_cost decimal(10,2) NOT NULL,
  scraped_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deliveries_user_date ON deliveries(user_id, delivery_date DESC);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_date timestamptz NOT NULL,
  amount decimal(10,2) NOT NULL,
  payment_method text,
  status text NOT NULL DEFAULT 'paid',
  scraped_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_user_date ON payments(user_id, payment_date DESC);

-- Row Level Security
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tank_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only access their own data
CREATE POLICY settings_user_policy ON settings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY tank_readings_user_policy ON tank_readings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY deliveries_user_policy ON deliveries FOR ALL USING (auth.uid() = user_id);
CREATE POLICY payments_user_policy ON payments FOR ALL USING (auth.uid() = user_id);

-- Note: The API server uses Supabase's service_role key, which bypasses RLS.
-- The user policies above protect data when accessed via the anon key or user JWTs directly.
