-- Live tier enforcement requires the authenticated user to write their own
-- usage counters and update their own challenges. The original migrations only
-- granted SELECT on usage_counters and SELECT/INSERT on challenges, so
-- ensureCounters() (INSERT + UPDATE) and incrementInterviewCounter() (upsert,
-- needs INSERT + UPDATE) failed, and evaluate.ts could not persist challenge
-- completion/summary.

-- usage_counters: INSERT — the authenticated user may create their own counter row
DROP POLICY IF EXISTS "Users can create own usage counter" ON usage_counters;
CREATE POLICY "Users can create own usage counter" ON usage_counters
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- usage_counters: UPDATE — the authenticated user may update their own counter row
DROP POLICY IF EXISTS "Users can update own usage counter" ON usage_counters;
CREATE POLICY "Users can update own usage counter" ON usage_counters
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- challenges: UPDATE — the authenticated user may update challenges in their own sessions
DROP POLICY IF EXISTS "Users can update own challenges" ON challenges;
CREATE POLICY "Users can update own challenges" ON challenges
  FOR UPDATE TO authenticated
  USING (session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid()))
  WITH CHECK (session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid()));
