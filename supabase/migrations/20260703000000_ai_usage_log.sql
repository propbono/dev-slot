-- AI usage log: audit trail + durable per-user rate-limit/spend-cap counters.
-- The server writes one row per AI model call. Counts over this table drive
-- the per-user sliding-window rate limit and the daily/monthly spend ceilings.

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip text,
  operation text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;

-- Users may write their own usage rows (the server acts on their behalf).
DROP POLICY IF EXISTS "Users can insert own AI usage" ON ai_usage_log;
CREATE POLICY "Users can insert own AI usage" ON ai_usage_log
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users may read only their own usage rows.
DROP POLICY IF EXISTS "Users can view own AI usage" ON ai_usage_log;
CREATE POLICY "Users can view own AI usage" ON ai_usage_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_user_created
ON ai_usage_log (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_created
ON ai_usage_log (created_at);
