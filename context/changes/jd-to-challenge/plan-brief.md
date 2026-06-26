# JD-to-Challenge Pipeline — Plan Brief

> Full plan: `context/changes/jd-to-challenge/plan.md`
> Roadmap: `context/foundation/roadmap.md` → S-01

## What & Why

User pastes a job description → DeepSeek V4 extracts the tech stack and role context → generates a tailored architecture challenge → session created in Supabase → user lands on an interview page displaying the challenge. This is the first user-visible capability of DevSlot — the setup flow that feeds the adaptive follow-up (S-02).

## Starting Point

F-01 is done — `sessions` and `session_messages` tables live on Supabase with RLS. Auth is wired. Dashboard exists as a static welcome page. The Vercel AI SDK is not yet installed.

## Desired End State

Signed-in user sees a JD input form on `/dashboard`. Pastes a real JD (50+ chars) → submits → spinner → redirected to `/interview/<uuid>` where the challenge is displayed, specific to the JD's domain and tech stack. Session row is `active` with two messages (system extraction + interviewer challenge).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| LLM provider | DeepSeek V4 via `@ai-sdk/deepseek` | Dedicated provider package; OpenAI-compatible API with `generateText()`. | Plan |
| LLM pipeline | Two calls: extract → generate | Separation of concerns — can debug whether extraction or generation failed. | Plan |
| Challenge display | Redirect to `/interview/[sessionId]` | Clean RESTful pattern; S-02 appends the answer workspace on the same route. | Plan |
| Session creation timing | Before LLM calls (status: `created`) | Session ID available for redirect immediately; orphaned `created` rows are harmless. | Plan |
| Extraction format | Structured JSON `{ tech_stack, role_level, domain }` | Machine-readable for S-02 (evaluation) and S-04 (metrics). | Plan |
| JD validation | Client-side 50-char min + server-side guard | Prevents wasted LLM calls on junk input; 50 chars catches "test" while allowing real JDs. | Plan |
| API key | `DEEPSEEK_API_KEY` in Astro env schema | Server-only, secret, consistent with existing `SUPABASE_*` pattern. | Plan |

## Scope

**In scope:** AI service module, generation API route, JD input form on dashboard, challenge display page, env vars  
**Out of scope:** Answer submission, evaluation, session history, streaming, mobile layouts

## Architecture / Approach

```
User pastes JD → JDInput (React island)
  → POST /api/interview/generate
    → createClient (Supabase SSR)
    → INSERT session (status: created)
    → extractConstraints(jd) → { tech_stack, role_level, domain }
    → INSERT system message
    → generateChallenge(jd, constraints) → challenge text
    → INSERT interviewer message
    → UPDATE session status → active
    → 302 redirect → /interview/<sessionId>
  → [sessionId].astro → fetch messages → ChallengeDisplay
```

Vercel AI SDK (`ai` + `@ai-sdk/deepseek`) handles LLM calls. All API logic in `src/lib/ai.ts` — no direct SDK usage outside that module.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. AI Foundation | Packages installed, env vars, `src/lib/ai.ts` | `@ai-sdk/deepseek` API compatibility with DeepSeek V4 |
| 2. API Route | `POST /api/interview/generate` — full pipeline | Prompt quality — extraction may misread unusual JDs |
| 3. UI | JD form on dashboard + `/interview/[sessionId]` display | Loading UX during 6-10s LLM calls |

**Prerequisites:** `DEEPSEEK_API_KEY` from DeepSeek platform, F-01 tables deployed  
**Estimated effort:** ~2-3 sessions across 3 phases

## Open Risks & Assumptions

- Assumption: DeepSeek V4 (`deepseek-chat`) reliably returns valid JSON for the extraction prompt
- Assumption: 6-10s total latency is acceptable for the MVP — PRD explicitly defers ultra-low-latency
- Risk: If `generateText()` has a 10s serverless timeout on Vercel Hobby tier, the second call may time out. Mitigated by the 60s Vercel function timeout (cold starts may add 1-2s)

## Success Criteria (Summary)

- User pastes a real JD → receives a tailored challenge that references the JD's domain and tech stack
- Short/submitted JDs gracefully rejected
- Cross-user RLS verified — no data leakage between accounts
- Session state correct in Supabase: `active` with two messages
