# Challenges Data Model — Implementation Plan

## Overview

Create the `challenges` table and add a `challenge_id` foreign key to `session_messages` — the data model foundation for multi-turn interview trees. Existing sessions get a default challenge row, keeping all messages grouped.

## Current State

- `sessions` + `session_messages` tables live on Supabase with RLS
- Sessions have `id, user_id, status, created_at, updated_at`
- Messages have `id, session_id, role, content, metadata, status, created_at`
- No concept of "challenges" within a session — all messages for a session are flat

## Desired End State

`challenges` table: `id (uuid PK), session_id (FK → sessions), status (active|completed), summary (JSONB nullable), created_at`. `session_messages` has `challenge_id` FK → challenges. Existing messages assigned to default challenges per session.

## Key Decisions

| Decision | Choice |
|---|---|
| Existing messages | Default challenge per session during migration |
| Statuses | active, completed |
| Summary schema | { quality, confidence, rationale, strengths: string[], improvement_areas: string[] } |

## Phase 1: Migration

**File**: `supabase/migrations/<timestamp>_create_challenges.sql`

```sql
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

-- Add challenge_id to session_messages
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
```

### Success Criteria:

- `npm run build` passes, typecheck passes, tests pass
- Migration applied to cloud — tables visible in Supabase dashboard
- Existing sessions have a default challenge with all messages assigned

## Progress

### Phase 1: Migration

- [x] 1.1 Migration file exists
- [x] 1.2 Build / typecheck / lint / test pass
- [ ] 1.3 Migration applied to cloud
- [ ] 1.4 Existing messages assigned to challenges
