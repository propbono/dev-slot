# Repository Guidelines

Astro 6 SSR web app with React 19 islands, TypeScript, Tailwind CSS 4, Supabase (auth + PostgreSQL), and shadcn/ui. Deployed to Cloudflare Workers via `@astrojs/cloudflare`. See `@README.md` for stack details and prerequisites; see `@CLAUDE.md` for extended conventions.

## Tripwires

- API routes (`src/pages/api/`) must export `const prerender = false` — SSR-only.
- Do not use Next.js directives (`"use client"`, `"use server"`) — this is Astro, not Next.
- Use `cn()` from `@/lib/utils` for conditional Tailwind classes. Never concatenate class strings manually.
- Every new Supabase table must have RLS enabled with granular per-operation, per-role policies. Migrations in `supabase/migrations/` use the naming format `YYYYMMDDHHmmss_description.sql`.

## Project Structure

```
src/
  pages/          Astro pages + API routes (file-based routing)
  components/
    ui/           shadcn/ui components ("new-york" style; add with `npx shadcn@latest add <name>`)
    hooks/        React hooks
  layouts/        Astro layouts
  lib/            Services, helpers (Supabase client, `cn()`, etc.)
  types.ts        Shared types and DTOs
supabase/
  migrations/     RLS-enabled DB migrations
public/           Static assets
```

Path alias: `@/*` → `./src/*`.

Architecture rule: Astro components for static content and layout; React components only when client-side interactivity is required.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server (Cloudflare workerd runtime) |
| `npm run build` | Production build (SSR) |
| `npm run lint` | ESLint with type-checked rules |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run format` | Prettier (includes Astro + Tailwind plugins) |

Pre-commit: husky + lint-staged auto-runs ESLint on `*.{ts,tsx,astro}` and Prettier on `*.{json,css,md}`.

## Environment

- Node.js v22.14.0 (`.nvmrc`)
- Copy `.env.example` → `.env` for local dev. Cloudflare local dev uses `.dev.vars` (gitignored).
- Required: `SUPABASE_URL`, `SUPABASE_KEY` (server-only, declared in `astro.config.mjs` `env.schema`).
- Local Supabase: `npx supabase start` (Docker required).

## CI

GitHub Actions (`.github/workflows/ci.yml`): lint + build on every push and PR to `master`. Build step requires `SUPABASE_URL` and `SUPABASE_KEY` repository secrets.

## Auth

Cookie-based sessions via `@supabase/ssr`. Middleware (`src/middleware.ts`) resolves user and redirects unauthenticated visitors away from `PROTECTED_ROUTES`. Endpoints at `src/pages/api/auth/{signin,signup,signout}.ts`. Pages at `src/pages/auth/{signin,signup,confirm-email}.astro`.

## Testing

No test runner configured yet. Add one before writing test files; do not create tests against a non-existent framework.
