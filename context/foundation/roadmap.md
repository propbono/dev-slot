---
project: DevSlot
version: 2
status: draft
created: 2026-06-26
updated: 2026-07-01
prd_version: 1
main_goal: market-feedback
top_blocker: time
---

# Roadmap: DevSlot

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Senior engineers targeting staff roles use DevSlot to simulate live architecture interviews against their target job description. The product adapts to answer quality — escalating into adversarial pressure-testing after strong answers, diagnosing with foundational drills after weak ones. The adaptive follow-up is the product's differentiator — the one trait that, if removed, makes DevSlot indistinguishable from a generic prompt-and-answer tool.

## North star

**S-02: Adaptive follow-up** — user submits an architectural solution and receives one follow-up that meaningfully escalates or de-escalates based on answer quality. This is the smallest end-to-end slice whose successful delivery proves the core hypothesis: that the follow-up genuinely responds to the user's answer rather than feeling generic. It sits as early as Prerequisites allow because market-feedback here answers the only question that matters — "does this work?" — before any session review or metrics work is worth building.

## At a glance

| ID | Change ID | Outcome (user can …) | Prerequisites | PRD refs | Status |
|---|---|---|---|---|---|
| F-01 | session-data-model | (foundation) interview session schema landed; sessions + messages tables, RLS policies, migration file | — | NFR privacy | done |
| S-01 | jd-to-challenge | paste a job description and receive a tailored architecture challenge informed by the role | F-01 | US-01, FR-005, FR-007, FR-008, FR-009 | blocked |
| S-02 | adaptive-follow-up | submit an architectural solution and receive one adaptive follow-up that escalates or de-escalates based on answer quality | F-01, S-01 | US-01, FR-010, FR-011, FR-012, FR-013, FR-014 | blocked |
| S-03 | session-history | end a session, browse completed sessions, and review a full chronological transcript | F-01, S-01 | FR-003, FR-015, FR-016, FR-017 | proposed |
| S-04 | performance-metrics | view performance metrics and a categorized engineering breakdown for a completed session | F-01, S-01, S-02 | FR-018 | done |
| F-02 | challenges-data-model | (foundation) challenges table with summary column + challenge_id FK on session_messages | — | FR-027, FR-028 | proposed |
| S-05 | multi-turn-loop | submit answers and receive follow-up questions in a continuous turn-based loop with evaluative feedback | F-02, S-02 | US-02, FR-019, FR-020 | proposed |
| S-06 | auto-complete-summaries | challenge auto-completes after 2-3 consecutive strong answers with comprehensive summary | S-05 | US-02, FR-021, FR-022 | proposed |
| S-07 | new-challenge-from-stack | generate a new architecture challenge from the same JD/tech stack within a session | F-02, S-01, S-06 | US-02, FR-023, FR-024 | proposed |
| S-08 | vertical-challenge-tabs | multiple challenges displayed as vertical tabs within a session | F-02, S-07 | US-02, FR-025, FR-026 | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme | Chain | Note |
|---|---|---|---|
| A | Core loop | `F-01` → `S-01` → `S-02` → `S-04` | The critical path from data model through to the adaptive follow-up and its metrics. Contains the north star (S-02). Biased toward market-feedback: ship the differentiator as fast as Prerequisites allow. |
| B | Review loop | `S-03` | Runs parallel with S-02 after S-01 lands. Joins Stream A at S-01. Buildable in any order relative to S-02. |

## Baseline

What's already in place in the codebase as of 2026-06-26 (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 + React 19 + Tailwind CSS 4 + shadcn/ui (components.json, new-york style)
- **Backend / API:** present — Astro API routes (src/pages/api/auth/signin.ts, signout.ts, signup.ts), Supabase client (src/lib/supabase.ts)
- **Data:** partial — Supabase client wired but no tables/migrations exist
- **Auth:** present — Supabase SSR middleware (src/middleware.ts) with cookie-based sessions, email/password sign-up with auto-confirm, tested working, covers FR-001, FR-002
- **Deploy / infra:** present — Vercel connected (.vercel/project.json), GitHub CI (.github/workflows/ci.yml), production deployed at dev-slot.vercel.app
- **Observability:** absent — no logging or error tracking

## Foundations

### F-01: Interview session schema

- **Outcome:** (foundation) `sessions` and `session_messages` tables landed with per-user row-level security. Supabase migration file created. Every downstream slice gets a durable home for interview state.
- **Change ID:** session-data-model
- **PRD refs:** NFR privacy (per-user data isolation), FR-003 (history tied to account), FR-015 (session state persistence)
- **Unlocks:** S-01 (needs session row to create on JD paste), S-02 (needs message rows for challenge/answer/follow-up), S-03 (reads completed sessions and transcripts), S-04 (reads evaluated sessions for metrics)
- **Prerequisites:** — (auth is baseline present; Supabase client already wired)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Schema must accommodate both the structured session lifecycle and the unstructured AI message content without over-normalizing prematurely. Design for flexible `messages` (role + content + metadata JSONB) so the shape can evolve as the AI response format cements.
- **Status:** done

