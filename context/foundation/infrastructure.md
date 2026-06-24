---
project: DevSlot
researched_at: 2026-06-24
recommended_platform: Vercel
runner_up: Cloudflare Workers
context_type: mvp
tech_stack:
  language: TypeScript (JavaScript)
  framework: Astro 6.3.1 / React 19.2.6
  runtime: Node.js (serverless functions)
---

## Recommendation

**Deploy on Vercel (Hobby tier, upgrade to Pro as needed).**

DevSlot is an adaptive AI interview simulator — a single-region SSR web app with Supabase for auth/database and an AI evaluation pipeline that calls an LLM API. After researching six platforms and running anti-bias cross-checks, Vercel is the best fit because it offers full Node.js compatibility (no runtime surprises for the AI SDK), a 60-second function timeout on the free Hobby tier (critical for AI response generation), automatic PR preview deployments, and a familiar ecosystem you're already comfortable with. The project's current Cloudflare Workers configuration (`@astrojs/cloudflare`) would work but carries concrete risks around CPU time limits, `nodejs_compat` gaps, and surprise billing that make Vercel the safer choice for an after-hours MVP.

## Platform Comparison

### Scoring Matrix

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Score |
|---|---|---|---|---|---|---|
| **Cloudflare Workers** | Pass | Pass | Pass | Pass | Pass | 5/5 |
| **Vercel** | Pass | Pass | Pass | Pass | Partial (MCP beta) | 4.5/5 |
| Netlify | Pass | Pass | Partial | Pass | Pass | 4/5 |
| Fly.io | Pass | Pass | Pass | Pass | Partial | 4/5 |
| Railway | Pass | Pass | Partial | Pass | Pass | 4/5 |
| Render | Partial | Pass | Fail | Partial | Fail | 2/5 |

### Platform Notes

**Cloudflare Workers** — Scored highest on paper but the anti-bias cross-check revealed concrete risks for DevSlot's AI evaluation pipeline: 10ms CPU limit on free tier (AI response generation can exceed this), incomplete Node.js compat (`nodejs_compat` flag), tight 1MB code bundle limit, and surprise billing from Workers Unbound. Already configured in the project (no adapter switch needed), but the risks are real for an AI-heavy SSR app.

**Vercel** — Full Node.js runtime, 60s function timeout on free tier (vs. 10s on Netlify), automatic PR previews, and a familiar DX. The Hobby tier covers MVP-scale traffic. Main tradeoff: Vercel MCP is beta (not GA), and at scale you'd need the Pro tier ($20/mo) for team features and higher limits. Recommended choice.

**Netlify** — Competitive free tier and the only platform with a GA MCP Server. However, the 10-second function timeout on the free plan is a hard risk for AI evaluation — an LLM API call alone can take 3-6 seconds, leaving almost no margin for application logic. No WebSocket support either.

**Fly.io** — Excellent for persistent processes and gives full control. But container-based PaaS adds Dockerfile overhead Astro doesn't need, the free tier is effectively deprecated (legacy only), and there's no MCP server. Better for apps that need long-lived connections.

**Railway** — Great DX, MCP support, and co-located PostgreSQL. But like Fly.io, it's container-based — you'd need Docker configuration. No true free tier for ongoing use. Better suited for full-stack apps without Astro's platform-native deployment.

**Render** — Weakest on CLI-native ops and agent-readability. Free tier web services sleep after inactivity. No MCP integration. Not recommended for agent-driven development.

### Shortlisted Platforms

#### 1. Vercel (Recommended)

Vercel wins on safety and familiarity. Full Node.js runtime means every npm package works — no `nodejs_compat` surprises, no CPU time traps for AI calls. The 60-second function timeout gives plenty of headroom for the AI evaluation + LLM API round-trip. PR previews are automatic and familiar from your past experience. The ecoystem (Vercel Postgres, KV, Blob) gives optional co-location if you want to move off Supabase later. The Hobby tier is genuinely free for MVP-scale traffic, and Pro ($20/mo) is reasonable when you outgrow it.

#### 2. Cloudflare Workers (Runner-up)

