# Rules for AI — Astro 6 SSR + React 19 + Supabase + Vercel

## Commands

- `npm run dev` — start dev server
- `npm run build` — production build (SSR via `@astrojs/vercel`)
- `npm run lint` — ESLint with type-checked rules
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (includes prettier-plugin-astro + prettier-plugin-tailwindcss)

Pre-commit hooks: husky + lint-staged runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

## Architecture

**Astro 6 SSR app** with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui components. Deployed to Vercel.

### Rendering mode

Full server-side rendering (`output: "server"` in astro.config.mjs). All pages are server-rendered by default. API routes must export `const prerender = false`.

### Auth flow

- `src/lib/supabase.ts` — creates a Supabase SSR client using `@supabase/ssr` with cookie-based sessions. Uses `astro:env/server` for `SUPABASE_URL` and `SUPABASE_KEY` (server-only secrets declared in astro.config.mjs `env.schema`).
- `src/middleware.ts` — runs on every request, resolves the current user, attaches to `context.locals.user`. Redirects unauthenticated users away from routes listed in `PROTECTED_ROUTES`.
- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`
- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`
- Protected page example: `src/pages/dashboard.astro`

### Key conventions

- **Path alias**: `@/*` maps to `./src/*` (tsconfig paths).
- **Astro components** for static content/layout; **React components** only when interactivity is needed. React islands use `client:load` directive.
- **Tailwind class merging**: use the `cn()` helper from `@/lib/utils` (clsx + tailwind-merge) for conditional/merged class names. Do not concatenate class strings manually.
- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style variant. Install new ones with `npx shadcn@latest add [name]`.
- **API routes**: use uppercase `GET`, `POST` exports.
- **Supabase migrations**: `supabase/migrations/` using naming format `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables with granular per-operation, per-role policies.
- **React**: no Next.js directives ("use client" etc.). Use `type` for type aliases, not `interface`.
- **Services/helpers** go in `src/lib/`.
- **Shared types** (entities, DTOs) go in `src/types.ts`.

### AI / LLM

DeepSeek V4 via `@ai-sdk/deepseek` and Vercel AI SDK. AI service at `src/lib/ai.ts` with `extractConstraints()`, `generateChallenge()`, `evaluateAnswer()`. Use `generateText()` for non-streaming generation.

### Environment

- Node.js v22.14.0 (see `.nvmrc`)
- Env vars in `.env.local`: `SUPABASE_URL`, `SUPABASE_KEY`, `DEEPSEEK_API_KEY`
- Vercel env vars: managed via `vercel env add` or dashboard

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs lint + build on every push and PR to `main`. Vercel auto-deploys on push to `main`.

## Testing

Vitest is the recommended test framework (first-class Astro/Vite support). Add before writing test files.
