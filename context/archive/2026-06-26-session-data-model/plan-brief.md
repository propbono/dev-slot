# Interview Session Schema — Plan Brief

> Full plan: `context/changes/session-data-model/plan.md`
> Roadmap: `context/foundation/roadmap.md` → F-01

## What & Why

Create the `sessions` and `session_messages` tables with row-level security — the first application schema in the project. This is the data layer foundation that every downstream DevSlot slice (challenge generation, adaptive follow-up, session history, performance metrics) builds on.

## Starting Point

Zero application tables exist. Auth is wired and tested (`src/middleware.ts`, Supabase SSR). The Supabase client is ready and deployed. The only missing piece is somewhere to store interview state.

## Desired End State

Two tables in the cloud Supabase project with granular RLS:

- `sessions` — lifecycle from `created` → `active` → `completed` / `abandoned`, owned per user
- `session_messages` — chronological transcript with roles (`system` | `interviewer` | `user`), AI evaluation metadata in JSONB, foreign-keyed to sessions

RLS prevents any user from seeing another user's interview data. Account deletion cascades cleanly.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Session lifecycle | created → active → completed → abandoned | Explicit creation state + abandoned for timeout detection; adds audit trail without complexity overhead. | Plan |
| Message roles | system \| interviewer \| user | Maps directly to the PRD's 3 logical actors — clean display filtering for transcripts. | Plan |
| Metadata column | JSONB with evaluation + confidence + tokens | Enables metrics (S-04) without a second schema migration; roadmap's "flexible JSONB" strategy. | Plan |
| RLS granularity | SELECT + INSERT + UPDATE per table (6 policies) | Matches AGENTS.md "per-operation, per-role" mandate exactly; prevents accidental deletes. | Plan |
| Migration deployment | Write SQL manually, apply via dashboard | Docker unavailable — no `db diff` or local Supabase; dashboard SQL editor is the reliable path. | Plan |

## Scope

**In scope:** `sessions` table, `session_messages` table, RLS policies, `updated_at` trigger, migration file  
**Out of scope:** Application code to create/read sessions (S-01+), indexes, seed data, local Supabase env

## Architecture / Approach

Single migration file (`supabase/migrations/20260626140000_create_sessions_and_messages.sql`), applied to cloud project `igxikicoplbllvdibmha.supabase.co`. Idempotent-safe (all `CREATE` guarded by `IF NOT EXISTS`). RLS binds to `auth.uid()` — the middleware-resolved user identity.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Migration File | `sessions` + `session_messages` SQL with RLS | Manual SQL errors — mitigated by validating syntax before applying |
| 2. Verification & Deployment | Tables live on cloud, RLS tested with two users | Cross-user isolation failure — caught by manual RLS verification step |

**Prerequisites:** Cloud Supabase project accessible ([supabase.com/dashboard](https://supabase.com/dashboard)), project ref `igxikicoplbllvdibmha`  
**Estimated effort:** ~1 session across 2 phases

## Open Risks & Assumptions

- Assumption: the cloud Supabase project's `auth` schema is functional and `auth.uid()` resolves correctly (verified during auth testing)
- Risk: manual SQL in the dashboard has no rollback — `DROP … IF EXISTS` guards mitigate, but incorrect DDL still needs manual fix

## Success Criteria (Summary)

- Both tables visible in Supabase dashboard with correct columns, constraints, and RLS policies
- Cross-user RLS verified: user A's session rows are invisible to user B
- Account deletion cascades to sessions and messages
