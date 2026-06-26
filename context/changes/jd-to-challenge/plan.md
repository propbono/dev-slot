# JD-to-Challenge Pipeline — Implementation Plan

## Overview

Build the end-to-end pipeline where a signed-in user pastes a job description, the system extracts the tech stack and role context via DeepSeek V4, generates a tailored architecture challenge, creates a Supabase session, and redirects to a session page displaying the challenge. This is roadmap slice **S-01** — the first user-visible capability after the data model foundation.

## Current State Analysis

- **Data layer ready:** F-01 deployed — `sessions` + `session_messages` tables live on Supabase with RLS (`supabase/migrations/20260626140000_create_sessions_and_messages.sql`)
- **Auth wired:** Middleware resolves `Astro.locals.user` per request; signup/signin tested
- **Dashboard exists:** `src/pages/dashboard.astro` shows a welcome message + sign-out button
- **API route pattern:** Existing auth routes use `APIRoute`, `createClient`, `formData`, and redirect-based responses (`src/pages/api/auth/signup.ts`)
- **UI toolkit:** shadcn/ui installed (button, form fields); React 19 islands available
- **Layout:** `src/layouts/Layout.astro` provides `<html>` shell with `bg-cosmic` theme
- **LLM provider:** DeepSeek V4 (`deepseek-chat`) via OpenAI-compatible API at `https://api.deepseek.com/v1`
- **No AI SDKs installed** — `ai` + `@ai-sdk/deepseek` need to be added
- **No `DEEPSEEK_API_KEY` env var** — needs to be added to `.env`, Vercel, and `astro.config.mjs`

### Key Discoveries:

- `@ai-sdk/deepseek` v3.0.0 exists — dedicated DeepSeek provider for the Vercel AI SDK, no custom baseURL needed
- `ai` v7.0.2 is the latest Vercel AI SDK core — `generateText()` for non-streaming generation
- Existing auth routes use form-based POST → redirect pattern — the generate endpoint follows the same convention
- `astro:env/server` pattern already used in `src/lib/supabase.ts` — consistent for `DEEPSEEK_API_KEY`

## Desired End State

A signed-in user navigates to `/dashboard`, sees a JD input form (textarea with 50-char minimum), pastes a job description, submits. The system:
1. Creates a session row (`status: created`)
2. Calls DeepSeek to extract `{ tech_stack, role_level, domain }` from the JD
3. Calls DeepSeek to generate a tailored architecture challenge
4. Saves extraction (system message) + challenge (interviewer message) to session_messages
5. Flips session status to `active`
6. Redirects to `/interview/<uuid>` where the challenge is displayed

**Verification:** paste a real JD → see a relevant challenge on the session page. Paste gibberish → see a validation error. No auth → redirected to sign-in.

## What We're NOT Doing

- No answer submission or evaluation — that's S-02 (adaptive follow-up)
- No session history or transcript view — that's S-03
- No streaming LLM responses — MVP uses non-streaming `generateText`
- No mobile-specific layouts beyond responsive Tailwind classes
- No multi-step interview flow — single challenge generation per session

## Implementation Approach

Three phases, top-to-bottom: foundation (SDK + config), pipeline (API route), UI (form + display). Each phase is independently testable.

Vercel AI SDK with `@ai-sdk/deepseek` for LLM calls. Two sequential calls per session:
1. **Extraction** — structured JSON from JD (`tech_stack`, `role_level`, `domain`)
2. **Generation** — challenge prompt fed with extraction + original JD

Session row created **before** LLM calls (status: `created`). On success, status flips to `active` and messages are inserted. On failure, the orphaned `created` session row is harmless — it's invisible in the history UI (S-03 only shows `completed`/`abandoned`).

Pressing "Start New Session" triggers a fresh session and a new challenge.

## Phase 1: AI Foundation

### Overview

