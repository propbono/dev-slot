-- 1. sessions table: interview session lifecycle
CREATE TABLE IF NOT EXISTS sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'active', 'completed', 'abandoned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. session_messages table: chronological interview transcript
CREATE TABLE IF NOT EXISTS session_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('system', 'interviewer', 'user')),
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. updated_at trigger for sessions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_sessions_updated_at ON sessions;
CREATE TRIGGER update_sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. RLS — enable on both tables
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_messages ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies — sessions (3 policies, 1 per operation)

-- SELECT: authenticated users read only their own sessions
DROP POLICY IF EXISTS "Users can view own sessions" ON sessions;
CREATE POLICY "Users can view own sessions" ON sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- INSERT: authenticated users create sessions with their own user_id
DROP POLICY IF EXISTS "Users can create own sessions" ON sessions;
CREATE POLICY "Users can create own sessions" ON sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE: authenticated users update only their own sessions
DROP POLICY IF EXISTS "Users can update own sessions" ON sessions;
CREATE POLICY "Users can update own sessions" ON sessions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 6. RLS policies — session_messages (3 policies, 1 per operation)

-- SELECT: authenticated users read messages only in their own sessions
DROP POLICY IF EXISTS "Users can view messages in own sessions" ON session_messages;
CREATE POLICY "Users can view messages in own sessions" ON session_messages
  FOR SELECT TO authenticated
  USING (
    session_id IN (
      SELECT id FROM sessions WHERE user_id = auth.uid()
    )
  );

-- INSERT: authenticated users create messages only in their own sessions
DROP POLICY IF EXISTS "Users can create messages in own sessions" ON session_messages;
CREATE POLICY "Users can create messages in own sessions" ON session_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    session_id IN (
      SELECT id FROM sessions WHERE user_id = auth.uid()
    )
  );

-- UPDATE: authenticated users update messages only in their own sessions
DROP POLICY IF EXISTS "Users can update messages in own sessions" ON session_messages;
CREATE POLICY "Users can update messages in own sessions" ON session_messages
  FOR UPDATE TO authenticated
  USING (
    session_id IN (
      SELECT id FROM sessions WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM sessions WHERE user_id = auth.uid()
    )
  );
