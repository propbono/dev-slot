> Generated 2026-11-07 — agent-generated review snapshot, not a live spec.

# Archdrill (dev-slot) — Code Quality & Architecture Review

**Scope:** research + review only. No code modified, no PR, no push.
**Repo reviewed:** disposable worktree of `dev-slot` at detached HEAD `origin/main` (`113568e`).
**Method:** read the full `src/` tree (~7,100 lines), all 18 Supabase migrations, the config files, the `context/` planning docs, and the test suite; then ran a clean `npm ci` and the full verification suite.

## 1. Summary verdict

**Overall health: good for a small, fast-moving MVP — the security-critical surfaces (Stripe, AI spend guard, PII handling) are genuinely well done, but the highest-risk business logic is untested and there are two real correctness/authorization gaps plus a stale dependency set.**

The codebase is small and legible: strict TypeScript, type-checked ESLint, `type` over `interface`, minimal `any`/`as`, well-named modules in `src/lib/*`. The verification gate holds on a clean install: **lint 0 errors (2 warnings), typecheck 0 errors, 115/115 tests pass, build succeeds** (verified below).

**Strongest aspects**

- **Stripe webhook** verifies the HMAC signature _before any DB write_ and confines the RLS-bypassing service-role client to that one route (`src/pages/api/stripe/webhook.ts`, `src/lib/stripe.ts`).
- **Stripe checkout** uses per-user idempotency keys plus an atomic `checkout_inflight` claim guard (with stale-reclaim and fail-closed 409) to prevent double subscriptions.
- **AI guard** fails closed: the audit row is inserted _before_ limits are counted, so over-rejection is preferred over over-spend (`src/lib/ai-guard.ts`).
- **PII posture** is thorough: Sentry drops request bodies/cookies/headers, `sanitize()`/`errorMessage()` redact emails and card-shaped digits, PostHog events are enum/number/boolean only.
- **RLS on every table**, with per-operation policies; the migrations are self-documenting and explain _why_ each grant exists.

**Biggest risks (ranked)**

1. **Vulnerable, stale dependencies** — `npm audit` reports **50 vulnerabilities: 2 critical, 23 high**. The installed `astro@6.3.1` (pinned by the committed lockfile) carries multiple critical XSS/RCE/SSRF advisories; a non-breaking `npm audit fix` resolves them.
2. **The north-star feature is untested** — `src/pages/api/interview/evaluate.ts` (308 lines: retry loop, 3-consecutive-strong auto-complete, max-rounds, summary, draft-revert) has **zero tests**; and the one "test" that claims to cover the auto-complete logic tests a _copy_ of the code, not the real code.
3. **Tier-limit race condition** — the free-tier interview cap is a read-then-write (`checkInterviewLimit` → separate `incrementInterviewCounter`) and the increment itself is a lost-update race, so concurrent requests can exceed the limit.
4. **Over-broad `session_messages` DELETE policy** — users can delete their own _committed_ transcript rows, which resets the turn-count used by `checkTurnLimit`.
5. **Cross-cutting duplication** — auth resolution + session-ownership checks are copy-pasted into 8 files; error-message maps are duplicated client/server and already drift.

---

## 2. Prioritized findings

Severity legend: **High** = should fix before launch; **Medium** = fix soon, real risk/debt; **Low** = cleanup/robustness.

### Theme A — Security & data handling

- **HIGH — Out-of-date dependencies with critical/high advisories.**
  `npm audit` → `50 vulnerabilities (6 low, 19 moderate, 23 high, 2 critical)`. The criticals are Astro advisories (XSS via unescaped spread/slot/attribute names, RCE via AVIF image optimization, host-header SSRF, base-path auth bypass — GHSA-jrpj-wcv7-9fh9, GHSA-26w7-cxv4-gfx2, GHSA-2pvr-wf23-7pc7, GHSA-376h-93r7-7g6f, etc.) affecting the installed `astro@6.3.1`, plus `node-tar` file-smuggling/DoS (transitive via the `supabase` CLI devDependency). `npm audit fix` (non-breaking) upgrades `astro 6.3.1 → 6.4.8` and `vite 7.3.3 → 7.3.7`; the committed `package-lock.json` currently pins the vulnerable versions, and CI does not run `npm audit`.
  **Recommendation:** run `npm audit fix`, commit the lockfile bump, add `npm audit` (or `npm audit --audit-level=high`) to `.github/workflows/ci.yml`, and enable Dependabot/Renovate. This is the single highest-leverage change because it closes real production XSS/RCE exposure without code changes.

