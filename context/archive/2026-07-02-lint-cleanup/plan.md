# Lint Cleanup — Implementation Plan

## Overview

Fix 64 ESLint errors across 14 files. Two categories: Supabase `any` types (requiring type assertions or generation) and code quality issues (unused vars, nullish coalescing, unnecessary conditions).

## Approach

**Phase 1: Code quality fixes** — safe, mechanical fixes for unused vars, `||` → `??`, unnecessary conditions. These don't change behavior.

**Phase 2: Supabase type fixes** — add type assertions for Supabase query results where the shape is known.

## Phase 1: Code Quality

### evaluate.ts — 12 errors
**File**: `src/pages/api/interview/evaluate.ts`
- Remove unused `inserted` variable
- `||` → `??` for nullish checks
- Cast Supabase results with known shapes

### new-challenge.ts — 22 errors  
**File**: `src/pages/api/interview/new-challenge.ts`
- Cast parsed JSON and Supabase results
- Remove explicit `any` annotations
- `||` → `??`

### Other API routes — 11 errors
**Files**: `create.ts`, `draft.ts`, `end.ts`, `generate.ts`
- Same patterns: type assertions, nullish coalescing

### Test files — 7 errors
**Files**: `ai.test.ts`, `PerformanceCard.test.ts`
- Cast mock return values properly

### Components — 12 errors
**Files**: `AnswerEditor.tsx`, `JDInput.tsx`, `GenerationSkeleton.tsx`, `ChallengeTabs.astro`, `history.astro`, `[sessionId].astro`
- `||` → `??`, unnecessary condition fixes

## Success Criteria

- `npm run lint` passes with 0 errors
- Build, typecheck, build pass
- All 14 tests pass

## Progress

### Phase 1: Code Quality

- [ ] 1.1 evaluate.ts fixed
- [ ] 1.2 new-challenge.ts fixed
- [ ] 1.3 Other API routes fixed
- [ ] 1.4 Test files fixed
- [ ] 1.5 Components fixed
- [ ] 1.6 `npm run lint` 0 errors

### Phase 2: Verification

- [ ] 2.1 Build / typecheck / test pass