## Slices

### S-01: JD-to-challenge pipeline

- **Outcome:** user can paste a raw, unformatted job description, trigger tech stack extraction, and receive a generated architecture challenge informed by the target role.
- **Change ID:** jd-to-challenge
- **PRD refs:** US-01, FR-005, FR-007, FR-008, FR-009
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Optimal prompt engineering pattern for extracting interview constraints from unstructured JD text — Owner: user. Block: no (iterable during implementation).
  - Acceptable end-to-end latency window for challenge generation (LLM call + extraction) so the interaction feels responsive — Owner: user. Block: no.
- **Risk:** AI-generated challenges may feel generic or misread the role context despite accurate extraction. Mitigate by starting with a narrow prompt and testing against diverse real-world JDs before shipping.
- **Status:** done

### S-02: Adaptive follow-up (North star)

- **Outcome:** user can view an interview workspace with the generated challenge and a solution editor, type and submit an architectural design, see an active evaluation state, and receive one adaptive follow-up that escalates into adversarial pressure-testing for strong answers or de-escalates into foundational diagnosis for weak answers.
- **Change ID:** adaptive-follow-up
- **PRD refs:** US-01, FR-010, FR-011, FR-012, FR-013, FR-014
- **Prerequisites:** F-01, S-01
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:**
  - Evaluation heuristic: what signal reliably distinguishes strong from weak architectural answers from a single open-ended response — Owner: user. Block: no (ship with best-guess heuristic; market-feedback validates it).
  - Follow-up prompt architecture: how to generate a contextual counter-challenge vs diagnostic drill from the same evaluation model — Owner: user. Block: no.
- **Risk:** The adaptive branching is the product's differentiator — if follow-ups feel random or disconnected from the user's answer, the product has no value. This is the highest-risk slice and the reason it is the north star. Mitigate by testing against varied answer quality (deliberately weak, deliberately strong) before considering the slice done.
- **Status:** done

### S-03: Session history

- **Outcome:** user can manually end an active interview session, browse a list of their completed sessions, and open a full chronological transcript showing every challenge, answer, and follow-up exchanged.
- **Change ID:** session-history
- **PRD refs:** FR-003, FR-015, FR-016, FR-017
- **Prerequisites:** F-01, S-01
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The transcript view must handle variable-length AI responses gracefully (some challenges/follow-ups may be long). Use scrollable prose containers rather than fixed-height panels to avoid truncation.
- **Status:** done

### S-04: Performance metrics

