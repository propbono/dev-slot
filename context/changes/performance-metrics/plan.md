# Performance Metrics — Implementation Plan

## Overview

Display a performance summary card on completed session pages, derived from the evaluation metadata already stored on session messages (quality, confidence, rationale from S-02). Qualitative labels with confidence bars — framed as a reflection aid, not an authoritative score.

## Current State Analysis

- **Evaluation metadata exists:** `session_messages.metadata` stores `{ quality: "strong"|"weak", confidence: 0-1, rationale: "..." }` — saved by `evaluateAnswer()` in S-02
- **Completed sessions:** session status `completed` or `abandoned` — the session page already detects these and shows a completion banner
- **SessionHeader exists:** sticky header with title, "History" link, "New Session" button, "End Session" button
- **PRD FR-018:** "User can view high-level performance metrics or categorized engineering breakdowns for a past session"
- **PRD risk:** "Categorized scoring could create false precision if evaluation quality is still immature" — use qualitative labels

## Desired End State

When viewing a completed session, a "Performance Summary" card appears above the conversation thread showing:
- Overall quality: "Strong" (green) or "Needs Work" (amber)
- Confidence level as a subtle bar
- Evaluator's rationale as the "breakdown"
- "Reflection aid — not an authoritative score" disclaimer

A "Performance" link in the session header scrolls to this card. No new page, no new API calls — all data already in the session page's message query.

## What We're NOT Doing

- No numeric scores (0-100) — qualitative labels only
- No per-category breakdowns — rationale text serves as the breakdown
- No additional LLM calls
- No metrics on the history list page
- No aggregation or trends across sessions

## Implementation Approach

Single phase: one new component (PerformanceCard) + session page integration + header link.

The session page already fetches all committed messages for the session. Each user-role message carries `metadata.quality`, `metadata.confidence`, `metadata.rationale`. The PerformanceCard extracts these from the messages array and renders them.

## Phase 1: Performance Card + Integration

### Changes Required:

#### 1. PerformanceCard component

**File**: `src/components/interview/PerformanceCard.astro`

**Intent**: Reads evaluation metadata from the session's user messages and renders a summary card with quality label, confidence bar, and rationale. Only renders when evaluation metadata exists (at least one user message with quality/confidence).

**Contract**:
- Props: `messages: Array<{ role: string; content: string; metadata?: Record<string, any> }>`
- Filters user messages with `metadata.quality`
- Takes the LATEST evaluation (most recent user message with metadata)
- Renders a card with:
  - Heading: "Performance Summary"
  - Quality badge: green "Strong" or amber "Needs Work"
  - Confidence bar: subtle horizontal bar, width = confidence * 100%
  - Rationale text below
  - Disclaimer: "Reflection aid — not an authoritative score"
- Dark cosmic theme styling
- Anchor id: `id="performance"` for scroll target
- If no evaluation metadata found, renders nothing (empty fragment)

#### 2. Session page integration

**File**: `src/pages/interview/[sessionId].astro`

**Intent**: Add PerformanceCard above MessageThread for completed/abandoned sessions. Import and render between the completion banner and the thread.

**Contract**: Add `<PerformanceCard messages={messages!} />` above `<MessageThread />` when session status is not `active`. The component handles the empty case internally.

#### 3. SessionHeader link

**File**: `src/components/interview/SessionHeader.astro`

**Intent**: Add a "Performance" link that scrolls to `#performance` on the page. Only visible when the session is completed/abandoned (not active).

**Contract**: Add `<a href="#performance" class="...">Performance</a>` styled as a subtle text link (like "History"). Only render when `status !== "active"`.

### Success Criteria:

#### Automated:

- `npm run build` passes, `npm run lint` passes
- `npm test` passes
- `PerformanceCard.astro` exists
- Session page renders PerformanceCard for completed sessions
- SessionHeader has "Performance" link for non-active sessions

#### Manual:

- Completed session with evaluation data shows quality label + confidence bar + rationale
- Completed session WITHOUT evaluation data shows no card (component renders nothing)
- Active session shows no performance card (only history/end)
- "Performance" link in header scrolls to the card
- Confidence bar width matches the confidence value

---

## Testing Strategy

### Unit Tests:

- `PerformanceCard` renders with evaluation metadata → shows quality badge + confidence bar
- `PerformanceCard` with no metadata → renders nothing
- Confidence bar width is proportional to metadata.confidence

### Manual Testing Steps:

1. Complete a session with evaluation data → view it → see performance card above transcript
2. Verify quality badge matches the evaluation (strong = green, weak = amber)
3. Verify confidence bar width matches the metadata value
4. Click "Performance" link in header → scrolls to card
5. Create a session with no evaluation (no answers submitted) → end it → no performance card shown

## References

- Roadmap S-04: `context/foundation/roadmap.md`
- PRD FR-018
- Evaluation metadata: stored by `evaluateAnswer()` in S-02
- Session page: `src/pages/interview/[sessionId].astro`
- Session header: `src/components/interview/SessionHeader.astro`

## Progress

### Phase 1: Performance Card + Integration

#### Automated

- [x] 1.1 `npm run build` passes
- [x] 1.2 `npm run lint` passes
- [x] 1.3 `npm test` passes
- [x] 1.4 `PerformanceCard.astro` exists
- [x] 1.5 Session page renders PerformanceCard for completed sessions
- [x] 1.6 SessionHeader has "Performance" link

#### Manual

- [ ] 1.7 Quality badge + confidence bar + rationale on completed session
- [ ] 1.8 No card when no evaluation metadata
- [ ] 1.9 "Performance" link scrolls to card
- [ ] 1.10 Confidence bar width matches value
