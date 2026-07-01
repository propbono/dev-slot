# JD Streaming — Implementation Plan

## Overview

Fix the "feels broken" wait during challenge generation by splitting the generate API into two endpoints (session creation + background generation), removing the 404-on-empty-session from the session page, and adding a loading skeleton with stage progress that polls for the challenge. Redirect happens immediately after session creation — the user sees the session page within ~200ms instead of 6-10s.

## Current State Analysis

- **Blocking POST:** `src/pages/api/interview/generate.ts` creates a session then runs both LLM calls (6-10s) before `context.redirect()` fires
- **404 on empty sessions:** `src/pages/interview/[sessionId].astro:22-27` returns `"Session not found or access denied"` when a session has zero messages — even though the session row exists in Supabase
- **JDInput spinner:** `src/components/interview/JDInput.tsx:53` shows a single static "Generating challenge..." message — no stage indicator
- **Vercel serverless constraint:** no persistent background processes — the POST handler can't redirect and continue work
- **Vercel AI SDK installed:** `ai` v7 with `generateText()` — already used for LLM calls
- **React islands exist:** `client:load` pattern used for `JDInput` and `AnswerEditor`

### Key Discoveries:

- The session page 404 check (`!messages || messages.length === 0`) was written before streaming was considered — it treats "no messages" as "not authorized" when it should treat it as "not ready yet"
- The generate API creates the session row early (line 23-28) but holds the redirect until the LLM completes (line 48) — the infrastructure for early redirect already exists
- Vercel serverless can't do "redirect and keep working" — the solution must split creation from generation

## Desired End State

User pastes a JD → submits → within ~200ms, the browser redirects to `/interview/<uuid>` where a loading skeleton shows "Creating your interview..." with a stage indicator. The challenge appears in-place when ready. No 404 for valid sessions. No blank wait on the dashboard.

**Verification:** submit a JD → see the session page immediately with a skeleton → challenge appears within 6-10s → full session page (thread view + editor) renders normally.

## What We're NOT Doing

- No SSE or WebSocket — polling is sufficient for a 6-10s generation window
- No `streamText()` migration — `generateText()` works, polling hides the latency
- No changes to the JDInput component — the user moves off that page before the LLM runs
- No background jobs or queue system — Vercel serverless can't support it
- No changes to the evaluation pipeline (S-02) — this is generation-only

## Implementation Approach

Two phases, top-to-bottom: API split (endpoint changes), session page upgrade (UI changes).

The generate flow splits into two endpoints:
1. `POST /api/interview/create` — validates auth + JD, creates session, **redirects immediately**
2. `GET /api/interview/generate?sessionId=X` — fetches the JD from the session row, runs extraction + challenge generation, saves messages, updates session status

The session page loads with a skeleton React island that polls the generate endpoint. When generation completes, the page refreshes (or the island re-renders) with the full content.

The JD text is stored in the session row so the generation endpoint can access it without the original form POST. This requires adding a `jd_text` column to the sessions table (or storing it as a system message immediately).

## Phase 1: API Split

### Overview

Create the POST creation endpoint and the GET generation endpoint. Store the JD text alongside the session so the background generation can access it.

### Changes Required:

#### 1. JD storage on session creation

**File**: `src/pages/api/interview/create.ts`

**Intent**: New endpoint. Validates auth and JD length (≥50 chars), creates the session row, stores the JD text as the first system-level message (or in a new column), and redirects immediately to `/interview/<uuid>`. No LLM calls — this endpoint completes in under 200ms.

**Contract**: POST handler. Same auth + validation as the current `generate.ts`. Creates session with status `created`. Saves the raw JD text as a message with role `system` and content `JSON.stringify({ raw_jd: jdText, status: "pending" })`. Redirects to `/interview/<sessionId>`.

#### 2. JD storage migration (if using a new column)

**File**: `supabase/migrations/<timestamp>_add_jd_text_to_sessions.sql`

**Intent**: Add a nullable `jd_text` column to the sessions table so the generation endpoint can access the original JD without parsing system messages.

**Contract**: `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS jd_text text;`

#### 3. Background generation endpoint

**File**: `src/pages/api/interview/generate.ts`

**Intent**: Rewrite the existing endpoint. Now receives a GET request with `?sessionId=X`. Validates the session exists and belongs to the user. If generation hasn't started yet (no interviewer messages), runs the two-step LLM pipeline. Saves messages and updates session status to `active`. Returns JSON: `{ ready: true }` on completion or `{ ready: false }` if still generating.

On error: returns `{ ready: false, error: "generation_failed" }`.

**Contract**: GET handler (or keep POST but called via fetch from the client). Fetches the JD text from the session (new column or system message). Extracts constraints → generates challenge → saves messages → updates status. Returns JSON. The `generateText()` call inside is still blocking — the client polls until it completes.

### Success Criteria:

#### Automated:

- `npm run build` passes
- `npm run lint` passes
- `create.ts` exists + redirects on valid JD
- `generate.ts` updated with GET handler + returns JSON
- Migration file exists (if adding column)

#### Manual:

- POST JD → redirected to `/interview/<uuid>` within 1 second
- Session row visible in Supabase with status `created` + JD text
- Call generate endpoint → challenge appears in Supabase messages, session becomes `active`
- Generate endpoint returns `{ ready: false }` while LLM is running
- Cross-user: another user calling generate for a different session → returns error