- **MEDIUM — Over-broad DELETE policy lets users reset their turn counter.**
  `supabase/migrations/20260703000002_session_messages_delete_policy.sql` grants `authenticated` DELETE on _any_ message in their own session. The policy exists only to clean up the `generating` lock marker (`src/pages/api/interview/generate.ts:73,119`). But `checkTurnLimit` counts _committed_ user messages (`src/lib/tiers.ts:94-103`), so a user can delete committed answers to reset the count and bypass the free-tier turn limit. No UI does this, but the RLS surface allows it directly.
  **Recommendation:** tighten the policy to `status = 'generating'` (optionally `AND role = 'interviewer'`), which is the only row the code ever deletes.

- **MEDIUM — Broad table grants to `anon` + `authenticated` (least-privilege regression).**
  `supabase/migrations/20261107010000_grant_public_privileges.sql` grants `SELECT, INSERT, UPDATE, DELETE` on **all** public tables to `anon` and `authenticated`, plus `ALTER DEFAULT PRIVILEGES` for future tables. RLS still gates rows, but this means a _future_ table that forgets `ENABLE ROW LEVEL SECURITY` would be fully exposed to anonymous writes. The `anon` grants are unnecessary (no public page writes).
  **Recommendation:** grant only the operations the app actually needs, drop the `anon` grants, and keep the default-privileges block but consider a migration CI check that asserts RLS is enabled on every table.

- **MEDIUM — `new-session.astro` active-session query is not user-scoped.**
  `src/pages/new-session.astro:13-19` selects the latest `active` session with no `.eq("user_id", …)` (unlike `src/pages/history.astro:15` which scopes correctly). It works today _only_ because RLS filters the rows, and it never calls `getUser()` (it leans on the middleware redirect). Fragile and inconsistent — if this query ever ran with the service-role client it would leak another user's session id.
  **Recommendation:** resolve the user and add `.eq("user_id", user.id)` explicitly, matching the other pages.

- **LOW — `ai_usage_log` is user-writable by design.**
  `supabase/migrations/20260703000000_ai_usage_log.sql` lets `authenticated` users INSERT rows for themselves. A user can spam their own log to trip their own limits (self-DoS) or pollute the audit trail. Not cross-user, but worth documenting or restricting to server-only writes.

- **LOW — Redundant/leaky Stripe linkage.**
  `src/pages/api/stripe/checkout.ts:157` stores `userId` in `metadata` _and_ `client_reference_id` (the webhook only reads `client_reference_id`). `downgradeToUser` (`src/pages/api/stripe/webhook.ts:32-40`) clears `stripe_subscription_id` but not `stripe_customer_id` on cancellation. Both harmless (partial unique indexes), but the stale `stripe_customer_id` lingers.

### Theme B — Correctness & type safety

- **MEDIUM — Free-tier interview cap is a lost-update + TOCTOU race.**
  `src/lib/tiers.ts:72-78` (`incrementInterviewCounter`) does `select → upsert(current+1)`; two concurrent calls both read `0` and both write `1`, losing an increment. Separately, `checkInterviewLimit` (`tiers.ts:57-68`) and `incrementInterviewCounter` are called back-to-back in `src/pages/api/interview/create.ts:20-36`, so two concurrent session creations can both pass the `>= 1` check. Net effect: a free user can exceed 1 interview/month via concurrency. The counters are also untested (`src/lib/tiers.test.ts` covers only `checkInterviewLimit`).
  **Recommendation:** make the increment atomic (single `UPDATE … SET interviews_this_month = interviews_this_month + 1` or an RPC), and fold the check into the same atomic statement.

- **LOW — Unguarded `JSON.parse` in `new-challenge.ts`.**
  `src/pages/api/interview/new-challenge.ts:62` parses the system message content _outside_ the `try` block (which starts at line 95), so malformed content throws an unhandled 500 instead of the redirect+Sentry path used everywhere else. `generate.ts` wraps the identical parse in try/catch (`generate.ts:110-126`). Low likelihood (server writes it) but inconsistent.

- **LOW — Inconsistent API error shapes.**
  `src/pages/api/interview/draft.ts` returns bare `new Response("Not configured" / "Unauthorized" / "Missing fields" / "Session not found")` and a bare `{ok:true}` (`draft.ts:7,13,18,27,48`), while the rest of the surface uses either `Response.json({error, detail})` (stripe, generate) or `redirect(?error=…)` (create/evaluate/new-challenge/end). There is no documented error-shape contract. **Recommendation:** pick one JSON error shape (e.g. `{error, detail}`) and apply it uniformly; document it in AGENTS.md.

