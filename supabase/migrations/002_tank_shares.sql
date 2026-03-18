-- Tank sharing: allows users to invite others to view their tank data
CREATE TABLE IF NOT EXISTS tank_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_email text NOT NULL,
  shared_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending', -- pending, active, revoked
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tank_shares_owner ON tank_shares(owner_id);
CREATE INDEX IF NOT EXISTS idx_tank_shares_shared_user ON tank_shares(shared_user_id) WHERE shared_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tank_shares_email ON tank_shares(shared_email);

-- Unique constraint: can't invite same email twice per owner
CREATE UNIQUE INDEX IF NOT EXISTS idx_tank_shares_owner_email ON tank_shares(owner_id, shared_email) WHERE status != 'revoked';

-- RLS
ALTER TABLE tank_shares ENABLE ROW LEVEL SECURITY;

-- Owners can manage their own shares
CREATE POLICY tank_shares_owner_policy ON tank_shares FOR ALL
  USING (auth.uid() = owner_id);

-- Shared users can view shares targeting them
CREATE POLICY tank_shares_viewer_policy ON tank_shares FOR SELECT
  USING (auth.uid() = shared_user_id);
