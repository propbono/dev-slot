# Multi-Turn Loop — Implementation Plan

## Overview

Enable continuous turn-based interview conversations by fixing challenge_id in API routes (broken by F-02 NOT NULL constraint) and updating the evaluation prompt for coaching tone. The session page already supports the loop — this change makes it continuous.

## Current State

- F-02 added `challenge_id NOT NULL` to session_messages — API routes fail on insert
- create.ts creates session but not challenge row
- evaluate.ts doesn't pass challenge_id
- draft.ts doesn't pass challenge_id
- evaluateAnswer() prompt is neutral "generate a follow-up" — needs coaching tone

## Changes

### 1. create.ts — create default challenge

**File**: `src/pages/api/interview/create.ts`

**Intent**: After creating a session, also INSERT a default challenge row. The session page and subsequent API routes can query this challenge by session_id.

**Contract**: `INSERT INTO challenges (session_id, status) VALUES (session.id, 'active')` after session creation.

### 2. draft.ts — include challenge_id

**File**: `src/pages/api/interview/draft.ts`

**Intent**: Query the active challenge for the session, include its ID in draft messages.

**Contract**: `SELECT id FROM challenges WHERE session_id = X AND status = 'active' LIMIT 1`. Include `challenge_id` in INSERT/UPDATE.

### 3. evaluate.ts — include challenge_id + coaching prompt

**File**: `src/pages/api/interview/evaluate.ts`

**Intent**: Query active challenge, include challenge_id in messages. Add coaching instruction to system prompt.

**Contract**: Same pattern as draft.ts for challenge_id. System prompt: add "Provide specific, actionable feedback. Point out strengths and weaknesses directly — be a real interviewer, not a neutral observer."

### 4. evaluateAnswer prompt

**File**: `src/lib/ai.ts`

**Intent**: Add coaching tone to the system prompt.

**Contract**: Change system prompt from "You are an expert technical interviewer evaluating..." to include: "Be direct and constructive — like a real interviewer providing feedback. Point out what the candidate missed or got right."

### Success Criteria:

- Build, typecheck, lint, tests pass
- New session creates a challenge row
- Drafts + evaluated answers include challenge_id
- Evaluation feedback includes specific coaching language

## Progress

### Phase 1: Fixes + Coaching

- [x] 1.1 Build / typecheck / lint / test pass
- [x] 1.2 create.ts creates default challenge
- [x] 1.3 draft.ts + evaluate.ts include challenge_id
- [x] 1.4 Coaching tone in evaluation prompt
- [ ] 1.5 Submit answer → follow-up appears, editor re-appears (continuous)