- **LOW — "Spend ceilings" are actually call-count ceilings.**
  `src/lib/ai-guard.ts` counts `ai_usage_log` rows; the table has no token/cost column. So `AI_DAILY_CALL_LIMIT` / `AI_MONTHLY_CALL_LIMIT` cap _calls_, not _spend_, despite AGENTS.md calling them "spend ceilings". A long-prompt call costs the same as a cheap one. Either rename the knobs or add token accounting.

- **LOW — No input-size upper bounds on LLM inputs.**
  `jd` has only a `>= 50` lower bound (`create.ts:74`); `answer` (`evaluate.ts:27`) and prompts have no ceiling. A user can submit arbitrarily large text to amplify LLM cost; the guard caps call _count_, not tokens.

### Theme C — Code organization & modularity

- **MEDIUM — Copy-pasted auth + ownership prologue across 8 files.**
  The `createClient → if(!supabase) → getUser → if(!user)` prologue and the `sessions.select().eq("id", …).eq("user_id", user.id).single()` ownership check are duplicated in `draft.ts:8-25`, `evaluate.ts:20-38`, `end.ts:8-20`, `generate.ts:15-27`, `new-challenge.ts:24-37`, `create.ts:10-30`, `[sessionId].astro:15-30`, `history.astro:8-15` (also `stripe/checkout.ts:70-74`). This is the clearest "spaghetti" signal — one security-relevant pattern repeated and already drifting (`new-session.astro` dropped the user scoping; see A).
  **Recommendation:** extract `requireUser(context)` and `assertSessionOwnership(supabase, userId, sessionId)` into `src/lib/`, returning typed results or throwing, so the ownership check can't be forgotten or mis-scoped again.

- **MEDIUM — Duplicated, already-drifting error-message maps.**
  `errorMessages` exists in both `src/components/interview/JDInput.tsx:28-41` and `src/pages/interview/[sessionId].astro:97-112`, and the two copies have already diverged (`JDInput` has `no_stack`/`missing_tech_stack`; `[sessionId]` has `missing_context`/`invalid_context`/`evaluation_failed`/`no_active_challenge`). **Recommendation:** one shared constant imported by both, or render all error text server-side.

- **MEDIUM — Magic strings for statuses/roles/error codes.**
  ~40 inline occurrences of `"created"/"active"/"completed"/"abandoned"`, `"draft"/"committed"/"generating"`, `"system"/"interviewer"/"user"`, `"upgrade_required"/"rate_limited"/…`. No shared enum/constants. **Recommendation:** centralize in a `src/lib/constants.ts` (or the documented-but-missing `src/types.ts`).

- **LOW — `src/types.ts` is documented but missing; shared types are re-declared.**
  Both AGENTS.md and CLAUDE.md say shared types live in `src/types.ts`, but the file doesn't exist. `SystemContent` is defined inline in `new-challenge.ts:1-10` while `generate.ts` parses the same shape with loose `Record<string, unknown>` casts, and `JDConstraints` is exported only from `ai.ts`. **Recommendation:** create `src/types.ts` and move `JDConstraints`, `SystemContent`, `TierLimits`, `PlanTier` there.

- **LOW — `"use client"` directives in 4 React islands.**
  `AnswerEditor.tsx:1`, `EndSessionButton.tsx:1`, `JDInput.tsx:1`, `GenerationSkeleton.tsx:1`. Astro ignores these; they're a Next.js-ism that directly contradicts the AGENTS.md tripwire "Do not use Next.js directives". Remove.

- **LOW — Dead/misleading config.**
  `strongThreshold` (`JDInput.tsx:22,201`) is submitted as a hidden field but never read server-side — `evaluate.ts` hardcodes 3 (`evaluate.ts:218-225`). `maxRounds` is a constant `useState(5)` with no UI to change it (`JDInput.tsx:21`). Both are dead flexibility that imply configurability that doesn't exist.

- **LOW — N+1 queries in `history.astro`.**
  `src/pages/history.astro:40-70` issues two queries per session (system message + message count) in a loop. Fine for a handful of sessions; scales poorly. A single join/aggregate or an RPC would be better.

### Theme D — Testing