Would be the top pick if DevSlot were a simpler app — static-first, light on AI compute. But the combination of free-tier CPU limits, Node.js compat gaps, and opaque billing makes it riskier for an AI evaluation app built after-hours by a solo developer. Already configured — so if Vercel turns out to have issues, migrating back is one config change away.

#### 3. Netlify

Best MCP story (GA server), generous free tier, and familiar ecosystem. Dropped to third because the 10-second function timeout is a concrete risk for AI workflows. If the evaluation pipeline is optimized to return in <8s, Netlify becomes a stronger contender.

## Anti-Bias Cross-Check: Vercel

### Devil's Advocate — Weaknesses

1. **Free tier function invocation limit (100k/mo)** — An interview session could generate 10-20 function invocations (SSR page loads + API calls + AI evaluations). At 1,000 practice sessions/month, that's 10k-20k — manageable, but 5,000 sessions would exhaust the free tier. Upgrading to Pro ($20/mo) is the fix, but it's a fixed cost that kicks in earlier than you might expect.

2. **Cold starts on Hobby tier** — After inactivity, the first request may experience 500ms-2s of cold start latency. For a user who opens DevSlot, submits an answer, and sees a spinner, this could feel like the app is broken — especially if the AI call then adds another 3-6s.

3. **Serverless lock-in with Vercel services** — If you adopt Vercel Postgres/KV/Blob, migrating away involves data export and configuration changes. Not a problem for MVP, but worth noting before you invest in Vercel-native services.

4. **Vercel MCP is beta** — The MCP server for agent-driven ops is documented as beta. Feature coverage may have gaps, and breaking changes could occur. For the first few months of development, this is acceptable — you can always fall back to the Vercel CLI — but it's not as mature as Netlify's GA MCP.

5. **Edge Runtime is not full Node.js** — If you configure Astro to use Vercel Edge Functions for global speed, you'll hit the same subset-of-Node-APIs issue as Cloudflare. The safest approach is to use Vercel Serverless Functions (full Node.js), which run from a single region — acceptable for a single-region MVP.

### Pre-Mortem — How This Could Fail

> "The team deployed DevSlot on Vercel for their MVP and initial user testing went well — sessions felt snappy. Then the first 20 beta users started running full 45-minute interview practice sessions. Each session generated 40+ function invocations (SSR page loads, API calls, AI evaluations). Within 10 days of opening beta, the account hit the Hobby tier's 100k function invocation limit. The app started serving 402 (Payment Required) errors mid-interview — a terrible first impression. The team upgraded to Pro ($20/mo) but realized the AI evaluation function, which calls a remote LLM API, consistently took 3-6 seconds. With 60s timeout, that was fine — but the unbilled cost of function duration on Pro meant a few power users running marathon sessions added unexpected charges. Meanwhile, the team had hardcoded Supabase URL + key in Vercel Environment Variables without realizing they were exposed in the client bundle — a beta user caught it in devtools. The MVP's 'private by default' promise was silently broken."

### Unknown Unknowns

- **Log retention on Hobby tier is only 72 hours** and logs are basic — no structured querying. If the AI evaluation pipeline fails silently, debugging via logs is harder than expected.
- **Environment Variables have a 4KB size limit per variable** on Vercel. If you store an AI provider API key with org config in one variable, you may hit this limit.
- **`@astrojs/vercel` adapter modes** — choosing the wrong `output` mode (`server` vs `static`) can silently break SSR routes. Ensure `output: 'server'` is set in `astro.config.mjs` after switching adapters.
- **PR preview deployments are public by default** — the landing page and sign-in flow would be visible on every PR preview. Since DevSlot requires auth for the core experience, this is acceptable for the landing page, but worth knowing.
- **Bandwidth overage on Hobby tier (100GB)** — Astro-rendered HTML + React island JS bundles + Tailwind CSS output can be 2-5MB per session. At 50,000 sessions/month, you'd approach the limit. For an MVP with a handful of users, this is comfortable.

## Operational Story

