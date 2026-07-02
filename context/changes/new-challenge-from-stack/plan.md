# New Challenge From Same Stack — Implementation Plan

## Overview

The "New Challenge" button on the ChallengeComplete card generates a fresh architecture challenge from the same JD/tech stack. Previous challenges are included in the prompt as context to avoid repetition.

## Changes

### 1. API endpoint

**File**: `src/pages/api/interview/new-challenge.ts`

**Intent**: POST handler that creates a new challenge row for the session and generates a fresh challenge from the session's system message. Returns redirect to the session page.

**Contract**: Receives `sessionId` from form. Auth guard + session ownership check. Creates new challenge via `INSERT INTO challenges`. Reads system message for stack data. Fetches all previous interviewer messages as anti-context. Calls `generateChallenge()` with previous topics excluded. Inserts new interviewer message with `challenge_id`. Redirects to `/interview/<sessionId>`.

### 2. ChallengeComplete button

**File**: `src/components/interview/ChallengeComplete.astro`

**Intent**: Replace the `<a href>` link with a `<form method="POST" action="/api/interview/new-challenge">`.

**Contract**: Hidden input `sessionId`. Submit button styled the same.

### 3. generateChallenge prompt

**File**: `src/lib/ai.ts`

**Intent**: Add optional `previousTopics` parameter to avoid repetition.

**Contract**: `generateChallenge(jdText, constraints, previousTopics?: string[])`. If provided, append: "Do NOT generate a challenge about these topics: {list}"

### Success Criteria:

- Build, typecheck, lint, tests pass
- "New Challenge" creates new challenge row in Supabase
- New challenge doesn't repeat previous topics
- Session page loads the new challenge

## Progress

- [x] 1.1 Build / typecheck / lint / test pass
- [x] 1.2 new-challenge.ts endpoint
- [x] 1.3 ChallengeComplete button triggers POST
- [x] 1.4 generateChallenge accepts previousTopics
- [ ] 1.5 New challenge is different from previous
