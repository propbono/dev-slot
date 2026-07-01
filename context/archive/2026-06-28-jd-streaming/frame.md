# Frame Brief: JD-to-Challenge — Perceived Brokenness

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

After submitting a job description, the user sees a spinning "Generating challenge..." button on the dashboard for 6-10 seconds with no page change, no progress feedback, and no evidence the app is doing anything. This creates the anxiety that the app crashed.

## Initial Framing (preserved)

- **User's stated cause or approach**: The blocking POST → redirect cycle is the wrong UX. The user should land on the session page immediately and see the challenge stream in.
- **User's proposed direction**: Redirect instantly after session creation, then stream the challenge generation to the session page via SSE or `streamText()`.
- **Pre-dispatch narrowing**: "Feels broken" is the leading concern — the blank wait creates anxiety the app crashed, not just impatience with latency.

## Dimension Map

The observation could originate at any of these dimensions:

1. **Navigation timing** — the redirect waits for the full LLM pipeline (extract + generate, ~6-10s) before the browser navigates. The session is created early but invisible.  ← user's initial framing
2. **Progress feedback** — the spinner says "Generating challenge..." but doesn't distinguish extraction vs generation stages. No evidence of forward progress.
3. **Session visibility** — the session page (`[sessionId].astro`) returns a 404 `"Session not found or access denied"` when a session exists but has zero messages. The session is *real* but the page calls it *not found*.
4. **Error recovery** — if the LLM fails mid-pipeline, the orphaned session (status: `created`, no messages) is invisible. The user has to start over with a new JD paste.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| Navigation timing: redirect too late | `generate.ts:48` — `context.redirect()` only fires after both LLM calls complete | STRONG |
| Progress feedback: no stage indicator | `JDInput.tsx:53` — single static "Generating challenge..." message, no stage transitions | STRONG |
| Session visibility: 404 on valid session | `[sessionId].astro:22-27` — `if (!messages \|\| messages.length === 0) return new Response("Session not found or access denied", { status: 404 })` | **STRONG — this is the key finding** |
| Error recovery: orphaned sessions invisible | `generate.ts:28` — session created with status `created`, but no retry UI exists | WEAK — not the primary concern |

## Narrowing Signals

Decisive observations from the investigation:

- **The session page returns a 404 for the exact scenario the redirect+stream fix would create.** Redirecting immediately after session creation sends the user to `"Session not found or access denied"` — which is worse UX than the current spinner. This means the session page MUST be fixed before any redirect-timing change.
- **The user's "feels broken" diagnosis is accurate** but the root cause is on the *receiving page*, not the sending API. The API creates the session correctly; the page denies its existence.
- **The spinner has no stage indicator** — the user has zero evidence of progress during the longest wait in the product.

## Cross-System Convention

The existing session page pattern (created for S-02) already handles a rich state: committed messages, drafts, quality badges, and error banners. Extending it to handle an empty/loading state follows the same page-as-truth pattern rather than introducing a new delivery mechanism.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: The session page denies the existence of a valid session that has no messages yet, so the app cannot safely navigate to the session page before the LLM completes — which forces the POST to block and creates the "feels broken" wait.

The fix has two parts: (1) the session page must handle the empty/loading state gracefully with a progress skeleton, and (2) the generate API must redirect early so the user sees that skeleton. Streaming the challenge delivery is the natural mechanism to populate the skeleton but is *secondary* — the skeleton is what solves "feels broken."

## Confidence

- **HIGH** — the 404-on-valid-session evidence is definitive (`[sessionId].astro:22-27`). All three dimensions (navigation, progress, visibility) converge on the same fix: session page loading state + early redirect.

## What Changes for /10x-plan

The plan should focus on making the session page show a loading skeleton with stage indicators when the session exists but has no interviewer messages, then redirecting the generate API immediately after session creation, and delivering the challenge via `streamText()` on the session page. This is a focused change to two files (`generate.ts` + `[sessionId].astro`) with one new component for the skeleton.

## References

- Source files: `src/pages/api/interview/generate.ts:23-28` (session created before LLM), `src/pages/api/interview/generate.ts:48` (redirect after LLM), `src/pages/interview/[sessionId].astro:22-27` (404 on empty messages), `src/components/interview/JDInput.tsx:53` (static spinner text)
