# Session History — Implementation Plan

## Overview

Add an "End Session" action to the interview page, a `/history` page listing completed and abandoned sessions with role/domain context, and a read-only transcript mode on the existing interview page for past sessions. All data already exists in Supabase — this is a read-and-display feature with one new API endpoint.

## Current State Analysis

- **Sessions exist:** `sessions` table with `id, user_id, status, created_at, updated_at` — status lifecycle: `created → active → completed / abandoned`
- **Messages exist:** `session_messages` with `role, content, metadata, status, created_at` — committed messages form the transcript
- **Interview page exists:** `/interview/[sessionId]` renders MessageThread + AnswerEditor for active sessions
- **SessionHeader exists:** sticky header with session title + "New Session" button
- **Dashboard exists:** `/dashboard` with JDInput form
- **No end-session action:** sessions stay `active` forever unless manually updated in the database
- **No history UI:** no way for users to see their past sessions

### Key Discoveries:

- System messages contain `{ tech_stack, role_level, domain }` — extractable for history list display
- Session page already fetches all committed messages for a session — transcript rendering is implemented in MessageThread
- RLS already scopes sessions + messages to the owning user — the history query is safe by default

## Desired End State

User on the interview page sees an "End Session" button in the header (with confirmation). Clicking ends the session (status → completed) and shows a "Session Complete" banner with the full transcript. Navigating to `/history` shows a list of past sessions with role, domain, date, message count, and status badge. Clicking a session opens the read-only transcript — same page layout, no answer editor.

## What We're NOT Doing

- No session deletion — sessions stay forever (NFR: "remain available for months")
- No search or filtering of history — MVP list is chronological
- No pagination of history list — MVP data volume is small
- No export or sharing of transcripts
- No changes to active session behavior — the interview flow (answer → evaluate → follow-up) is unchanged

## Implementation Approach

Two phases: end-session action (API + UI), history display (list page + read-only mode).

The transcript view REUSES `/interview/[sessionId]` — when the session status is `completed` or `abandoned`, the answer editor is hidden and a completion banner appears above the thread. No new route needed.

The end-session API is a simple `POST /api/interview/end` that updates the session status. Auth-guarded with session ownership check.

## Phase 1: End Session

### Overview

Create the API endpoint to end a session, and add the "End Session" button with confirmation to the interview page header.

### Changes Required:

#### 1. End session API

**File**: `src/pages/api/interview/end.ts`

**Intent**: POST handler that receives `sessionId`, validates auth + session ownership, and updates the session status from `active` to `completed`. Returns redirect to the same session page (which will now render in read-only mode).

**Contract**: POST handler. Reads `sessionId` from form data. Auth guard via `createClient` + `getUser()`. Verifies session belongs to user. Updates `sessions SET status = 'completed'`. Redirects to `/interview/<sessionId>`.

#### 2. End Session button in header

**File**: `src/components/interview/SessionHeader.astro`

**Intent**: Add an "End Session" button next to "New Session" in the header. Only visible when the session is active. On click, shows a browser-native confirmation dialog. Posts to `/api/interview/end`.

**Contract**: Add a form with `method="POST" action="/api/interview/end"` containing a hidden `sessionId` input. Button styled as a subtle border button (matching "New Session" style but less prominent). Add `onsubmit="return confirm('End this session? Your transcript will be saved.')"` for the confirmation dialog. Pass `sessionId` as a prop.

#### 3. Header prop update

**File**: `src/pages/interview/[sessionId].astro`

**Intent**: Pass `sessionId` to `SessionHeader` so the end-session form can include it.

**Contract**: Add `sessionId={sessionId}` prop to `<SessionHeader />`.

### Success Criteria:

#### Automated:

- `npm run build` passes
- `npm run lint` passes
- `end.ts` API route exists
- `SessionHeader.astro` has end-session form with confirmation

#### Manual:

- "End Session" button visible on active session page (not on completed sessions)
- Clicking shows browser confirmation dialog
- Confirming ends the session — status becomes `completed` in Supabase
- Page reloads showing the completed transcript (read-only mode from Phase 2)

---

## Phase 2: History Page + Read-Only Mode

### Overview

Create the `/history` page listing completed and abandoned sessions with role/domain context. Update the interview page to hide the answer editor when the session is not active.

### Changes Required:

#### 1. History list page

**File**: `src/pages/history.astro`

**Intent**: Server-side rendered page that fetches completed and abandoned sessions for the authenticated user, extracts role/domain from each session's system message, and displays them in a chronological list with message counts and status badges. Clicking a row navigates to `/interview/<sessionId>` for the transcript.

**Contract**:
- Auth guard via `createClient` + `getUser()`
- Query `sessions WHERE user_id = auth.uid() AND status IN ('completed', 'abandoned') ORDER BY created_at DESC`
- For each session, fetch one system message to extract `role_level` and `domain`
- For each session, fetch message count: `SELECT count(*) FROM session_messages WHERE session_id = X AND status = 'committed'`
- Render as a list of cards: role/domain heading, date, message count, status badge (green "Completed" / gray "Abandoned")
- Link to dashboard for "New Session"
- Uses Layout + cosmic theme styling
- Empty state: "No completed sessions yet. Start your first interview." with link to dashboard

