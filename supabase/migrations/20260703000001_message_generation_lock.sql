-- Extend session_messages.status so challenge generation can hold an atomic,
-- idempotent "generating" lock (prevents concurrent/repeated AI generation for
-- the same session from the client's polling loop).

ALTER TABLE session_messages
DROP CONSTRAINT IF EXISTS session_messages_status_check;

ALTER TABLE session_messages
ADD CONSTRAINT session_messages_status_check
CHECK (status IN ('draft', 'committed', 'generating'));

-- At most one in-flight generation per session.
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_messages_one_generating
ON session_messages (session_id)
WHERE role = 'interviewer' AND status = 'generating';
