# Adaptive Follow-Up — Implementation Plan

## Overview

Upgrade the interview session page with a markdown answer editor, add a DeepSeek-powered evaluation pipeline that judges answer quality against the session's role constraints, and generate one adaptive follow-up that escalates (adversarial pressure-test for strong answers) or de-escalates (foundational diagnosis for weak answers). This is roadmap slice **S-02** — the north star, the product's core differentiator.

## Current State Analysis

- **Session page exists:** `/interview/[sessionId].astro` displays the challenge via `ChallengeDisplay.astro` with a "Coming next" placeholder
- **AI service:** `src/lib/ai.ts` has `extractConstraints()` + `generateChallenge()` — needs a new `evaluateAnswer()` function
- **API route pattern:** `src/pages/api/interview/generate.ts` — the evaluation endpoint follows the same conventions
- **Supabase:** `sessions` + `session_messages` tables with RLS; metadata JSONB column ready for evaluation data
- **DeepSeek V4:** wired via `@ai-sdk/deepseek`, working from S-01
- **No draft persistence:** `session_messages` has no deduplication between draft and submitted states — messages are always committed
- **No markdown rendering** — existing components use plain text or prose

### Key Discoveries:

- System message (role: `system`) stores extraction as `JSON.stringify(constraints)` — the evaluation prompt can reuse this as evaluation criteria
- Interviewer messages (role: `interviewer`) store the challenge — the evaluation prompt gets the full context chain
- Session lifecycle has `active` state after challenge generation — ideal for the answer → evaluation → follow-up loop
- React islands already used (`JDInput.tsx` with `client:load`) — answer editor follows the same pattern

## Desired End State

A signed-in user visits `/interview/<sessionId>`, sees the original challenge, a markdown answer editor below it, types their architectural solution (with live preview toggle), and submits. The system:
1. Posts the answer to the evaluation API
2. Evaluates answer quality (strong vs weak) based on coverage of role-relevant constraints
3. Generates one adaptive follow-up — escalating for strong answers, diagnosing for weak answers
4. Persists the answer + evaluation metadata + follow-up as session messages
5. Re-renders the page with the full conversation thread: challenge → user answer → follow-up
6. Re-shows the answer editor for the user to respond to the follow-up (session stays active)

Drafts auto-save every few seconds while the user types, persisting across browser refreshes.

Error handling: retry evaluation up to 3 times on failure. If all retries fail, save the session as-is and redirect to dashboard with a "session saved" notice.

**Verification:** submit a deliberately weak answer → receive a foundational diagnostic follow-up. Submit a strong, comprehensive answer → receive an adversarial pressure-test follow-up.

## What We're NOT Doing

- No multi-turn trees beyond responding to the follow-up — session stays active but PRD gates at ≥1 follow-up
- No streaming evaluation or follow-up generation — `generateText()` like S-01
- No performance scoring or metrics — that's S-04
- No session history UI — that's S-03
- No real-time collaboration or WebSocket — single-user, request-response

## Implementation Approach

Three phases: foundation (schema + editor), pipeline (evaluation + follow-up), and integration (session page + error handling).

Single LLM call for evaluation + follow-up generation combined. The prompt receives the full context chain (JD extraction, challenge, user answer) and returns both the quality assessment and the follow-up in one structured response.

Evaluation metadata stored on the answer message row: `{ quality, confidence, rationale }`. Follow-up stored as a new interviewer message. Session stays `active` — user can respond to the follow-up.

Draft persistence: session_messages gets a `status` column (`draft` | `committed`). Drafts auto-save via a debounced API call. On page load, the latest draft (if any) pre-fills the editor. On submit, the draft is flipped to committed + evaluation data is merged.

## Phase 1: Foundation — Schema & Answer Editor

### Overview

Add a `status` column to `session_messages` for draft tracking, and build the markdown answer editor React island with live preview toggle and auto-save. The editor replaces the "coming next" placeholder on the session page.

### Changes Required:

#### 1. Migration — add status column

