-- Add INSERT policy for challenges table
DROP POLICY IF EXISTS "Users can insert own challenges" ON challenges;
CREATE POLICY "Users can insert own challenges" ON challenges
  FOR INSERT TO authenticated
  WITH CHECK (session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid()));
