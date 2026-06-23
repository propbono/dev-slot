---
project: DevSlot
version: 1
status: draft
created: 2026-06-02
context_type: greenfield
product_type: web-app
target_scale:
  users: large
  qps: unknown
  data_volume: unknown
timeline_budget:
  mvp_weeks: 6
  hard_deadline: 2026-07-30
  after_hours_only: true
---

## Vision & Problem Statement

Senior Software Engineers interviewing for staff roles often prepare for architecture interviews using generic interview prep or random system design questions. In the moment that matters — a high-stakes interview loop — those tools fail to simulate the live, adaptive pressure of defending design choices against evolving constraints, leaving candidates with hidden gaps.

The insight is that the missing value is not more static content, but an interview simulator that adapts to answer quality, uses the specific job description and target stack as context, and exposes blind spots through adversarial follow-up.

## User & Persona

### Primary persona

A Senior Software Engineer targeting staff-level roles. They reach for DevSlot when preparing for interviews where system design, architectural tradeoffs, and live defense of decisions are major evaluation gates.

## Success Criteria

### Primary

- A signed-in user can paste a target job description, receive a tailored architecture challenge, submit a design response, and get one adaptive follow-up that meaningfully changes based on answer quality.

### Secondary

- The user can review the completed session transcript afterward.

### Guardrails

- The adaptive follow-up must clearly relate to the submitted job description and answer, rather than feeling generic.
- User-submitted interview answers and saved session history remain private to that user.

## User Stories

### US-01: Candidate receives a foundational follow-up after a weak answer

- **Given** a signed-in tech lead candidate is on the interview setup page and has pasted a senior front-end job description demanding large-scale UI architecture and monorepo experience
- **When** they start the interview simulation and submit a surface-level solution focused only on upgrading CI hardware
- **Then** the system displays an active evaluation state and returns a foundational, diagnostic follow-up question about tracking code changes via dependency graphs instead of escalating the difficulty

#### Acceptance Criteria
- The user sees a visible evaluation state after submitting their answer
- The follow-up reflects the pasted job description context rather than a generic system design prompt
- A weak answer causes the next question to become more foundational rather than more advanced

## Functional Requirements

### Authentication
- FR-001: User can sign in using OAuth or magic link. Priority: must-have
  > Socrates: No counter-argument selected; kept as written.
- FR-002: Signed-in user can sign out of the active session. Priority: must-have
  > Socrates: No counter-argument selected; kept as written.
- FR-003: Signed-in user can return to the product and access saved interview history tied to their account. Priority: must-have
  > Socrates: Counter-argument considered: "Account-linked persistence adds data/privacy complexity before the core loop is proven." Resolution: kept as written.

### Interview setup
- FR-004: User can choose whether to start an interview from a pasted job description or from explicit tech stack input. Priority: nice-to-have
  > Socrates: No counter-argument selected; kept as written.
- FR-005: User can paste raw, unformatted text into a job description input. Priority: must-have
  > Socrates: No counter-argument selected; kept as written.
- FR-006: User can provide explicit technical tags to shape the interview prompt. Priority: nice-to-have
  > Socrates: Counter-argument considered: "Explicit tech tags are redundant if JD input already contains enough context." Resolution: kept as written.
- FR-007: User can trigger automatic extraction of a tech stack from a pasted job description. Priority: must-have
  > Socrates: Counter-argument considered: "Explicit extraction may be unnecessary if the system can silently use the JD to generate the challenge." Resolution: kept as written.
- FR-008: User can start a tailored interview simulation from the provided input. Priority: must-have
  > Socrates: No counter-argument selected; kept as written.
- FR-009: User can receive a generated interview challenge informed by the submitted job description. Priority: must-have
  > Socrates: No counter-argument selected; kept as written.

### Active simulation
- FR-010: User can view an interview workspace that shows the interviewer prompt and a solution editor. Priority: must-have
  > Socrates: Counter-argument considered: "The product needs a clear place to read the prompt and write the answer, even if layout changes later." Resolution: kept as written.
- FR-011: User can type an architectural solution into a multi-line input. Priority: must-have
  > Socrates: Counter-argument considered: "Multi-line free text is essential because architecture answers are open-ended." Resolution: kept as written.
