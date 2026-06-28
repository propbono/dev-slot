-- Add status column to session_messages for draft tracking
ALTER TABLE session_messages
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'committed'
CHECK (status IN ('draft', 'committed'));

-- Add index for faster draft lookups per session
CREATE INDEX IF NOT EXISTS idx_session_messages_session_status
ON session_messages (session_id, status);