- **Outcome:** user can view high-level performance metrics and a categorized engineering breakdown (e.g., scalability, data modeling, failure domains) for any completed session.
- **Change ID:** performance-metrics
- **PRD refs:** FR-018
- **Prerequisites:** F-01, S-01, S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Metric categories: which engineering dimensions to surface (scalability, data modeling, fault tolerance, tradeoff reasoning, etc.) — Owner: user. Block: no (start with 3-4 categories from S-02's evaluation, expand based on feedback).
  - Visualization approach: numeric scores vs qualitative breakdown vs both — Owner: user. Block: no.
- **Risk:** Categorized scoring risks false precision if evaluation quality is still immature at this point. The PRD itself flags this tension. Mitigate by framing metrics as a "reflection aid" rather than an authoritative score, with qualitative labels over numeric precision.
- **Status:** done

### F-02: Challenges data model

- **Outcome:** (foundation) `challenges` table with session_id, status, summary JSONB landed. Migration adds `challenge_id` FK to session_messages.
- **Change ID:** challenges-data-model
- **PRD refs:** FR-027, FR-028
- **Unlocks:** S-05 (needs challenge_id on messages), S-07 (needs challenges table), S-08 (needs challenge rows for tabs)
- **Prerequisites:** — (sessions table exists from F-01)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Adding a NOT NULL FK to session_messages — existing rows need a default challenge. Mitigate by creating a default challenge row per session during migration.
- **Status:** done

### S-05: Multi-turn loop

- **Outcome:** user can submit answers and receive follow-up questions in a continuous turn-based loop, with the interviewer providing specific feedback on weak points and strengths.
- **Change ID:** multi-turn-loop
- **PRD refs:** US-02, FR-019, FR-020
- **Prerequisites:** F-02, S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The evaluation loop must not create a tight coupling between frontend polling and backend state. Use the existing evaluate.ts pattern — POST answer → evaluate → redirect → page shows new thread.
- **Status:** done

### S-06: Auto-complete + summaries

- **Outcome:** challenge auto-completes after 2-3 consecutive strong evaluations, with a comprehensive summary including quality, confidence, strengths, and improvement areas.
- **Change ID:** auto-complete-summaries
- **PRD refs:** US-02, FR-021, FR-022
- **Prerequisites:** S-05
- **Parallel with:** S-07
- **Blockers:** —
- **Unknowns:**
  - Summary prompt engineering — how to synthesize a full conversation into strengths/improvement areas via a single LLM call — Owner: user. Block: no.
- **Risk:** The auto-complete threshold (2-3 strong answers) may trigger too early or too late depending on evaluation accuracy. Mitigate with a configurable threshold.
- **Status:** done

### S-07: New challenges from same stack

- **Outcome:** user can generate a new architecture challenge from the same JD/tech stack, with the new challenge substantively different from previous challenges in the session.
- **Change ID:** new-challenge-from-stack
- **PRD refs:** US-02, FR-023, FR-024
- **Prerequisites:** F-02, S-01, S-06
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - "Substantively different" heuristic — how to ensure the new challenge doesn't feel repetitive — Owner: user. Block: no.
- **Risk:** New challenges may drift too far from the original JD intent. Mitigate by keeping the same constraints and role context in the prompt.
- **Status:** done

### S-08: Vertical challenge tabs

- **Outcome:** multiple challenges within a session are displayed as vertical tabs, each showing that challenge's full conversation thread. User can switch between challenges.
- **Change ID:** vertical-challenge-tabs
- **PRD refs:** US-02, FR-025, FR-026
- **Prerequisites:** F-02, S-07
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Multiple challenges on one page increase page weight. Mitigate with lazy loading — only render the active tab's thread.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID | Suggested issue title | Ready for `/10x-plan` | Notes |
|---|---|---|---|---|
| F-01 | session-data-model | Create interview sessions schema with RLS | yes | Done |
| S-01 | jd-to-challenge | JD input → challenge generation pipeline | yes | Done |
| S-02 | adaptive-follow-up | Adaptive follow-up — evaluation + branching | yes | Done |
| S-03 | session-history | Session history — list, end, transcript review | yes | Done |
| S-04 | performance-metrics | Performance metrics and engineering breakdown | yes | Done |
| F-02 | challenges-data-model | Create challenges table with FK | yes | Done |
| S-05 | multi-turn-loop | Continuous turn-based interview loop | yes | Done |
| S-06 | auto-complete-summaries | Auto-complete after strong answers | yes | Done |
| S-07 | new-challenge-from-stack | New challenge from same JD/stack | yes | Done |
| S-08 | vertical-challenge-tabs | Vertical challenge tabs in session page | no | Depends on S-07 |

## Open Roadmap Questions

1. **Summary prompt engineering for multi-turn conversations** — Owner: user. Block: S-06. How to synthesize a full conversation into strengths and improvement areas via a single LLM call.
2. **"Substantively different" challenge heuristic** — Owner: user. Block: S-07. How to ensure new challenges from the same stack don't feel repetitive.

## Parked

- **Mobile-native app:** — PRD §Non-Goals.
- **Admin, billing, subscriptions:** — PRD §Non-Goals.
- **Ultra-low-latency streaming responses:** — PRD §Non-Goals.
- **At-scale concerns from shape-notes:** At 100x scale, the branching rule may need asynchronous or streamed evaluation paths and routing by domain/difficulty tier. Explicitly deferred — no scaling pressure at MVP size.

## Done

- **S-07: generate a new architecture challenge from the same JD/tech stack within a session** — Archived 2026-07-01 → `context/archive/2026-07-01-new-challenge-from-stack/`. Lesson: —.

- **S-06: challenge auto-completes after 2-3 consecutive strong answers with comprehensive summary** — Archived 2026-07-01 → `context/archive/2026-07-01-auto-complete-summaries/`. Lesson: —.

- **S-05: submit answers and receive follow-up questions in a continuous turn-based loop with evaluative feedback** — Archived 2026-07-01 → `context/archive/2026-07-01-multi-turn-loop/`. Lesson: —.

- **F-02: (foundation) challenges table with summary column + challenge_id FK on session_messages** — Archived 2026-07-01 → `context/archive/2026-07-01-challenges-data-model/`. Lesson: —.

- **S-04: view performance metrics and a categorized engineering breakdown for a completed session** — Archived 2026-07-01 → `context/archive/2026-07-01-performance-metrics/`. Lesson: —.

- **S-03: end a session, browse completed sessions, and review a full chronological transcript** — Archived 2026-07-01 → `context/archive/2026-07-01-session-history/`. Lesson: —.

- **S-02: submit an architectural solution and receive one adaptive follow-up that escalates or de-escalates based on answer quality** — Archived 2026-06-28 → `context/archive/2026-06-26-adaptive-follow-up/`. Lesson: —.

- **S-01: paste a job description and receive a tailored architecture challenge informed by the role** — Archived 2026-06-28 → `context/archive/2026-06-26-jd-to-challenge/`. Lesson: —.

- **F-01: (foundation) interview session schema landed; sessions + messages tables, RLS policies, migration file** — Archived 2026-06-28 → `context/archive/2026-06-26-session-data-model/`. Lesson: —.