Install the Vercel AI SDK packages, wire up the DeepSeek provider, add environment variables, and create the AI service module with two exported functions: `extractConstraints()` and `generateChallenge()`.

### Changes Required:

#### 1. Install AI SDK packages

**File**: `package.json`

**Intent**: Add `ai` (Vercel AI SDK core) and `@ai-sdk/deepseek` (DeepSeek provider) as dependencies.

**Contract**: `npm install ai @ai-sdk/deepseek`

#### 2. Environment variable

**File**: `.env`

**Intent**: Add `DEEPSEEK_API_KEY` so the AI service can authenticate. Also needs adding to Vercel environment variables for production.

**Contract**: Append `DEEPSEEK_API_KEY=###` to `.env`. Add `DEEPSEEK_API_KEY` to Vercel project settings (Production + Preview environments).

#### 3. Astro env schema

**File**: `astro.config.mjs`

**Intent**: Register `DEEPSEEK_API_KEY` in Astro's server-side env schema so `astro:env/server` can resolve it. Must be server-only and secret.

**Contract**: Add to the existing `env.schema` object:
```js
DEEPSEEK_API_KEY: envField.string({ context: "server", access: "secret" }),
```

#### 4. AI service module

**File**: `src/lib/ai.ts`

**Intent**: Provide `extractConstraints(jdText: string)` → `{ tech_stack, role_level, domain }` and `generateChallenge(jdText: string, constraints)` → `string` using DeepSeek V4 via the Vercel AI SDK. This module is the single integration point — all other code calls these two functions, never touches the SDK directly.

**Contract**:

```ts
import { createDeepSeek } from "@ai-sdk/deepseek";
import { generateText } from "ai";
import { DEEPSEEK_API_KEY } from "astro:env/server";

const deepseek = createDeepSeek({ apiKey: DEEPSEEK_API_KEY });

export interface JDConstraints {
  tech_stack: string[];
  role_level: string;
  domain: string;
}

export class ExtractionError extends Error {
  constructor(message: string, public readonly rawText: string) {
    super(message);
    this.name = "ExtractionError";
  }
}

export async function extractConstraints(jdText: string): Promise<JDConstraints> {
  const { text } = await generateText({
    model: deepseek("deepseek-chat"),
    system:
      "You extract structured information from job descriptions. Return ONLY valid JSON, no other text.",
    prompt: `Extract from the following job description:\n1. Tech stack (technologies, frameworks, platforms)\n2. Role level (Junior, Mid, Senior, Staff, Principal)\n3. Domain (Fintech, Healthcare, E-commerce, SaaS, etc.)\n\nReturn JSON: {"tech_stack": [...], "role_level": "...", "domain": "..."}\n\nJob description:\n${jdText}`,
  });

  // Strip markdown fences and whitespace in case the LLM wraps the JSON
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(cleaned) as JDConstraints;
  } catch {
    throw new ExtractionError("Failed to parse extraction JSON", text);
  }
}

export async function generateChallenge(
  jdText: string,
  constraints: JDConstraints,
): Promise<string> {
  const { text } = await generateText({
    model: deepseek("deepseek-chat"),
    system:
      "You are an expert technical interviewer conducting system design interviews. Return ONLY the challenge text — no preamble, no labels.",
    prompt: `You are interviewing a ${constraints.role_level} engineer for a ${constraints.domain} role.\nTech stack: ${constraints.tech_stack.join(", ")}.\n\nOriginal job description:\n${jdText}\n\nGenerate a single, focused system design challenge that:\n- Is open-ended (no single right answer)\n- Requires architectural tradeoff reasoning\n- Is specific to the role's domain and tech stack\n- Is answerable in 15-20 minutes\n\nReturn ONLY the challenge text.`,
  });
  return text;
}
```

### Success Criteria:

#### Automated:

- `npm run build` passes (no type errors, AI SDK resolves)
- `npm run lint` passes
- `src/lib/ai.ts` exists with both exported functions
- `DEEPSEEK_API_KEY` declared in `astro.config.mjs` env schema

#### Manual:

- Vercel dashboard shows `DEEPSEEK_API_KEY` in Production environment variables
- `.env` contains a (placeholder or real) `DEEPSEEK_API_KEY` value

---

## Phase 2: API Route — Generate Challenge

### Overview

Create `POST /api/interview/generate` — the endpoint that orchestrates the full pipeline: validate the JD, create a session, extract constraints, generate the challenge, save messages, and redirect to the session page.

### Changes Required:

#### 1. Generate endpoint

**File**: `src/pages/api/interview/generate.ts`

**Intent**: Handle the form POST from the JD input page. Validates auth and JD length (≥50 chars), creates a session, runs the two-step LLM pipeline, persists messages, and redirects to `/interview/<sessionId>`. Error paths redirect back to `/dashboard` with a query param (`?error=...`).

**Contract**:

```ts
import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { extractConstraints, generateChallenge } from "@/lib/ai";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return context.redirect("/dashboard?error=not_configured");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return context.redirect("/auth/signin");

  const form = await context.request.formData();
  const jd = (form.get("jd") as string)?.trim();
  if (!jd || jd.length < 50)
    return context.redirect("/dashboard?error=jd_too_short");

  // Create session
  const { data: session, error: sessionErr } = await supabase
    .from("sessions")
    .insert({ user_id: user.id, status: "created" })
    .select("id")
    .single();

  if (sessionErr || !session)
    return context.redirect("/dashboard?error=session_failed");

  try {
    // Step 1: Extract constraints
    const constraints = await extractConstraints(jd);
    await supabase.from("session_messages").insert({
      session_id: session.id,
      role: "system",
      content: JSON.stringify(constraints),
    });

    // Step 2: Generate challenge
    const challenge = await generateChallenge(jd, constraints);
    await supabase.from("session_messages").insert({
      session_id: session.id,
      role: "interviewer",
      content: challenge,
    });

    // Mark session active
    await supabase
      .from("sessions")
      .update({ status: "active" })
      .eq("id", session.id);

    return context.redirect(`/interview/${session.id}`);
  } catch {
    return context.redirect("/dashboard?error=generation_failed");
  }
};
```

### Success Criteria:

#### Automated:

- `npm run build` passes
- `npm run lint` passes
- `src/pages/api/interview/generate.ts` exists with POST export

#### Manual:

- Submit a real JD via the dashboard form → redirected to `/interview/<uuid>` with the challenge displayed
- Submit a short string (< 50 chars) → redirected to `/dashboard?error=jd_too_short`
- Submit with no auth → redirected to `/auth/signin`
- Verify session row created in Supabase with status `active` and two messages
- Verify RLS: another user cannot see the generated session

---

## Phase 3: UI — Dashboard Upgrade + Session Page

### Overview

Two UI changes:
1. Upgrade the dashboard page to include the JD input form (replacing the current static welcome content) with client-side validation and a loading state
2. Create the session display page at `/interview/[sessionId]` showing the generated challenge with a placeholder for the S-02 answer workspace

### Changes Required:

#### 1. Dashboard — JD input form

**File**: `src/pages/dashboard.astro`

**Intent**: Replace the current static welcome card with a JD input section. The page retains the user email + sign-out in a top bar but the main content area becomes a form: `<textarea>` for the JD, a character counter, and a submit button. Client-side validation prevents submission under 50 characters. On submit, posts to `/api/interview/generate` and shows a loading state while the redirect is in flight.

**Contract**: Astro page with a React island for the form component. The form:
- Displays user email in a thin top bar
- Shows a `<textarea>` with placeholder "Paste a full job description (minimum 50 characters)..."
- Shows live character count below the textarea (turns red under 50)
- Submit button disabled until ≥ 50 chars
- On submit: button shows spinner + "Generating challenge..." text
- Error state: reads `?error=` query param and shows a red banner (jd_too_short, generation_failed, session_failed, not_configured)
- Edge case: if `?error=` shows that generation failed but a session `id` is present in the URL, offer a "Retry" link

#### 2. JD Input Form React component

**File**: `src/components/interview/JDInput.tsx`

**Intent**: Client-side interactive form with validation, character counter, and loading state. Uses shadcn/ui button and Tailwind for styling. Dark theme (matching `bg-cosmic`).

**Contract**: 
- Props: `error?: string`
- State: `jd` (string), `submitting` (boolean)
- Renders: textarea, char counter (`{jd.length}/50 minimum`), submit button
- Submits via native `<form method="POST" action="/api/interview/generate">`
- onSubmit sets `submitting = true`, disables button
- Char counter turns red when `jd.length < 50`

#### 3. Session display page

**File**: `src/pages/interview/[sessionId].astro`

**Intent**: Server-side rendered page that fetches the session's interviewer message (the challenge) from Supabase and displays it. Auth-guarded: redirects to `/auth/signin` if no user; shows "Session not found" if the session doesn't exist or belongs to another user (RLS blocks the query). Includes a "New Session" button linking back to `/dashboard`.

**Contract**:
- Props: `sessionId` from URL param
- Server-side: `createClient()` → `supabase.from("session_messages").select("role, content").eq("session_id", sessionId).order("created_at")`
- Filters for `role === "interviewer"` messages (the challenge)
- Displays the challenge in a styled prose container
- If no messages found: "Session not found or access denied"
- Top: "Interview Challenge" heading + session ID (truncated)
- Bottom: divider + "Ready to respond? The answer workspace will be added in the next update." placeholder
- "New Session" link → `/dashboard`

#### 4. Challenge display component

**File**: `src/components/interview/ChallengeDisplay.astro`

**Intent**: Astro component that renders the challenge text with appropriate typography. Dark background card with the interviewer's prompt formatted for readability.

**Contract**:
- Props: `challenge: string`
- Renders: `<div class="...">` with prose-safe whitespace-pre-wrap, scrollable for long challenges
- Semantic heading: the role/domain extracted from the system message (if available), otherwise generic "Your Challenge"

### Success Criteria:

#### Automated:

- `npm run build` passes
- `npm run lint` passes
- `src/pages/dashboard.astro` updated with JD form (no longer static welcome)
- `src/pages/interview/[sessionId].astro` exists
- `src/components/interview/JDInput.tsx` exists
- `src/components/interview/ChallengeDisplay.astro` exists

#### Manual:

- **Dashboard:** User sees JD input form + character counter. Button disabled at 0 chars, enabled at 50+. Counter shows real-time count.
- **Validation:** Submit with < 50 chars → form blocked client-side
- **Happy path:** Paste a real JD → submit → spinner appears → redirected to `/interview/<uuid>` → challenge displayed
- **Auth guard:** Visit `/interview/<uuid>` unauthenticated → redirected to sign-in
- **Access control:** User B visits user A's session URL → "Session not found or access denied"
- **Edge case:** Visit `/interview/nonexistent-uuid` → "Session not found"

---

## Testing Strategy

### Unit Tests:

None in scope — test framework not configured per AGENTS.md.

### Integration Tests:

None in scope — first integration test comes with S-02 or when test framework is added.

### Manual Testing Steps:

1. **Happy path:** Sign in → dashboard shows JD form → paste a real JD (e.g., from linkedin.com/jobs) → submit → wait for generation → verify challenge is specific to the JD's domain and tech stack
2. **Short JD:** Submit a JD under 50 chars → verify client-side block + server-side redirect with error
3. **Cross-user RLS:** Create a session as user A → copy the `/interview/<uuid>` URL → sign in as user B → visit that URL → verify "not found"
4. **Error resilience:** Temporarily remove `DEEPSEEK_API_KEY` → submit a JD → verify graceful error redirect (generation_failed) without a crash
5. **Session data:** After successful generation, verify in Supabase dashboard: session status `active`, 2 messages (system + interviewer), correct user_id
6. **Multiple sessions:** Generate 2-3 sessions → verify each has a unique challenge, no cross-contamination

## Performance Considerations

- **LLM latency:** Two sequential calls (~6-10s total at DeepSeek's current speeds). The client sees a spinner and the browser's native loading indicator during the POST → redirect cycle.
- **No streaming in MVP:** Acceptable per PRD §Non-Goals ("no guarantees for ultra-low-latency conversational feedback"). If latency exceeds ~15s, consider streaming in a follow-up.
- **Session row is lightweight:** ~100 bytes per session + ~2KB per message pair. No indexing beyond PKs needed at MVP scale.

## Migration Notes

- No schema changes — F-01 tables are used as-is.
- `DEEPSEEK_API_KEY` must be added to Vercel Production + Preview environments before deploying Phase 2.
- `@ai-sdk/deepseek` and `ai` are new dependencies — no conflicts with existing packages.

## References

- Roadmap S-01: `context/foundation/roadmap.md` — JD-to-challenge slice
- F-01 migration: `supabase/migrations/20260626140000_create_sessions_and_messages.sql`
- PRD: `context/foundation/prd.md` — FR-005, FR-007, FR-008, FR-009, US-01
- Existing API pattern: `src/pages/api/auth/signup.ts`
- Existing auth pattern: `src/middleware.ts`
- Supabase client: `src/lib/supabase.ts`
- Vercel AI SDK: https://ai-sdk.dev/docs
- DeepSeek provider: https://ai-sdk.dev/providers/ai-sdk-providers/deepseek

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: AI Foundation

#### Automated

- [x] 1.1 `npm run build` passes with `ai` + `@ai-sdk/deepseek` installed — 7c8f140
- [x] 1.2 `npm run lint` passes — 7c8f140
- [x] 1.3 `src/lib/ai.ts` exists with `extractConstraints()` + `generateChallenge()` — 7c8f140
- [x] 1.4 `DEEPSEEK_API_KEY` in `astro.config.mjs` env schema — 7c8f140

#### Manual

- [x] 1.5 `DEEPSEEK_API_KEY` in Vercel Production environment variables — 7c8f140
- [x] 1.6 `.env.local` contains `DEEPSEEK_API_KEY` — 7c8f140

### Phase 2: API Route — Generate Challenge

#### Automated

- [x] 2.1 `npm run build` passes
- [x] 2.2 `npm run lint` passes
- [x] 2.3 `src/pages/api/interview/generate.ts` exists with POST export

#### Manual

- [ ] 2.4 Submit real JD → redirected to `/interview/<uuid>` with challenge
- [ ] 2.5 Submit short JD (< 50 chars) → error redirect
- [ ] 2.6 Unauthenticated submit → redirect to sign-in
- [ ] 2.7 Session row + 2 messages in Supabase after successful generation

### Phase 3: UI — Dashboard + Session Page

#### Automated

- [ ] 3.1 `npm run build` passes
- [ ] 3.2 `npm run lint` passes
- [ ] 3.3 `src/pages/dashboard.astro` updated with JD form
- [ ] 3.4 `src/pages/interview/[sessionId].astro` exists
- [ ] 3.5 `src/components/interview/JDInput.tsx` exists
- [ ] 3.6 `src/components/interview/ChallengeDisplay.astro` exists

#### Manual

- [ ] 3.7 Dashboard shows JD form with character counter + disabled button at < 50 chars
- [ ] 3.8 Client-side validation blocks submit under 50 chars
- [ ] 3.9 Successful JD → challenge flow (end-to-end)
- [ ] 3.10 Auth guard on `/interview/[sessionId]` (unauthenticated → sign-in)
- [ ] 3.11 Cross-user RLS: user B cannot see user A's session