**File**: `supabase/migrations/<timestamp>_add_message_status.sql`

**Intent**: Add a `status` column to `session_messages` to distinguish drafts from committed messages. Default `committed` for existing rows. CHECK constraint limits to `draft | committed`.

**Contract**: 
```sql
ALTER TABLE session_messages 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'committed' 
CHECK (status IN ('draft', 'committed'));
```

#### 2. Markdown editor component

**File**: `src/components/interview/AnswerEditor.tsx`

**Intent**: Large textarea with a toggle between edit (monospace textarea) and preview (rendered markdown). Submits to evaluation API. Auto-saves drafts via debounced fetch to a draft endpoint. Client-side validation: minimum 20 characters.

**Contract**:
- Props: `sessionId: string`, `initialDraft?: string`
- State: `content` (string), `mode` ("edit" | "preview"), `submitting` (boolean)
- Renders: textarea in edit mode, `react-markdown` in preview mode, toggle button, submit button
- Auto-save: every 3 seconds while user is typing and `content.length > 0`, POST to `/api/interview/draft` with `{ sessionId, content }`
- Submit: POST to `/api/interview/evaluate` with `{ sessionId, answer: content }` via form
- Markdown preview: basic GFM (headings, lists, code blocks, bold/italic)
- Minimum 20 characters to enable submit
- Matches cosmic theme (dark bg, purple accents)

#### 3. Install react-markdown

**File**: `package.json`

**Intent**: Add `react-markdown` for the preview pane of the editor.

**Contract**: `npm install react-markdown`

#### 4. Draft API route

**File**: `src/pages/api/interview/draft.ts`

**Intent**: Upsert a draft message for the current session. If a draft already exists, update its content. Auth-guarded. Returns `{ ok: true }` or error.

**Contract**: POST handler, reads `{ sessionId, content }` from form data. Upserts into `session_messages` where `session_id = sessionId AND role = 'user' AND status = 'draft'`. On conflict (session_id + role + status unique), updates content. Validate session belongs to user before upsert (query sessions table).

### Success Criteria:

#### Automated:

- Migration file exists in `supabase/migrations/`
- `npm run build` passes
- `npm run lint` passes
- `AnswerEditor.tsx` exists
- `react-markdown` installed in package.json
- `draft.ts` API route exists

#### Manual:

- Migration applied to cloud Supabase — `status` column visible on `session_messages`
- Editor renders on session page with edit/preview toggle
- Auto-save creates a draft row in session_messages (visible in dashboard)
- Draft survives page refresh (re-populates editor on reload)
- Submit button disabled at < 20 chars

---

## Phase 2: Evaluation Pipeline

### Overview

Create the evaluation AI function and the API route that orchestrates answer evaluation + follow-up generation. Single LLM call combining both steps. The API persists the answer (with evaluation metadata) and the follow-up (as interviewer message).

### Changes Required:

#### 1. Evaluation AI function

**File**: `src/lib/ai.ts` (add to existing)

**Intent**: Add `evaluateAnswer()` that takes the session context (JD constraints, challenge, user answer) and returns both the quality assessment and a tailored follow-up. Single DeepSeek call with structured output.

**Contract**:

```ts
export interface EvaluationResult {
  quality: "strong" | "weak";
  confidence: number; // 0-1
  rationale: string;
  followUp: string;
}

export async function evaluateAnswer(
  constraints: JDConstraints,
  challenge: string,
  answer: string,
): Promise<EvaluationResult>
```

The function constructs a prompt that includes:
- The role context: "You evaluated a {role_level} engineer for a {domain} role with tech stack {tech_stack}"
- The challenge text
- The user's submitted answer
- Instructions: "Evaluate whether the answer demonstrates coverage of the role-relevant constraints. Then generate one follow-up question: if the answer is strong, escalate into an adversarial pressure-test; if weak, de-escalate into a foundational diagnostic. Return JSON: {\"quality\": \"strong\"|\"weak\", \"confidence\": <0-1>, \"rationale\": \"...\", \"followUp\": \"...\"}"