- FR-012: User can submit an architectural solution for evaluation. Priority: must-have
  > Socrates: Counter-argument considered: "The product might evaluate continuously, making explicit submit optional." Resolution: kept as written.
- FR-013: User can see an active evaluation state while the product analyzes the submitted answer. Priority: must-have
  > Socrates: Counter-argument considered: "Without visible evaluation state, the interview flow may feel broken or laggy." Resolution: kept as written.

### Adaptive feedback
- FR-014: User can receive one adaptive follow-up question that becomes more advanced after a strong answer or more foundational after a weak answer. Priority: must-have
  > Socrates: Counter-argument considered: "This adaptive branch is the product’s core differentiator and must stay." Resolution: kept as written.

### Session history
- FR-015: User can end an active interview session manually. Priority: must-have
  > Socrates: Counter-argument considered: "Users may still expect a clear way to exit and save state." Resolution: kept as written.
- FR-016: User can view a list of completed interview sessions. Priority: must-have
  > Socrates: Counter-argument considered: "History helps users return and compare practice over time, which supports retention." Resolution: kept as written.
- FR-017: User can open and review a full chronological transcript of a past interview session. Priority: must-have
  > Socrates: Counter-argument considered: "Transcript review is key to learning from mistakes after the live simulation ends." Resolution: kept as written.
- FR-018: User can view high-level performance metrics or categorized engineering breakdowns for a past session. Priority: must-have
  > Socrates: Counter-argument considered: "Categorized scoring could create false precision if evaluation quality is still immature." Resolution: kept as written.

## Non-Functional Requirements

- The initial challenge and each adaptive follow-up return quickly enough that the interaction feels like a live interview rather than a stalled application.
- A user's in-progress solution draft remains available after an accidental browser refresh or brief connection interruption.
- Interview transcripts, pasted job descriptions, performance metrics, and saved session history are accessible only to the owning user and authorized product operations.
- Saved interview sessions and transcripts remain available and readable for months after completion without silent loss or corruption.
- The interview workspace remains readable on laptops, tablets, and desktop monitors without requiring horizontal scrolling for core reading and writing tasks.
- Core reading and writing flows support keyboard navigation, strong text contrast, and screen-reader labels.
- When a user deletes their account, past transcripts, metrics, and pasted data are permanently erased within 30 days.
- The product remains usable on the latest two major versions of mainstream desktop browsers.

## Business Logic

The application evaluates the technical depth of the user’s architectural design against the target job constraints and decides whether the next interviewer move should escalate into edge-case pressure testing or de-escalate into foundational diagnostic probing.

The rule consumes two primary user-facing inputs: the unstructured job description or text block pasted during setup, and the natural-language architectural response entered by the user in the solution editor. The job description establishes the target role's constraints and expectations; the submitted response provides the material to judge for technical depth, engineering concepts, and blind spots.

The rule outputs a contextual change in interview direction rather than a flat score. Based on what the user submitted against the role context, the product returns a follow-up that either raises the stakes with a realistic architectural pressure test or lowers the complexity into a foundational drill-down.

The user encounters the result immediately after submitting an answer to an active challenge. After a brief evaluation state, the interviewer feed updates with either a targeted counter-challenge or a diagnostic rescue prompt, which is the moment the experience shifts from a static prompt into a responsive sparring session.

Additional supporting rules:
- The app derives interview constraints from the pasted job description before generating the challenge.
- The app distinguishes strong versus weak answers based on coverage of role-relevant constraints rather than keyword matching alone.

## Access Control

Public visitors can access landing and marketing pages. To start or save interview sessions, the user must sign in.

MVP authentication supports OAuth and magic link sign-in. The MVP uses a flat user model: all signed-in users access the same product capabilities.

Future role separation may be introduced later for business model or administration needs, but it is not part of the MVP.

## Non-Goals

- No deep multi-turn interview trees beyond the first adaptive follow-up in the MVP, so the first version stays focused on proving the branching core.
- No mobile-native application support in the MVP, so effort stays on the primary web experience.
- No advanced admin, billing, or subscription management in the MVP, because monetization and back-office workflows are explicitly deferred.
- No guarantees for ultra-low-latency conversational feedback in the MVP, because conversational adaptation matters more than near-instant responsiveness in the first release.

## Open Questions

No open questions currently.
