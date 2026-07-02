# Fix Auto-Complete — Implementation Plan

## Overview

Auto-complete never triggers because the JSONB metadata comparison in the consecutive-strong check may not match properly. The fix: use a simpler count-based check instead of comparing JSONB values in a `.every()` filter.

## Root Cause

`recentAnswers.every(a => a.metadata?.quality === "strong")` — Supabase returns JSONB as plain objects, but optional chaining can return values that don't match strict equality with a TypeScript string comparison.

## Fix

**File**: `src/pages/api/interview/evaluate.ts`

Replace the JSONB quality check with a simpler count query: count how many of the last 3 answers have quality "strong" in their metadata.

```ts
// Get last 3 answers, count strong ones
const { data: lastThree } = await supabase
  .from("session_messages")
  .select("metadata")
  .eq("challenge_id", challenge.id)
  .eq("role", "user")
  .eq("status", "committed")
  .order("created_at", { ascending: false })
  .limit(3);

const strongCount = (lastThree ?? []).filter(
  (a) => a.metadata && a.metadata.quality === "strong",
).length;

const allStrong = lastThree?.length === 3 && strongCount === 3;
```

Using `->>` operator (Postgres JSON text extraction) instead of JS object comparison.

## Success Criteria:

- Build, typecheck, lint, tests pass
- 3 consecutive strong → auto-complete triggers
- Weak answer resets the count

## Progress

- [x] 1.1 Build / typecheck / lint / test pass
- [x] 1.2 3 strong → auto-complete
- [x] 1.3 Weak resets count
