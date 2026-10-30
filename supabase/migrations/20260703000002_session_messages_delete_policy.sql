-- Allow authenticated users to delete messages in their own sessions.
-- The generation-lock cleanup in src/pages/api/interview/generate.ts removes its
-- "generating" marker via session_messages.delete, which requires a DELETE policy.
DROP POLICY IF EXISTS "Users can delete messages in own sessions" ON session_messages;
CREATE POLICY "Users can delete messages in own sessions" ON session_messages
  FOR DELETE TO authenticated
  USING (
    session_id IN (
      SELECT id FROM sessions WHERE user_id = auth.uid()
    )
  );
