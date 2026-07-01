---
change_id: replace-interface-type
title: Replace interface with type
status: new
created: 2026-07-01
updated: 2026-07-01
archived_at: null
---

## Notes

Replace all `interface` declarations with `type` across the codebase, per the new AGENTS.md convention. 22 interfaces found in src/ — 21 will become `type`, 1 stays (`Locals` in env.d.ts — required for declaration merging).

Files touched: 16 component files + 2 lib files. Mechanical rename: `interface Foo { ... }` → `type Foo = { ... }`.