- **HIGH — `evaluate.ts` (the north-star route) has no tests.**
  308 lines: retry loop with backoff, 3-consecutive-strong auto-complete, max-rounds completion, summary generation, draft-revert on exhaustion — none of it is covered. Per the roadmap, adaptive follow-up is the product differentiator; this is the highest-risk untested path. **Recommendation:** test it directly (mock `@/lib/ai`, `ai-guard`, `posthog`, supabase like `generate-route.test.ts`), covering: guard rejection → draft revert, retry exhaustion → `evaluation_failed`, strong×3 → auto-complete + summary, max-rounds path.

- **MEDIUM — `auto-complete.test.ts` tests a copy, not the real code.**
  `src/lib/auto-complete.test.ts:4-6` defines `hasConsecutiveStrong` _locally in the test file_ and tests that copy. The real logic lives inline in `evaluate.ts:218-225`. The "extract for testing" step was never done, so the test provides zero regression protection. **Recommendation:** extract the decision function into `src/lib/` and have the test (and `evaluate.ts`) use it.

- **MEDIUM — `tiers.ts` limit functions mostly untested.**
  `src/lib/tiers.test.ts` covers only `checkInterviewLimit`. `checkTurnLimit`, `checkChallengeLimit`, `ensureCounters` (incl. the 30-day reset), and `incrementInterviewCounter` are untested — precisely where the race in Theme B lives.

- **MEDIUM — No tests for auth routes, middleware, create/new-challenge/draft/end, or any `.astro` page.**
  `signin/signup/signout`, `middleware.ts`, `create.ts`, `new-challenge.ts`, `draft.ts`, `end.ts`, and all pages are untested. The Stripe and generate routes have good coverage, so the pattern exists — it just hasn't been extended to the rest.

- **LOW — No coverage thresholds.**
  `@vitest/coverage-v8` is installed but `vitest.config.ts` has no `coverage` config and CI doesn't collect coverage, so gaps (like evaluate.ts) aren't visible.

### Theme E — Observability & operability

- **MEDIUM — CI does not check dependencies.**
  `.github/workflows/ci.yml` runs typecheck + lint + build + test but no `npm audit` and no dependabot/renovate config. This is how the critical advisories (Theme A) went unnoticed. (Also note: the CI step _order_ in the file is typecheck→lint→build→test, while AGENTS.md/CLAUDE.md describe lint→typecheck→test→build — cosmetic.)

- **LOW — Client Sentry env vars undeclared.**
  `sentry.client.config.ts:5-6` reads `import.meta.env.PUBLIC_SENTRY_ENV` and `PUBLIC_SENTRY_RELEASE`, which are **not** in `astro.config.mjs` `env.schema` (only `PUBLIC_SENTRY_DSN` is). Client `environment`/`release` won't populate unless set manually in Vercel.

