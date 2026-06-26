# Interview Session Schema — Implementation Plan

## Overview

Create the `sessions` and `session_messages` tables with per-user row-level security (RLS) via a Supabase migration. This is roadmap foundation **F-01** — the data layer that every downstream DevSlot slice (challenge generation, adaptive follow-up, session history, performance metrics) builds on.

## Current State Analysis

- **Supabase client wired:** `src/lib/supabase.ts` provides `createClient()` via `@supabase/ssr`. Uses `astro:env/server` for credentials.
- **Auth active:** Supabase SSR middleware (`src/middleware.ts`) resolves `auth.uid()` per request. Email/password flow tested and working.
- **No existing schema:** `supabase/migrations/` directory absent. No application tables exist — only Supabase's internal `auth` schema.
- **Supabase CLI installed** (`npx supabase` v2.98.2) but **Docker not available** — `supabase start` for local dev won't work. Migration must be written by hand (no `db diff` auto-generation) and deployed directly to the cloud project (`igxikicoplbllvdibmha.supabase.co`).
- **RLS is mandatory per AGENTS.md:** every new table needs granular per-operation, per-role policies.

### Key Discoveries:

- `auth.uid()` function is available for RLS policy `USING` clauses — the authenticated user's UUID
- Migration naming convention from AGENTS.md: `YYYYMMDDHHmmss_description.sql`
- Deletion cascading controlled by `ON DELETE CASCADE` on foreign keys — when user deletes account, all sessions + messages clean up automatically

## Desired End State

Two tables live in the `public` schema on the cloud Supabase project:

| Table | Columns | RLS policies |
|---|---|---|
| `sessions` | id, user_id, status, created_at, updated_at | SELECT, INSERT, UPDATE per owner |
| `session_messages` | id, session_id, role, content, metadata, created_at | SELECT, INSERT, UPDATE per session owner |

`auth.users` cascading delete ensures NFR-7 (account deletion erases data within 30 days). Every downstream slice can create sessions and append messages knowing RLS prevents cross-user access.

**Verification:** query both tables from the Supabase dashboard as two different users — user A's rows are invisible to user B.

## What We're NOT Doing

- No application code changes — this is schema-only. API routes and UI pages for sessions come in downstream slices (S-01 through S-04).
- No local Supabase dev environment — Docker is unavailable. Testing happens against the cloud project.
- No indexes beyond the implicit PK indexes — the MVP's data volume doesn't justify them yet. Add in S-04 (metrics) if needed.
- No seed data — the first session row is created when S-01 (JD-to-challenge) ships.

## Implementation Approach

