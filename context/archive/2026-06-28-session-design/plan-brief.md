# Session Design — Plan Brief

> Full plan: `context/changes/session-design/plan.md`

## What & Why

Sticky header with a single "New Session" button replaces the duplicated footer buttons. Interviewer messages get left-aligned purple cards, user messages get right-aligned blue cards — the thread reads as a real conversation. Pure CSS pass, no logic changes.

## Starting Point

`ChallengeDisplay.astro` renders a "New Session" footer that repeats for every interviewer message in `MessageThread`. Both interviewer and user cards use identical `bg-white/5` styling — hard to distinguish who's speaking. No header exists.

## Desired End State

Sticky header bar with session title + single "New Session" button. Conversation thread with clear visual lanes: purple left-aligned interviewer, blue right-aligned user. One phase, 5 component changes.

## Key Decisions Made

| Decision | Choice | Why | Source |
|---|---|---|---|
| Visual distinction | Left-aligned purple (interviewer), right-aligned blue (user) | Chat-thread pattern — instantly readable as dialogue | Plan |
| "New Session" placement | Sticky header bar | Always accessible, never duplicated | Plan |
| Implementation | Single phase, Tailwind-only | No logic changes, pure class-name swaps | Plan |

## Scope

**In scope:** SessionHeader, ChallengeDisplay (strip footer), AnswerCard (restyle), MessageThread (inline cards), session page (add header)  
**Out of scope:** Responsive overhaul, theme toggle, AnswerEditor changes, GenerationSkeleton changes

## Architecture / Approach

```
SessionHeader (sticky top)
  └─ MessageThread
       ├─ Interviewer card (purple, left)  ← inline, not ChallengeDisplay
       ├─ User card (blue, right)          ← updated AnswerCard
       ├─ Interviewer card (purple, left)  ← follow-up
       └─ ...
  └─ AnswerEditor (unchanged)
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Header + Thread | Sticky header, chat-style lanes, no duplicated buttons | Layout regression — ensure existing sessions still render correctly |

**Prerequisites:** Session page functioning, all existing components in place  
**Estimated effort:** ~1 session

## Success Criteria (Summary)

- One "New Session" button in header, zero in message cards
- Left-aligned purple interviewer cards, right-aligned blue user cards
- Header stays pinned on scroll
- No regressions