- **LOW — `no-console` warnings are intentional but noisy.**
  `posthog.ts:46,62` use `console.error` (captured by Sentry's `captureConsoleIntegration`), which triggers the 2 lint warnings on every run. Consider an explicit `Sentry.captureException` so the intent is obvious and lint is clean.

- **LOW — No AI/Stripe config surfaced in `config-status.ts`.**
  `src/lib/config-status.ts` only checks Supabase. The JDInput `not_configured` message says "AI service is not configured" but that code path only fires when _Supabase_ is missing. Misleading.

### Theme F — Maintainability & docs drift

- **MEDIUM — `context/` planning docs are materially stale.**
  `context/foundation/roadmap.md` (updated 2026-07-01) marks S-01/S-02 (JD→challenge, adaptive follow-up) as `blocked` and S-03/S-05/S-06/S-07/S-09/S-10 as `proposed`, even though all are implemented in code (history, multi-turn, auto-complete, new-challenge, tiers, Stripe). Its "Baseline" still says "Observability: absent" although Sentry + PostHog are wired. `prd.md` is `status: draft`. The planning layer is no longer a reliable map of the code.
  **Recommendation:** either retire the `context/` tree for this repo or do one catch-up pass marking slices `done`.

- **LOW — Contradictory deployment docs.**
  `context/foundation/tech-stack.md` says `deployment_target: cloudflare-pages`, while `infrastructure.md` (and the actual `@astrojs/vercel` adapter) is Vercel.

- **LOW — README references a non-existent `.env.example`.**
  `README.md:39,81` says `cp .env.example .env.local`, but no `.env.example` exists, and `.gitignore` has a bare `.env*` rule that would exclude it anyway. Onboarding gap.

- **LOW — CLAUDE.md is a stale copy of AGENTS.md.**
  CLAUDE.md's CI line says CI "runs lint + build" (it actually runs typecheck+lint+build+test), and its "Shared types go in `src/types.ts`" points at a missing file. AGENTS.md is the authoritative one; CLAUDE.md should either link to it or be kept in sync.

---

## 3. Top 5 changes that would most improve the codebase

1. **Update dependencies and gate them in CI.** `npm audit fix` (non-breaking: astro 6.3.1→6.4.8, vite 7.3.3→7.3.7) closes the critical Astro XSS/RCE advisories; commit the lockfile and add `npm audit --audit-level=high` + Dependabot. Highest leverage, no code risk.
2. **Test `evaluate.ts` and the real tier-limit functions.** Cover retry/auto-complete/summary in the north-star route, and _fix_ `auto-complete.test.ts` to test the extracted production function instead of a local copy.
3. **Fix the free-tier race.** Make `incrementInterviewCounter` atomic and merge the limit check+increment so concurrency can't bypass the interview cap.
4. **Tighten the `session_messages` DELETE policy** to `status = 'generating'`, and re-scope `new-session.astro`'s active-session query by `user_id`.
5. **Centralize the duplicated cross-cutting concerns.** Add `requireUser`/`assertSessionOwnership` helpers, a single error-message map, shared status/role/error constants in a real `src/types.ts`, and normalize `draft.ts`'s response shape.

---

## 4. What's already good — preserve this

- **Stripe webhook security** (`src/pages/api/stripe/webhook.ts`, `src/lib/stripe.ts`): signature verified before any DB write; service-role client confined to this route; every DB write checks `.error` and returns 5xx so Stripe retries; recoverable vs terminal status handling is correct and covered by tests.
- **Checkout idempotency** (`src/pages/api/stripe/checkout.ts`): per-user idempotency keys + the `checkout_inflight` atomic claim (23505 detection, stale reclaim, fail-closed 409) are a genuinely solid concurrency design, well tested.
- **AI guard fail-closed design** (`src/lib/ai-guard.ts`): insert-before-count ordering, a pure `decideAiCall` decision function, and documented best-effort in-memory limiters — the comments explain the trade-offs honestly.
- **PII hygiene**: Sentry `dataCollection` + requestData allowlist + `beforeSend` strip (`sentry.server.config.ts`), static AI span names (`src/lib/ai.ts`), `sanitize`/`errorMessage` redaction (`src/lib/stripe.ts`), PostHog enum/number/boolean-only events with `flush()` before return (`src/lib/posthog.ts`), cookieless + no-session-recording client (`src/lib/posthog-client.ts`).
- **RLS discipline**: every table enables RLS with per-operation, per-role policies, and migrations explain _why_ each grant exists (e.g. the `grant_public_privileges` comment).
- **Env ergonomics**: all knobs centralized in `astro.config.mjs` `env.schema` with defaults and `optional` flags; analytics and Sentry silently no-op when unset.
- **Test quality where it exists**: Stripe checkout/webhook branch coverage (plan change, claim races, idempotency-key shape, downgrade paths, signature rejection) and the `ai.ts`/`ai-guard.ts` mocks (`vi.hoisted`, no real API hits) are exemplary — extend this standard to the untested routes.

---

## Appendix — commands run and results

All on a clean `npm ci` (the worktree's `node_modules` was initially incomplete — `@sentry/astro` was missing — so `npm ci` was required for accurate results; it also surfaced the audit findings).

| Command             | Result                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm ci`            | 952 packages; **audit: 50 vulns (2 critical, 23 high, 19 moderate, 6 low)**                                                                                        |
| `npm run lint`      | 0 errors, **2 warnings** (`no-console` in `src/lib/posthog.ts:46,62`)                                                                                              |
| `npm run typecheck` | 0 errors, 6 hints (deprecated `tseslint.config` signature; unused `_chain` in `tiers.test.ts`)                                                                     |
| `npm test`          | **16 files, 115 tests passed**                                                                                                                                     |
| `npm run build`     | success (Astro 6 SSR → `@astrojs/vercel`)                                                                                                                          |
| `npm audit`         | criticals = Astro XSS/RCE/SSRF (astro@6.3.1) + node-tar (transitive via `supabase` CLI); `npm audit fix --dry-run` resolves astro→6.4.8, vite→7.3.7 non-breakingly |

Evidence line references throughout are against `HEAD = 113568e`.
