# Repository Guidelines

Astro 6 SSR web app with React 19 islands, TypeScript, Tailwind CSS 4, Supabase (auth + PostgreSQL), and shadcn/ui. Deployed to Vercel. See `@CLAUDE.md` for extended conventions.

## Tripwires

- API routes (`src/pages/api/`) must export `const prerender = false` — SSR-only.
- Do not use Next.js directives (`"use client"`, `"use server"`) — this is Astro, not Next.
- Use `cn()` from `@/lib/utils` for conditional Tailwind classes. Never concatenate class strings manually.
- Every new Supabase table must have RLS enabled with granular per-operation, per-role policies. Migrations in `supabase/migrations/` use the naming format `YYYYMMDDHHmmss_description.sql`.
- Use `type` for type aliases, not `interface`. Reserve `interface` for declaration merging only (rare in application code).
- **After every implementation phase, run the full verification suite before committing:** `npm run lint && npm run typecheck && npm test && npm run build`. All four must pass with zero errors. Fix any failures before proceeding.

## Project Structure

```
src/
  pages/          Astro pages + API routes (file-based routing)
  components/
    ui/           shadcn/ui components ("new-york" style; add with `npx shadcn@latest add <name>`)
    hooks/        React hooks
    interview/    Interview feature components
  layouts/        Astro layouts
  lib/            Services, helpers (Supabase client, AI service, `cn()`, etc.)
  types.ts        Shared types and DTOs
supabase/
  migrations/     RLS-enabled DB migrations
public/           Static assets
```

Path alias: `@/*` → `./src/*`.

Architecture rule: Astro components for static content and layout; React components only when client-side interactivity is required. React islands use `client:load` directive.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server (Vercel runtime) |
| `npm run build` | Production build (SSR) |
| `npm run lint` | ESLint with type-checked rules |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run typecheck` | TypeScript type checking (`astro check`) |
| `npm run format` | Prettier (includes Astro + Tailwind plugins) |

Pre-commit: husky + lint-staged auto-runs ESLint on `*.{ts,tsx,astro}` and Prettier on `*.{json,css,md}`.

## Environment

- Node.js v22.14.0 (`.nvmrc`)
- Use `.env.local` for local dev (gitignored). Astro reads from `.env.local` automatically.
- Required: `SUPABASE_URL`, `SUPABASE_KEY`, `DEEPSEEK_API_KEY` (server-only, declared in `astro.config.mjs` `env.schema`).
- Vercel environment variables: managed via `vercel env add` or dashboard.

## CI

GitHub Actions (`.github/workflows/ci.yml`): typecheck + lint + build + test on every push and PR to `main`. Build step requires `SUPABASE_URL` and `SUPABASE_KEY` repository secrets. Vercel auto-deploys on push to `main` via GitHub integration.

## Auth

Cookie-based sessions via `@supabase/ssr`. Middleware (`src/middleware.ts`) resolves user and redirects unauthenticated visitors away from `PROTECTED_ROUTES`. Endpoints at `src/pages/api/auth/{signin,signup,signout}.ts`. Pages at `src/pages/auth/{signin,signup,confirm-email}.astro`.

## AI / LLM

DeepSeek V4 via `@ai-sdk/deepseek` and Vercel AI SDK (`ai` v7). AI service module at `src/lib/ai.ts`. Functions: `extractConstraints()`, `generateChallenge()`, `evaluateAnswer()`. Use `generateText()` for non-streaming; polling pattern for async generation.

## Testing

- `npm test` — Run all tests (Vitest)
- `npm run test:watch` — Watch mode
- Test files are co-located: `src/**/*.test.ts`
- Mock external API calls; don't hit real APIs in unit tests

```
src/
  lib/
    ai.ts
    ai.test.ts        ← co-located test
```
