# History & Retry Fixes — Implementation Plan

## Changes

### 1. History — active session link

**File**: `src/pages/history.astro`

**Intent**: Query for active session. If one exists, show a banner at the top: "You have an active session — Continue" linking to `/interview/<id>`.

### 2. Generation skeleton — retry button

**File**: `src/components/interview/GenerationSkeleton.tsx`

**Intent**: When generation fails (error state), add a "Retry" button alongside "Return to Dashboard". Retry reloads the page, which re-triggers polling of the generate endpoint.

## Progress

- [ ] 1.1 Build / typecheck / lint / test pass
- [ ] 1.2 History shows active session link
- [ ] 1.3 Retry button on generation failure