Single migration file, written by hand (no `db diff` since Docker isn't available), applied to the cloud project via `npx supabase db push` or the Supabase dashboard SQL editor. The migration:

1. Creates `sessions` with a status CHECK constraint defining the `created → active → completed → abandoned` lifecycle
2. Creates `session_messages` with a role CHECK constraint (`system` | `interviewer` | `user`) and a `metadata` JSONB column for evaluation output, confidence scores, and token counts
3. Enables RLS on both tables
4. Adds 3 policies per table (6 total): SELECT, INSERT, UPDATE — each scoped to `auth.uid()`
5. Creates an `updated_at` trigger function + trigger on `sessions`

## Phase 1: Migration File

### Overview

Write the migration SQL file. This is the sole artifact — schema design, RLS, and trigger logic in one `.sql` file.

### Changes Required:

#### 1. Migration SQL

**File**: `supabase/migrations/20260626140000_create_sessions_and_messages.sql`

**Intent**: Create two tables with lifecycle constraints, RLS policies, and an auto-updating `updated_at` trigger. This is the first migration in the project — the file must be idempotent-safe (each `CREATE` guarded by `IF NOT EXISTS`) so re-running doesn't fail.

**Contract**:

```sql
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
```

### Success Criteria:

#### Automated:

- `supabase/migrations/` directory exists with exactly one `.sql` file
- SQL is syntactically valid (apply via Supabase dashboard SQL editor — no errors)

#### Manual:

- Tables appear in Supabase dashboard → Table Editor (`sessions`, `session_messages` with correct columns and constraints)
- RLS policies appear in Supabase dashboard → Authentication → Policies (6 policies listed across both tables)
- `auth.users` foreign key reference is confirmed (dashboard → Database → Relationships)

---

## Phase 2: Verification & Cloud Deployment

### Overview

Apply the migration to the cloud Supabase project and verify the schema, constraints, and RLS behavior work as designed.

### Changes Required:

#### 1. Apply migration

**Intent**: Push the migration SQL to the cloud project `igxikicoplbllvdibmha.supabase.co`. Two paths available — `npx supabase db push` (CLI-based) or copy-paste into the Supabase dashboard SQL editor (web-based). Since Docker isn't available for local dev, the dashboard SQL editor is the more reliable path.

**Contract**: Execute the migration SQL via Supabase dashboard → SQL Editor → paste full file content → Run. Confirm zero errors in the results panel.

#### 2. Verify RLS isolation

**Intent**: Confirm that user A cannot see user B's rows. With two test accounts (create them if needed), insert a session as user A, then query as user B — result should be empty.

**Contract**: Manual test steps:

1. Sign in as user A via the deployed app (`dev-slot.vercel.app/auth/signin`)
2. Open Supabase dashboard → SQL Editor → run as authenticated user A with their JWT:
   ```sql
   INSERT INTO sessions (user_id, status) VALUES (auth.uid(), 'created') RETURNING id;
   ```
3. Sign in as user B
4. Run `SELECT * FROM sessions;` as user B → should return 0 rows (user B can't see user A's session)

### Success Criteria:

#### Automated:

- `SELECT count(*) FROM sessions;` returns a number (table exists, queryable)
- `SELECT count(*) FROM session_messages;` returns 0 (table exists, empty)

#### Manual:

- Both tables visible in Supabase dashboard Table Editor
- RLS policies listed under Authentication → Policies
- Cross-user isolation confirmed: user B's `SELECT * FROM sessions` returns only user B's rows
- `updated_at` trigger verified: UPDATE a session row → `updated_at` > `created_at`

---

## Testing Strategy

### Unit Tests:

No application code changes — no unit tests to write. Schema testing is covered by the manual RLS verification in Phase 2.

### Integration Tests:

None in scope. The first integration test will come in S-01 (JD-to-challenge) when an API route creates a session row.

### Manual Testing Steps:

1. **Schema review:** Open Supabase dashboard → Table Editor → inspect `sessions` columns, types, defaults, and CHECK constraint
2. **RLS audit:** Open Supabase dashboard → Authentication → Policies → verify 6 policies (3 per table) with correct operation types and USING clauses
3. **Cascade test:** Create a session for user A → delete user A's account → confirm session rows are gone (requires a throwaway test account)
4. **Status constraint:** Attempt `INSERT INTO sessions (user_id, status) VALUES (auth.uid(), 'invalid');` → should fail with CHECK violation
5. **Trigger test:** Run `UPDATE sessions SET status = 'active';` on a test row, then verify `updated_at` > `created_at` (confirm the `update_updated_at_column()` trigger fires)

## Performance Considerations

- No performance concerns at MVP scale. The `session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid())` subquery in the RLS policies adds one indexed lookup per operation — negligible overhead.
- `ON DELETE CASCADE` on both foreign keys ensures no orphaned message rows.

## Migration Notes

- This is the **first** migration in the project. Future migrations will be numbered sequentially with later timestamps and must be applied in order.
- No data to migrate — the project is greenfield with zero application tables.
- If the migration is applied via dashboard SQL editor, the file in `supabase/migrations/` serves as documentation and source of truth; re-applying is safe due to `IF NOT EXISTS` / `DROP … IF EXISTS` guards.

## References

- Roadmap F-01: `context/foundation/roadmap.md` — session schema foundation
- PRD privacy NFR: `context/foundation/prd.md` — per-user data isolation requirement
- AGENTS.md: RLS + migration naming conventions
- Existing Supabase client: `src/lib/supabase.ts`
- Supabase SSR middleware: `src/middleware.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Migration File

#### Automated

- [x] 1.1 `supabase/migrations/` directory exists with one `.sql` file — 3cc436a
- [x] 1.2 SQL syntactically valid (zero errors on apply) — 3cc436a

#### Manual

- [x] 1.3 Tables `sessions` and `session_messages` visible in dashboard Table Editor with correct columns — 32b54a8
- [x] 1.4 RLS policies listed in dashboard (6 policies across both tables) — 32b54a8
- [x] 1.5 Foreign key relationship `sessions.user_id → auth.users.id` confirmed — 32b54a8

### Phase 2: Verification & Cloud Deployment

#### Automated

- [x] 2.1 `SELECT count(*) FROM sessions` returns a number (table exists, queryable) — 32b54a8
- [x] 2.2 `SELECT count(*) FROM session_messages` returns 0 (table exists, empty) — 32b54a8

#### Manual

- [x] 2.3 Both tables visible in Supabase dashboard Table Editor — 32b54a8
- [x] 2.4 RLS policies listed under Authentication → Policies — 32b54a8
- [x] 2.5 Cross-user isolation confirmed (user B can't see user A's rows) — 32b54a8
- [x] 2.6 Trigger verified (UPDATE session → updated_at > created_at) — 32b54a8