Uses the same markdown fence stripping pattern as `extractConstraints()`.

#### 2. Evaluation API route

**File**: `src/pages/api/interview/evaluate.ts`

**Intent**: POST handler that receives the user's answer. Validates auth + session ownership. Flips the draft message to committed. Runs evaluation + follow-up generation. Persists answer (with metadata) and follow-up messages. Returns redirect to the session page.

Error handling: 3 retries with 1s delay between. If all retries fail, redirect to `/dashboard?error=evaluation_failed`.

**Contract**:
- POST: reads `{ sessionId, answer }` from form data
- Auth guard + session ownership check (user must own the session)
- Fetch draft message → update status to `committed`
- If no draft: insert new committed user message
- Fetch system message (constraints) + interviewer message (challenge) for context
- Call `evaluateAnswer(constraints, challenge, answer)` with retry loop (max 3)
- Update user message metadata with `{ quality, confidence, rationale }`
- Insert interviewer message (role: `interviewer`, content: `followUp`)
- Redirect to `/interview/<sessionId>` (page re-renders with full thread)

### Success Criteria:

#### Automated:

- `npm run build` passes
- `npm run lint` passes
- `evaluateAnswer()` exported from `src/lib/ai.ts`
- `evaluate.ts` API route exists

#### Manual:

- Submit a short, surface-level answer → receives a foundational diagnostic follow-up
- Submit a comprehensive answer covering constraints → receives an adversarial pressure-test follow-up
- Evaluation metadata (quality, confidence, rationale) stored on the user message in Supabase
- Retry: force a failure (e.g., bad API key) → retries 3 times → redirects with error

---

## Phase 3: Session Page — Thread View & Full Flow

### Overview

Upgrade the session page from a single challenge display to a full conversation thread showing: challenge → answer(s) → follow-up(s). The answer editor appears below the thread when the session is active and no follow-up is pending. Error states for evaluation failures. Draft restoration on page load.

### Changes Required:

#### 1. Session page upgrade

**File**: `src/pages/interview/[sessionId].astro`

**Intent**: Rewrite to fetch all messages for the session and render them as a chronological thread. The challenge + any answers + any follow-ups appear in order. The answer editor renders below the thread when the session is `active` and the latest message is not a user-submitted answer awaiting evaluation (i.e., no "pending evaluation" state — evaluation is synchronous in the POST, so the page always shows the complete state after redirect).

**Contract**:
- Fetch session + all messages with `status = 'committed'` (skip drafts) ordered by `created_at`
- Render each message based on role:
  - `interviewer`: challenge/follow-up card (reuse `ChallengeDisplay.astro` concept — rename/generalize or add a variant)
  - `user`: answer card with quality badge (strong/green, weak/amber) + rationale tooltip
  - `system`: hidden (not displayed to user)
- If no answers yet: show only the challenge + the editor
- If answers + follow-ups exist: show full thread + editor below
- "New Session" link at the bottom (always present, even during active session)
- Auth guard: redirect to sign-in if no user
- Session ownership: if RLS blocks the query (no messages returned), show "Session not found"

#### 2. Thread components

**File**: `src/components/interview/MessageThread.astro`

**Intent**: Astro component that renders an array of messages as a chronological vertical thread. Each message gets role-appropriate styling.

**File**: `src/components/interview/AnswerCard.astro`

**Intent**: Displays a user-submitted answer with the quality badge and a truncated rationale. Props: `answer: string`, `quality?: string`, `confidence?: number`, `rationale?: string`.

### Success Criteria:

#### Automated:

- `npm run build` passes
- `npm run lint` passes
- `MessageThread.astro` exists
- `AnswerCard.astro` exists

#### Manual:

- Full flow: challenge → type answer → submit → evaluation → follow-up appears in thread → editor re-appears
- Quality badge visible on user's answer card (strong/green or weak/amber)
- Auto-save: type in editor → refresh page → draft restored
- Submitting clears the draft and commits the message
- Force evaluation failure (bad key) → retries 3 times → redirect to dashboard with error

