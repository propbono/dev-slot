-- Create challenges table for multi-turn interview support
CREATE TABLE IF NOT EXISTS challenges (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own challenges" ON challenges;
CREATE POLICY "Users can view own challenges" ON challenges
  FOR SELECT TO authenticated
  USING (session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid()));

-- Insert default challenge per existing session
INSERT INTO challenges (session_id, status, created_at)
SELECT id, 'active', created_at FROM sessions
ON CONFLICT DO NOTHING;

-- Add challenge_id to session_messages (nullable first, then backfill, then NOT NULL)
ALTER TABLE session_messages
ADD COLUMN IF NOT EXISTS challenge_id uuid REFERENCES challenges(id) ON DELETE CASCADE;

-- Assign existing messages to their session's default challenge
UPDATE session_messages sm
SET challenge_id = (
  SELECT c.id FROM challenges c WHERE c.session_id = sm.session_id LIMIT 1
)
WHERE sm.challenge_id IS NULL;

-- Make NOT NULL after backfill
ALTER TABLE session_messages ALTER COLUMN challenge_id SET NOT NULL;

-- Index for challenge message lookups
CREATE INDEX IF NOT EXISTS idx_session_messages_challenge
ON session_messages (challenge_id);
