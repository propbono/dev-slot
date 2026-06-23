---
starter_id: 10x-astro-starter
package_manager: npm
project_name: dev-slot
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
---

## Why this stack

A solo developer shipping an adaptive AI interview simulator as a web app in 6 after-hours weeks needs a battle-tested, agent-friendly starter that includes auth, a database, AI integration potential, and edge deploy out of the box. The `10x-astro-starter` is the recommended default for `(web-app, js)` — it bundles Astro 6 + React 19 + TypeScript + Tailwind CSS 4 + Supabase (PostgreSQL, auth, storage) + Cloudflare Pages/Workers, clears all four agent-friendly gates, and carries first-class bootstrapper confidence. Auth and AI feature flags are both set per the PRD's functional requirements; payments, realtime, and background jobs are out of MVP scope. Deployment to Cloudflare Pages with GitHub Actions auto-deploy-on-merge mirrors the starter's default path — the shortest route from scaffold to live.
