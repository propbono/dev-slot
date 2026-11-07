> Generated 2026-11-07 — agent-generated review snapshot, not a live spec.

# Archdrill — Architecture Scalability Assessment

**Date:** 2026-11-07 (scout/research task — no code changed, no accounts created, no infrastructure touched)
**Scope:** Capacity analysis, bottleneck/failure-mode analysis, and a phased scaling plan. Research + analysis only.

---

## TL;DR

- Archdrill is a **single-region, synchronous, serverless + managed-Postgres app**. Every AI call happens inside the HTTP request, guarded by a per-call DB write, and the client polls for completion every 2 seconds.
- **Today's architecture will comfortably serve ~1,000 registered users and a few hundred concurrently active sessions**, but it is **not launch-eligible for a paid product as-is**: Vercel's Hobby plan forbids commercial use, and Supabase Free pauses after 1 week of inactivity and has no daily backups.
- **The first hard failure is not CPU, DB size, or AI cost — it is Supabase Auth rate limiting.** The app calls `supabase.auth.getUser()` on **every** request (middleware + every API route) without forwarding the end-user IP. Supabase's default limit on `/auth/v1/user` is **30 requests / 5 min per IP**; all traffic egresses from a shared Vercel IP pool, so under load this 429s and the middleware silently logs users out (`src/middleware.ts:6-15`).
- **The first structural bottleneck is the free Supabase tier's shared CPU + the synchronous AI path**, followed by write amplification in `ai_usage_log` and per-instance (non-durable) rate limiters.
- **Nothing here needs a big rewrite.** The fixes are small, well-scoped, and mostly config: forward the client IP to Supabase, cut redundant `getUser()` calls, move the per-call guard counts off hot path, and upgrade the two platforms to their paid tiers at launch. Async/queue + durable rate limiting are ~10k-user work, not launch work.

---

## 1. What I did and how facts were grounded

- Read the full request/DB/AI surface: `astro.config.mjs`, `package.json`, `src/middleware.ts`, `src/lib/*` (`ai.ts`, `ai-guard.ts`, `supabase.ts`, `tiers.ts`, `stripe.ts`, `posthog.ts`), all `src/pages/api/**` routes, `src/components/interview/*`, and all `supabase/migrations/*.sql`.
- Reused two prior reports: the deploy/cost report (deploy/env/cost; DeepSeek pricing) and the model-tiers report (AI model cost + tiering).
- Fetched **current** (2026) public limit pages and read their markdown:
  - Vercel: `vercel.com/docs/limits/overview.md`, `/docs/limits/fair-use-guidelines.md`, `/docs/functions/limitations.md` (all fetched 2026-11-07).
  - Supabase: `supabase.com/pricing.md`, `/docs/guides/database/connecting-to-postgres.md`, `/docs/guides/platform/rate-limits.md` (fetched 2026-11-07).
- Every file reference below is `file:line`. Figures that could not be verified are explicitly flagged.

---

## 2. Current architecture (codebase facts)

| Layer            | How it is wired today                                                                                                                  | File refs                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Runtime          | Astro 6 SSR, `output: "server"`, `@astrojs/vercel`, single region (default `iad1`), Node serverless (Fluid compute)                    | `astro.config.mjs:13-14`                                                                       |
| Auth             | Cookie sessions via `@supabase/ssr`; middleware resolves user on **every** request                                                     | `src/middleware.ts:6-15`                                                                       |
| DB               | Supabase via PostgREST (HTTP) only — no raw `postgres://` connections                                                                  | `src/lib/supabase.ts:10-21`                                                                    |
| AI               | DeepSeek, non-streaming `generateText()`, one provider, `DEEPSEEK_MODEL` (default `deepseek-flash`), thinking disabled                 | `src/lib/ai.ts:6,36,74,110,155`                                                                |
| AI guard         | Per-call: 1 INSERT into `ai_usage_log` + 3 `COUNT` queries (window/day/month); per-IP + global limiters are **in-memory per instance** | `src/lib/ai-guard.ts:124,140-143,83-84`                                                        |
| Generation       | Synchronous in the HTTP request; client polls `/api/interview/generate` every 2s until `{ready:true}`                                  | `src/pages/api/interview/generate.ts`, `src/components/interview/GenerationSkeleton.tsx:10,40` |
| Evaluation       | Synchronous POST `/api/interview/evaluate`; up to 3 retries with 1s backoff; summary generated inline when a challenge completes       | `src/pages/api/interview/evaluate.ts`                                                          |
| Tiers            | free 1 interview/mo (≤3 turns, 1 challenge); pro 5/mo (unlimited turns, 5 challenges); unlimited                                       | `src/lib/tiers.ts:12-15`                                                                       |
| Payments         | Stripe Checkout + webhook; service-role DB writes in the webhook                                                                       | `src/pages/api/stripe/webhook.ts`                                                              |
| Analytics/errors | PostHog (`flush()` awaited before each route returns); Sentry fire-and-forget                                                          | `src/lib/posthog.ts:42,55-59`                                                                  |

