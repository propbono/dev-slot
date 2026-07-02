# Fix Session UX — Implementation Plan

## Overview

Four grouped UX fixes for the session page: sticky header broken by overflow-hidden, end session modal centering, session page title, and "New Challenge" button in tabs.

## Changes

### 1. Fix sticky header + modal position

**File**: `src/pages/interview/[sessionId].astro`

**Intent**: `overflow-hidden` on the page wrapper kills CSS `sticky` and interferes with `fixed` modal positioning. Remove it.

### 2. Session name

**File**: `src/components/interview/SessionHeader.astro`

**Intent**: Pass `role` and `domain` properly — shows "Staff — Fintech" instead of "Interview Session". Already coded, just verify it works.

### 3. New Challenge button in tabs

**File**: `src/components/interview/ChallengeTabs.astro`

**Intent**: Add a "New" button at the top of the tab list that triggers a new challenge. Links to the new-challenge API.

### Success Criteria:

- Header sticks on scroll
- End session modal centered on screen
- Session name shows role/domain
- "New Challenge" button visible in tabs

## Progress

- [ ] 1.1 Build / typecheck / lint / test pass
- [ ] 1.2 Sticky header works on scroll
- [ ] 1.3 Modal centered on screen
- [ ] 1.4 Session name shows role/domain
- [ ] 1.5 New Challenge button in tabs
