# Session Design — Implementation Plan

## Overview

Redesign the interview session page with a sticky header (containing "New Session"), distinct visual differentiation between interviewer and user messages (left/right alignment with tinted backgrounds), and removal of duplicated UI elements. Clean up the conversation thread so it reads as a real dialogue.

## Current State Analysis

- **"New Session" duplicated:** `ChallengeDisplay.astro` renders a footer with "New Session" + "Ready to respond?" placeholder — every interviewer message in `MessageThread` gets a copy
- **Thread indistinction:** both interviewer (`ChallengeDisplay`) and user (`AnswerCard`) use identical `bg-white/5` + `border-white/10` cards — only a small "Your Answer" label distinguishes them
- **No header:** the session page has no persistent navigation — everything scrolls as one long vertical page
- **ChallengeDisplay mixed concerns:** it's both a message card AND a session footer — needs to become a pure message card

### Key Discoveries:

- `ChallengeDisplay.astro` lines 27-42: footer section with placeholder + "New Session" link — this is the duplicated element
- `MessageThread.astro` line 22: renders `ChallengeDisplay` for every `interviewer` message — this causes the duplication
- Both `ChallengeDisplay` and `AnswerCard` use identical `rounded-2xl border border-white/10 bg-white/5` classes
- Session page already uses `Astro.locals.user` — header can display user context

## Desired End State

The session page has a sticky top header bar with session title and "New Session" button. Below, the conversation thread shows interviewer messages left-aligned with a purple tint and user messages right-aligned with a blue tint — instantly readable as a dialogue. Only one "New Session" button exists, pinned in the header.

## What We're NOT Doing

- No layout engine change — Tailwind CSS classes only
- No new dependencies
- No responsive layout overhaul — the existing max-w-3xl constraint stays
- No changes to AnswerEditor or GenerationSkeleton — they're fine
- No dark/light theme toggle — cosmic theme stays

## Implementation Approach

Single phase: structural CSS pass across 4 components + 1 new header component. All changes are class-name substitutions and element restructuring — no logic changes.

## Phase 1: Header + Thread Redesign

### Overview

Add a sticky header bar, refactor ChallengeDisplay into a pure message card, restyle interviewer/user cards for chat-style distinction, and fix MessageThread to not duplicate the footer.

### Changes Required:

#### 1. New session header

**File**: `src/components/interview/SessionHeader.astro`

**Intent**: Sticky top bar showing the session context and a "New Session" button. Pinned to the top of the viewport so it's always accessible. Replaces the duplicated footer buttons.

**Contract**:
- Sticky header: `sticky top-0 z-10` with cosmic bg
- Left: session title ("Interview — {role} {domain}" or "Interview Session")
- Right: "New Session" link styled as a small button
- Separator line at the bottom edge

#### 2. ChallengeDisplay — strip the footer

**File**: `src/components/interview/ChallengeDisplay.astro`

**Intent**: Remove the footer section (placeholder text + "New Session" link). This component becomes a pure message card — just the heading + challenge text. Keep the role/domain heading for the first card, omit for follow-ups (existing logic).

**Contract**:
- Remove lines 27-42 (footer div + "New Session" link)
- Change background: `bg-purple-500/10 border-purple-500/20` for interviewer messages (purple tint)
- Keep the heading + prose content
- Remove the "Ready to respond?" placeholder — that's now implied by the editor below the thread

#### 3. AnswerCard — right-align + blue tint

**File**: `src/components/interview/AnswerCard.astro`

**Intent**: Right-align user messages with a blue-tinted background. The "Your Answer" label stays but moves to the right side. The quality badge stays on the right.

**Contract**:
- Container: `ml-auto max-w-[85%]` (right-aligned, slightly narrower for readability)
- Card background: `bg-blue-500/10 border-blue-500/20` (blue tint)
- Label + badge: right-aligned (`text-right`, `justify-end`)
- Rationale box: same blue tint, below the card

#### 4. MessageThread — remove ChallengeDisplay wrapping, use inline cards

**File**: `src/components/interview/MessageThread.astro`

**Intent**: Replace the full `ChallengeDisplay` import with inline message cards. Interviewer messages render directly as left-aligned cards (formerly the ChallengeDisplay content, now just heading + prose). User messages use the updated AnswerCard. No more duplicated footers.

**Contract**:
- Interviewer messages: render inline div with `bg-purple-500/10 border-purple-500/20` + heading + prose (same content as ChallengeDisplay but no footer)
- User messages: use the updated `AnswerCard` (already right-aligned)
- Space between messages: `space-y-6` (more breathing room than `space-y-4`)
- First interviewer message: shows role/domain heading; subsequent follow-ups show "Follow-up" label
- All messages get `mr-auto` for left-aligned or `ml-auto` for right-aligned — clear visual lane per role

#### 5. Session page — add header, remove old structure

**File**: `src/pages/interview/[sessionId].astro`

**Intent**: Add the `SessionHeader` at the top of the page content area. Remove any residual "New Session" references from other components. The header stays visible as the user scrolls through the conversation thread.

**Contract**:
- Add `<SessionHeader />` before `MessageThread`
- Pass `role` and `domain` to the header for the title
- No other structural changes

### Success Criteria:

#### Automated:

- `npm run build` passes
- `npm run lint` passes
- `SessionHeader.astro` exists
- `ChallengeDisplay.astro` no longer contains footer/button
- `AnswerCard.astro` has right-aligned + blue-tinted classes
- `MessageThread.astro` uses inline cards, not full ChallengeDisplay

#### Manual:

- Header visible at top of session page, stays pinned on scroll
- "New Session" button appears exactly once, in the header
- Interviewer messages are left-aligned with purple tint
- User messages are right-aligned with blue tint
- Thread reads clearly as a conversation at a glance
- No regressions: existing sessions render normally, evaluation flow works

---

## Testing Strategy

### Manual Testing Steps:

1. **Header:** Visit a session page → header visible at top → scroll down → header stays pinned
2. **Single button:** Check there's only one "New Session" button (in header), not in every message card
3. **Visual lanes:** Interviewer messages are left-aligned purple, user messages right-aligned blue
4. **Regression:** Existing session with challenge + answers + follow-ups renders with correct colors and alignment
5. **Mobile:** Narrow viewport → right-aligned user messages don't overflow

## Performance Considerations

- No new dependencies — pure Tailwind CSS changes
- No additional client JS — static Astro components
- Header is `sticky` not `fixed` — no layout shift, no z-index stacking issues

## References

- Current components: `src/components/interview/{ChallengeDisplay,MessageThread,AnswerCard}.astro`
- Session page: `src/pages/interview/[sessionId].astro`
- Frame brief: `context/changes/session-design/frame.md` (write before implementing)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Header + Thread Redesign

#### Automated

- [x] 1.1 `npm run build` passes
- [x] 1.2 `npm run lint` passes
- [x] 1.3 `SessionHeader.astro` exists
- [x] 1.4 `ChallengeDisplay.astro` stripped of footer
- [x] 1.5 `AnswerCard.astro` right-aligned + blue tint
- [x] 1.6 `MessageThread.astro` uses inline cards

#### Manual

- [x] 1.7 Header pinned on scroll, single "New Session" button
- [x] 1.8 Interviewer messages left-aligned purple
- [x] 1.9 User messages right-aligned blue
- [x] 1.10 Thread reads clearly as conversation
- [x] 1.11 No regressions in existing sessions