---

## 3. Capacity today — per-layer ceilings

The table quantifies each layer on the **current free/cheap tiers**. "Users/month" is **active** users (each doing their tier's interviews); a free user = 1 interview ≈ 5-6 AI calls and ≈ 20-30 Vercel function invocations (page loads + 2s polling + API calls).

### 3.1 Per-layer capacity table

| Layer                                  | Current tier / limit (verified 2026)                                                                  | Realistic ceiling (active users/mo)                                                                                  | What breaks first                                                          | Confidence                                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Supabase Auth rate limit**           | `/auth/v1/user` default **30 req / 5 min / IP**; app does **not** forward client IP                   | **Tens to low hundreds of _concurrent_ sessions** (burst), 429 → silent logout                                       | `getUser()` 429s; middleware sets `user=null` → redirect to `/auth/signin` | High (limit is documented; exact break point depends on Vercel egress IP diversity — must load-test) |
| **Supabase Free tier**                 | 500 MB DB (shared CPU, 500 MB RAM), 5 GB egress, **pauses after 1 week inactivity**, no daily backups | ~5-10k interviews lifetime (storage); ~2-5k active/mo (egress); **latency degrades under concurrency on shared CPU** | DB full / egress / pause-on-inactivity / shared-CPU contention             | Medium-high                                                                                          |
| **Vercel (Hobby)**                     | 1M invocations/mo, 100 GB Fast Data Transfer, 300s max duration, 2 GB/1 vCPU, 30k concurrency         | ~35-40k interviews/mo (invocations); **but Hobby is non-commercial only**                                            | Invocation/CPU budget; **ToS violation for a paid product**                | High                                                                                                 |
| **Vercel (Pro)**                       | usage-based: $0.60/1M invocations, ~$0.128/active-CPU-hr, ~$0.0106/GB-hr; 800s max duration           | No hard ceiling until ~100k+ users; cost scales linearly                                                             | Budget, not capacity                                                       | High                                                                                                 |
| **DeepSeek**                           | flash concurrency **2500**, v4-pro **500**; ~$0.003/interview                                         | **~100k+ interviews/mo before concurrency/TPM matters**                                                              | Latency (synchronous call) & PRC residency, not capacity                   | Medium (RPM/TPM hard numbers unverified)                                                             |
| **Stripe**                             | No meaningful API rate limit at this volume; webhook is low-frequency                                 | Not a bottleneck                                                                                                     | n/a                                                                        | High                                                                                                 |
| **PostHog**                            | Free ≈ 1M events/mo (unverified exact figure); app fires ~5-8 events/interview                        | ~150-300k interviews/mo                                                                                              | Event cap → dropped events (silent)                                        | Low (exact free cap unverified)                                                                      |
| **Sentry**                             | Free ≈ 5k errors/mo (unverified); capture is async                                                    | Not a bottleneck                                                                                                     | Error-cap → dropped captures                                               | Low                                                                                                  |
| **`ai_usage_log` write amplification** | 4 DB round-trips per AI call (1 INSERT + 3 COUNT)                                                     | Adds ~1-2s DB overhead per interview; grows unbounded                                                                | Latency, then disk                                                         | High (code-read)                                                                                     |
| **In-memory rate limiters**            | per-IP 30/60s, global 120/60s — **per lambda instance, reset on cold start**                          | N/A (correctness gap, not capacity)                                                                                  | Limits silently weaken as instances scale out                              | High (documented in `ai-guard.ts:46-49`)                                                             |

### 3.2 The FIRST bottleneck

**Ranked, first to last as traffic grows:**

1. **Supabase Auth `/auth/v1/user` rate limit (no IP forwarding)** — _hard failure, cheapest fix._ This 429s and logs users out before any DB or AI ceiling is reached. It is the single most likely "app breaks first" event.
2. **The fact that the product cannot legally/operationally run on the current tiers** — Vercel Hobby is "non-commercial personal use only" (a paid Stripe product is commercial); Supabase Free pauses after 1 week of inactivity and has no backups. This is a compliance/availability gate, not a capacity number.
3. **Supabase Free shared CPU + 500 MB DB** — the first genuine _capacity_ ceiling (storage ≈ 5-10k interviews; latency under concurrency).
4. **Vercel Hobby invocation/CPU budget** — only if the ToS issue were ignored (~35-40k interviews/mo).
5. **DeepSeek concurrency/cost** — effectively never at realistic scale; latency and PRC data residency are the real issues (see the prior model-tiers report).

**Realistic "users before something breaks" summary:** the app should comfortably serve **~1,000 registered users with a few hundred concurrent sessions** today, but the correct statement is: _it is not launch-ready on the free tiers at any meaningful scale, and the first hard failure (auth 429s) can appear at a few hundred concurrent active sessions._

---

## 4. Failure modes & bottlenecks (how it degrades)

### 4.1 `getUser()` on every request + no IP forwarding (highest risk)

`src/middleware.ts:6-15` runs `supabase.auth.getUser()` for **every** page render and API call; each API route then calls `getUser()` **again**. Every one of those is a network round-trip to Supabase Auth, and they all originate from Vercel's shared egress IPs. Supabase's current rate-limits doc lists `/auth/v1/user` in the sign-in bucket (**30 req/5 min/IP**). Without `sb-forwarded-for` (which needs a secret key, per Supabase docs), a burst of concurrent sessions can trip this and 429 → `user=null` → redirect to sign-in, i.e. **users get randomly logged out mid-interview**. Fixes: forward the IP (`sb-forwarded-for` + secret key), and/or stop calling `getUser()` in middleware (use local `getSession()` JWT decode) and cache the verified user per request.

### 4.2 Synchronous request → AI-call → response

`evaluate.ts` and `generate.ts` hold the HTTP request open for the full DeepSeek round-trip (typically 3-10s, sometimes longer on a big JD or a retry). Consequences:

- The user stares at a spinner; no progress, no cancellation.
- The "generation lock" (`session_messages` with `status='generating'`) has a **90s stale timeout** (`generate.ts:7`). If two AI calls + DeepSeek latency exceed 90s, the next poll deletes the marker and **re-runs generation → double AI spend and a duplicate challenge**.
- A function crash mid-call loses the in-flight work (evaluation is retried client-side via the 3× loop; generation is re-polled, but only after the stale lock clears).
- Function duration (300s Hobby / 800s Pro) is _not_ the issue today, but a queued long job (e.g. summary over a huge transcript) would be.

### 4.3 `ai_usage_log` write amplification

`guardAiCall()` does **1 INSERT + 3 `COUNT(exact)` queries per AI call** (`ai-guard.ts:124,140-143`). A single free interview (~5-6 calls) adds ~20-24 guard round-trips, and the table grows forever (no retention/archival). At thousands of calls/day this is the dominant DB load on the hot path, and the counts re-scan an index range each time. The insert-then-count ordering is deliberately race-safe (over-reject rather than over-spend), but the cost is real.

### 4.4 In-memory rate limiters are per-instance

`ipWindow` (30/60s) and `globalWindow` (120/60s) live in module scope (`ai-guard.ts:83-84`) and reset on every cold start. Under scale-out (Vercel auto-scales to 30k concurrent functions), the "global" cap becomes **120/min per instance**, not per app — so the abuse backstop silently weakens exactly when you need it. The durable per-user limits (window/day/month, from `ai_usage_log`) are the only ones that hold cross-instance.

### 4.5 Supabase connection limits from serverless — mostly a non-issue here

The app never opens raw Postgres connections: `createServerClient`/`createSupabaseClient` talk to PostgREST over HTTPS (`supabase.ts:10,36`). PostgREST pools DB connections internally, so the classic "serverless exhausts direct connections" failure does **not** apply to this codebase. What _does_ apply: PostgREST throughput under shared CPU, and the auth rate limits above. (If a raw-pooler path is ever added, use the Supavisor transaction pooler with a pool size of 1 per the connecting docs — but that's not the case today.)

### 4.6 PostHog flush on the hot path

Every AI/analytics route does `await flush()` before returning (`posthog.ts:55-59`, called from `generate.ts`, `evaluate.ts`, `create.ts`, etc.). This adds a network round-trip to the request tail. It's protected by try/catch and no-ops when unconfigured, but under load it adds latency to every request and couples analytics delivery to the user response. Free-tier event caps would drop events silently long before this is a real bottleneck.

---

## 5. Phased scaling plan (1k → 10k → 100k)

### Phase 0 — Launch readiness (before charging anyone; ~0-1k users)

**Goal: make the current architecture legal and non-self-sabotaging. No redesign.**

1. **Move to Vercel Pro** (Hobby forbids commercial use). Keep single-region `iad1`.
2. **Move Supabase to Pro, Micro compute ($25 + $10/mo)**, or at minimum accept that Free pauses after 1 week of inactivity. Pro gives daily backups + no pause.
3. **Forward the client IP to Supabase Auth** (`sb-forwarded-for` header + a `sb_secret_…` key in `createServerClient`'s `global.headers`), and enable IP forwarding in the dashboard. This neutralizes the #1 hard failure.
4. **Cut redundant auth round-trips**: replace middleware `getUser()` with `getSession()` (local JWT verify, no network); keep `getUser()` only in API routes that mutate. (Small change, big per-request win.)
5. **Reduce polling amplification**: lengthen `POLL_INTERVAL` (2s → 3-5s) or switch generation to a single awaited fetch / streaming. Optional but cheap.
6. Optionally add a `model` column to `ai_usage_log` (already recommended in the model-tiers report) so spend is attributable.

**Effort:** a few hours of config + 2-3 small code changes. **Cost:** ~$35-55/mo total platform spend.

### Phase 1 — 1k → 10k users

**Goal: remove per-call DB write amplification and make rate limiting durable.**

1. **Batch the guard accounting.** Move the 3 `COUNT` queries to a single `SELECT count(*) ... FILTER` (or a materialized per-user counter in `usage_counters`), and/or do the day/month counts from a cached value refreshed periodically instead of per call. Keep the INSERT (it's the audit + the race-safe reserve), but stop doing 3 exact counts per call.
2. **Add retention to `ai_usage_log`** (periodic DELETE/PARTITION by month) so the audit table doesn't grow unbounded.
3. **Durable cross-instance rate limiting.** Replace the in-memory `ipWindow`/`globalWindow` with Upstash Redis (or a Supabase-backed counter). This makes the per-IP/global caps actually cross-instance. Trigger: when you first observe bursty traffic or a rate-limit-related abuse incident; strictly needed before you rely on those knobs.
4. **Keep the synchronous AI path for now** — at 10k users it's fine; DeepSeek flash has ~2,500 concurrency and the cost is negligible. Do _not_ build a queue yet.

**Effort:** a few days. **Cost:** +~$5-10/mo for Redis (Upstash free tier may suffice).

### Phase 2 — 10k → 100k users

**Goal: decouple AI work from the request and tier the model.**

1. **Make the AI pipeline async/queued.** The trigger is when synchronous latency + retries start producing visible 504s/timeouts or when you want progress/cancellation. Move `evaluate` and `generate` onto a queue (Upstash QStash, Vercel's queue, or Inngest) with a durable job record in Postgres; the HTTP route enqueues and returns `202`, the client polls/streams the job status. This also fixes the 90s stale-lock double-spend risk.
2. **Split the Stripe webhook to its own function/worker** if webhook volume or retry pressure grows (it's already isolated in `webhook.ts`; this is mainly about keeping billing writes out of the hot path and giving Stripe a fast ACK).
3. **Supabase compute upgrade** Micro → Small → Medium as CPU/connections dictate; consider a **dedicated pooler (PgBouncer)** only if you ever add a raw Postgres path — not needed for PostgREST.
4. **Model tiering** per the prior model-tiers report: pro → `deepseek-v4-pro`, unlimited → US-hosted default, gated on the captain decisions already held there.
5. **Regional hosting**: multi-region Vercel functions only when latency data shows a non-US cohort; not before.

**Effort:** 1-2 weeks. **Cost:** scales with usage (Vercel usage-based + Supabase compute).

### Phase 3 — 100k+ users

**Goal: isolate blast radius; revisit provider choice.**

- Dedicated Postgres (Large+) or split auth/usage into separate services.
- US-hosted / multi-provider model routing for data residency (already a held captain decision).
- A dedicated evaluation worker fleet with concurrency controls; caching of extracted constraints; edge/regional reads.
- This is far enough out that the plan should be revisited against real traffic before committing.

---

## 6. Architecture changes worth considering (trigger + cost/effort)

| Change                                              | Trigger                                         | Rough cost/effort                          | Verdict                                           |
| --------------------------------------------------- | ----------------------------------------------- | ------------------------------------------ | ------------------------------------------------- |
| Forward Supabase auth IP + reduce `getUser()` calls | **Now** (fixes the #1 hard failure)             | Low — config + small code                  | **Do first**                                      |
| Vercel Pro + Supabase Pro (Micro)                   | **Now** (paid product can't run on Hobby/Free)  | ~$35-55/mo                                 | **Do first**                                      |
| Batch/cache `ai_usage_log` counts                   | ~1k+ active users, or visible DB latency        | Low — 1 file                               | Do in Phase 1                                     |
| `ai_usage_log` retention/partitioning               | ~10k users or 1M+ rows                          | Low — migration                            | Do in Phase 1                                     |
| Durable rate-limit store (Upstash Redis)            | ~1k-10k users; first abuse incident             | Medium — new dep                           | Do in Phase 1                                     |
| Async/queued AI pipeline (evaluate/summary)         | ~10k-100k users; when sync latency/retries bite | High — new queue + worker + status polling | Phase 2, not before                               |
| Split Stripe webhook to a worker                    | When webhook volume/retries grow                | Low-medium                                 | Phase 2                                           |
| Connection pooling (pgBouncer/Supavisor)            | Only if a raw `postgres://` path is added       | Low-medium                                 | **Not needed today** (PostgREST pools internally) |
| Supabase compute upgrade (Small/Medium/Large)       | When CPU/connections plateau                    | $15→$110/mo                                | Phase 2                                           |
| Model tiering / US-hosted provider                  | Per prior held captain decisions                | Medium                                     | Phase 2, gated on decisions                       |
| Edge/multi-region hosting                           | Non-US latency data                             | Medium                                     | Defer                                             |
| Caching (constraint extraction, static pages)       | Visible repeat-cost                             | Low                                        | Defer until measured                              |

---

## 7. Recommendation (ordered) + "don't over-engineer"

**Do now (unblocks a paid launch; hours of work):**

1. Forward `sb-forwarded-for` + secret key to Supabase; enable IP forwarding in the dashboard.
2. Replace middleware `getUser()` with `getSession()` (local verify); drop the duplicate `getUser()` where the route already calls it.
3. Move to Vercel Pro and Supabase Pro (Micro) — the product is commercial and Supabase Free pauses + has no backups.
4. Lengthen/remove the 2s polling loop (or stream generation).

**Do when you cross ~1k active users:** 5. Batch the three `ai_usage_log` counts; add retention/partitioning. 6. Durable cross-instance rate limiting (Upstash Redis).

**Do when you cross ~10k active users:** 7. Async/queued AI pipeline + progress/cancellation (also fixes the 90s stale-lock double-spend). 8. Supabase compute upgrade; split Stripe webhook if needed.

**Do when you cross ~100k (revisit then, don't plan in detail now):** 9. Dedicated Postgres / worker fleet / multi-provider routing / regional hosting.

**Do NOT do prematurely:**

- **No async job queue for launch.** Synchronous DeepSeek flash is cheap and fits in 300s/800s; a queue adds a new service + failure modes you don't need at <10k users.
- **No raw-connection pooling / pgBouncer.** The app uses PostgREST (HTTP); direct-connection exhaustion isn't a real risk today.
- **No Redis/Upstash at launch** — the durable per-user limits already hold cross-instance; only the per-IP/global backstops are per-instance, and they're backstops.
- **No multi-region/edge hosting** until latency data demands it.
- **No model tiering or US-hosted provider swap** before the captain decisions already held in the model-tiers report are answered.
- **No DB sharding / read replicas / event-sourcing** — these are 100k+ scale concerns and would be premature at any point in the near term.

---

## 8. Ship-worthy findings (for firstmate)

These are concrete, low-risk items this analysis surfaced that could ship as a follow-up implementation task if firstmate promotes this:

1. **Auth IP forwarding + `getUser()` reduction** — the single highest-value change (fixes the #1 failure mode). Touches `src/lib/supabase.ts` (add `global.headers['sb-forwarded-for']`) + `src/middleware.ts` (use `getSession()`).
2. **`ai_usage_log` count batching + retention** — `ai-guard.ts` does 3 exact counts per call; batch them and add a retention policy.
3. **Polling amplification** — `GenerationSkeleton.tsx:10` polls every 2s; lengthen or replace with streaming.

---

## 9. Unresolved captain decisions

This report surfaces **no new** unresolved captain decision. The recommendations are engineering-phased with clear triggers, and the "spend money on Pro tiers" step is forced by platform ToS (Vercel Hobby = non-commercial only; Supabase Free pauses), not an open choice. The genuine product/legal forks this analysis touches (which model serves pro/unlimited; whether/when to onboard a US-hosted provider) were already registered as captain holds by the prior `archdrill-model-tiers` report and are referenced here rather than duplicated.

---

## Appendix — evidence

- Vercel limits (fetched 2026-11-07): Hobby max function duration 300s / 2 GB-1 vCPU / 30k concurrency; 1M invocations, 100 GB Fast Data Transfer, 4h Active CPU, 360 GB-hrs provisioned memory; runtime logs 1h. Pro: 800s max (1800s beta), 4 GB-2 vCPU, usage-based ($0.60/1M invocations, ~$0.128/CPU-hr, ~$0.0106/GB-hr). Hobby is "non-commercial personal use only" (`fair-use-guidelines.md`).
- Supabase pricing (fetched 2026-11-07): Free = 500 MB DB (shared CPU, 500 MB RAM), 5 GB egress, 50k MAU, pauses after 1 week inactivity, no daily backups. Pro = $25/mo + compute; Micro $10 (1 GB RAM, 60 direct/200 pooler conns), Small $15 (90/400), Medium $60 (120/600), Large $110 (8 GB dedicated).
- Supabase auth rate limits (fetched 2026-11-07): `/auth/v1/user` listed with sign-ins at **30 req/5 min/IP** default; token endpoint 150/5min/IP; IP forwarding requires `sb-forwarded-for` + a secret (`sb_secret_…`) key.
- DeepSeek pricing/concurrency from prior `archdrill-model-tiers` report (fetched 2026-11-06): flash $0.15/$0.30 input, $0.60/$1.20 output, concurrency 2500; v4-pro $0.66/$1.32 in, $1.98/$3.96 out, concurrency 500.
- Code: `src/middleware.ts:6-15` (getUser every request), `src/lib/supabase.ts:10,36` (PostgREST only, no forwarded-for header), `src/lib/ai-guard.ts:124,140-143,83-84` (insert+3 counts; per-instance limiters), `src/components/interview/GenerationSkeleton.tsx:10,40` (2s polling), `src/pages/api/interview/generate.ts:7` (90s stale lock), `src/lib/posthog.ts:55-59` (flush before return).
- Unverified: PostHog and Sentry free-tier exact event/error caps (flagged in §3.1); DeepSeek hard RPM/TPM numbers (only concurrency is documented); the precise auth-429 breaking point (depends on Vercel egress IP diversity — needs a load test).
