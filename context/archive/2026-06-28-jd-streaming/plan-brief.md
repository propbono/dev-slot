# JD Streaming — Plan Brief

> Full plan: `context/changes/jd-streaming/plan.md`
> Frame brief: `context/changes/jd-streaming/frame.md`

## What & Why

The session page returns a 404 when a valid session has no messages — forcing the POST to block until the LLM completes. Fix: split the API so session creation redirects immediately, and the session page shows a loading skeleton that polls for the challenge. The "feels broken" 6-10s blank wait becomes a ~200ms redirect with visible progress.

## Starting Point

S-01 is complete — the generate API creates a session then blocks for 6-10s before redirecting. The session page returns 404 on empty messages. Vercel AI SDK (`generateText()`) is installed and working. React islands (`client:load`) pattern is established.

## Desired End State

User submits JD → within 200ms, browser redirects to `/interview/<uuid>` → loading skeleton with stage indicator → challenge appears in 6-10s → page reloads with full thread view + editor. No 404 for valid sessions. No blank wait.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Delivery mechanism | Polling, not SSE/streamText() | Simpler HTTP, works with Vercel serverless, reuses existing generateText(). | Plan |
| Error handling | Skeleton shows error card with dashboard link | User sees failure immediately with a clear path to retry. | Plan |
| JD storage | System message with `{ raw_jd, status: "pending" }` | No migration needed — reuses existing session_messages schema. | Plan |
| Redirect timing | Immediately after session INSERT | Within 200ms — the session page skeleton handles the rest. | Frame |

## Scope

**In scope:** create.ts endpoint, generate.ts rewrite (GET + polling), GenerationSkeleton.tsx, [sessionId].astro empty-state fix  
**Out of scope:** SSE, streamText(), JDInput changes, evaluation pipeline changes

## Architecture / Approach

```
POST /api/interview/create
  → INSERT session + store JD as system message
  → 302 redirect → /interview/<uuid>  (~200ms)

GET /interview/[sessionId]
  → messages.length === 0 → render GenerationSkeleton
  → skeleton polls GET /api/interview/generate?sessionId=X every 2s
  → generate endpoint: extract + challenge + save messages
  → returns { ready: true } → page reloads with full thread
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. API Split | create.ts + generate.ts rewrite | generate endpoint must be idempotent (re-poll safe) |
| 2. Session Page | GenerationSkeleton + 404 removal | Page reload UX — skeleton → flash → content |

**Prerequisites:** S-01 jd-to-challenge complete, DeepSeek API key active  
**Estimated effort:** ~1 session across 2 phases

## Open Risks & Assumptions

- Assumption: generating a challenge is idempotent — re-polling the generate endpoint while the LLM is running is safe (the endpoint checks if interviewer messages already exist)
- Risk: if the generate endpoint is called twice concurrently (two browser tabs), two challenges could be created. Mitigated by checking for existing interviewer messages before running the LLM.

## Success Criteria (Summary)

- Submit JD → redirect to session page within 1 second
- Loading skeleton shows stage transitions during generation
- Challenge appears when ready, no 404 for valid empty sessions
- Generation failure shows error card with retry path
