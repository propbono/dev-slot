---
bootstrapped_at: 2026-06-05T12:43:10Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: dev-slot
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
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
```

### Why this stack

A solo developer shipping an adaptive AI interview simulator as a web app in 6 after-hours weeks needs a battle-tested, agent-friendly starter that includes auth, a database, AI integration potential, and edge deploy out of the box. The `10x-astro-starter` is the recommended default for `(web-app, js)` — it bundles Astro 6 + React 19 + TypeScript + Tailwind CSS 4 + Supabase (PostgreSQL, auth, storage) + Cloudflare Pages/Workers, clears all four agent-friendly gates, and carries first-class bootstrapper confidence. Auth and AI feature flags are both set per the PRD's functional requirements; payments, realtime, and background jobs are out of MVP scope. Deployment to Cloudflare Pages with GitHub Actions auto-deploy-on-merge mirrors the starter's default path — the shortest route from scaffold to live.

## Pre-scaffold verification

| Signal             | Value                              | Severity | Notes                              |
| ------------------ | ---------------------------------- | -------- | ---------------------------------- |
| npm package        | not run                            | —        | starter uses git clone; no npm package to check |
| GitHub repo        | unavailable                        | —        | gh CLI not authenticated or network unavailable |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 20
**Conflicts (.scaffold siblings)**: none
**.gitignore handling**: moved silently (absent in cwd)
**.bootstrap-scaffold cleanup**: deleted (including cloned `.git/` before move-up)

### Files moved

- astro.config.mjs
- CLAUDE.md
- components.json
- eslint.config.js
- node_modules/
- package-lock.json
- package.json
- public/
- README.md
- src/
- supabase/
- tsconfig.json
- wrangler.jsonc
- .env.example
- .github/
- .gitignore
- .husky/
- .nvmrc
- .prettierrc.json
- .vscode/

### Preserved by conflict policy

- `context/` — cwd copy preserved verbatim (no overwrite)
- `AGENTS.md` — cwd copy preserved (no scaffold equivalent)
- `.git/` — cwd repo history preserved; scaffold `.git/` was deleted before move-up

## Post-scaffold audit

**Tool**: npm audit --json
**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW
**Direct vs transitive**: 0/0/2/0 direct of 0/1/9/0 total

### HIGH findings

- **devalue** (5.6.3 – 5.8.0): Svelte devalue DoS via sparse array deserialization. CVSS 7.5. Transitive dependency. Fix available.

### MODERATE findings

- **@astrojs/check** (>=0.9.3): via @astrojs/language-server → volar-service-yaml → yaml-language-server → yaml. Direct dependency. Fix available (downgrade to 0.9.2, semver-major).
- **wrangler** (<=4.93.0): via miniflare → ws. Direct dependency. Fix available.
- **@astrojs/language-server** (>=2.14.0): via volar-service-yaml → yaml-language-server → yaml. Transitive.
- **@cloudflare/vite-plugin** (<=1.37.2): via miniflare → ws + wrangler. Transitive.
- **miniflare** (<=4.20260518.0): via ws. Transitive.
- **volar-service-yaml** (<=0.0.70): via yaml-language-server → yaml. Transitive.
- **ws** (8.0.0 – 8.20.0): Uninitialized memory disclosure. CVSS 4.4. Transitive, used by @supabase/realtime-js and miniflare. Fix available.
- **yaml** (2.0.0 – 2.8.2): Stack Overflow via deeply nested YAML collections. CVSS 4.3. Transitive. Fix available (via @astrojs/check downgrade).
- **yaml-language-server** (multiple ranges): via yaml. Transitive. Fix available (via @astrojs/check downgrade).

## Hints recorded but not acted on

| Hint                       | Value                              |
| -------------------------- | ---------------------------------- |
| bootstrapper_confidence    | first-class                        |
| quality_override           | false                              |
| path_taken                 | standard                           |
| self_check_answers         | null                               |
| team_size                  | solo                               |
| deployment_target          | cloudflare-pages                   |
| ci_provider                | github-actions                     |
| ci_default_flow            | auto-deploy-on-merge               |
| has_auth                   | true                               |
| has_payments               | false                              |
| has_realtime               | false                              |
| has_ai                     | true                               |
| has_background_jobs        | false                              |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
