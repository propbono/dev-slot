# Session History Fixes — Implementation Plan

## Overview

Three targeted fixes for the session-history implementation: replace the browser confirm dialog with a styled React modal, add time to the history page date display, and fix the "Invalid date" on the completion banner by using the session end time.

## Current State Analysis

- **Browser confirm:** `SessionHeader.astro` uses `onsubmit="return confirm(...)"` — unstyled, can't match cosmic theme
- **Date only in history:** `history.astro` `formatDate` uses `{month, day, year}` — no time displayed
- **Invalid date:** `[sessionId].astro` completion banner uses `session.created_at` — shows session creation time, not end time

## Desired End State

- End Session shows a styled modal with cosmic theme (dark bg, purple accent, "End Session" / "Cancel" buttons)
- History page shows date AND time per session
- Completion banner shows the actual end date/time, not the creation date

## Implementation Approach

Single phase — three isolated fixes across three files.

## Changes

### 1. Styled confirm dialog

**File**: `src/components/interview/EndSessionButton.tsx` (new), `src/components/interview/SessionHeader.astro`

**Fix**: Create a React island with a state-based modal dialog. On click, shows an inline modal with cosmic theme styling. On confirm, submits the form programmatically via fetch to `/api/interview/end` then reloads.

**Contract**: React component with `sessionId` prop. State: `open` (boolean), `ending` (boolean). On confirm click: sets `ending`, POSTs to end API, reloads page. Styled with `bg-cosmic` + `border-white/10` + `bg-purple-600` button. Replaces the current `<form>` + `<button>` in SessionHeader.

### 2. Time in history

**File**: `src/pages/history.astro`

**Fix**: Change `formatDate` to include time: `{hour: 'numeric', minute: '2-digit'}` in the options.

### 3. Completion banner date

**File**: `src/pages/interview/[sessionId].astro`

**Fix**: Query `updated_at` from the session row alongside `created_at`. Display `updated_at` (which reflects the end time) instead of `created_at` on the completion banner. Pass `updatedAt` to the template.

### Success Criteria:

#### Automated:

- `npm run build` passes, `npm run lint` passes
- `EndSessionButton.tsx` exists
- No more `onsubmit="return confirm"` in SessionHeader
- History shows time in date format strings
- Completion banner uses `updated_at`

#### Manual:

- End Session shows styled modal (dark bg, purple buttons, not browser native)
- History page shows e.g. "Jun 28, 3:14 PM" instead of just "Jun 28"
- Completion banner shows actual end time, not creation time

## Progress

### Phase 1: Fixes

#### Automated

- [x] 1.1 `npm run build` passes — 8cca97e
- [x] 1.2 `npm run lint` passes — 8cca97e
- [x] 1.3 `EndSessionButton.tsx` exists — 8cca97e
- [x] 1.4 No browser confirm in SessionHeader — 8cca97e
- [x] 1.5 History formatDate includes time — 8cca97e
- [x] 1.6 Completion banner uses `updated_at` — 8cca97e

#### Manual

- [x] 1.7 Styled modal on End Session — 8cca97e
- [x] 1.8 Time visible in history list — 8cca97e
- [x] 1.9 Completion banner shows end time, not creation time — 8cca97e
