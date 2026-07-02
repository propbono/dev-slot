-- User roles table
CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own role" ON user_roles;
CREATE POLICY "Users can view own role" ON user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Seed existing users as 'user'
INSERT INTO user_roles (user_id, role)
SELECT id, 'user' FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- Usage counters table
CREATE TABLE IF NOT EXISTS usage_counters (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  interviews_this_month integer NOT NULL DEFAULT 0,
  billing_cycle_start timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own usage" ON usage_counters;
CREATE POLICY "Users can view own usage" ON usage_counters
  FOR SELECT TO authenticated USING (user_id = auth.uid());
