---
change_id: lint-cleanup
title: Lint cleanup
status: implementing
created: 2026-07-02
updated: 2026-07-02
archived_at: 2026-07-02T18:17:00Z
---

## Notes

Fix 64 ESLint errors across 14 files. Main sources:
- Supabase queries return `any` — need to cast or add type generation
- `no-unnecessary-condition` — optional chains on non-nullish values
- `no-unsafe-assignment/member-access` — `any` values from Supabase
- `no-explicit-any` — explicit `any` type annotations
- `prefer-nullish-coalescing` — `||` should be `??`

Priority: API routes first (12 in evaluate.ts, 22 in new-challenge.ts), then test files, then components.