---

## Phase 2: Session Page — Loading State

### Overview

Upgrade `[sessionId].astro` to handle the empty/initializing state. Replace the `"Session not found or access denied"` 404 with a loading skeleton that polls the generate endpoint. Show the full session page when messages are ready.

### Changes Required:

#### 1. Session page — remove the 404, add polling

**File**: `src/pages/interview/[sessionId].astro`

**Intent**: Replace the `if (!messages || messages.length === 0)` 404 check with a loading state. If the session has zero committed interviewer messages, render a loading skeleton instead of a 404. If messages exist, render the existing thread view + editor.

**Contract**:
- Fetch session messages with `status = 'committed'` as before
- If `messages.length === 0` → render the `GenerationSkeleton` component (new) instead of 404
- If messages exist → render `MessageThread` + `AnswerEditor` as before
- Pass `sessionId` to the skeleton so it can poll
- Periodically trigger a page reload (or React island re-render) when generation completes

#### 2. Loading skeleton component

**File**: `src/components/interview/GenerationSkeleton.tsx`

**Intent**: React island that shows a skeleton card with a stage progress indicator. Polls `GET /api/interview/generate?sessionId=X` every 2 seconds. Shows stage transitions: "Creating session..." → "Analyzing job description..." → "Crafting your challenge...". When the API returns `{ ready: true }`, triggers a page reload to show the full session.

On error: shows "Generation failed. Return to dashboard and try again." with a link to `/dashboard`.

**Contract**:
- Props: `sessionId: string`
- State: `stage` (string), `error` (string | null)
- Polls every 2 seconds with `setInterval`
- On mount: sets stage to "Creating your interview..."
- Stage transitions driven by polling responses (or simulated with timeouts as fallback)
- On `{ ready: true }` → `window.location.reload()`
- On error → renders error card with link to `/dashboard`

### Success Criteria:

#### Automated:

- `npm run build` passes
- `npm run lint` passes
- `GenerationSkeleton.tsx` exists
- `[sessionId].astro` no longer returns 404 for empty sessions

#### Manual:

- Submit JD → redirected to session page → skeleton visible → challenge appears → page loads normally
- Skeleton shows at least 2 stage transitions before the challenge arrives
- Empty session page (after create, before generate) shows skeleton, not 404
- Generate endpoint fails → skeleton shows error card with dashboard link
- Existing sessions with messages still render the full thread view (no regression)

---

## Testing Strategy

### Manual Testing Steps:

1. **Happy path:** Submit JD → redirect to session page (< 1s) → see skeleton → wait → challenge appears → thread + editor load
2. **Empty session:** Visit `/interview/<valid-session-id-with-no-messages>` → skeleton, not 404
3. **Existing session:** Visit a session with messages → full thread view + editor (no regression)
4. **Generation failure:** Force generate error (bad key) → skeleton shows error → link back to dashboard works
5. **Cross-user:** User B visits user A's session → 404 (unchanged behavior — no messages due to RLS)

## Performance Considerations

- **Creation endpoint latency:** < 200ms (session INSERT + redirect) — no LLM calls
- **Generation endpoint latency:** 6-10s (same as current, but user isn't waiting on the dashboard)
- **Polling frequency:** 2s interval, ~5 calls per generation — negligible load
- **Page reload:** Full reload on completion — in future, could swap skeleton for content in-place without reload

## Migration Notes

- If using `jd_text` column: migration adds nullable column, existing sessions get NULL — no data migration needed
- If storing JD as a system message: existing sessions already have the JD in their system messages — no migration needed
- `generate.ts` API route changes from POST → GET (or stays POST but adds GET). No breaking change to any existing caller (only called by the new polling component)

## References

- Frame brief: `context/changes/jd-streaming/frame.md`
- Current generate API: `src/pages/api/interview/generate.ts`
- Current session page: `src/pages/interview/[sessionId].astro`
- Existing polling pattern: `AnswerEditor.tsx` (auto-save uses fetch + FormData)
- Vercel AI SDK: `src/lib/ai.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: API Split

#### Automated

- [x] 1.1 `npm run build` passes — cfdf60d
- [x] 1.2 `npm run lint` passes — cfdf60d
- [x] 1.3 `create.ts` exists with POST handler — cfdf60d
- [x] 1.4 `generate.ts` updated with background generation — cfdf60d

#### Manual

- [x] 1.5 POST JD → redirect to `/interview/<uuid>` within 1s
- [x] 1.6 Session row with JD text in Supabase
- [x] 1.7 Generate endpoint produces challenge + updates session to `active`
- [x] 1.8 Cross-user: generate returns error for another user's session

### Phase 2: Session Page — Loading State

#### Automated

- [x] 2.1 `npm run build` passes
- [x] 2.2 `npm run lint` passes
- [x] 2.3 `GenerationSkeleton.tsx` exists
- [x] 2.4 `[sessionId].astro` no longer returns 404 for empty sessions

#### Manual

- [ ] 2.5 Submit JD → skeleton → challenge appears → page reloads
- [ ] 2.6 Skeleton shows stage transitions
- [ ] 2.7 Empty session shows skeleton, not 404
- [ ] 2.8 Error card with dashboard link on generation failure
- [ ] 2.9 Existing sessions still render full thread (no regression)