#### 2. Navigation to history

**File**: `src/components/interview/SessionHeader.astro`

**Intent**: Add a "History" link to the header alongside "New Session" and "End Session". Links to `/history`.

**Contract**: Add `<a href="/history">History</a>` styled as a subtle text link between the title and the right-side buttons.

**File**: `src/pages/dashboard.astro`

**Intent**: Add a link to `/history` on the dashboard so users can access past sessions from the home page.

**Contract**: Add a link after or near the Topbar: "View Session History →" linking to `/history`.

#### 3. Read-only mode on session page

**File**: `src/pages/interview/[sessionId].astro`

**Intent**: When the session status is `completed` or `abandoned`, hide the AnswerEditor and show a "Session Complete" banner above the thread. The thread itself renders identically — all messages are read-only by nature.

**Contract**:
- After fetching the session, check `session.status`
- If status is `completed` or `abandoned`: hide `<AnswerEditor />`, show a banner above `MessageThread`: "Session Complete — {date}" with a subtle green accent
- If status is `active`: show the editor as before
- Pass `editable={false}` concept — simply don't render the editor for non-active sessions

#### 4. Dashboard link to continue active session

**File**: `src/pages/dashboard.astro`

**Intent**: If the user has an active session, show a "Continue Session" link on the dashboard so they can return to it.

**Contract**: Query `sessions WHERE user_id = auth.uid() AND status = 'active' LIMIT 1`. If one exists, show a banner above the JD form: "You have an active session — Continue" linking to `/interview/<id>`.

### Success Criteria:

#### Automated:

- `npm run build` passes
- `npm run lint` passes
- `src/pages/history.astro` exists
- `SessionHeader` has "History" link
- `[sessionId].astro` hides editor for completed/abandoned sessions

#### Manual:

- History page lists all completed/abandoned sessions with role, domain, date, count, badge
- Clicking a session opens the transcript (same layout, no editor)
- Active sessions do NOT appear in history
- "End Session" from Phase 1 → session appears in history
- Dashboard shows "Continue Session" for active sessions
- Empty history shows helpful empty state

---

## Testing Strategy

### Manual Testing Steps:

1. **End session:** Start interview → click "End Session" → confirm → page shows completed banner, no editor
2. **History list:** Visit `/history` → see completed session with role, domain, date, badge
3. **Transcript:** Click session in history → opens `/interview/<id>` with full thread, no editor, completion banner
4. **Active session:** Visit `/interview/<active-id>` → editor still visible, "End Session" button present
5. **Continue:** Dashboard shows "Continue Session" link for active sessions
6. **Empty state:** Delete all sessions → `/history` shows empty state with link to dashboard
7. **Cross-user:** User B visits User A's history → empty list (RLS blocks)

## Performance Considerations

- History query: one `sessions` query + one `system_messages` query per session for role/domain. At MVP scale (< 50 sessions) this is negligible. If it grows, batch the system message query with `IN`.
- No pagination needed at MVP scale.
- Read-only mode adds no additional queries — same Supabase calls as the active view.

## Migration Notes

- No schema changes — all data already exists.
- The `end.ts` API route updates session status — existing active sessions can be ended, no migration needed.

## References

- Roadmap S-03: `context/foundation/roadmap.md`
- PRD: FR-003, FR-015, FR-016, FR-017
- Existing session page: `src/pages/interview/[sessionId].astro`
- Existing session header: `src/components/interview/SessionHeader.astro`
- Existing message components: `MessageThread.astro`, `AnswerCard.astro`, `ChallengeDisplay.astro`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: End Session

#### Automated

- [x] 1.1 `npm run build` passes — 1566d05
- [x] 1.2 `npm run lint` passes — 1566d05
- [x] 1.3 `end.ts` API route exists — 1566d05
- [x] 1.4 `SessionHeader.astro` has end-session form with confirmation — 1566d05

#### Manual

- [x] 1.5 "End Session" button visible on active session page — 1566d05
- [x] 1.6 Confirmation dialog on click — 1566d05
- [x] 1.7 Confirming flips session status to `completed` — 1566d05

### Phase 2: History Page + Read-Only Mode

#### Automated

- [x] 2.1 `npm run build` passes
- [x] 2.2 `npm run lint` passes
- [x] 2.3 `src/pages/history.astro` exists
- [x] 2.4 `SessionHeader` has "History" link
- [x] 2.5 `[sessionId].astro` hides editor for completed sessions

#### Manual

- [ ] 2.6 History lists completed sessions with role/domain/date/count/badge
- [ ] 2.7 Clicking session opens read-only transcript
- [ ] 2.8 Active sessions hidden from history
- [ ] 2.9 Dashboard shows "Continue Session" for active sessions
- [ ] 2.10 Empty history shows helpful empty state
