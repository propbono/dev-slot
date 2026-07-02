---
change_id: fix-auto-complete
title: Fix auto-complete
status: implementing
created: 2026-07-01
updated: 2026-07-01
archived_at: null
---

## Notes

Auto-complete never triggers — challenge continues indefinitely despite 3+ consecutive strong answers. The consecutive strong tracking logic in evaluate.ts is not detecting the condition correctly. Investigate and fix.

Bug #4 from QA findings.
