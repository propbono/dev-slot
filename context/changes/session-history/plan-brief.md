# Session History — Plan Brief

> Full plan: `context/changes/session-history/plan.md`
> Roadmap: `context/foundation/roadmap.md` → S-03

## What & Why

End an active interview session, browse a list of completed/abandoned sessions with role and domain context, and review full transcripts in read-only mode. All data already exists in Supabase — this is read-and-display, no schema changes.

## Starting Point

Sessions and messages exist in Supabase with RLS. The interview page renders active sessions with editor. No "end session" action. No history list page. No way to view past sessions.

## Desired End State

"End Session" button in header → flips status to completed. `/history` page lists past sessions with role, domain, date, message count, status badge. Clicking opens the transcript on the existing interview page (same layout, answer editor hidden). Dashboard shows "Continue Session" for active sessions.

## Key Decisions Made

| Decision | Choice | Why | Source |
|---|---|---|---|
| History page | `/history` — own route | Clean separation from dashboard | Plan |
| Transcript viewer | Reuse `/interview/[id]` with read-only mode | No new route, consistent layout | Plan |
| End session UX | Button in header + confirm dialog | Clear affordance, no accidental endings | Plan |
| History list content | Role, domain, date, count, status badge | Enough context to identify sessions | Plan |
| Active sessions in history | No — only completed + abandoned | History means "done" | Plan |

## Scope

**In scope:** end.ts API, end-session button, /history page, read-only mode, dashboard links  
**Out of scope:** Deletion, search/filter, pagination, export, multi-turn management

## Architecture / Approach

```
POST /api/interview/end → UPDATE sessions SET status = 'completed'
  → redirect → /interview/<id> (now read-only)

GET /history → SELECT sessions WHERE status IN ('completed', 'abandoned')
  → extract role/domain from system messages
  → role/domain + date + count + badge per row
  → click → /interview/<id> (read-only)
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. End Session | API + header button + confirmation | Session ownership check must be correct |
| 2. History + Read-Only | History page + transcript viewer + dashboard links | N+1 query for role/domain per session (fine at MVP scale) |

**Prerequisites:** S-01 + S-02 complete (sessions + messages exist)  
**Estimated effort:** ~1 session across 2 phases

## Success Criteria (Summary)

- End session from interview page, confirmation dialog, status flip
- History page shows completed/abandoned sessions with context
- Click session → read-only transcript (same layout, no editor)
- Dashboard shows "Continue Session" for active sessions