---

## Testing Strategy

### Unit Tests:

None in scope — no test framework configured.

### Integration Tests:

None in scope.

### Manual Testing Steps:

1. **Weak answer:** Submit "Upgrade the CI server to handle more load" for a Staff-level distributed systems JD → expect a foundational diagnostic follow-up about monitoring, observability, or incident response
2. **Strong answer:** Submit a comprehensive answer covering data modeling, scaling, failure domains, and tradeoffs → expect an adversarial follow-up about edge cases or failure scenarios
3. **Draft persistence:** Type half an answer → refresh the page → draft is restored in the editor
4. **Multi-turn:** Submit answer → get follow-up → submit response to follow-up → second follow-up generated (session stays active)
5. **Cross-user:** User B cannot access user A's session or submit answers to it
6. **Retry logic:** Temporarily use invalid API key → submit → observe 3 retries with delay → redirect with error

## Performance Considerations

- **Evaluation latency:** Single LLM call (~3-5s for DeepSeek). User sees a loading spinner on submit. With 3 retries, worst case is ~15s.
- **Draft auto-save:** Debounced to 3s, lightweight upsert — negligible DB load.
- **Markdown rendering:** Client-side only, no server-side rendering needed — `react-markdown` is ~30KB gzipped.
- **No streaming:** Acceptable per PRD §Non-Goals.

## Migration Notes

- Migration adds `status` column to `session_messages` with default `'committed'` — existing rows unchanged, zero-downtime.
- No schema changes to `sessions` table.

## References

- Roadmap S-02: `context/foundation/roadmap.md` — Adaptive follow-up (north star)
- S-01 implementation: `context/changes/jd-to-challenge/plan.md`
- Existing AI service: `src/lib/ai.ts`
- Existing session page: `src/pages/interview/[sessionId].astro`
- Existing Supabase migration: `supabase/migrations/20260626140000_create_sessions_and_messages.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Foundation — Schema & Answer Editor

#### Automated

- [x] 1.1 Migration file exists in `supabase/migrations/`
- [x] 1.2 `npm run build` passes
- [x] 1.3 `npm run lint` passes
- [x] 1.4 `AnswerEditor.tsx` exists
- [x] 1.5 `react-markdown` installed in package.json
- [x] 1.6 `draft.ts` API route exists

#### Manual

- [x] 1.7 Migration applied to cloud Supabase — `status` column visible
- [x] 1.8 Editor renders on session page with edit/preview toggle
- [x] 1.9 Auto-save creates a draft row visible in Supabase dashboard
- [x] 1.10 Draft survives page refresh

### Phase 2: Evaluation Pipeline

#### Automated

- [ ] 2.1 `npm run build` passes
- [ ] 2.2 `npm run lint` passes
- [ ] 2.3 `evaluateAnswer()` exported from `src/lib/ai.ts`
- [ ] 2.4 `evaluate.ts` API route exists

#### Manual

- [ ] 2.5 Weak answer → foundational diagnostic follow-up
- [ ] 2.6 Strong answer → adversarial pressure-test follow-up
- [ ] 2.7 Evaluation metadata stored on user message in Supabase
- [ ] 2.8 Retry logic: 3 attempts on failure → redirect with error

### Phase 3: Session Page — Thread View & Full Flow

#### Automated

- [ ] 3.1 `npm run build` passes
- [ ] 3.2 `npm run lint` passes
- [ ] 3.3 `MessageThread.astro` exists
- [ ] 3.4 `AnswerCard.astro` exists

#### Manual

- [ ] 3.5 Full flow: challenge → answer → evaluation → follow-up in thread
- [ ] 3.6 Quality badge on answer card (strong/green or weak/amber)
- [ ] 3.7 Draft restoration on page reload
- [ ] 3.8 Submit clears draft + commits message
- [ ] 3.9 Error retry → redirect to dashboard
- [ ] 3.10 Cross-user RLS: user B blocked
