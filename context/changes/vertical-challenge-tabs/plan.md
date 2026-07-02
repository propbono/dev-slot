# Vertical Challenge Tabs — Implementation Plan

## Overview

Add a right-side vertical tab bar showing all challenges in a session. Each tab displays challenge number + status badge (Active/Completed). Clicking a tab shows that challenge's messages. The active tab's thread replaces the current flat message view.

## Changes

### 1. Challenge tabs component

**File**: `src/components/interview/ChallengeTabs.astro`

**Intent**: Renders a vertical tab bar listing challenges with status badges. Active tab is highlighted.

**Contract**: Props: `challenges: Array<{ id: string; status: string }>`, `activeId: string`. Renders list of clickable tabs. Active tab gets purple highlight.

### 2. Session page — tabs + filtered view

**File**: `src/pages/interview/[sessionId].astro`

**Intent**: Query all challenges for the session. Default to the latest challenge. Filter messages by active challenge_id. Render ChallengeTabs sidebar + MessageThread for active challenge.

**Contract**: 
- Query `challenges WHERE session_id = X ORDER BY created_at`
- Default active challenge = the last one (latest)
- Read `?challenge=X` query param for tab switching
- Filter messages: `messages.filter(m => m.challenge_id === activeChallengeId)`
- Render ChallengeTabs in a right sidebar
- Render MessageThread with filtered messages

### Success Criteria:

- Build, typecheck, lint, tests pass
- Tabs visible for sessions with multiple challenges
- Clicking tab switches the displayed challenge
- Active tab is highlighted
- Single challenge sessions show no tabs (just the normal view)

## Progress

- [x] 1.1 Build / typecheck / lint / test pass
- [x] 1.2 ChallengeTabs component renders challenge list
- [x] 1.3 Session page filters messages by challenge
- [x] 1.4 Tab switching via query param
- [x] 1.5 Active tab highlighted, completed tabs badged
