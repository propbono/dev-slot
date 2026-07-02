# Interview Config UI — Implementation Plan

## Overview

Add "Max Rounds" and "Strong Threshold" inputs to the New Session page (both JD and Tech Stack modes). Values passed to create.ts and stored on the challenge row.

## Changes

### 1. JDInput — add threshold inputs

**File**: `src/components/interview/JDInput.tsx`

**Intent**: Add two number inputs at the bottom of the form (both modes): "Max Rounds" (default 5) and "Strong Threshold" (default 3). Hidden inputs in the form.

### 2. create.ts — store thresholds

**File**: `src/pages/api/interview/create.ts`

**Intent**: Read `maxRounds` and `strongThreshold` from form data, pass to challenge INSERT.

### 3. new-challenge.ts — same

**File**: `src/pages/api/interview/new-challenge.ts`

**Intent**: Read `maxRounds` and `strongThreshold` from form data (from header button form).

## Progress

- [ ] 1.1 Build / typecheck / lint / test pass
- [ ] 1.2 Threshold inputs visible on New Session page
- [ ] 1.3 create.ts stores thresholds on challenge
- [ ] 1.4 new-challenge.ts stores thresholds
