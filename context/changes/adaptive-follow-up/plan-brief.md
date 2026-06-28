# Adaptive Follow-Up — Plan Brief

> Full plan: `context/changes/adaptive-follow-up/plan.md`
> Roadmap: `context/foundation/roadmap.md` → S-02 (North star)

## What & Why

The north star — the slice that proves DevSlot's core hypothesis. User submits an architectural solution to the generated challenge, the system evaluates answer quality against the session's role constraints, and generates one adaptive follow-up: escalating into an adversarial pressure-test for strong answers, de-escalating into foundational diagnosis for weak ones. If this doesn't feel genuinely adaptive, the product has no value.

## Starting Point

S-01 is done — challenge generation pipeline working, session page displays the challenge with a placeholder. The AI service (`src/lib/ai.ts`) has extraction + generation. Session messages table has a `metadata` JSONB column ready for evaluation data. No draft persistence, no markdown editing.

## Desired End State

Session page shows a chronological thread: challenge → user's submitted answer (with quality badge) → adaptive follow-up. Below the thread, a markdown editor with live preview lets the user respond. Drafts auto-save and survive refresh. One LLM call handles evaluation + follow-up generation together. Session stays active for multi-turn responses. On failure: 3 retries, then graceful save-and-redirect.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Evaluation approach | Single LLM call: evaluate + follow-up together | Fewer tokens, faster — the LLM has full context for coherent follow-ups. | Plan |
| Evaluation criteria | Coverage of role-relevant constraints | Directly matches PRD business logic — defensible, concrete. | Plan |
| Follow-up display | Chronological thread view | Feels like a real interview transcript unfolding. | Plan |
| Session after follow-up | Stays active — user can continue responding | More natural interview feel; MVP supports multi-turn within active session. | Plan |
| Evaluation metadata | `{ quality, confidence, rationale }` | Rich enough for S-04 metrics, readable in transcripts. | Plan |
| Draft persistence | DB-backed via `status` column on messages | Matches PRD NFR for cross-device/browser persistence. | Plan |
| Error handling | Retry 3x → save session + redirect | User keeps their work; no dead-end loops. | Plan |
| Answer editor | Markdown textarea with live preview toggle | Lightweight (react-markdown only), matches architecture prose use-case. | Plan |

## Scope

**In scope:** `status` column migration, answer editor, evaluation AI function, evaluate API route, session page thread view, draft auto-save, retry logic  
**Out of scope:** Performance scoring (S-04), session history (S-03), streaming, real-time collaboration

## Architecture / Approach

```
User types in AnswerEditor (React island)
  → Auto-save drafts: POST /api/interview/draft (debounced 3s)
  → Submit: POST /api/interview/evaluate
    → Flip draft → committed
    → evaluateAnswer(constraints, challenge, answer) — single DeepSeek call
    → Returns { quality, confidence, rationale, followUp }
    → Update answer metadata + insert follow-up message
    → 302 redirect → /interview/<sessionId>
  → Session page re-renders: MessageThread shows full conversation
```

Three phases: schema + editor, evaluation pipeline, session page integration.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Foundation | Migration + AnswerEditor + draft API | Markdown rendering matches cosmic theme |
| 2. Evaluation Pipeline | evaluateAnswer() + evaluate API route | Prompt quality — distinguishing strong/weak reliably |
| 3. Session Page | Thread view + full flow + error handling | Edge cases: empty sessions, missing messages, retry UX |

**Prerequisites:** S-01 complete, `react-markdown` for the editor, DeepSeek API key active  
**Estimated effort:** ~2-3 sessions across 3 phases

## Open Risks & Assumptions

- Assumption: Single DeepSeek call can reliably distinguish strong from weak answers while generating a coherent follow-up
- Assumption: 3-5s evaluation latency is acceptable — users expect AI evaluation to take a moment
- Risk: The evaluation prompt may produce inconsistent results across different JD domains — needs testing against diverse JDs

## Success Criteria (Summary)

- Weak answer receives a foundational diagnostic follow-up (not an escalation)
- Strong answer receives an adversarial pressure-test follow-up (not a generic prompt)
- Draft auto-saves and survives browser refresh
- Evaluation metadata stored and visible on answer cards
- Retry logic handles failures gracefully (3 attempts → save and redirect)
