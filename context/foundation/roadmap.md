---
project: DevSlot
version: 1
status: draft
created: 2026-06-26
updated: 2026-06-28
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
| S-04 | performance-metrics | view performance metrics and a categorized engineering breakdown for a completed session | F-01, S-01, S-02 | FR-018 | proposed |

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
- **Status:** proposed

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
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID | Suggested issue title | Ready for `/10x-plan` | Notes |
|---|---|---|---|---|
| F-01 | session-data-model | Create interview sessions schema with RLS | yes | No blockers; run `/10x-plan session-data-model` |
| S-01 | jd-to-challenge | JD input → challenge generation pipeline | no | Blocked by Open Roadmap Q#1 (LLM provider) |
| S-02 | adaptive-follow-up | Adaptive follow-up — evaluation + branching | no | Blocked by Open Roadmap Q#1; depends on S-01 |
| S-03 | session-history | Session history — list, end, transcript review | no | Depends on S-01 landing first |
| S-04 | performance-metrics | Performance metrics and engineering breakdown | no | Depends on S-01 + S-02 |

## Open Roadmap Questions

1. **Which LLM provider and model for challenge generation, evaluation, and adaptive follow-up?** — Owner: user. Block: S-01, S-02. The AI pipeline (JD extraction, challenge generation, answer evaluation, follow-up branching) touches both blocked slices. Provider choice affects latency budget, prompt engineering approach, and integration architecture. Resolving this unblocks 2 slices.

## Parked

- **FR-004 (JD vs tech stack mode choice):** — Parked because main goal is market-feedback on the core loop; mode-switching UI adds setup complexity without changing the validation signal.
- **FR-006 (explicit technical tags):** — Parked for same reason as FR-004; JD-to-challenge extraction (FR-007 in S-01) provides sufficient input for the MVP.
- **Multi-turn interview trees beyond the first adaptive follow-up:** — PRD §Non-Goals explicitly defers this past MVP.
- **Mobile-native app:** — PRD §Non-Goals.
- **Admin, billing, subscriptions:** — PRD §Non-Goals.
- **Ultra-low-latency streaming responses:** — PRD §Non-Goals.
- **At-scale concerns from shape-notes:** At 100x scale, the branching rule may need asynchronous or streamed evaluation paths and routing by domain/difficulty tier. Explicitly deferred — no scaling pressure at MVP size.

## Done

- **S-02: submit an architectural solution and receive one adaptive follow-up that escalates or de-escalates based on answer quality** — Archived 2026-06-28 → `context/archive/2026-06-26-adaptive-follow-up/`. Lesson: —.

- **S-01: paste a job description and receive a tailored architecture challenge informed by the role** — Archived 2026-06-28 → `context/archive/2026-06-26-jd-to-challenge/`. Lesson: —.

- **F-01: (foundation) interview session schema landed; sessions + messages tables, RLS policies, migration file** — Archived 2026-06-28 → `context/archive/2026-06-26-session-data-model/`. Lesson: —.
