# Tier Enforcement — Implementation Plan

## Overview

Add usage limit checks to API routes based on user tier (Free/Pro/Unlimited). Free users hit an upgrade prompt when limits are exhausted. Counters auto-reset after 30-day billing cycle.

## Tier Limits

| Tier | Interviews/mo | Turns/challenge | Challenges/session |
|---|---|---|---|
| Free | 1 | 3 | 1 |
| Pro | 5 | Unlimited | 5 |
| Unlimited | Unlimited | Unlimited | Unlimited |

## Changes

### 1. Tier utility

**File**: `src/lib/tiers.ts` (new)

**Intent**: Shared functions for tier checking. `getUserTier(userId)`, `checkInterviewLimit(userId)`, `checkTurnLimit(userId)`, `checkChallengeLimit(userId)`. Handles 30-day counter reset.

### 2. create.ts — interview limit

**File**: `src/pages/api/interview/create.ts`

**Intent**: Before creating session, check `interviews_this_month` against tier limit. If exceeded on Free/Pro, redirect with upgrade error. On success, increment counter.

### 3. evaluate.ts — turn limit

**File**: `src/pages/api/interview/evaluate.ts`

**Intent**: Before evaluating, count turns in current challenge. If turn limit exceeded, redirect with upgrade error. Unlimited tier skips.

### 4. new-challenge.ts — challenge limit

**File**: `src/pages/api/interview/new-challenge.ts`

**Intent**: Before creating new challenge, count challenges in current session. If limit exceeded, redirect.

### 5. Upgrade prompt

**File**: `src/components/interview/JDInput.tsx`

**Intent**: When `error=upgrade_required` is in the URL, show a styled modal with tier options (Pro $10/mo, Unlimited $15/mo). "Coming soon" message since Stripe is S-10.

## Success Criteria

- Build, typecheck, lint, tests pass
- Free user blocked at 1 interview → sees upgrade prompt
- Pro blocked at 5 interviews → sees upgrade prompt
- Turn limit enforced per challenge
- Challenge limit enforced per session
- Counters auto-reset after 30 days

## Progress

### Phase 1: Tier Logic + API

- [ ] 1.1 `src/lib/tiers.ts` with tier checking functions
- [ ] 1.2 create.ts interview limit check
- [ ] 1.3 evaluate.ts turn limit check
- [ ] 1.4 new-challenge.ts challenge limit check

### Phase 2: Upgrade Prompt

- [ ] 2.1 JDInput upgrade modal
- [ ] 2.2 Build / typecheck / lint / test pass
- [ ] 2.3 End-to-end: Free user blocked → sees upgrade prompt
