# Configurable Auto-Complete — Implementation Plan

## Overview

Add a `max_rounds` default (5) to the auto-complete logic. Challenge completes after 3 consecutive strong answers OR after reaching max_rounds total. Summary generated in both cases.

## Changes

### 1. Migration — add max_rounds column

**File**: `supabase/migrations/<timestamp>_add_max_rounds.sql`

**Intent**: `ALTER TABLE challenges ADD COLUMN IF NOT EXISTS max_rounds integer NOT NULL DEFAULT 5`

### 2. evaluate.ts — max rounds check

**File**: `src/pages/api/interview/evaluate.ts`

**Intent**: After the existing strong check, add a fallback: count total completed user answers for this challenge. If >= max_rounds, auto-complete.

**Contract**: 
```ts
const { count: totalRounds } = await supabase
  .from("session_messages")
  .select("*", { count: "exact", head: true })
  .eq("challenge_id", challenge.id)
  .eq("role", "user")
  .eq("status", "committed");

if (totalRounds && totalRounds >= (maxRounds ?? 5)) {
  // auto-complete
}
```

### 3. create.ts — set max_rounds on challenge creation

**File**: `src/pages/api/interview/create.ts`

**Intent**: Include `max_rounds: 5` in the challenge INSERT.

### 4. new-challenge.ts — same

**File**: `src/pages/api/interview/new-challenge.ts`

**Intent**: Include `max_rounds: 5` in the new challenge INSERT.

## Success Criteria:

- Build, typecheck, lint, tests pass
- 3 strong → auto-complete (unchanged)
- 5 total answers (mix of strong/weak) → auto-complete
- Weak-only path reaches max_rounds and completes

## Progress

- [ ] 1.1 Build / typecheck / lint / test pass
- [ ] 1.2 Migration applied
- [ ] 1.3 create.ts + new-challenge.ts set max_rounds
- [ ] 1.4 evaluate.ts checks max_rounds
- [ ] 1.5 5 total rounds → auto-complete