- **Preview deploys**: Every push to a GitHub branch automatically creates a preview URL via Vercel's Git integration. Previews are publicly accessible by default (landing page visible). Available on all plans including Hobby.
- **Secrets**: Environment variables live in Vercel's dashboard under Project Settings → Environment Variables. Mark secrets (API keys, `SUPABASE_KEY`) as "Secret" so they are encrypted. Only project members with appropriate permissions can view or modify them. Rotation requires a manual update in the dashboard or via the Vercel CLI (`vercel env rm`, `vercel env add`).
- **Rollback**: In Vercel dashboard, navigate to Deployments → select a previous deployment → "Promote to Production". Or CLI: `vercel rollback [deployment-id]`. Rollback is instant (instant switch of traffic). Database migrations (Supabase) are not rolled back automatically — you must manage that separately.
- **Approval**: Production deployments (`vercel --prod`) and secret rotation require human approval. An agent may deploy to preview environments unattended. Dropping a database or rotating primary credentials always needs a human.
- **Logs**: On Hobby tier, view runtime logs via Vercel dashboard → Project → Logs (72h retention). CLI: `vercel logs [deployment-url]` (tail live). For structured log querying, upgrade to Pro or pipe logs to an external service.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Free tier 100k function invocations exhausted | Devil's advocate | Medium | High | Monitor usage via Vercel dashboard; upgrade to Pro ($20/mo) before hitting the limit. Set up a usage alert. |
| Cold start latency feels broken to users | Devil's advocate | High | Medium | Add a "connecting..." UI state with a spinner + estimated wait time. Consider a keep-alive cron job (paid feature) on Pro. |
| Serverless lock-in with Vercel services | Devil's advocate | Low | Medium | Keep Supabase as the primary database (already decided). Use Vercel services only if truly needed. Document export paths. |
| Vercel MCP beta instability | Devil's advocate | Medium | Low | Use CLI (`vercel`) as the primary agent tool. MCP is a convenience, not a dependency. |
| Accidentally choosing Edge Runtime over Serverless Functions | Devil's advocate | Medium | High | In `astro.config.mjs`, explicitly set `output: 'server'` with the serverless adapter (not edge). Document in AGENTS.md. |
| 402 errors at scale during beta | Pre-mortem | Medium | Critical | Set up Vercel spend notifications. Budget $20/mo for Pro before opening beta. Use supabase for auth (free tier generous). |
| 72h log retention insufficient for debugging | Unknown unknowns | Medium | High | Ship structured logs to an external service (Better Stack, Logtail, or Axiom) from day one. Both have generous free tiers. |
| Exposed API keys in client bundle | Pre-mortem | Low | Critical | Audit Vite/Astro config to ensure `SUPABASE_KEY` is server-only (`context: "server"` in env schema — already configured in astro.config.mjs). |
| Bandwidth overage on Hobby tier | Unknown unknowns | Low | Low | 100GB is generous for text-heavy SSR app. Monitor monthly. Upgrade to Pro adds 1TB bandwidth. |
| PR previews publicly expose landing page | Unknown unknowns | Medium | Low | Acceptable for MVP — landing page is public content. Auth wall protects core features. |

## Getting Started

1. **Remove the Cloudflare adapter and install the Vercel adapter:**
   ```bash
   npm uninstall @astrojs/cloudflare
   npx astro add vercel
   ```
   This installs `@astrojs/vercel@^11.0.0` and updates `astro.config.mjs`.

2. **Update `astro.config.mjs`** — ensure it looks like this after the adapter switch:
   ```js
   import vercel from "@astrojs/vercel/serverless";

   export default defineConfig({
     output: "server",
     adapter: vercel(),
     // ... rest stays the same
   });
   ```

3. **Remove the `wrangler.jsonc` file** (no longer needed):
   ```bash
   rm wrangler.jsonc
   ```

4. **Link the project to Vercel:**
   ```bash
   npx vercel link
   ```
   Follow the CLI prompts to connect to your Vercel account and create a new project.

5. **Add environment variables** in the Vercel dashboard (or via `vercel env add`):
   - `SUPABASE_URL` — your Supabase project URL
   - `SUPABASE_KEY` — your Supabase anon/public key (server-side context)
   - Any AI provider API keys needed for interview evaluation

6. **Deploy:**
   ```bash
   npx vercel --prod
   ```
   Or push to `master`/`main` — the GitHub integration will auto-deploy.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (beyond Vercel's native Git integration)
- Production-scale architecture (multi-region, HA, DR)
- Custom domain configuration (handled via Vercel dashboard)
- Database migration strategy when switching platforms
